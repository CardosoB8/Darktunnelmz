package com.darktunnel.vpn.ui.components

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.darktunnel.vpn.model.LogEntry
import com.darktunnel.vpn.model.LogLevel
import com.darktunnel.vpn.ui.theme.*
import kotlinx.coroutines.launch

/**
 * Log Console Component
 * 
 * Displays connection logs with:
 * - Timestamp
 * - Log level indicator
 * - Auto-scroll to latest
 * - Copy to clipboard
 * - Clear logs
 * 
 * @param logs List of log entries
 * @param onClear Callback to clear logs
 * @param modifier Modifier for customization
 */
@Composable
fun LogConsole(
    logs: List<LogEntry>,
    onClear: () -> Unit,
    modifier: Modifier = Modifier
) {
    val clipboardManager = LocalClipboardManager.current
    val listState = rememberLazyListState()
    val coroutineScope = rememberCoroutineScope()
    
    // Auto-scroll to bottom when new logs are added
    LaunchedEffect(logs.size) {
        if (logs.isNotEmpty()) {
            coroutineScope.launch {
                listState.animateScrollToItem(logs.size - 1)
            }
        }
    }
    
    Card(
        modifier = modifier
            .fillMaxWidth()
            .height(200.dp),
        colors = CardDefaults.cardColors(
            containerColor = LogBackground
        ),
        shape = MaterialTheme.shapes.medium
    ) {
        Column {
            // Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Connection Log",
                    style = MaterialTheme.typography.labelMedium,
                    color = TextSecondaryDark
                )
                
                Row(
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    // Copy button
                    IconButton(
                        onClick = {
                            val logText = logs.joinToString("\n") { it.toFormattedString() }
                            clipboardManager.setText(AnnotatedString(logText))
                        },
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.ContentCopy,
                            contentDescription = "Copy logs",
                            tint = TextSecondaryDark,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                    
                    // Clear button
                    IconButton(
                        onClick = onClear,
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Clear,
                            contentDescription = "Clear logs",
                            tint = TextSecondaryDark,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
            }
            
            // Log entries
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .padding(horizontal = 12.dp)
            ) {
                if (logs.isEmpty()) {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "No logs yet. Connect to see activity.",
                            style = MaterialTheme.typography.bodySmall,
                            color = TextSecondaryDark
                        )
                    }
                } else {
                    LazyColumn(
                        state = listState,
                        verticalArrangement = Arrangement.spacedBy(2.dp)
                    ) {
                        items(
                            items = logs,
                            key = { it.timestamp }
                        ) { log ->
                            LogEntryItem(log = log)
                        }
                    }
                }
            }
        }
    }
}

/**
 * Individual log entry item
 */
@Composable
private fun LogEntryItem(
    log: LogEntry,
    modifier: Modifier = Modifier
) {
    val logColor = when (log.level) {
        LogLevel.DEBUG -> LogDebug
        LogLevel.INFO -> LogInfo
        LogLevel.WARNING -> LogWarning
        LogLevel.ERROR -> LogError
        LogLevel.SUCCESS -> LogSuccess
    }
    
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.Top
    ) {
        // Timestamp
        Text(
            text = log.formattedTimestamp(),
            style = CustomTypography.LogText,
            color = TextSecondaryDark
        )
        
        // Level indicator
        Box(
            modifier = Modifier
                .size(6.dp)
                .clip(RoundedCornerShape(3.dp))
                .background(logColor)
                .align(Alignment.CenterVertically)
        )
        
        // Message
        Text(
            text = log.message,
            style = CustomTypography.LogText,
            color = LogText,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f)
        )
    }
}

/**
 * Compact log indicator for AppBar
 * 
 * Shows a small badge with log count
 */
@Composable
fun LogIndicator(
    logCount: Int,
    modifier: Modifier = Modifier
) {
    if (logCount > 0) {
        Badge(
            modifier = modifier,
            containerColor = AccentOrange
        ) {
            Text(
                text = if (logCount > 99) "99+" else logCount.toString(),
                color = Color.White
            )
        }
    }
}
