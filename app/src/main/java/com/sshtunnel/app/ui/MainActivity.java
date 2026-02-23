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
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.ImageView;
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

public class MainActivity extends AppCompatActivity {

    private static final String TAG = "MainActivity";
    private static final int REQUEST_VPN = 1;
    private static final int REQUEST_PAYLOAD_GENERATOR = 2;
    private static final int REQUEST_PROFILE_MANAGER = 3;

    // UI Components (adaptado para novo layout)
    private Spinner spinner1_metodo_choose;
    private Spinner spinner2_import_or_export_config;
    private ImageView ivSettings;
    private ImageView ivReset;
    private EditText edittext1payload;
    private EditText edittext2sni;
    private EditText edittext3proxy;
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

        // Inicializar LogManager
        LogManager.getInstance().init(this);

        // Bind views (novos IDs)
        bindViews();

        // Setup spinners
        setupSpinners();

        // Setup listeners
        setupListeners();

        // Bind to service
        bindService();

        LogManager.getInstance().i(TAG, "MainActivity iniciado");
    }

    private void bindViews() {
        spinner1_metodo_choose = findViewById(R.id.spinner1_metodo_choose);
        spinner2_import_or_export_config = findViewById(R.id.spinner2_import_or_export_config);
        ivSettings = findViewById(R.id.ivSettings);
        ivReset = findViewById(R.id.ivReset);
        edittext1payload = findViewById(R.id.edittext1payload);
        edittext2sni = findViewById(R.id.edittext2sni);
        edittext3proxy = findViewById(R.id.edittext3proxy);
        textview8logs = findViewById(R.id.textview8logs);
        vscroll1 = findViewById(R.id.vscroll1);
        btnConnect = findViewById(R.id.btnConnect);
    }

    private void setupSpinners() {
        // Connection mode spinner
        ArrayAdapter<CharSequence> modeAdapter = ArrayAdapter.createFromResource(
                this, R.array.connection_modes, android.R.layout.simple_spinner_item);
        modeAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinner1_metodo_choose.setAdapter(modeAdapter);
    }

    private void setupListeners() {
        btnConnect.setOnClickListener(v -> connect());

        ivSettings.setOnClickListener(v -> {
            // TODO: Abrir configurações
            Toast.makeText(this, "Configurações", Toast.LENGTH_SHORT).show();
        });

        ivReset.setOnClickListener(v -> {
            edittext1payload.setText("");
            edittext2sni.setText("");
            edittext3proxy.setText("");
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
        if (!validateInputs()) return;

        ConnectionConfig config = buildConnectionConfig();

        Intent serviceIntent = new Intent(this, SSHConnectionService.class);
        startService(serviceIntent);

        if (serviceBound && sshService != null) {
            sshService.connect(config);
        }
    }

    private boolean validateInputs() {
        return true; // TODO: implementar validação
    }

    private ConnectionConfig buildConnectionConfig() {
        ConnectionConfig config = new ConnectionConfig();
        config.setHost("localhost"); // TODO: pegar do layout
        config.setPort(22);
        config.setUsername("user");
        config.setPassword("pass");
        config.setPayload(edittext1payload.getText().toString());
        config.setSni(edittext2sni.getText().toString());

        String proxyText = edittext3proxy.getText().toString();
        if (!proxyText.isEmpty()) {
            String[] parts = proxyText.split(":");
            if (parts.length == 2) {
                config.setProxyHost(parts[0]);
                config.setProxyPort(Integer.parseInt(parts[1]));
            }
        }
        return config;
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
        // TODO: implementar
    }

    private void appendLog(String message) {
        String currentText = textview8logs.getText().toString();
        textview8logs.setText(currentText + message + "\n");
        vscroll1.post(() -> vscroll1.fullScroll(View.FOCUS_DOWN));
    }
}
