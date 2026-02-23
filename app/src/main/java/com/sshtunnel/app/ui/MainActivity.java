package com.sshtunnel.app.ui;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.SharedPreferences;
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
import androidx.appcompat.app.AppCompatActivity;

import com.sshtunnel.app.R;
import com.sshtunnel.app.helper.LogManager;
import com.sshtunnel.app.model.ConnectionConfig;
import com.sshtunnel.app.model.ConnectionStatus;
import com.sshtunnel.app.service.SSHConnectionService;
import com.sshtunnel.app.service.SSHTunnelVpnService;

public class MainActivity extends AppCompatActivity {

    private static final String TAG = "MainActivity";
    private static final int REQUEST_VPN = 1;
    private static final String PREFS_NAME = "SSHTunnelPrefs";

    // Modos de conexão
    private static final int MODE_NORMAL = 0;
    private static final int MODE_SSL_TLS = 1;
    private static final int MODE_PROXY = 2;

    // UI Components
    private Spinner spinner1_metodo_choose;
    private ImageView ivSettings;
    private ImageView ivReset;
    
    // Layouts condicionais
    private LinearLayout layout_ssh_fields;
    private LinearLayout layout_tls_fields;
    private LinearLayout layout_proxy_fields;
    
    // Campos SSH
    private EditText edittext_host;
    private EditText edittext_username;
    private EditText edittext_password;
    
    // Campos TLS
    private EditText edittext_tls_cert;
    private EditText edittext2sni;  // SNI movido para TLS
    
    // Campos Proxy
    private EditText edittext_proxy;
    private Spinner spinner_proxy_type;
    
    // Campos comuns
    private EditText edittext1payload;
    private TextView textview8logs;
    private ScrollView vscroll1;
    private Button btnConnect;

    private SSHConnectionService sshService;
    private boolean serviceBound = false;
    private boolean isConnecting = false;
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
        
