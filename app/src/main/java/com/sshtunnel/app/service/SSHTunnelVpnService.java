package com.sshtunnel.app.service;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.VpnService;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.sshtunnel.app.R;
import com.sshtunnel.app.helper.LogManager;
import com.sshtunnel.app.ui.MainActivity;

import java.io.IOException;

/**
 * VPN Service for SSH Tunnel - Versão com bibliotecas tun2socks funcionais
 */
public class SSHTunnelVpnService extends VpnService {
    
    private static final String TAG = "SSHTunnelVpnService";
    private static final String CHANNEL_ID = "ssh_vpn_channel";
    private static final int NOTIFICATION_ID = 2;
    
    public static final String ACTION_CONNECT = "com.sshtunnel.app.CONNECT";
    public static final String ACTION_DISCONNECT = "com.sshtunnel.app.DISCONNECT";
    
    private ParcelFileDescriptor vpnInterface;
    private Thread vpnThread;
    private boolean isRunning = false;
    private int socksPort = 1080;
    private String socksServerAddress;
    
    @Override
    public void onCreate() {
        super.onCreate();
        LogManager.getInstance().i(TAG, "SSHTunnelVpnService criado");
        createNotificationChannel();
    }
    
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;
        
        String action = intent.getAction();
        
        if (ACTION_CONNECT.equals(action)) {
            socksPort = intent.getIntExtra("socks_port", 1080);
            socksServerAddress = "127.0.0.1:" + socksPort;
            connectVPN();
        } else if (ACTION_DISCONNECT.equals(action)) {
            disconnectVPN();
        }
        
        return START_STICKY;
    }
    
    @Override
    public void onDestroy() {
        super.onDestroy();
        disconnectVPN();
    }
    
    private void connectVPN() {
        if (isRunning) return;
        
        LogManager.getInstance().i(TAG, "Iniciando VPN com porta SOCKS5: " + socksPort);
        
        // Inicializar bibliotecas tun2socks
        Tun2Socks.initialize(this);
        
        try {
            Builder builder = new Builder();
            builder.setMtu(1500);
            builder.addAddress("10.0.0.2", 24);
            builder.addRoute("0.0.0.0", 0);
            builder.addDnsServer("8.8.8.8");
            builder.addDnsServer("8.8.4.4");
            builder.setSession("SSH Tunnel VPN");
            
            // Adicionar apps que não devem ser roteados pela VPN
            builder.addDisallowedApplication(getPackageName());
            
            vpnInterface = builder.establish();
            if (vpnInterface == null) {
                LogManager.getInstance().e(TAG, "Falha ao estabelecer VPN");
                return;
            }
            
            isRunning = true;
            startForeground(NOTIFICATION_ID, buildNotification());
            
            // Iniciar tun2socks em thread separada
            startTun2Socks();
            
        } catch (Exception e) {
            LogManager.getInstance().e(TAG, "Erro: " + e.getMessage());
            disconnectVPN();
        }
    }
    
    private void startTun2Socks() {
        vpnThread = new Thread(() -> {
            String[] parts = socksServerAddress.split(":");
            String host = parts[0];
            int port = Integer.parseInt(parts[1]);
            
            LogManager.getInstance().i(TAG, "Iniciando tun2socks com host=" + host + ", port=" + port);
            
            // Chamar o método startSimpleTun2Socks da biblioteca
            boolean success = Tun2Socks.startSimpleTun2Socks(
                    vpnInterface,
                    1500,
                    host,
                    port
            );
            
            if (success) {
                LogManager.getInstance().i(TAG, "tun2socks iniciado com sucesso");
            } else {
                LogManager.getInstance().e(TAG, "Falha ao iniciar tun2socks");
            }
            
            // Quando o método retornar, a VPN foi desconectada
            if (isRunning) {
                disconnectVPN();
            }
        });
        vpnThread.start();
    }
    
    private void disconnectVPN() {
        isRunning = false;
        
        // Parar tun2socks
        try {
            Tun2Socks.stopTun2Socks();
        } catch (Exception e) {
            Log.e(TAG, "Erro ao parar tun2socks", e);
        }
        
        if (vpnThread != null) {
            try {
                vpnThread.interrupt();
                vpnThread.join(1000);
            } catch (InterruptedException e) {
                Log.e(TAG, "Erro ao parar thread", e);
            }
            vpnThread = null;
        }
        
        if (vpnInterface != null) {
            try {
                vpnInterface.close();
            } catch (IOException e) {
                Log.e(TAG, "Erro ao fechar interface", e);
            }
            vpnInterface = null;
        }
        
        stopForeground(true);
        stopSelf();
    }
    
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "SSH Tunnel VPN", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Notificações do serviço VPN");
            
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }
    
    private Notification buildNotification() {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, intent, PendingIntent.FLAG_IMMUTABLE);
        
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(getString(R.string.app_name) + " VPN")
                .setContentText("VPN ativa - SOCKS5: 127.0.0.1:" + socksPort)
                .setSmallIcon(R.drawable.ic_vpn)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setColor(getResources().getColor(R.color.statusConnected))
                .build();
    }
    
    public static Intent prepare(Context context) {
        return VpnService.prepare(context);
    }
}
