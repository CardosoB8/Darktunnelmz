package com.darktunnel.vpn.util

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import com.darktunnel.vpn.model.LogLevel
import java.text.SimpleDateFormat
import java.util.*

/**
 * DarkTunnel VPN - Utility Extensions
 * 
 * Kotlin extension functions for common operations
 */

// ==================== CONTEXT EXTENSIONS ====================

/**
 * Copy text to clipboard
 */
fun Context.copyToClipboard(text: String, label: String = "DarkTunnel") {
    val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    val clip = ClipData.newPlainText(label, text)
    clipboard.setPrimaryClip(clip)
}

/**
 * Show a toast message
 */
fun Context.showToast(message: String, duration: Int = Toast.LENGTH_SHORT) {
    Toast.makeText(this, message, duration).show()
}

// ==================== STRING EXTENSIONS ====================

/**
 * Mask sensitive information in strings
 * Example: "password123" -> "pas***"
 */
fun String.maskSensitive(startLength: Int = 3, maskChar: Char = '*'): String {
    if (length <= startLength) return this
    val masked = maskChar.toString().repeat(length - startLength)
    return substring(0, startLength) + masked
}

/**
 * Check if string is a valid IP address
 */
fun String.isValidIpAddress(): Boolean {
    val ipRegex = Regex(
        "^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$"
    )
    return ipRegex.matches(this)
}

/**
 * Check if string is a valid port number
 */
fun String.isValidPort(): Boolean {
    val port = toIntOrNull() ?: return false
    return port in 1..65535
}

/**
 * Check if string is a valid hostname
 */
fun String.isValidHostname(): Boolean {
    val hostnameRegex = Regex(
        "^(?=.{1,253}$)[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$"
    )
    return hostnameRegex.matches(this)
}

/**
 * Truncate string to specified length with ellipsis
 */
fun String.truncate(maxLength: Int, ellipsis: String = "..."): String {
    return if (length > maxLength) {
        substring(0, maxLength - ellipsis.length) + ellipsis
    } else {
        this
    }
}

// ==================== LONG EXTENSIONS ====================

/**
 * Format bytes to human-readable string
 */
fun Long.formatBytes(): String {
    if (this < 0) return "0 B"
    val units = arrayOf("B", "KB", "MB", "GB", "TB")
    var size = this.toDouble()
    var unitIndex = 0
    while (size >= 1024 && unitIndex < units.size - 1) {
        size /= 1024
        unitIndex++
    }
    return String.format("%.2f %s", size, units[unitIndex])
}

/**
 * Format duration in milliseconds to human-readable string
 */
fun Long.formatDuration(): String {
    val seconds = this / 1000
    val hours = seconds / 3600
    val minutes = (seconds % 3600) / 60
    val secs = seconds % 60
    return String.format("%02d:%02d:%02d", hours, minutes, secs)
}

/**
 * Format timestamp to readable date/time
 */
fun Long.formatTimestamp(pattern: String = "yyyy-MM-dd HH:mm:ss"): String {
    val sdf = SimpleDateFormat(pattern, Locale.getDefault())
    return sdf.format(Date(this))
}

// ==================== INT EXTENSIONS ====================

/**
 * Format ping value with color indicator
 */
fun Int.formatPing(): String {
    return when {
        this < 0 -> "-- ms"
        this < 50 -> "$this ms (Excellent)"
        this < 100 -> "$this ms (Good)"
        this < 150 -> "$this ms (Fair)"
        else -> "$this ms (Poor)"
    }
}

// ==================== LOG LEVEL EXTENSIONS ====================

/**
 * Get color for log level
 */
fun LogLevel.getColor(): androidx.compose.ui.graphics.Color {
    return when (this) {
        LogLevel.DEBUG -> androidx.compose.ui.graphics.Color.Gray
        LogLevel.INFO -> androidx.compose.ui.graphics.Color.Blue
        LogLevel.WARNING -> androidx.compose.ui.graphics.Color(0xFFFFA500) // Orange
        LogLevel.ERROR -> androidx.compose.ui.graphics.Color.Red
        LogLevel.SUCCESS -> androidx.compose.ui.graphics.Color.Green
    }
}

// ==================== DATE EXTENSIONS ====================

/**
 * Format date to relative time string
 */
fun Date.toRelativeTime(): String {
    val now = System.currentTimeMillis()
    val diff = now - this.time
    
    return when {
        diff < 60_000 -> "Just now"
        diff < 3_600_000 -> "${diff / 60_000}m ago"
        diff < 86_400_000 -> "${diff / 3_600_000}h ago"
        diff < 604_800_000 -> "${diff / 86_400_000}d ago"
        else -> SimpleDateFormat("MMM dd, yyyy", Locale.getDefault()).format(this)
    }
}

// ==================== VALIDATION ====================

/**
 * Validate VPN target format
 */
fun validateTarget(target: String): Boolean {
    if (target.isBlank()) return false
    
    // Format: host:port or host:port@protocol
    val parts = target.split(":")
    if (parts.size < 2) return false
    
    val host = parts[0]
    val portPart = parts[1].substringBefore("@")
    
    // Validate host
    if (!host.isValidHostname() && !host.isValidIpAddress()) return false
    
    // Validate port
    if (!portPart.isValidPort()) return false
    
    return true
}

/**
 * Extract host from target string
 */
fun extractHost(target: String): String {
    return target.substringBefore(":").substringBefore("@")
}

/**
 * Extract port from target string
 */
fun extractPort(target: String): Int {
    val portStr = target.substringAfter(":").substringBefore("@")
    return portStr.toIntOrNull() ?: 443
}

/**
 * Extract protocol from target string
 */
fun extractProtocol(target: String): String? {
    return if (target.contains("@")) {
        target.substringAfter("@")
    } else null
}
