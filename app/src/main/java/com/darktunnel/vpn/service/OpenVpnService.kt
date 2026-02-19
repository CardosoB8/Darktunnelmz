package com.darktunnel.vpn.service

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
 * OpenVPN Service
 * 
 * VPN service implementation for OpenVPN protocol.
 * 
 * TODO: Integrate with ics-openvpn library
 * This is currently a placeholder that extends the base VPN service.
 * 
 * OpenVPN Integration Steps:
 * 1. Add ics-openvpn dependency
 * 2. Implement VpnProfile management
 * 3. Parse OpenVPN configuration files (.ovpn)
  * 4. Handle certificate and key management
 * 
 * @author DarkTunnel Team
 * @version 1.0.0
 */
class OpenVpnService : VpnService() {

    private var vpnInterface: ParcelFileDescriptor? = null
    private var isRunning = false
    
    // OpenVPN configuration
    private var vpnConfig: OpenVpnConfig? = null

    companion object {
        const val ACTION_CONNECT = "com.darktunnel.vpn.openvpn.CONNECT"
        const val ACTION_DISCONNECT = "com.darktunnel.vpn.openvpn.DISCONNECT"
        const val NOTIFICATION_CHANNEL_ID = "openvpn_channel"
        const val NOTIFICATION_ID = 1003
        
        // Configuration keys
        const val EXTRA_CONFIG = "config"
        const val EXTRA_SERVER = "server"
        const val EXTRA_PORT = "port"
        const val EXTRA_PROTOCOL = "protocol"
        const val EXTRA_USERNAME = "username"
        const val EXTRA_PASSWORD = "password"
        const val EXTRA_CA_CERT = "ca_cert"
        const val EXTRA_CLIENT_CERT = "client_cert"
        const val EXTRA_CLIENT_KEY = "client_key"
    }

