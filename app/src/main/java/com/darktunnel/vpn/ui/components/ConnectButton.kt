package com.darktunnel.vpn.ui.components

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.darktunnel.vpn.model.VpnState
import com.darktunnel.vpn.ui.theme.*

/**
 * Connect Button Component
 * 
 * Displays the main VPN connection button with different states:
 * - CONNECT (blue, idle)
 * - CONNECTING (orange, with spinner)
 * - DISCONNECT (red, connected)
 * 
 * @param state Current VPN state
 * @param onClick Callback when button is clicked
 * @param modifier Modifier for customization
 */
@Composable
fun ConnectButton(
    state: VpnState,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val buttonColor = when (state) {
        is VpnState.Connected -> ButtonDisconnect
        is VpnState.Connecting,
        is VpnState.Reconnecting -> ButtonConnecting
        is VpnState.Error -> ButtonConnect
        else -> ButtonConnect
    }
    
    val buttonText = when (state) {
        is VpnState.Connected -> "DISCONNECT"
        is VpnState.Connecting -> "CONNECTING…"
        is VpnState.Reconnecting -> "RECONNECTING…"
        is VpnState.Disconnecting -> "DISCONNECTING…"
        is VpnState.Error -> "RETRY"
        else -> "CONNECT"
    }
    
    val isEnabled = when (state) {
        is VpnState.Connecting,
        is VpnState.Reconnecting,
        is VpnState.Disconnecting -> false
        else -> true
    }
    
    // Animation for connecting state
    val scale by animateFloatAsState(
        targetValue = if (state is VpnState.Connecting) 1.02f else 1f,
        animationSpec = tween(300),
        label = "button_scale"
    )
    
    Button(
        onClick = onClick,
        enabled = isEnabled,
        modifier = modifier
            .fillMaxWidth()
            .height(56.dp)
            .scale(scale),
        colors = ButtonDefaults.buttonColors(
            containerColor = buttonColor,
            disabledContainerColor = buttonColor.copy(alpha = 0.6f)
        ),
        shape = MaterialTheme.shapes.medium
    ) {
        Box(
            contentAlignment = Alignment.Center
        ) {
            // Show spinner when connecting
            if (state is VpnState.Connecting || state is VpnState.Reconnecting) {
                CircularProgressIndicator(
                    modifier = Modifier
                        .size(24.dp)
                        .align(Alignment.CenterStart),
                    color = Color.White,
                    strokeWidth = 2.dp
                )
            }
            
            Text(
                text = buttonText,
                style = CustomTypography.ButtonText,
                color = Color.White,
                textAlign = TextAlign.Center
            )
        }
    }
}

/**
 * VPN Status Indicator
 * 
 * Shows current VPN connection status with icon and text
 * 
 * @param state Current VPN state
 * @param modifier Modifier for customization
 */
@Composable
fun VpnStatusIndicator(
    state: VpnState,
    modifier: Modifier = Modifier
) {
    val (statusText, statusColor, bgColor) = when (state) {
        is VpnState.Connected -> Triple(
            "Connected",
            VpnConnected,
            VpnConnectedBg
        )
        is VpnState.Connecting -> Triple(
            "Connecting…",
            VpnConnecting,
            VpnConnectingBg
        )
        is VpnState.Reconnecting -> Triple(
            "Reconnecting…",
            VpnConnecting,
            VpnConnectingBg
        )
        is VpnState.Disconnecting -> Triple(
            "Disconnecting…",
            VpnConnecting,
            VpnConnectingBg
        )
        is VpnState.Error -> Triple(
            state.message,
            VpnError,
            VpnErrorBg
        )
        else -> Triple(
            "Disconnected",
            VpnDisconnected,
            VpnDisconnectedBg
        )
    }
    
    Surface(
        modifier = modifier,
        color = bgColor,
        shape = MaterialTheme.shapes.small
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            // Status dot
            Surface(
                modifier = Modifier.size(8.dp),
                shape = MaterialTheme.shapes.small,
                color = statusColor
            ) { }
            
            Text(
                text = statusText,
                style = CustomTypography.StatusText,
                color = statusColor
            )
        }
    }
}

/**
 * Connection Statistics Display
 * 
 * Shows bytes transferred and connection duration
 * 
 * @param stats Connection statistics
 * @param modifier Modifier for customization
 */
@Composable
fun ConnectionStatsDisplay(
    stats: com.darktunnel.vpn.model.ConnectionStats?,
    modifier: Modifier = Modifier
) {
    stats?.let {
        Card(
            modifier = modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant
            )
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = "Connection Statistics",
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurface
                )
                
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    StatItem(
                        label = "Sent",
                        value = it.formatBytes(it.bytesSent)
                    )
                    StatItem(
                        label = "Received",
                        value = it.formatBytes(it.bytesReceived)
                    )
                    StatItem(
                        label = "Duration",
                        value = it.formatDuration()
                    )
                }
                
                if (it.averagePing > 0) {
                    Text(
                        text = "Ping: ${it.averagePing} ms",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

@Composable
private fun StatItem(
    label: String,
    value: String
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
