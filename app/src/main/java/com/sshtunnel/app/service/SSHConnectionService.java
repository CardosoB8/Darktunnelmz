package com.sshtunnel.app.service;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Binder;
import android.os.Build;
import android.os.IBinder;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import com.sshtunnel.app.R;
import com.sshtunnel.app.helper.JSchHelper;
import com.sshtunnel.app.helper.LogManager;
import com.sshtunnel.app.model.ConnectionConfig;
import com.sshtunnel.app.model.ConnectionStatus;
import com.sshtunnel.app.ui.MainActivity;

/**
 * Service for managing SSH connection
 */
public class SSHConnectionService extends Service {
    
    private static final String TAG = "SSHConnectionService";
    private static final String CHANNEL_ID = "ssh_tunnel_channel";
    private static final int NOTIFICATION_ID = 1;
    
    private final IBinder binder = new LocalBinder();
    private JSchHelper jschHelper;
    private ConnectionConfig currentConfig;
    private ServiceListener serviceListener;
    
    public interface ServiceListener {
        void onStatusChanged(ConnectionStatus status);
        void onLog(String message);
        void onError(String error);
        void onConnected();
        void onDisconnected();
    }
    
    public class LocalBinder extends Binder {
        public SSHConnectionService getService() {
            return SSHConnectionService.this;
        }
    }
    
    @Override
    public void onCreate() {
        super.onCreate();
        LogManager.getInstance().i(TAG, "SSHConnectionService criado");
        
        jschHelper = new JSchHelper();
        jschHelper.setConnectionListener(new JSchHelper.ConnectionListener() {
            @Override
            public void onStatusChanged(ConnectionStatus status) {
                updateNotification(status);
                if (serviceListener != null) {
                    serviceListener.onStatusChanged(status);
                }
            }
            
            @Override
            public void onLog(String message) {
                LogManager.getInstance().i(TAG, message);
                if (serviceListener != null) {
                    serviceListener.onLog(message);
                }
            }
            
            @Override
            public void onError(String error) {
                LogManager.getInstance().e(TAG, error);
                if (serviceListener != null) {
                    serviceListener.onError(error);
                }
            }
            
            @Override
            public void onConnected() {
                if (serviceListener != null) {
                    serviceListener.onConnected();
                }
            }
            
            @Override
            public void onDisconnected() {
                if (serviceListener != null) {
                    serviceListener.onDisconnected();
                }
                stopForeground(true);
            }
        });
        
        createNotificationChannel();
    }
    
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        LogManager.getInstance().i(TAG, "SSHConnectionService iniciado");
        return START_STICKY;
    }
    
    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return binder;
    }
    
    @Override
    public void onDestroy() {
        super.onDestroy();
        disconnect();
        LogManager.getInstance().i(TAG, "SSHConnectionService destruído");
    }
    
    /**
     * Connect to SSH server
     */
    public void connect(ConnectionConfig config) {
        if (jschHelper.isConnected()) {
            LogManager.getInstance().w(TAG, "Já conectado, desconectando primeiro…");
            disconnect();
        }
        
        this.currentConfig = config;
        jschHelper.setConfig(config);
        
        // Start as foreground service
        startForeground(NOTIFICATION_ID, buildNotification(ConnectionStatus.CONNECTING));
        
        jschHelper.connect();
    }
    
    /**
     * Disconnect from SSH server
     */
    public void disconnect() {
        if (jschHelper != null) {
            jschHelper.disconnect();
        }
        stopForeground(true);
    }
    
    /**
     * Check if connected
     */
    public boolean isConnected() {
        return jschHelper != null && jschHelper.isConnected();
    }
    
    /**
     * Get current config
     */
    public ConnectionConfig getCurrentConfig() {
        return currentConfig;
    }
    
    /**
     * Get local SOCKS5 port
     */
    public int getLocalSocksPort() {
        return jschHelper != null ? jschHelper.getLocalSocksPort() : 1080;
    }
    
    /**
     * Set service listener
     */
    public void setServiceListener(ServiceListener listener) {
        this.serviceListener = listener;
    }
    
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    getString(R.string.notification_channel_name),
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription(getString(R.string.notification_channel_desc));
            
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
        Intent disconnectIntent = new Intent(this, SSHConnectionService.class);
        disconnectIntent.setAction("DISCONNECT");
        PendingIntent disconnectPendingIntent = PendingIntent.getService(
                this, 1, disconnectIntent, PendingIntent.FLAG_IMMUTABLE
        );
        
        String contentText;
        int color;
        
        switch (status) {
            case CONNECTED:
                contentText = currentConfig != null 
                        ? getString(R.string.notification_text_connected, currentConfig.getHost(), currentConfig.getPort())
                        : getString(R.string.notification_title_connected);
                color = getResources().getColor(R.color.statusConnected);
                break;
            case CONNECTING:
                contentText = "Conectando…";
                color = getResources().getColor(R.color.statusConnecting);
                break;
            case ERROR:
                contentText = "Erro na conexão";
                color = getResources().getColor(R.color.statusError);
                break;
            default:
                contentText = "Desconectado";
                color = getResources().getColor(R.color.statusDisconnected);
        }
        
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(getString(R.string.app_name))
                .setContentText(contentText)
                .setSmallIcon(R.drawable.ic_vpn)
                .setContentIntent(pendingIntent)
                .setOngoing(status == ConnectionStatus.CONNECTED || status == ConnectionStatus.CONNECTING)
                .setColor(color);
        
        if (status == ConnectionStatus.CONNECTED) {
            builder.addAction(R.drawable.ic_vpn, getString(R.string.notification_action_disconnect), disconnectPendingIntent);
        }
        
        return builder.build();
    }
    
    private void updateNotification(ConnectionStatus status) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, buildNotification(status));
        }
    }
}
