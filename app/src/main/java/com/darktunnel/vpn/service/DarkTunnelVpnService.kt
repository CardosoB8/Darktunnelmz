package com.darktunnel.vpn.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import androidx.core.app.NotificationCompat
import com.darktunnel.vpn.R
import com.darktunnel.vpn.ui.MainActivity
import timber.log.Timber

/**
 * DarkTunnel VPN Service
 * 
 * Core VPN service that extends Android's VpnService.
 * Manages the VPN tunnel, notification, and connection state.
 * 
 * Features:
 * - Foreground service with persistent notification
 * - VPN tunnel management
 * - Connection statistics tracking
 * - Auto-reconnect on failure
 * 
 * TODO: Implement actual VPN tunnel logic
 * 
 * @author DarkTunnel Team
 * @version 1.0.0
 */
class DarkTunnelVpnService : VpnService() {

    private var vpnInterface: ParcelFileDescriptor? = null
    private var isRunning = false
    
    companion object {
        const val ACTION_CONNECT = "com.darktunnel.vpn.CONNECT"
        const val ACTION_DISCONNECT = "com.darktunnel.vpn.DISCONNECT"
        const val NOTIFICATION_CHANNEL_ID = "vpn_service_channel"
        const val NOTIFICATION_ID = 1001
    }

    override fun onCreate() {
        super.onCreate()
        Timber.d("DarkTunnelVpnService created")
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_CONNECT -> {
                val serverAddress = intent.getStringExtra("server") ?: return START_NOT_STICKY
                val serverPort = intent.getIntExtra("port", 443)
                connect(serverAddress, serverPort)
            }
            ACTION_DISCONNECT -> {
                disconnect()
            }
        }
        return START_STICKY
    }

    /**
     * Establish VPN connection
     */
    private fun connect(serverAddress: String, serverPort: Int) {
        if (isRunning) {
            Timber.w("VPN already running")
            return
        }
        
        Timber.d("Connecting to $serverAddress:$serverPort")
        
        // Build VPN interface
        val builder = Builder()
            .setSession("DarkTunnel VPN")
            .addAddress("10.0.0.2", 24)
            .addDnsServer("8.8.8.8")
            .addRoute("0.0.0.0", 0)
            .establish()
        
        vpnInterface = builder
        
        if (vpnInterface != null) {
            isRunning = true
            startForeground(NOTIFICATION_ID, buildNotification("Connected to $serverAddress"))
            Timber.d("VPN interface established")
            
            // TODO: Start packet processing threads
            // startVpnThreads()
        } else {
            Timber.e("Failed to establish VPN interface")
        }
    }

    /**
     * Disconnect VPN
     */
    private fun disconnect() {
        Timber.d("Disconnecting VPN")
        
        isRunning = false
        
        // Close VPN interface
        try {
            vpnInterface?.close()
        } catch (e: Exception) {
            Timber.e(e, "Error closing VPN interface")
        }
        vpnInterface = null
        
        // Stop foreground service
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        
        Timber.d("VPN disconnected")
    }

    override fun onDestroy() {
        super.onDestroy()
        disconnect()
        Timber.d("DarkTunnelVpnService destroyed")
    }

    /**
     * Create notification channel for Android O+
     */
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "VPN Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows VPN connection status"
                setShowBadge(false)
            }
            
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    /**
     * Build notification for foreground service
     */
    private fun buildNotification(contentText: String): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )
        
        val disconnectIntent = PendingIntent.getService(
            this,
            0,
            Intent(this, DarkTunnelVpnService::class.java).apply {
                action = ACTION_DISCONNECT
            },
            PendingIntent.FLAG_IMMUTABLE
        )
        
        return NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle("DarkTunnel VPN")
            .setContentText(contentText)
            .setSmallIcon(R.drawable.ic_vpn_on)
            .setContentIntent(pendingIntent)
            .addAction(R.drawable.ic_vpn_off, "Disconnect", disconnectIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    /**
     * Update notification text
     */
    private fun updateNotification(text: String) {
        val notificationManager = getSystemService(NotificationManager::class.java)
        notificationManager.notify(NOTIFICATION_ID, buildNotification(text))
    }
}