    override fun onCreate() {
        super.onCreate()
        Timber.d("OpenVpnService created")
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_CONNECT -> {
                val config = parseConfigFromIntent(intent)
                connect(config)
            }
            ACTION_DISCONNECT -> {
                disconnect()
            }
        }
        return START_STICKY
    }

    /**
     * Parse OpenVPN configuration from intent extras
     */
    private fun parseConfigFromIntent(intent: Intent): OpenVpnConfig {
        // Check if full config is provided
        intent.getStringExtra(EXTRA_CONFIG)?.let {
            return parseOvpnConfig(it)
        }
        
        // Otherwise build from individual parameters
        return OpenVpnConfig(
            server = intent.getStringExtra(EXTRA_SERVER) ?: "",
            port = intent.getIntExtra(EXTRA_PORT, 1194),
            protocol = intent.getStringExtra(EXTRA_PROTOCOL) ?: "udp",
            username = intent.getStringExtra(EXTRA_USERNAME),
            password = intent.getStringExtra(EXTRA_PASSWORD),
            caCert = intent.getStringExtra(EXTRA_CA_CERT),
            clientCert = intent.getStringExtra(EXTRA_CLIENT_CERT),
            clientKey = intent.getStringExtra(EXTRA_CLIENT_KEY)
        )
    }

    /**
     * Parse .ovpn configuration file content
     * 
     * TODO: Implement full OpenVPN config parsing
     */
    private fun parseOvpnConfig(configContent: String): OpenVpnConfig {
        val lines = configContent.lines()
        
        var server = ""
        var port = 1194
        var protocol = "udp"
        var username: String? = null
        var password: String? = null
        var caCert: String? = null
        var clientCert: String? = null
        var clientKey: String? = null
        
        var inCaSection = false
        var inCertSection = false
        var inKeySection = false
        val caBuilder = StringBuilder()
        val certBuilder = StringBuilder()
        val keyBuilder = StringBuilder()
        
        for (line in lines) {
            val trimmed = line.trim()
            
            when {
                trimmed.startsWith("remote ") -> {
                    val parts = trimmed.split(" ")
                    if (parts.size >= 2) {
                        server = parts[1]
                        if (parts.size >= 3) {
                            port = parts[2].toIntOrNull() ?: 1194
                        }
                    }
                }
                trimmed == "proto tcp" -> protocol = "tcp"
                trimmed == "proto udp" -> protocol = "udp"
                trimmed.startsWith("<ca>") -> inCaSection = true
                trimmed.startsWith("</ca>") -> {
                    inCaSection = false
                    caCert = caBuilder.toString()
                }
                trimmed.startsWith("<cert>") -> inCertSection = true
                trimmed.startsWith("</cert>") -> {
                    inCertSection = false
                    clientCert = certBuilder.toString()
                }
                trimmed.startsWith("<key>") -> inKeySection = true
                trimmed.startsWith("</key>") -> {
                    inKeySection = false
                    clientKey = keyBuilder.toString()
                }
                inCaSection && trimmed.isNotEmpty() -> caBuilder.appendLine(trimmed)
                inCertSection && trimmed.isNotEmpty() -> certBuilder.appendLine(trimmed)
                inKeySection && trimmed.isNotEmpty() -> keyBuilder.appendLine(trimmed)
            }
        }
        
        return OpenVpnConfig(
            server = server,
            port = port,
            protocol = protocol,
            username = username,
            password = password,
            caCert = caCert,
            clientCert = clientCert,
            clientKey = clientKey
        )
    }

    /**
     * Establish OpenVPN connection
     * 
     * TODO: Implement actual OpenVPN connection using ics-openvpn
     */
    private fun connect(config: OpenVpnConfig) {
        if (isRunning) {
            Timber.w("OpenVPN already running")
            return
        }
        
        Timber.d("Connecting OpenVPN to ${config.server}:${config.port}")
        
        // Validate configuration
        if (config.server.isBlank()) {
            Timber.e("Invalid OpenVPN configuration: missing server")
            return
        }
        
        // Build VPN interface
        val builder = Builder()
            .setSession("DarkTunnel OpenVPN")
            .addAddress("10.8.0.2", 24)
            .addDnsServer("8.8.8.8")
            .addRoute("0.0.0.0", 0)
            .setMtu(1500)
        
        if (config.protocol == "tcp") {
            builder.allowFamily(android.system.OsConstants.AF_INET)
        }
        
        vpnInterface = builder.establish()
        
        if (vpnInterface != null) {
            isRunning = true
            vpnConfig = config
            
            startForeground(
                NOTIFICATION_ID,
                buildNotification("OpenVPN: ${config.server}")
            )
            
            Timber.d("OpenVPN interface established")
            
            // TODO: Initialize OpenVPN connection
            // - Load VPN profile
            // - Start VPN thread
            // - Handle authentication
            
        } else {
            Timber.e("Failed to establish OpenVPN interface")
        }
    }

    /**
     * Disconnect OpenVPN
     */
    private fun disconnect() {
        Timber.d("Disconnecting OpenVPN")
        
        isRunning = false
        
        // TODO: Stop OpenVPN connection
        
        try {
            vpnInterface?.close()
        } catch (e: Exception) {
            Timber.e(e, "Error closing OpenVPN interface")
        }
        vpnInterface = null
        vpnConfig = null
        
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        
        Timber.d("OpenVPN disconnected")
    }

    override fun onDestroy() {
        super.onDestroy()
        disconnect()
        Timber.d("OpenVpnService destroyed")
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "OpenVPN",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "OpenVPN connection status"
                setShowBadge(false)
            }
            
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(contentText: String): android.app.Notification {
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )
        
        val disconnectIntent = PendingIntent.getService(
            this,
            0,
            Intent(this, OpenVpnService::class.java).apply {
                action = ACTION_DISCONNECT
            },
            PendingIntent.FLAG_IMMUTABLE
        )
        
        return NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle("DarkTunnel OpenVPN")
            .setContentText(contentText)
            .setSmallIcon(R.drawable.ic_vpn_on)
            .setContentIntent(pendingIntent)
            .addAction(R.drawable.ic_vpn_off, "Disconnect", disconnectIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    // Data class for OpenVPN configuration
    data class OpenVpnConfig(
        val server: String,
        val port: Int = 1194,
        val protocol: String = "udp",
        val username: String? = null,
        val password: String? = null,
        val caCert: String? = null,
        val clientCert: String? = null,
        val clientKey: String? = null
    )
}
