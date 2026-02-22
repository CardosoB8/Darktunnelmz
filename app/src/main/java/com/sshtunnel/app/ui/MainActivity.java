package com.sshtunnel.app.ui;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.net.VpnService;
import android.os.Bundle;
import android.os.IBinder;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.Toolbar;

import com.google.android.material.textfield.TextInputEditText;
import com.sshtunnel.app.R;
import com.sshtunnel.app.helper.LogManager;
import com.sshtunnel.app.helper.PayloadGenerator;
import com.sshtunnel.app.model.ConnectionConfig;
import com.sshtunnel.app.model.ConnectionStatus;
import com.sshtunnel.app.model.Profile;
import com.sshtunnel.app.service.SSHConnectionService;
import com.sshtunnel.app.service.SSHTunnelVpnService;
import com.sshtunnel.app.utils.ProfileManager;

/**
 * Main Activity for SSH Tunnel App
 */
public class MainActivity extends AppCompatActivity {
    
    private static final String TAG = "MainActivity";
    private static final int REQUEST_VPN = 1;
    private static final int REQUEST_PAYLOAD_GENERATOR = 2;
    private static final int REQUEST_PROFILE_MANAGER = 3;
    
    // UI Components
    private TextView tvStatus;
    private TextView tvConnectionInfo;
    private TextInputEditText etHost;
    private TextInputEditText etPort;
    private TextInputEditText etUsername;
    private TextInputEditText etPassword;
    private CheckBox cbUsePrivateKey;
    private Button btnSelectKey;
    private TextView tvKeyPath;
    private Spinner spinnerConnectionMode;
    private TextInputEditText etPayload;
    private TextInputEditText etSNI;
    private Spinner spinnerProxyType;
    private TextInputEditText etProxyHost;
    private TextInputEditText etProxyPort;
    private TextView tvLogs;
    private ScrollView scrollViewLogs;
    private Button btnConnect;
    private Button btnDisconnect;
    private Button btnGeneratePayload;
    private Button btnSaveProfile;
    private Button btnLoadProfile;
    private Button btnClearLogs;
    
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
                    Toast.makeText(this, R.string.error_vpn_permission, Toast.LENGTH_SHORT).show();
                }
            }
    );
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        
        // Setup toolbar
        Toolbar toolbar = findViewById(R.id.toolbar);
        setSupportActionBar(toolbar);
        
        // Initialize LogManager
        LogManager.getInstance().init(this);
        
        // Bind views
        bindViews();
        
        // Setup spinners
        setupSpinners();
        
        // Setup listeners
        setupListeners();
        
        // Bind to service
        bindService();
        
        // Setup log listener
        setupLogListener();
        
        LogManager.getInstance().i(TAG, "MainActivity iniciado");
    }
    
    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (serviceBound) {
            unbindService(serviceConnection);
        }
    }
    
    @Override
    protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        
        if (requestCode == REQUEST_PAYLOAD_GENERATOR && resultCode == RESULT_OK && data != null) {
            String payload = data.getStringExtra("payload");
            if (payload != null) {
                etPayload.setText(payload);
            }
        } else if (requestCode == REQUEST_PROFILE_MANAGER && resultCode == RESULT_OK && data != null) {
            Profile profile = (Profile) data.getSerializableExtra("profile");
            if (profile != null) {
                loadProfile(profile);
            }
        }
    }
    
    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        getMenuInflater().inflate(R.menu.menu_main, menu);
        return true;
    }
    
    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        int id = item.getItemId();
        
        if (id == R.id.action_settings) {
            // Open settings
            return true;
        } else if (id == R.id.action_about) {
            showAboutDialog();
            return true;
        } else if (id == R.id.action_exit) {
            exitApp();
            return true;
        }
        
        return super.onOptionsItemSelected(item);
    }
    
    private void bindViews() {
        tvStatus = findViewById(R.id.tvStatus);
        tvConnectionInfo = findViewById(R.id.tvConnectionInfo);
        etHost = findViewById(R.id.etHost);
        etPort = findViewById(R.id.etPort);
        etUsername = findViewById(R.id.etUsername);
        etPassword = findViewById(R.id.etPassword);
        cbUsePrivateKey = findViewById(R.id.cbUsePrivateKey);
        btnSelectKey = findViewById(R.id.btnSelectKey);
        tvKeyPath = findViewById(R.id.tvKeyPath);
        spinnerConnectionMode = findViewById(R.id.spinnerConnectionMode);
        etPayload = findViewById(R.id.etPayload);
        etSNI = findViewById(R.id.etSNI);
        spinnerProxyType = findViewById(R.id.spinnerProxyType);
        etProxyHost = findViewById(R.id.etProxyHost);
        etProxyPort = findViewById(R.id.etProxyPort);
        tvLogs = findViewById(R.id.tvLogs);
        scrollViewLogs = findViewById(R.id.scrollViewLogs);
        btnConnect = findViewById(R.id.btnConnect);
        btnDisconnect = findViewById(R.id.btnDisconnect);
        btnGeneratePayload = findViewById(R.id.btnGeneratePayload);
        btnSaveProfile = findViewById(R.id.btnSaveProfile);
        btnLoadProfile = findViewById(R.id.btnLoadProfile);
        btnClearLogs = findViewById(R.id.btnClearLogs);
    }
    
    private void setupSpinners() {
        // Connection mode spinner
        ArrayAdapter<CharSequence> modeAdapter = ArrayAdapter.createFromResource(
                this, R.array.connection_modes, android.R.layout.simple_spinner_item);
        modeAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerConnectionMode.setAdapter(modeAdapter);
        
        // Proxy type spinner
        ArrayAdapter<CharSequence> proxyAdapter = ArrayAdapter.createFromResource(
                this, R.array.proxy_types, android.R.layout.simple_spinner_item);
        proxyAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerProxyType.setAdapter(proxyAdapter);
    }
    
    private void setupListeners() {
        // Connect button
        btnConnect.setOnClickListener(v -> connect());
        
        // Disconnect button
        btnDisconnect.setOnClickListener(v -> disconnect());
        
        // Generate payload button
        btnGeneratePayload.setOnClickListener(v -> {
            Intent intent = new Intent(this, PayloadGeneratorActivity.class);
            String currentPayload = etPayload.getText() != null ? etPayload.getText().toString() : "";
            intent.putExtra("current_payload", currentPayload);
            startActivityForResult(intent, REQUEST_PAYLOAD_GENERATOR);
        });
        
        // Save profile button
        btnSaveProfile.setOnClickListener(v -> saveProfile());
        
        // Load profile button
        btnLoadProfile.setOnClickListener(v -> {
            Intent intent = new Intent(this, ProfileManagerActivity.class);
            startActivityForResult(intent, REQUEST_PROFILE_MANAGER);
        });
        
        // Clear logs button
        btnClearLogs.setOnClickListener(v -> {
            tvLogs.setText("");
            LogManager.getInstance().clearLogs();
        });
        
        // Private key checkbox
        cbUsePrivateKey.setOnCheckedChangeListener((buttonView, isChecked) -> {
            btnSelectKey.setVisibility(isChecked ? View.VISIBLE : View.GONE);
            tvKeyPath.setVisibility(isChecked ? View.VISIBLE : View.GONE);
        });
        
        // Select key button
        btnSelectKey.setOnClickListener(v -> selectPrivateKey());
        
        // Proxy type spinner
        spinnerProxyType.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                boolean showProxyFields = position > 0;
                etProxyHost.setEnabled(showProxyFields);
                etProxyPort.setEnabled(showProxyFields);
            }
            
            @Override
            public void onNothingSelected(AdapterView<?> parent) {}
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
                    runOnUiThread(() -> {
                        // Start VPN after SSH connection
                        prepareAndStartVpn();
                    });
                }
                
                @Override
                public void onDisconnected() {
                    runOnUiThread(() -> {
                        stopVpnService();
                    });
                }
            });
        }
    }
    
    private void setupLogListener() {
        LogManager.getInstance().addListener(new LogManager.LogListener() {
            @Override
            public void onNewLog(LogManager.LogEntry entry) {
                runOnUiThread(() -> appendLog(entry.toString()));
            }
            
            @Override
            public void onLogsCleared() {
                runOnUiThread(() -> tvLogs.setText(""));
            }
        });
    }
    
    private void connect() {
        // Validate inputs
        if (!validateInputs()) {
            return;
        }
        
        // Build connection config
        ConnectionConfig config = buildConnectionConfig();
        
        // Start service and connect
        Intent serviceIntent = new Intent(this, SSHConnectionService.class);
        startService(serviceIntent);
        
        if (serviceBound && sshService != null) {
            sshService.connect(config);
        }
    }
    
    private void disconnect() {
        if (serviceBound && sshService != null) {
            sshService.disconnect();
        }
        stopVpnService();
    }
    
    private boolean validateInputs() {
        String host = etHost.getText() != null ? etHost.getText().toString().trim() : "";
        String portStr = etPort.getText() != null ? etPort.getText().toString().trim() : "";
        String username = etUsername.getText() != null ? etUsername.getText().toString().trim() : "";
        String password = etPassword.getText() != null ? etPassword.getText().toString() : "";
        
        if (host.isEmpty()) {
            etHost.setError(getString(R.string.error_empty_host));
            etHost.requestFocus();
            return false;
        }
        
        if (portStr.isEmpty()) {
            etPort.setError(getString(R.string.error_invalid_port));
            etPort.requestFocus();
            return false;
        }
        
        try {
            int port = Integer.parseInt(portStr);
            if (port <= 0 || port > 65535) {
                etPort.setError(getString(R.string.error_invalid_port));
                etPort.requestFocus();
                return false;
            }
        } catch (NumberFormatException e) {
            etPort.setError(getString(R.string.error_invalid_port));
            etPort.requestFocus();
            return false;
        }
        
        if (username.isEmpty()) {
            etUsername.setError(getString(R.string.error_empty_username));
            etUsername.requestFocus();
            return false;
        }
        
        if (!cbUsePrivateKey.isChecked() && password.isEmpty()) {
            etPassword.setError(getString(R.string.error_empty_password));
            etPassword.requestFocus();
            return false;
        }
        
        return true;
    }
    
    private ConnectionConfig buildConnectionConfig() {
        ConnectionConfig config = new ConnectionConfig();
        
        config.setHost(etHost.getText().toString().trim());
        config.setPort(Integer.parseInt(etPort.getText().toString().trim()));
        config.setUsername(etUsername.getText().toString().trim());
        config.setPassword(etPassword.getText().toString());
        config.setUsePrivateKey(cbUsePrivateKey.isChecked());
        
        if (tvKeyPath.getText() != null) {
            config.setPrivateKeyPath(tvKeyPath.getText().toString());
        }
        
        String mode = spinnerConnectionMode.getSelectedItem().toString();
        config.setConnectionMode(ConnectionConfig.ConnectionMode.fromString(mode));
        
        if (etPayload.getText() != null) {
            config.setPayload(etPayload.getText().toString());
        }
        
        if (etSNI.getText() != null) {
            config.setSni(etSNI.getText().toString().trim());
        }
        
        String proxyType = spinnerProxyType.getSelectedItem().toString();
        config.setProxyType(ConnectionConfig.ProxyType.fromString(proxyType));
        
        if (etProxyHost.getText() != null) {
            config.setProxyHost(etProxyHost.getText().toString().trim());
        }
        
        if (etProxyPort.getText() != null && !etProxyPort.getText().toString().isEmpty()) {
            config.setProxyPort(Integer.parseInt(etProxyPort.getText().toString().trim()));
        }
        
        return config;
    }
    
    private void prepareAndStartVpn() {
        Intent intent = SSHTunnelVpnService.prepare(this);
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
        
        LogManager.getInstance().i(TAG, "Serviço VPN iniciado na porta " + socksPort);
    }
    
    private void stopVpnService() {
        Intent intent = new Intent(this, SSHTunnelVpnService.class);
        intent.setAction(SSHTunnelVpnService.ACTION_DISCONNECT);
        startService(intent);
    }
    
    private void updateStatusUI(ConnectionStatus status) {
        tvStatus.setText(status.getDisplayName());
        
        int color;
        switch (status) {
            case CONNECTED:
                color = getResources().getColor(R.color.statusConnected);
                btnConnect.setVisibility(View.GONE);
                btnDisconnect.setVisibility(View.VISIBLE);
                break;
            case CONNECTING:
                color = getResources().getColor(R.color.statusConnecting);
                btnConnect.setEnabled(false);
                break;
            case ERROR:
                color = getResources().getColor(R.color.statusError);
                btnConnect.setVisibility(View.VISIBLE);
                btnDisconnect.setVisibility(View.GONE);
                btnConnect.setEnabled(true);
                break;
            default:
                color = getResources().getColor(R.color.statusDisconnected);
                btnConnect.setVisibility(View.VISIBLE);
                btnDisconnect.setVisibility(View.GONE);
                btnConnect.setEnabled(true);
        }
        
        tvStatus.setTextColor(color);
        
        // Update connection info
        if (status == ConnectionStatus.CONNECTED && sshService != null) {
            ConnectionConfig config = sshService.getCurrentConfig();
            if (config != null) {
                tvConnectionInfo.setText(config.getUsername() + "@" + config.getHost() + ":" + config.getPort());
                tvConnectionInfo.setVisibility(View.VISIBLE);
            }
        } else {
            tvConnectionInfo.setVisibility(View.GONE);
        }
    }
    
    private void appendLog(String message) {
        String currentText = tvLogs.getText().toString();
        tvLogs.setText(currentText + message + "\n");
        
        // Auto scroll
    private void appendLog(String message) {
        if (tvLogs == null || scrollViewLogs == null) {
            Log.e("MainActivity", "appendLog chamado antes da UI estar pronta");
            return;
        }
        
        String currentText = tvLogs.getText().toString();
        tvLogs.setText(currentText + message + "\n");
        
        // Auto scroll - só executa se scrollViewLogs não for nulo
        if (scrollViewLogs != null) {
            scrollViewLogs.post(() -> {
                if (scrollViewLogs != null) {
                    scrollViewLogs.fullScroll(View.FOCUS_DOWN);
                }
            });
        }
    }
        
        final EditText input = new EditText(this);
        input.setHint("Nome do perfil");
        builder.setView(input);
        
        builder.setPositiveButton("Salvar", (dialog, which) -> {
            String name = input.getText().toString().trim();
            if (name.isEmpty()) {
                Toast.makeText(this, "Nome não pode estar vazio", Toast.LENGTH_SHORT).show();
                return;
            }
            
            Profile profile = new Profile();
            profile.setName(name);
            profile.setHost(etHost.getText() != null ? etHost.getText().toString().trim() : "");
            profile.setPort(Integer.parseInt(etPort.getText() != null ? etPort.getText().toString().trim() : "22"));
            profile.setUsername(etUsername.getText() != null ? etUsername.getText().toString().trim() : "");
            profile.setPassword(etPassword.getText() != null ? etPassword.getText().toString() : "");
            profile.setUsePrivateKey(cbUsePrivateKey.isChecked());
            profile.setPrivateKeyPath(tvKeyPath.getText() != null ? tvKeyPath.getText().toString() : "");
            profile.setConnectionMode(spinnerConnectionMode.getSelectedItem().toString());
            profile.setPayload(etPayload.getText() != null ? etPayload.getText().toString() : "");
            profile.setSni(etSNI.getText() != null ? etSNI.getText().toString().trim() : "");
            profile.setProxyType(spinnerProxyType.getSelectedItem().toString());
            profile.setProxyHost(etProxyHost.getText() != null ? etProxyHost.getText().toString().trim() : "");
            profile.setProxyPort(etProxyPort.getText() != null && !etProxyPort.getText().toString().isEmpty() 
                    ? Integer.parseInt(etProxyPort.getText().toString().trim()) : 0);
            
            if (ProfileManager.getInstance(this).saveProfile(profile)) {
                Toast.makeText(this, R.string.msg_profile_saved, Toast.LENGTH_SHORT).show();
            } else {
                Toast.makeText(this, "Erro ao salvar perfil", Toast.LENGTH_SHORT).show();
            }
        });
        
        builder.setNegativeButton("Cancelar", null);
        builder.show();
    }
    
    private void loadProfile(Profile profile) {
        etHost.setText(profile.getHost());
        etPort.setText(String.valueOf(profile.getPort()));
        etUsername.setText(profile.getUsername());
        etPassword.setText(profile.getPassword());
        cbUsePrivateKey.setChecked(profile.isUsePrivateKey());
        tvKeyPath.setText(profile.getPrivateKeyPath());
        
        // Set connection mode
        String[] modes = getResources().getStringArray(R.array.connection_modes);
        for (int i = 0; i < modes.length; i++) {
            if (modes[i].equalsIgnoreCase(profile.getConnectionMode())) {
                spinnerConnectionMode.setSelection(i);
                break;
            }
        }
        
        etPayload.setText(profile.getPayload());
        etSNI.setText(profile.getSni());
        
        // Set proxy type
        String[] proxyTypes = getResources().getStringArray(R.array.proxy_types);
        for (int i = 0; i < proxyTypes.length; i++) {
            if (proxyTypes[i].equalsIgnoreCase(profile.getProxyType())) {
                spinnerProxyType.setSelection(i);
                break;
            }
        }
        
        etProxyHost.setText(profile.getProxyHost());
        etProxyPort.setText(profile.getProxyPort() > 0 ? String.valueOf(profile.getProxyPort()) : "");
        
        Toast.makeText(this, R.string.msg_profile_loaded, Toast.LENGTH_SHORT).show();
    }
    
    private void selectPrivateKey() {
        // TODO: Implement file picker for private key
        Toast.makeText(this, "Selecionador de arquivo não implementado", Toast.LENGTH_SHORT).show();
    }
    
    private void showAboutDialog() {
        new AlertDialog.Builder(this)
                .setTitle(R.string.about_title)
                .setMessage(R.string.about_description + "\n\nVersão 1.0.0")
                .setPositiveButton("OK", null)
                .show();
    }
    
    private void exitApp() {
        disconnect();
        finish();
    }
}
