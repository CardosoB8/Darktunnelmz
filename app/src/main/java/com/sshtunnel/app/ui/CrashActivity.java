package com.sshtunnel.app.ui;

import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

import com.sshtunnel.app.R;

public class CrashActivity extends AppCompatActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_crash);

        TextView tvError = findViewById(R.id.tvError);
        Button btnRestart = findViewById(R.id.btnRestart);
        Button btnClose = findViewById(R.id.btnClose);

        String error = getIntent().getStringExtra("error");
        tvError.setText("Ops! Algo deu errado:\n\n" + error);

        btnRestart.setOnClickListener(v -> {
            Intent intent = new Intent(this, MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
            finish();
        });

        btnClose.setOnClickListener(v -> finishAffinity());
    }
}
