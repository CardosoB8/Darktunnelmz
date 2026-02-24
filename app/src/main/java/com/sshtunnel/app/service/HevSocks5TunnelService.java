package com.sshtunnel.app.service;

import android.net.VpnService;
import android.os.ParcelFileDescriptor;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;

public class HevSocks5TunnelService extends VpnService {
    
    private static final String TAG = "HevSocks5Tunnel";
    private static final String CHANNEL_ID = "hev_socks5_channel";
    private static final int NOTIFICATION_ID = 2;
    
    public static final String ACTION_CONNECT = "hev.sockstun.CONNECT";
    public static final String ACTION_DISCONNECT = "hev.sockstun.DISCONNECT";
    
    private ParcelFileDescriptor tunFd;
    private boolean isRunning = false;
    private int socksPort = 1080;
    private String socksAddress = "127.0.0.1";
    private String socksUser = "";
    private String socksPass = "";
    private String payload = "";
    private String sni = "";
    private String proxyHost = "";
    private int proxyPort = 0;
    
    static {
        try {
            System.loadLibrary("hev-socks5-tunnel");
            Log.i(TAG, "✅ Biblioteca hev-socks5-tunnel carregada");
        } catch (UnsatisfiedLinkError e) {
            Log.e(TAG, "❌ ERRO FATAL: Não foi possível carregar a biblioteca", e);
        }
    }
    
    private static native void HevSocks5TunnelStartService(String configPath, int tunFd);
    private static native void HevSocks5TunnelStopService();
    
    @Override
    public int onStartCommand(android.content.Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;
        
        String action = intent.getAction();
        
        if (ACTION_CONNECT.equals(action)) {
            socksPort = intent.getIntExtra("socks_port", 1080);
            socksAddress = intent.getStringExtra("socks_address");
            socksUser = intent.getStringExtra("socks_user") != null ? intent.getStringExtra("socks_user") : "";
            socksPass = intent.getStringExtra("socks_pass") != null ? intent.getStringExtra("socks_pass") : "";
            payload = intent.getStringExtra("payload") != null ? intent.getStringExtra("payload") : "";
            sni = intent.getStringExtra("sni") != null ? intent.getStringExtra("sni") : "";
            proxyHost = intent.getStringExtra("proxy_host") != null ? intent.getStringExtra("proxy_host") : "";
            proxyPort = intent.getIntExtra("proxy_port", 0);
            
            startTunnel();
        } else if (ACTION_DISCONNECT.equals(action)) {
            stopTunnel();
        }
        
        return START_STICKY;
    }
    
    private void startTunnel() {
        if (isRunning) return;
        
        Log.i(TAG, "🚀 Iniciando HevSocks5Tunnel...");
        
        try {
            // Validar se a biblioteca foi carregada
            try {
                Class.forName("com.sshtunnel.app.service.HevSocks5TunnelService");
            } catch (ClassNotFoundException e) {
                Log.e(TAG, "Classe não encontrada", e);
                stopSelf();
                return;
            }
            
            Builder builder = new Builder();
            builder.setMtu(1500);
            builder.addAddress("10.0.0.2", 24);
            builder.addRoute("0.0.0.0", 0);
            builder.addDnsServer("8.8.8.8");
            builder.addDnsServer("8.8.4.4");
            builder.setSession("SSH Tunnel VPN");
            builder.addDisallowedApplication(getPackageName());
            
            tunFd = builder.establish();
            
            // VALIDAÇÃO CRÍTICA
            if (tunFd == null) {
                Log.e(TAG, "❌ tunFd é NULL - VPN não estabelecida");
                stopSelf();
                return;
            }
            
            int fd = tunFd.getFd();
            if (fd < 0) {
                Log.e(TAG, "❌ File descriptor inválido: " + fd);
                stopSelf();
                return;
            }
            
            Log.i(TAG, "✅ tunFd criado com sucesso. fd=" + fd);
            
            File configFile = new File(getCacheDir(), "socks5.conf");
            createConfigFile(configFile);
            
            Log.i(TAG, "📄 Config file criado: " + configFile.getAbsolutePath());
            
            // CHAMADA NATIVA
            try {
                HevSocks5TunnelStartService(configFile.getAbsolutePath(), fd);
                Log.i(TAG, "✅ HevSocks5TunnelStartService executado");
            } catch (UnsatisfiedLinkError e) {
                Log.e(TAG, "❌ Erro nativo: " + e.getMessage());
                stopSelf();
                return;
            }
            
            isRunning = true;
            startForeground(NOTIFICATION_ID, createNotification());
            Log.i(TAG, "🎉 Tunnel iniciado com sucesso!");
            
        } catch (Exception e) {
            Log.e(TAG, "❌ Exceção em startTunnel", e);
            stopTunnel();
        }
    }
    
