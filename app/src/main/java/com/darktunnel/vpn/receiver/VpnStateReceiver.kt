package com.darktunnel.vpn.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import timber.log.Timber

/**
 * VPN State Receiver
 * 
 * Receives broadcasts about VPN connection state changes.
 * Used to update UI and handle state changes across the app.
 * 
 * @author DarkTunnel Team
 * @version 1.0.0
 */
class VpnStateReceiver : BroadcastReceiver() {

    companion object {
        const val ACTION_VPN_CONNECTED = "com.darktunnel.vpn.ACTION_VPN_CONNECTED"
        const val ACTION_VPN_DISCONNECTED = "com.darktunnel.vpn.ACTION_VPN_DISCONNECTED"
        const val ACTION_VPN_ERROR = "com.darktunnel.vpn.ACTION_VPN_ERROR"
        
        const val EXTRA_ERROR_MESSAGE = "error_message"
        const val EXTRA_SERVER_ADDRESS = "server_address"
        const val EXTRA_CONNECTION_DURATION = "connection_duration"
        
        /**
         * Create intent for VPN connected state
         */
        fun createConnectedIntent(serverAddress: String): Intent {
            return Intent(ACTION_VPN_CONNECTED).apply {
                putExtra(EXTRA_SERVER_ADDRESS, serverAddress)
            }
        }
        
        /**
         * Create intent for VPN disconnected state
         */
        fun createDisconnectedIntent(connectionDuration: Long = 0): Intent {
            return Intent(ACTION_VPN_DISCONNECTED).apply {
                putExtra(EXTRA_CONNECTION_DURATION, connectionDuration)
            }
        }
        
        /**
         * Create intent for VPN error state
         */
        fun createErrorIntent(errorMessage: String): Intent {
            return Intent(ACTION_VPN_ERROR).apply {
                putExtra(EXTRA_ERROR_MESSAGE, errorMessage)
            }
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            ACTION_VPN_CONNECTED -> {
                val serverAddress = intent.getStringExtra(EXTRA_SERVER_ADDRESS) ?: "Unknown"
                Timber.d("VPN connected to $serverAddress")
                
                // TODO: Update UI, show notification, etc.
            }
            
            ACTION_VPN_DISCONNECTED -> {
                val duration = intent.getLongExtra(EXTRA_CONNECTION_DURATION, 0)
                Timber.d("VPN disconnected after ${duration}ms")
                
                // TODO: Update UI, cancel notification, etc.
            }
            
            ACTION_VPN_ERROR -> {
                val errorMessage = intent.getStringExtra(EXTRA_ERROR_MESSAGE) ?: "Unknown error"
                Timber.e("VPN error: $errorMessage")
                
                // TODO: Show error notification, update UI, etc.
            }
        }
    }
}

/**
 * Interface for listening to VPN state changes
 */
interface VpnStateListener {
    fun onVpnConnected(serverAddress: String)
    fun onVpnDisconnected(connectionDuration: Long)
    fun onVpnError(errorMessage: String)
}
