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
    
    // Campos Proxy
    private EditText edittext_proxy;
    private Spinner spinner_proxy_type;
    
    // Campos comuns
    private EditText edittext1payload;
    private EditText edittext2sni;
    private TextView textview8logs;
    private ScrollView vscroll1;
    private Button btnConnect;

    private SSHConnectionService sshService;
    private boolean serviceBound = false;

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
        
        edittext_proxy = findViewById(R.id.edittext_proxy);
        spinner_proxy_type = findViewById(R.id.spinner_proxy_type);
        
        edittext1payload = findViewById(R.id.edittext1payload);
        edittext2sni = findViewById(R.id.edittext2sni);
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
        btnConnect.setOnClickListener(v -> connect());

        ivSettings.setOnClickListener(v -> {
            Toast.makeText(this, "Configurações", Toast.LENGTH_SHORT).show();
        });

        ivReset.setOnClickListener(v -> {
            edittext_host.setText("");
            edittext_username.setText("");
            edittext_password.setText("");
            edittext_tls_cert.setText("");
            edittext_proxy.setText("");
            edittext1payload.setText("");
            edittext2sni.setText("");
            Toast.makeText(this, "Campos resetados", Toast.LENGTH_SHORT).show();
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
                    });
                }

                @Override
                public void onConnected() {
                    runOnUiThread(() -> prepareAndStartVpn());
                }

                @Override
                public void onDisconnected() {
                    runOnUiThread(() -> stopVpnService());
                }
            });
        }
    }

    private void connect() {
        int mode = spinner1_metodo_choose.getSelectedItemPosition();
        
        if (mode == MODE_NORMAL || mode == MODE_SSL_TLS) {
            // Validar campos SSH
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

            // Parse host:port
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
            
            if (mode == MODE_SSL_TLS) {
                config.setConnectionMode(ConnectionConfig.ConnectionMode.SSL_TLS);
                config.setSni(edittext2sni.getText().toString());
            }

            // Iniciar serviço SSH
            Intent serviceIntent = new Intent(this, SSHConnectionService.class);
            startService(serviceIntent);

            if (serviceBound && sshService != null) {
                sshService.connect(config);
            }
        }
        else if (mode == MODE_PROXY) {
            // Modo proxy direto
            String proxy = edittext_proxy.getText().toString().trim();
            if (proxy.isEmpty()) {
                Toast.makeText(this, "Preencha proxy", Toast.LENGTH_SHORT).show();
                return;
            }
            Toast.makeText(this, "Modo proxy não implementado ainda", Toast.LENGTH_SHORT).show();
        }
    }

    private void prepareAndStartVpn() {
        Intent intent = VpnService.prepare(this);
        if (intent != null) {
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
    }

    private void stopVpnService() {
        Intent intent = new Intent(this, SSHTunnelVpnService.class);
        intent.setAction(SSHTunnelVpnService.ACTION_DISCONNECT);
        startService(intent);
    }

    private void updateStatusUI(ConnectionStatus status) {
        // TODO: Atualizar UI com status
    }

    private void appendLog(String message) {
        runOnUiThread(() -> {
            String currentText = textview8logs.getText().toString();
            textview8logs.setText(currentText + message + "\n");
            vscroll1.post(() -> vscroll1.fullScroll(View.FOCUS_DOWN));
        });
    }
}