    private void createConfigFile(File file) throws IOException {
        FileOutputStream fos = new FileOutputStream(file, false);
        
        StringBuilder config = new StringBuilder();
        config.append("misc:\n");
        config.append("  task-stack-size: 20480\n");
        config.append("\n");
        config.append("tunnel:\n");
        config.append("  mtu: 1500\n");
        config.append("\n");
        config.append("socks5:\n");
        config.append("  port: ").append(socksPort).append("\n");
        config.append("  address: '").append(socksAddress).append("'\n");
        config.append("  udp: 'tcp'\n");
        
        if (payload != null && !payload.isEmpty()) {
            config.append("  http-upstream: '").append(payload).append("'\n");
        }
        
        if (sni != null && !sni.isEmpty()) {
            config.append("  tls-sni: '").append(sni).append("'\n");
        }
        
        if (proxyHost != null && !proxyHost.isEmpty() && proxyPort > 0) {
            config.append("  proxy:\n");
            config.append("    address: '").append(proxyHost).append("'\n");
            config.append("    port: ").append(proxyPort).append("\n");
        }
        
        if (socksUser != null && !socksUser.isEmpty() && 
            socksPass != null && !socksPass.isEmpty()) {
            config.append("  username: '").append(socksUser).append("'\n");
            config.append("  password: '").append(socksPass).append("'\n");
        }
        
        config.append("\n");
        config.append("mapdns:\n");
        config.append("  address: 8.8.8.8\n");
        config.append("  port: 53\n");
        config.append("  network: 240.0.0.0\n");
        config.append("  netmask: 240.0.0.0\n");
        config.append("  cache-size: 10000\n");
        
        fos.write(config.toString().getBytes());
        fos.close();
        Log.i(TAG, "📝 Configuração salva:\n" + config.toString());
    }
    
    private android.app.Notification createNotification() {
        android.content.Intent intent = new android.content.Intent(this, 
                com.sshtunnel.app.ui.MainActivity.class);
        intent.setFlags(android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP | 
                       android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP);
        android.app.PendingIntent pendingIntent = android.app.PendingIntent.getActivity(
                this, 0, intent, android.app.PendingIntent.FLAG_IMMUTABLE);
        
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(getString(com.sshtunnel.app.R.string.app_name) + " VPN")
                .setContentText("VPN ativa - " + socksAddress + ":" + socksPort)
                .setSmallIcon(com.sshtunnel.app.R.drawable.ic_vpn)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .build();
    }
    
    private void stopTunnel() {
        Log.i(TAG, "🛑 Parando HevSocks5Tunnel...");
        isRunning = false;
        
        try {
            HevSocks5TunnelStopService();
        } catch (Exception e) {
            Log.e(TAG, "Erro ao parar serviço nativo", e);
        }
        
        if (tunFd != null) {
            try {
                tunFd.close();
            } catch (IOException e) {
                Log.e(TAG, "Erro ao fechar tunFd", e);
            }
            tunFd = null;
        }
        
        stopForeground(true);
        stopSelf();
    }
    
    @Override
    public void onRevoke() {
        Log.i(TAG, "🔄 onRevoke chamado");
        stopTunnel();
        super.onRevoke();
    }
    
    @Override
    public void onDestroy() {
        Log.i(TAG, "💥 onDestroy chamado");
        stopTunnel();
        super.onDestroy();
    }
}
