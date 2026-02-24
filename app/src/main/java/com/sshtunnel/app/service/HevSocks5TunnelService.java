package com.sshtunnel.app.service;

import android.net.VpnService;
import android.os.ParcelFileDescriptor;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;

/**
 * HevSocks5TunnelService - baseado no TProxyService do app SocksTun
 */
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
    
    // Carregar biblioteca nativa
    static {
        try {
            System.loadLibrary("hev-socks5-tunnel");
            Log.i(TAG, "Biblioteca hev-socks5-tunnel carregada com sucesso");
        } catch (UnsatisfiedLinkError e) {
            Log.e(TAG, "ERRO FATAL: Não foi possível carregar a biblioteca hev-socks5-tunnel", e);
        }
    }
    
    // Métodos nativos
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
        
        Log.i(TAG, "Iniciando HevSocks5Tunnel com porta SOCKS5: " + socksPort);
        
        try {
            // Criar builder da VPN
            Builder builder = new Builder();
            builder.setMtu(1500);
            builder.addAddress("10.0.0.2", 24);
            builder.addRoute("0.0.0.0", 0);
            builder.addDnsServer("8.8.8.8");
            builder.addDnsServer("8.8.4.4");
            builder.setSession("SSH Tunnel VPN");
            builder.addDisallowedApplication(getPackageName());
            
            // Estabelecer interface TUN
            tunFd = builder.establish();
            if (tunFd == null) {
                Log.e(TAG, "Falha ao estabelecer VPN");
                return;
            }
            
            // Criar arquivo de configuração (igual ao SocksTun)
            File configFile = new File(getCacheDir(), "socks5.conf");
            createConfigFile(configFile);
            
            Log.i(TAG, "Arquivo de configuração criado: " + configFile.getAbsolutePath());
            Log.i(TAG, "Iniciando serviço nativo com fd=" + tunFd.getFd());
            
            // Iniciar serviço nativo
            HevSocks5TunnelStartService(configFile.getAbsolutePath(), tunFd.getFd());
            
            isRunning = true;
            
            // Criar notificação
            startForeground(NOTIFICATION_ID, createNotification());
            
            Log.i(TAG, "HevSocks5Tunnel iniciado com sucesso");
            
        } catch (Exception e) {
            Log.e(TAG, "Erro ao iniciar tunnel", e);
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
        
        // Payload personalizado (via cabeçalho HTTP)
        if (payload != null && !payload.isEmpty()) {
            config.append("  http-upstream: '").append(payload).append("'\n");
        }
        
        // SNI
        if (sni != null && !sni.isEmpty()) {
            config.append("  tls-sni: '").append(sni).append("'\n");
        }
        
        // Proxy
        if (proxyHost != null && !proxyHost.isEmpty() && proxyPort > 0) {
            config.append("  proxy:\n");
            config.append("    address: '").append(proxyHost).append("'\n");
            config.append("    port: ").append(proxyPort).append("\n");
        }
        
        // Autenticação SOCKS5
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
                .setContentText("VPN ativa - SOCKS5: " + socksAddress + ":" + socksPort)
                .setSmallIcon(com.sshtunnel.app.R.drawable.ic_vpn)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .build();
    }
    
    private void stopTunnel() {
        Log.i(TAG, "Parando HevSocks5Tunnel");
        isRunning = false;
        
        // Parar serviço nativo
        try {
            HevSocks5TunnelStopService();
        } catch (Exception e) {
            Log.e(TAG, "Erro ao parar serviço nativo", e);
        }
        
        // Fechar file descriptor
        if (tunFd != null) {
            try {
                tunFd.close();
            } catch (IOException e) {
                Log.e(TAG, "Erro ao fechar tunFd", e);
            }
            tunFd = null;
        }
        
        // Parar foreground service
        stopForeground(true);
        stopSelf();
    }
    
    @Override
    public void onRevoke() {
        stopTunnel();
        super.onRevoke();
    }
    
    @Override
    public void onDestroy() {
        stopTunnel();
        super.onDestroy();
    }
}
