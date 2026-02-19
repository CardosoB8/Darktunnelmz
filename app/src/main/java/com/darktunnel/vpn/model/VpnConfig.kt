package com.darktunnel.vpn.model

import android.os.Parcelable
import kotlinx.parcelize.Parcelize

/**
 * VPN Configuration Data Class
 * 
 * Represents a complete VPN configuration including target, payload,
 * protocol type, and connection parameters.
 * 
 * @property id Unique identifier for the configuration
 * @property name User-friendly name for this configuration
 * @property target The target server address (host:port@protocol)
 * @property payload The payload data (HTTP/SSH payload)
 * @property protocol The VPN protocol type (WireGuard, OpenVPN, etc.)
 * @property isFavorite Whether this config is marked as favorite
 * @property createdAt Timestamp when the config was created
 * @property updatedAt Timestamp when the config was last updated
 * @property additionalParams Additional protocol-specific parameters
 */
@Parcelize
data class VpnConfig(
    val id: String = java.util.UUID.randomUUID().toString(),
    val name: String = "",
    val target: String = "",
    val payload: String = "",
    val protocol: VpnProtocol = VpnProtocol.SSH,
    val isFavorite: Boolean = false,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis(),
    val additionalParams: Map<String, String> = emptyMap()
) : Parcelable {

    /**
     * Validates the configuration
     * @return true if the configuration is valid
     */
    fun isValid(): Boolean {
        return target.isNotBlank() && isValidTarget(target)
    }

    /**
     * Validates target format
     */
    private fun isValidTarget(target: String): Boolean {
        // Basic validation: host:port or host:port@protocol
        val regex = Regex("""^[a-zA-Z0-9.-]+:\d+(@[a-zA-Z]+)?$""")
        return regex.matches(target.trim())
    }

    /**
     * Extracts host from target string
     */
    fun getHost(): String {
        return target.substringBefore(":").substringBefore("@")
    }

    /**
     * Extracts port from target string
     */
    fun getPort(): Int {
        val portStr = target.substringAfter(":").substringBefore("@")
        return portStr.toIntOrNull() ?: 80
    }

    /**
     * Extracts protocol override from target string if present
     */
    fun getProtocolOverride(): String? {
        return if (target.contains("@")) {
            target.substringAfter("@")
        } else null
    }

    companion object {
        /**
         * Creates a sample configuration for testing
         */
        fun sample(): VpnConfig {
            return VpnConfig(
                name = "Sample Profile",
                target = "uk1.example.com:443@ssh",
                payload = buildString {
                    appendLine("GET / HTTP/1.1")
                    appendLine("Host: uk1.example.com")
                    appendLine("Connection: keep-alive")
                    appendLine("User-Agent: Mozilla/5.0")
                    appendLine()
                },
                protocol = VpnProtocol.SSH
            )
        }
    }
}

/**
 * VPN Protocol Types
 */
enum class VpnProtocol {
    WIREGUARD,
    OPENVPN,
    SSH,
    SHADOWSOCKS,
    TROJAN,
    VLESS,
    VMESS;

    companion object {
        fun fromString(value: String): VpnProtocol {
            return try {
                valueOf(value.uppercase())
            } catch (e: IllegalArgumentException) {
                SSH // Default fallback
            }
        }
    }
}

/**
 * VPN Connection State
 * Represents the current state of the VPN connection
 */
sealed class VpnState {
    object Disconnected : VpnState()
    data class Connecting(
        val progress: Int = 0,
        val message: String = "Initializing..."
    ) : VpnState()
    data class Connected(
        val localIp: String? = null,
        val serverIp: String? = null,
        val bytesSent: Long = 0,
        val bytesReceived: Long = 0,
        val connectedSince: Long = System.currentTimeMillis(),
        val protocol: VpnProtocol = VpnProtocol.SSH
    ) : VpnState()
    data class Disconnecting(
        val message: String = "Disconnecting..."
    ) : VpnState()
    data class Error(
        val message: String,
        val errorCode: Int = 0,
        val recoverable: Boolean = true
    ) : VpnState()
    data class Reconnecting(
        val attempt: Int = 1,
        val maxAttempts: Int = 3
    ) : VpnState()

    /**
     * Gets a user-friendly status message
     */
    fun getStatusMessage(): String {
        return when (this) {
            is Disconnected -> "Disconnected"
            is Connecting -> "Connecting... ($progress%)"
            is Connected -> "Connected"
            is Disconnecting -> "Disconnecting..."
            is Error -> "Error: $message"
            is Reconnecting -> "Reconnecting... (Attempt $attempt/$maxAttempts)"
        }
    }

    /**
     * Checks if currently connected
     */
    fun isConnected(): Boolean = this is Connected

    /**
     * Checks if currently connecting
     */
    fun isConnecting(): Boolean = this is Connecting || this is Reconnecting

    /**
     * Checks if can connect (disconnected or error)
     */
    fun canConnect(): Boolean = this is Disconnected || (this is Error && recoverable)

    /**
     * Checks if can disconnect (connected or connecting)
     */
    fun canDisconnect(): Boolean = this is Connected || this is Connecting || this is Reconnecting
}

/**
 * Profile data class for saved configurations
 */
@Parcelize
data class Profile(
    val id: String = java.util.UUID.randomUUID().toString(),
    val name: String,
    val config: VpnConfig,
    val isFavorite: Boolean = false,
    val useCount: Int = 0,
    val lastUsed: Long? = null,
    val createdAt: Long = System.currentTimeMillis()
) : Parcelable {
    
    /**
     * Creates a copy with updated last used timestamp
     */
    fun markUsed(): Profile {
        return copy(
            useCount = useCount + 1,
            lastUsed = System.currentTimeMillis()
        )
    }
}

/**
 * Log entry for connection logging
 */
data class LogEntry(
    val timestamp: Long = System.currentTimeMillis(),
    val level: LogLevel = LogLevel.INFO,
    val message: String,
    val tag: String = "DarkTunnel"
) {
    fun formattedTimestamp(): String {
        val sdf = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.getDefault())
        return sdf.format(java.util.Date(timestamp))
    }

    fun toFormattedString(): String {
        return "[${formattedTimestamp()}] [${level.name}] $message"
    }
}

enum class LogLevel {
    DEBUG,
    INFO,
    WARNING,
    ERROR,
    SUCCESS
}

/**
 * Connection statistics
 */
data class ConnectionStats(
    val bytesSent: Long = 0,
    val bytesReceived: Long = 0,
    val packetsSent: Long = 0,
    val packetsReceived: Long = 0,
    val connectionDuration: Long = 0, // in milliseconds
    val averagePing: Int = 0 // in milliseconds
) {
    fun formatBytes(bytes: Long): String {
        val units = arrayOf("B", "KB", "MB", "GB")
        var size = bytes.toDouble()
        var unitIndex = 0
        while (size >= 1024 && unitIndex < units.size - 1) {
            size /= 1024
            unitIndex++
        }
        return String.format("%.2f %s", size, units[unitIndex])
    }

    fun formatDuration(): String {
        val seconds = connectionDuration / 1000
        val hours = seconds / 3600
        val minutes = (seconds % 3600) / 60
        val secs = seconds % 60
        return String.format("%02d:%02d:%02d", hours, minutes, secs)
    }
}