        // Carregar dados salvos
        loadSavedData();
    }

    private void bindViews() {
        spinner1_metodo_choose = findViewById(R.id.spinner1_metodo_choose);
        ivSettings = findViewById(R.id.ivSettings);
        ivReset = findViewById(R.id.ivReset);
        
        layout_ssh_fields = findViewById(R.id.layout_ssh_fields);
        layout_tls_fields = findViewById(R.id.layout_tls_fields);
        layout_proxy_fields = findViewById(R.id.layout_proxy_fields);
        
        edittext_host = findViewById(R.id.edittext_host);
        edittext_username = findViewById(R.id.edittext_username);
        edittext_password = findViewById(R.id.edittext_password);
        
        edittext_tls_cert = findViewById(R.id.edittext_tls_cert);
        edittext2sni = findViewById(R.id.edittext2sni);
        
        edittext_proxy = findViewById(R.id.edittext_proxy);
        spinner_proxy_type = findViewById(R.id.spinner_proxy_type);
        
        edittext1payload = findViewById(R.id.edittext1payload);
        textview8logs = findViewById(R.id.textview8logs);
        vscroll1 = findViewById(R.id.vscroll1);
        btnConnect = findViewById(R.id.btnConnect);
    }

    private void setupSpinners() {
        // Connection mode spinner
        String[] modes = {"Normal", "SSL/TLS", "Proxy"};
        ArrayAdapter<String> modeAdapter = new ArrayAdapter<>(this, 
                android.R.layout.simple_spinner_item, modes);
        modeAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinner1_metodo_choose.setAdapter(modeAdapter);
        
        spinner1_metodo_choose.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                // Mostrar/esconder layouts conforme modo selecionado
                layout_ssh_fields.setVisibility(position == MODE_NORMAL || position == MODE_SSL_TLS ? View.VISIBLE : View.GONE);
                layout_tls_fields.setVisibility(position == MODE_SSL_TLS ? View.VISIBLE : View.GONE);
                layout_proxy_fields.setVisibility(position == MODE_PROXY ? View.VISIBLE : View.GONE);
            }

            @Override
            public void onNothingSelected(AdapterView<?> parent) {}
        });

        // Proxy type spinner
        String[] proxyTypes = {"HTTP", "HTTPS", "SOCKS4", "SOCKS5"};
        ArrayAdapter<String> proxyAdapter = new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_item, proxyTypes);
        proxyAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinner_proxy_type.setAdapter(proxyAdapter);
    }

    private void setupListeners() {
        btnConnect.setOnClickListener(v -> {
            if (isConnected) {
                disconnect();
            } else if (isConnecting) {
                Toast.makeText(this, "Conectando...", Toast.LENGTH_SHORT).show();
            } else {
                connect();
            }
        });

        ivSettings.setOnClickListener(v -> {
            Toast.makeText(this, "Configurações", Toast.LENGTH_SHORT).show();
        });

        ivReset.setOnClickListener(v -> {
            edittext_host.setText("");
            edittext_username.setText("");
            edittext_password.setText("");
            edittext_tls_cert.setText("");
            edittext2sni.setText("");
            edittext_proxy.setText("");
            edittext1payload.setText("");
            Toast.makeText(this, "Campos resetados", Toast.LENGTH_SHORT).show();
        });
    }

    private void loadSavedData() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        
        edittext_host.setText(prefs.getString("host", ""));
        edittext_username.setText(prefs.getString("username", ""));
        edittext_password.setText(prefs.getString("password", ""));
        edittext_tls_cert.setText(prefs.getString("tls_cert", ""));
        edittext2sni.setText(prefs.getString("sni", ""));
        edittext_proxy.setText(prefs.getString("proxy", ""));
        edittext1payload.setText(prefs.getString("payload", ""));
        
        int mode = prefs.getInt("mode", 0);
        spinner1_metodo_choose.setSelection(mode);
        
        int proxyType = prefs.getInt("proxy_type", 0);
        spinner_proxy_type.setSelection(proxyType);
    }

    private void saveData() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        
        editor.putString("host", edittext_host.getText().toString());
        editor.putString("username", edittext_username.getText().toString());
        editor.putString("password", edittext_password.getText().toString());
        editor.putString("tls_cert", edittext_tls_cert.getText().toString());
        editor.putString("sni", edittext2sni.getText().toString());
        editor.putString("proxy", edittext_proxy.getText().toString());
        editor.putString("payload", edittext1payload.getText().toString());
        
        editor.putInt("mode", spinner1_metodo_choose.getSelectedItemPosition());
        editor.putInt("proxy_type", spinner_proxy_type.getSelectedItemPosition());
        
        editor.apply();
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
                        isConnecting = false;
                        isConnected = false;
                        updateButtonState();
                    });
                }

                @Override
                public void onConnected() {
                    runOnUiThread(() -> {
                        appendLog("✅ SSH Conectado!");
                        isConnecting = false;
                        isConnected = true;
                        updateButtonState();
                        prepareAndStartVpn();
                    });
                }

                @Override
                public void onDisconnected() {
                    runOnUiThread(() -> {
                        appendLog("Desconectado");
                        isConnecting = false;
                        isConnected = false;
                        updateButtonState();
                        stopVpnService();
                    });
                }
            });
        }
    }

    private void connect() {
        int mode = spinner1_metodo_choose.getSelectedItemPosition();
        
        // Salvar dados antes de conectar
        saveData();
        
        if (mode == MODE_NORMAL || mode == MODE_SSL_TLS) {
            String hostPort = edittext_host.getText().toString().trim();
            String username = edittext_username.getText().toString().trim();
            String password = edittext_password.getText().toString().trim();

            if (hostPort.isEmpty()) {
                Toast.makeText(this, "Preencha Host:Porta", Toast.LENGTH_SHORT).show();
                return;
            }
            if (username.isEmpty()) {
                Toast.makeText(this, "Preencha usuário", Toast.LENGTH_SHORT).show();
                return;
            }
            if (password.isEmpty()) {
                Toast.makeText(this, "Preencha senha", Toast.LENGTH_SHORT).show();
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
            
            if (mode == MODE_SSL_TLS) {
                config.setConnectionMode(ConnectionConfig.ConnectionMode.SSL_TLS);
                config.setSni(edittext2sni.getText().toString());
            }

            isConnecting = true;
            isConnected = false;
            updateButtonState();
            
            appendLog("🔄 Conectando a " + host + ":" + port + "...");

            Intent serviceIntent = new Intent(this, SSHConnectionService.class);
            startService(serviceIntent);

            if (serviceBound && sshService != null) {
                sshService.connect(config);
            }
        }
        else if (mode == MODE_PROXY) {
            String proxy = edittext_proxy.getText().toString().trim();
            if (proxy.isEmpty()) {
                Toast.makeText(this, "Preencha proxy", Toast.LENGTH_SHORT).show();
                return;
            }
            Toast.makeText(this, "Modo proxy não implementado ainda", Toast.LENGTH_SHORT).show();
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
        } else if (isConnecting) {
            btnConnect.setText("CONNECTING...");
            btnConnect.setBackgroundTintList(getColorStateList(android.R.color.holo_orange_dark));
        } else {
            btnConnect.setText("CONNECT");
            btnConnect.setBackgroundTintList(getColorStateList(R.color.colorPrimary));
        }
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
        Intent intent = new Intent(this, SSHTunnelVpnService.class);
        intent.setAction(SSHTunnelVpnService.ACTION_CONNECT);
        intent.putExtra("socks_port", socksPort);
        startService(intent);
        appendLog("🌐 VPN iniciada na porta " + socksPort);
    }

    private void stopVpnService() {
        Intent intent = new Intent(this, SSHTunnelVpnService.class);
        intent.setAction(SSHTunnelVpnService.ACTION_DISCONNECT);
        startService(intent);
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
}
