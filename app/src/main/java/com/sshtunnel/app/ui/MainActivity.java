package com.sshtunnel.app.ui;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.net.VpnService;
import android.os.Bundle;
import android.os.IBinder;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;

import com.sshtunnel.app.R;
import com.sshtunnel.app.helper.LogManager;
import com.sshtunnel.app.model.ConnectionConfig;
import com.sshtunnel.app.model.ConnectionStatus;
import com.sshtunnel.app.service.SSHConnectionService;
import com.sshtunnel.app.service.HevSocks5TunnelService;

public class MainActivity extends Activity {

    private static final String TAG = "MainActivity";
    
    // UI Components
    private EditText edittext_host;
    private EditText edittext_username;
    private EditText edittext_password;
    private EditText edittext1payload;
    private EditText edittext2sni;
    private EditText edittext_proxy;
    private TextView textview8logs;
    private ScrollView vscroll1;
    private Button btnConnect;
    private Spinner spinner1_metodo_choose;
    
    private SSHConnectionService sshService;
    private boolean serviceBound = false;
    private boolean isConnected = false;

    private final ServiceConnection serviceConnection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder service) {
            SSHConnectionService.LocalBinder binder = (SSHConnectionService.LocalBinder) service;
            sshService = binder.getService();
            serviceBound = true;
            setupServiceListener();
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            sshService = null;
            serviceBound = false;
        }
    };

    private final ActivityResultLauncher<Intent> vpnLauncher = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            result -> {
                if (result.getResultCode() == Activity.RESULT_OK) {
                    startVpnService();
                } else {
                    Toast.makeText(this, "Permissão VPN negada", Toast.LENGTH_SHORT).show();
                }
            }
    );

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        LogManager.getInstance().init(this);

        bindViews();
        setupSpinners();
        setupListeners();
        bindService();
    }

    private void bindViews() {
        edittext_host = findViewById(R.id.edittext_host);
        edittext_username = findViewById(R.id.edittext_username);
        edittext_password = findViewById(R.id.edittext_password);
        edittext1payload = findViewById(R.id.edittext1payload);
        edittext2sni = findViewById(R.id.edittext2sni);
        edittext_proxy = findViewById(R.id.edittext_proxy);
        textview8logs = findViewById(R.id.textview8logs);
        vscroll1 = findViewById(R.id.vscroll1);
        btnConnect = findViewById(R.id.btnConnect);
        spinner1_metodo_choose = findViewById(R.id.spinner1_metodo_choose);
    }

    private void setupSpinners() {
        String[] modes = {"Normal", "SSL/TLS"};
        ArrayAdapter<String> modeAdapter = new ArrayAdapter<>(this, 
                android.R.layout.simple_spinner_item, modes);
        modeAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinner1_metodo_choose.setAdapter(modeAdapter);
    }

    private void setupListeners() {
        btnConnect.setOnClickListener(v -> {
            if (isConnected) {
                disconnect();
            } else {
                connect();
            }
        });
    }

    private void bindService() {
        Intent intent = new Intent(this, SSHConnectionService.class);
        bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE);
    }

    private void setupServiceListener() {
        if (sshService != null) {
            sshService.setServiceListener(new SSHConnectionService.ServiceListener() {
                @Override
                public void onStatusChanged(ConnectionStatus status) {
                    runOnUiThread(() -> updateStatusUI(status));
                }

                @Override
                public void onLog(String message) {
                    runOnUiThread(() -> appendLog(message));
                }

                @Override
                public void onError(String error) {
                    runOnUiThread(() -> {
                        appendLog("ERRO: " + error);
                        Toast.makeText(MainActivity.this, error, Toast.LENGTH_LONG).show();
                        isConnected = false;
                        updateButtonState();
                    });
                }

                @Override
                public void onConnected() {
                    runOnUiThread(() -> {
                        appendLog("✅ SSH Conectado!");
                        isConnected = true;
                        updateButtonState();
                        prepareAndStartVpn();
                    });
                }

                @Override
                public void onDisconnected() {
                    runOnUiThread(() -> {
                        appendLog("Desconectado");
                        isConnected = false;
                        updateButtonState();
                        stopVpnService();
                    });
                }
            });
        }
    }

    private void connect() {
        String hostPort = edittext_host.getText().toString().trim();
        String username = edittext_username.getText().toString().trim();
        String password = edittext_password.getText().toString().trim();

        if (hostPort.isEmpty() || username.isEmpty() || password.isEmpty()) {
            Toast.makeText(this, "Preencha todos os campos", Toast.LENGTH_SHORT).show();
            return;
        }

        String[] parts = hostPort.split(":");
        String host = parts[0];
        int port = parts.length > 1 ? Integer.parseInt(parts[1]) : 22;

        ConnectionConfig config = new ConnectionConfig();
        config.setHost(host);
        config.setPort(port);
        config.setUsername(username);
        config.setPassword(password);
        config.setPayload(edittext1payload.getText().toString());
        config.setSni(edittext2sni.getText().toString());

        String proxy = edittext_proxy.getText().toString().trim();
        if (!proxy.isEmpty()) {
            String[] proxyParts = proxy.split(":");
            config.setProxyHost(proxyParts[0]);
            if (proxyParts.length > 1) {
                config.setProxyPort(Integer.parseInt(proxyParts[1]));
            }
        }

        appendLog("🔄 Conectando a " + host + ":" + port + "...");

        Intent serviceIntent = new Intent(this, SSHConnectionService.class);
        startService(serviceIntent);

        if (serviceBound && sshService != null) {
            sshService.connect(config);
        }
    }

    private void disconnect() {
        appendLog("🔄 Desconectando...");
        if (serviceBound && sshService != null) {
            sshService.disconnect();
        }
    }

    private void updateButtonState() {
        if (isConnected) {
            btnConnect.setText("DISCONNECT");
            btnConnect.setBackgroundTintList(getColorStateList(android.R.color.holo_red_dark));
        } else {
            btnConnect.setText("CONNECT");
            btnConnect.setBackgroundTintList(getColorStateList(R.color.colorPrimary));
        }
    }

    private void updateStatusUI(ConnectionStatus status) {
        // Não usado por enquanto
    }

    private void appendLog(String message) {
        runOnUiThread(() -> {
            String currentText = textview8logs.getText().toString();
            textview8logs.setText(currentText + message + "\n");
            vscroll1.post(() -> vscroll1.fullScroll(View.FOCUS_DOWN));
        });
    }

    private void prepareAndStartVpn() {
        Intent intent = VpnService.prepare(this);
        if (intent != null) {
            appendLog("🔐 Solicitando permissão VPN...");
            vpnLauncher.launch(intent);
        } else {
            startVpnService();
        }
    }

    private void startVpnService() {
        int socksPort = sshService != null ? sshService.getLocalSocksPort() : 1080;
        
        Intent intent = new Intent(this, HevSocks5TunnelService.class);
        intent.setAction(HevSocks5TunnelService.ACTION_CONNECT);
        intent.putExtra("socks_port", socksPort);
        intent.putExtra("socks_address", "127.0.0.1");
        intent.putExtra("socks_user", sshService != null ? sshService.getCurrentConfig().getUsername() : "");
        intent.putExtra("socks_pass", sshService != null ? sshService.getCurrentConfig().getPassword() : "");
        intent.putExtra("payload", sshService != null ? sshService.getCurrentConfig().getPayload() : "");
        intent.putExtra("sni", sshService != null ? sshService.getCurrentConfig().getSni() : "");
        intent.putExtra("proxy_host", sshService != null ? sshService.getCurrentConfig().getProxyHost() : "");
        intent.putExtra("proxy_port", sshService != null ? sshService.getCurrentConfig().getProxyPort() : 0);
        
        startService(intent);
        appendLog("🌐 VPN iniciada na porta " + socksPort);
    }

    private void stopVpnService() {
        Intent intent = new Intent(this, HevSocks5TunnelService.class);
        intent.setAction(HevSocks5TunnelService.ACTION_DISCONNECT);
        startService(intent);
    }
}
