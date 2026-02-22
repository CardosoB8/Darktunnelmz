package com.sshtunnel.app.ui;

import android.os.Bundle;
import android.os.Environment;
import android.view.MenuItem;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.Toolbar;

import com.sshtunnel.app.R;
import com.sshtunnel.app.helper.LogManager;

import java.io.File;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * Activity for viewing application logs
 */
public class LogViewerActivity extends AppCompatActivity {
    
    private ScrollView scrollViewLogs;
    private TextView tvLogs;
    private EditText etFilter;
    private Button btnClear;
    private Button btnExport;
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_log_viewer);
        
        // Setup toolbar
        Toolbar toolbar = findViewById(R.id.toolbar);
        setSupportActionBar(toolbar);
        if (getSupportActionBar() != null) {
            getSupportActionBar().setDisplayHomeAsUpEnabled(true);
        }
        
        // Bind views
        bindViews();
        
        // Setup listeners
        setupListeners();
        
        // Load logs
        loadLogs();
        
        // Setup log listener
        LogManager.getInstance().addListener(new LogManager.LogListener() {
            @Override
            public void onNewLog(LogManager.LogEntry entry) {
                runOnUiThread(() -> {
                    loadLogs();
                    scrollToBottom();
                });
            }
            
            @Override
            public void onLogsCleared() {
                runOnUiThread(() -> tvLogs.setText(""));
            }
        });
    }
    
    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        if (item.getItemId() == android.R.id.home) {
            finish();
            return true;
        }
        return super.onOptionsItemSelected(item);
    }
    
    private void bindViews() {
        scrollViewLogs = findViewById(R.id.scrollViewLogs);
        tvLogs = findViewById(R.id.tvLogs);
        etFilter = findViewById(R.id.etFilter);
        btnClear = findViewById(R.id.btnClear);
        btnExport = findViewById(R.id.btnExport);
    }
    
    private void setupListeners() {
        btnClear.setOnClickListener(v -> {
            LogManager.getInstance().clearLogs();
            tvLogs.setText("");
        });
        
        btnExport.setOnClickListener(v -> exportLogs());
        
        etFilter.setOnEditorActionListener((v, actionId, event) -> {
            loadLogs();
            return true;
        });
    }
    
    private void loadLogs() {
        String filter = etFilter.getText() != null ? etFilter.getText().toString() : "";
        List<LogManager.LogEntry> logs = LogManager.getInstance().getLogs(filter);
        
        StringBuilder sb = new StringBuilder();
        for (LogManager.LogEntry entry : logs) {
            sb.append(entry.toString()).append("\n");
        }
        
        tvLogs.setText(sb.toString());
    }
    
    private void scrollToBottom() {
        scrollViewLogs.post(() -> scrollViewLogs.fullScroll(View.FOCUS_DOWN));
    }
    
    private void exportLogs() {
        try {
            SimpleDateFormat sdf = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault());
            String filename = "ssh_tunnel_logs_" + sdf.format(new Date()) + ".txt";
            
            File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            File file = new File(downloadsDir, filename);
            
            if (LogManager.getInstance().exportLogs(file)) {
                Toast.makeText(this, "Logs exportados para: " + file.getAbsolutePath(), Toast.LENGTH_LONG).show();
            } else {
                Toast.makeText(this, "Erro ao exportar logs", Toast.LENGTH_SHORT).show();
            }
        } catch (Exception e) {
            Toast.makeText(this, "Erro: " + e.getMessage(), Toast.LENGTH_SHORT).show();
        }
    }
}
