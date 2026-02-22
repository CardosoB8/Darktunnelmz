package com.sshtunnel.app.utils;

import android.content.Context;
import android.content.Intent;
import android.os.Environment;
import android.util.Log;

import java.io.File;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Classe para capturar e salvar crashes do app
 */
public class CrashHandler implements Thread.UncaughtExceptionHandler {

    private static final String TAG = "CrashHandler";
    private static final String CRASH_DIR = "SSHTunnel_crashes";
    private final Context context;
    private final Thread.UncaughtExceptionHandler defaultHandler;

    public CrashHandler(Context context) {
        this.context = context;
        this.defaultHandler = Thread.getDefaultUncaughtExceptionHandler();
    }

    @Override
    public void uncaughtException(Thread thread, Throwable ex) {
        // Salvar o crash em arquivo
        saveCrashToFile(ex);

        // Mostrar no logcat
        Log.e(TAG, "🚨 CRASH DETECTADO! " + ex.getMessage());
        ex.printStackTrace();

        // Se quiser mostrar uma Activity de erro (opcional)
        // showErrorActivity(ex);

        // Chamar o handler padrão (que fecha o app)
        if (defaultHandler != null) {
            defaultHandler.uncaughtException(thread, ex);
        } else {
            System.exit(1);
        }
    }

    private void saveCrashToFile(Throwable ex) {
        try {
            // Criar pasta para os crashes
            File crashDir = new File(context.getExternalFilesDir(null), CRASH_DIR);
            if (!crashDir.exists()) {
                crashDir.mkdirs();
            }

            // Nome do arquivo com timestamp
            String timestamp = new SimpleDateFormat("yyyy-MM-dd_HH-mm-ss", Locale.US).format(new Date());
            File crashFile = new File(crashDir, "crash_" + timestamp + ".txt");

            // Escrever detalhes do crash
            FileWriter writer = new FileWriter(crashFile);
            writer.write("=== CRASH REPORT ===\n");
            writer.write("Data: " + new Date().toString() + "\n");
            writer.write("App: SSH Tunnel\n");
            writer.write("Versão: " + getAppVersion() + "\n\n");
            writer.write("=== EXCEÇÃO ===\n");
            
            StringWriter sw = new StringWriter();
            PrintWriter pw = new PrintWriter(sw);
            ex.printStackTrace(pw);
            writer.write(sw.toString());

            writer.flush();
            writer.close();

            Log.i(TAG, "✅ Crash salvo em: " + crashFile.getAbsolutePath());

        } catch (Exception e) {
            Log.e(TAG, "Erro ao salvar crash: " + e.getMessage());
        }
    }

    private String getAppVersion() {
        try {
            return context.getPackageManager()
                    .getPackageInfo(context.getPackageName(), 0)
                    .versionName;
        } catch (Exception e) {
            return "desconhecida";
        }
    }

    // Opcional: mostrar uma tela de erro amigável
    private void showErrorActivity(Throwable ex) {
        Intent intent = new Intent(context, com.sshtunnel.app.ui.CrashActivity.class);
        intent.putExtra("error", ex.getMessage());
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }
}
