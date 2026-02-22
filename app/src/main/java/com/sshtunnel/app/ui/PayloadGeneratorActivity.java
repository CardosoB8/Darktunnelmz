package com.sshtunnel.app.ui;

import android.content.Intent;
import android.os.Bundle;
import android.view.MenuItem;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.Toolbar;
import androidx.cardview.widget.CardView;

import com.google.android.material.textfield.TextInputEditText;
import com.sshtunnel.app.R;
import com.sshtunnel.app.helper.PayloadGenerator;

/**
 * Activity for generating HTTP/HTTPS payloads with placeholders
 */
public class PayloadGeneratorActivity extends AppCompatActivity {
    
    private TextInputEditText etPayloadEditor;
    private TextView tvPreview;
    private CardView cardPreview;
    
    private Button btnInsertHost;
    private Button btnInsertPort;
    private Button btnInsertMethod;
    private Button btnInsertProtocol;
    private Button btnInsertCrlf;
    private Button btnInsertCrlf2;
    private Button btnInsertUa;
    private Button btnInsertRaw;
    
    private Button btnPreview;
    private Button btnApplyPayload;
    private Button btnUseExampleConnect;
    private Button btnUseExampleGet;
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_payload_generator);
        
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
        
        // Load current payload if provided
        String currentPayload = getIntent().getStringExtra("current_payload");
        if (currentPayload != null && !currentPayload.isEmpty()) {
            etPayloadEditor.setText(currentPayload);
        }
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
        etPayloadEditor = findViewById(R.id.etPayloadEditor);
        tvPreview = findViewById(R.id.tvPreview);
        cardPreview = findViewById(R.id.cardPreview);
        
        btnInsertHost = findViewById(R.id.btnInsertHost);
        btnInsertPort = findViewById(R.id.btnInsertPort);
        btnInsertMethod = findViewById(R.id.btnInsertMethod);
        btnInsertProtocol = findViewById(R.id.btnInsertProtocol);
        btnInsertCrlf = findViewById(R.id.btnInsertCrlf);
        btnInsertCrlf2 = findViewById(R.id.btnInsertCrlf2);
        btnInsertUa = findViewById(R.id.btnInsertUa);
        btnInsertRaw = findViewById(R.id.btnInsertRaw);
        
        btnPreview = findViewById(R.id.btnPreview);
        btnApplyPayload = findViewById(R.id.btnApplyPayload);
        btnUseExampleConnect = findViewById(R.id.btnUseExampleConnect);
        btnUseExampleGet = findViewById(R.id.btnUseExampleGet);
    }
    
    private void setupListeners() {
        // Placeholder buttons
        btnInsertHost.setOnClickListener(v -> insertPlaceholder(PayloadGenerator.PLACEHOLDER_HOST));
        btnInsertPort.setOnClickListener(v -> insertPlaceholder(PayloadGenerator.PLACEHOLDER_PORT));
        btnInsertMethod.setOnClickListener(v -> insertPlaceholder(PayloadGenerator.PLACEHOLDER_METHOD));
        btnInsertProtocol.setOnClickListener(v -> insertPlaceholder(PayloadGenerator.PLACEHOLDER_PROTOCOL));
        btnInsertCrlf.setOnClickListener(v -> insertPlaceholder(PayloadGenerator.PLACEHOLDER_CRLF));
        btnInsertCrlf2.setOnClickListener(v -> insertPlaceholder(PayloadGenerator.PLACEHOLDER_CRLF2));
        btnInsertUa.setOnClickListener(v -> insertPlaceholder(PayloadGenerator.PLACEHOLDER_UA));
        btnInsertRaw.setOnClickListener(v -> insertPlaceholder(PayloadGenerator.PLACEHOLDER_RAW));
        
        // Preview button
        btnPreview.setOnClickListener(v -> showPreview());
        
        // Apply button
        btnApplyPayload.setOnClickListener(v -> applyPayload());
        
        // Example buttons
        btnUseExampleConnect.setOnClickListener(v -> {
            etPayloadEditor.setText(PayloadGenerator.EXAMPLE_CONNECT);
            Toast.makeText(this, "Exemplo CONNECT carregado", Toast.LENGTH_SHORT).show();
        });
        
        btnUseExampleGet.setOnClickListener(v -> {
            etPayloadEditor.setText(PayloadGenerator.EXAMPLE_GET);
            Toast.makeText(this, "Exemplo GET carregado", Toast.LENGTH_SHORT).show();
        });
    }
    
    private void insertPlaceholder(String placeholder) {
        String currentText = etPayloadEditor.getText() != null ? etPayloadEditor.getText().toString() : "";
        int cursorPosition = etPayloadEditor.getSelectionStart();
        
        String newText = PayloadGenerator.insertAtPosition(currentText, placeholder, cursorPosition);
        etPayloadEditor.setText(newText);
        etPayloadEditor.setSelection(cursorPosition + placeholder.length());
    }
    
    private void showPreview() {
        String template = etPayloadEditor.getText() != null ? etPayloadEditor.getText().toString() : "";
        
        if (template.isEmpty()) {
            Toast.makeText(this, "Payload está vazio", Toast.LENGTH_SHORT).show();
            return;
        }
        
        String preview = PayloadGenerator.previewPayload(template);
        tvPreview.setText(preview);
        cardPreview.setVisibility(View.VISIBLE);
    }
    
    private void applyPayload() {
        String payload = etPayloadEditor.getText() != null ? etPayloadEditor.getText().toString() : "";
        
        Intent resultIntent = new Intent();
        resultIntent.putExtra("payload", payload);
        setResult(RESULT_OK, resultIntent);
        finish();
    }
}
