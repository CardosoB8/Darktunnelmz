package com.sshtunnel.app.service;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.net.VpnService;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.sshtunnel.app.R;
import com.sshtunnel.app.helper.LogManager;
import com.sshtunnel.app.model.ConnectionStatus;
import com.sshtunnel.app.ui.MainActivity;

import java.io.IOException;
import java.util.Arrays;

/**
 * VPN Service for SSH Tunnel using tun2socks
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
    
    @Override
    public void onCreate() {
        super.onCreate();
        LogManager.getInstance().i(TAG, "SSHTunnelVpnService criado");
        createNotificationChannel();
    }
    
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            return START_NOT_STICKY;
        }
        
        String action = intent.getAction();
        
        if (ACTION_CONNECT.equals(action)) {
            socksPort = intent.getIntExtra("socks_port", 1080);
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
        LogManager.getInstance().i(TAG, "SSHTunnelVpnService destruído");
    }
    
    /**
     * Connect VPN
     */
    private void connectVPN() {
        if (isRunning) {
            LogManager.getInstance().w(TAG, "VPN já está rodando");
            return;
        }
        
        LogManager.getInstance().i(TAG, "Iniciando VPN…");
        
        Builder builder = new Builder();
        
        // VPN Configuration
        builder.setMtu(1500);
        builder.addAddress("10.0.0.2", 24);
        builder.addRoute("0.0.0.0", 0);
        builder.addDnsServer("8.8.8.8");
        builder.addDnsServer("8.8.4.4");
        builder.setSession(getString(R.string.app_name));
        
        // Allow bypass
        builder.allowBypass();
        
        // Set underlying networks (for Android 7.0+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            builder.setUnderlyingNetworks(null);
        }
        
        // Establish VPN
        try {
            vpnInterface = builder.establish();
            if (vpnInterface == null) {
                LogManager.getInstance().e(TAG, "Falha ao estabelecer VPN");
                return;
            }
            
            isRunning = true;
            startForeground(NOTIFICATION_ID, buildNotification(ConnectionStatus.CONNECTED));
            
            // Start tun2socks
            startTun2Socks();
            
            LogManager.getInstance().i(TAG, "VPN iniciada com sucesso");
            
        } catch (Exception e) {
            LogManager.getInstance().e(TAG, "Erro ao iniciar VPN: " + e.getMessage());
            disconnectVPN();
        }
    }
    
    /**
     * Disconnect VPN
     */
    private void disconnectVPN() {
        LogManager.getInstance().i(TAG, "Parando VPN…");
        
        isRunning = false;
        
        // Stop tun2socks
        stopTun2Socks();
        
        // Close VPN interface
        if (vpnInterface != null) {
            try {
                vpnInterface.close();
            } catch (IOException e) {
                Log.e(TAG, "Erro ao fechar interface VPN", e);
            }
            vpnInterface = null;
        }
        
        stopForeground(true);
        stopSelf();
        
        LogManager.getInstance().i(TAG, "VPN parada");
    }
    
    /**
     * Start tun2socks to route traffic through SOCKS5 proxy
     */
    private void startTun2Socks() {
        vpnThread = new Thread(() -> {
            try {
                int fd = vpnInterface.getFd();
                LogManager.getInstance().i(TAG, "Iniciando tun2socks com fd=" + fd + ", socks=127.0.0.1:" + socksPort);
                
                // Run tun2socks
                // Note: In a real implementation, you would use the badvpn-tun2socks binary
                // For this example, we'll use a Java implementation
                runTun2SocksJava(fd);
                
            } catch (Exception e) {
                LogManager.getInstance().e(TAG, "Erro no tun2socks: " + e.getMessage());
            }
        });
        
        vpnThread.start();
    }
    
    /**
     * Java implementation of tun2socks functionality
     * This is a simplified version - production would use native badvpn-tun2socks
     */
    private void runTun2SocksJava(int vpnFd) {
        try {
            com.londonx.tun2socks.Tun2Socks.start(
                vpnFd,
                1500,
                "10.0.0.2",
                "255.255.255.0",
                "127.0.0.1:" + socksPort,
                "127.0.0.1:7300",
                1
            );
        } catch (Exception e) {
            Log.e(TAG, "Erro ao iniciar tun2socks", e);
        }
    }
                Thread.currentThread().interrupt();
                break;
            }
        }
    }
    
    /**
     * Stop tun2socks
     */
    private void stopTun2Socks() {
        isRunning = false;
        
        if (vpnThread != null) {
            vpnThread.interrupt();
            vpnThread = null;
        }
    }
    
    /**
     * Check if VPN is running
     */
    public boolean isRunning() {
        return isRunning;
    }
    
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "SSH Tunnel VPN",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Notificações do serviço VPN SSH Tunnel");
            
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
    
    private Notification buildNotification(ConnectionStatus status) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, intent, PendingIntent.FLAG_IMMUTABLE
        );
        
        // Disconnect action
        Intent disconnectIntent = new Intent(this, SSHTunnelVpnService.class);
        disconnectIntent.setAction(ACTION_DISCONNECT);
        PendingIntent disconnectPendingIntent = PendingIntent.getService(
                this, 1, disconnectIntent, PendingIntent.FLAG_IMMUTABLE
        );
        
        String contentText = "VPN ativa - SOCKS5: 127.0.0.1:" + socksPort;
        int color = getResources().getColor(R.color.statusConnected);
        
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(getString(R.string.app_name) + " VPN")
                .setContentText(contentText)
                .setSmallIcon(R.drawable.ic_vpn)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setColor(color)
                .addAction(R.drawable.ic_vpn, getString(R.string.notification_action_disconnect), disconnectPendingIntent)
                .build();
    }
    
    /**
     * Prepare VPN (called from Activity)
     */
    public static Intent prepare(android.content.Context context) {
        return VpnService.prepare(context);
    }
}
