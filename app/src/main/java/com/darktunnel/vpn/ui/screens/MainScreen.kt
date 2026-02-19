package com.darktunnel.vpn.ui.screens

import androidx.compose.animation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.darktunnel.vpn.model.VpnState
import com.darktunnel.vpn.ui.components.*
import com.darktunnel.vpn.viewmodel.MainViewModel
import kotlinx.coroutines.launch

/**
 * Main Screen
 * 
 * Primary UI for the DarkTunnel VPN application.
 * Contains:
 * - AppBar with actions
 * - Target and payload input fields
 * - Connect/Disconnect button
 * - Connection logs
 * - Profile drawer access
 * 
 * @param viewModel MainViewModel instance
 * @param onNavigateToProfiles Callback to navigate to profiles
 * @param onNavigateToSettings Callback to navigate to settings
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
    viewModel: MainViewModel,
    onNavigateToProfiles: () -> Unit,
    onNavigateToSettings: () -> Unit
) {
    val scrollState = rememberScrollState()
    val clipboardManager = LocalClipboardManager.current
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    
    // Collect states from ViewModel
    val vpnState by viewModel.vpnState.collectAsStateWithLifecycle()
    val target by viewModel.target.collectAsStateWithLifecycle()
    val payload by viewModel.payload.collectAsStateWithLifecycle()
    val logs by viewModel.logs.collectAsStateWithLifecycle()
    val performanceMode by viewModel.performanceMode.collectAsStateWithLifecycle()
    val directTarget by viewModel.directTarget.collectAsStateWithLifecycle()
    val connectionStats by viewModel.connectionStats.collectAsStateWithLifecycle()
    
    // UI state
    var showProfileDrawer by remember { mutableStateOf(false) }
    var showSaveProfileDialog by remember { mutableStateOf(false) }
    var showClearConfirmDialog by remember { mutableStateOf(false) }
    
    // Handle error messages
    LaunchedEffect(Unit) {
        viewModel.errorMessage.collect { message ->
            snackbarHostState.showSnackbar(
                message = message,
                duration = SnackbarDuration.Short
            )
        }
    }
    
    // Handle success messages
    LaunchedEffect(Unit) {
        viewModel.successMessage.collect { message ->
            snackbarHostState.showSnackbar(
                message = message,
                duration = SnackbarDuration.Short
            )
        }
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("DarkTunnel") },
                actions = {
                    // Favorite button
                    IconButton(onClick = { /* TODO: Show favorites */ }) {
                        Icon(
                            imageVector = Icons.Default.Star,
                            contentDescription = "Favorites"
                        )
                    }
                    
                    // Delete button
                    IconButton(
                        onClick = { showClearConfirmDialog = true },
                        enabled = target.isNotBlank() || payload.isNotBlank()
                    ) {
                        Icon(
                            imageVector = Icons.Default.Delete,
                            contentDescription = "Clear fields"
                        )
                    }
                    
                    // More options menu
                    var showMenu by remember { mutableStateOf(false) }
                    IconButton(onClick = { showMenu = true }) {
                        Icon(
                            imageVector = Icons.Default.MoreVert,
                            contentDescription = "More options"
                        )
                    }
                    
                    DropdownMenu(
                        expanded = showMenu,
                        onDismissRequest = { showMenu = false }
                    ) {
                        DropdownMenuItem(
                            text = { Text("Profiles") },
                            onClick = {
                                showMenu = false
                                onNavigateToProfiles()
                            },
                            leadingIcon = {
                                Icon(Icons.Default.Person, null)
                            }
                        )
                        
                        DropdownMenuItem(
                            text = { Text("Settings") },
                            onClick = {
                                showMenu = false
                                onNavigateToSettings()
                            },
                            leadingIcon = {
                                Icon(Icons.Default.Settings, null)
                            }
                        )
                        
                        Divider()
                        
                        DropdownMenuItem(
                            text = { Text("About") },
                            onClick = {
                                showMenu = false
                                // TODO: Show about dialog
                            },
                            leadingIcon = {
                                Icon(Icons.Default.Info, null)
                            }
                        )
                    }
                }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(16.dp)
                .verticalScroll(scrollState),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Status Card
            StatusCard(vpnState = vpnState)
            
            // Main Configuration Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    // Target input
                    TargetInputField(
                        value = target,
                        onValueChange = viewModel::onTargetChange,
                        enabled = vpnState !is VpnState.Connecting
                    )
                    
                    // Payload input
                    PayloadInputField(
                        value = payload,
                        onValueChange = viewModel::onPayloadChange,
                        enabled = vpnState !is VpnState.Connecting
                    )
                    
                    // Toggles
                    ToggleSwitch(
                        checked = performanceMode,
                        onCheckedChange = viewModel::onPerformanceModeChange,
                        label = "Performance Mode",
                        enabled = vpnState !is VpnState.Connecting
                    )
                    
                    ToggleSwitch(
                        checked = directTarget,
                        onCheckedChange = viewModel::onDirectTargetChange,
                        label = "Direct → Target",
                        enabled = vpnState !is VpnState.Connecting
                    )
                    
                    // Connect button
                    ConnectButton(
                        state = vpnState,
                        onClick = { viewModel.toggleConnection() }
                    )
                }
            }
            
            // Connection statistics (when connected)
            AnimatedVisibility(
                visible = vpnState is VpnState.Connected,
                enter = fadeIn() + expandVertically(),
                exit = fadeOut() + shrinkVertically()
            ) {
                ConnectionStatsDisplay(stats = connectionStats)
            }
            
            // Log console
            LogConsole(
                logs = logs,
                onClear = viewModel::clearLogs
            )
            
            // Quick actions
            QuickActionsRow(
                onSaveProfile = { showSaveProfileDialog = true },
                onLoadProfile = { showProfileDrawer = true },
                onCopyConfig = {
                    val config = "Target: $target\nPayload: $payload"
                    clipboardManager.setText(AnnotatedString(config))
                    scope.launch {
                        snackbarHostState.showSnackbar("Configuration copied")
                    }
                }
            )
        }
    }
    
    // Save Profile Dialog
    if (showSaveProfileDialog) {
        SaveProfileDialog(
            onDismiss = { showSaveProfileDialog = false },
            onSave = { name ->
                viewModel.saveCurrentAsProfile(name)
                showSaveProfileDialog = false
            }
        )
    }
    
    // Clear Confirmation Dialog
    if (showClearConfirmDialog) {
        AlertDialog(
            onDismissRequest = { showClearConfirmDialog = false },
            title = { Text("Clear Fields") },
            text = { Text("Are you sure you want to clear all fields?") },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.clearTarget()
                        viewModel.clearPayload()
                        showClearConfirmDialog = false
                    }
                ) {
                    Text("Clear")
                }
            },
            dismissButton = {
                TextButton(onClick = { showClearConfirmDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }
    
    // Profile Bottom Sheet
    if (showProfileDrawer) {
        // TODO: Implement profile bottom sheet
        // ProfileBottomSheet(...)
    }
}

/**
 * Status Card
 * 
 * Shows current VPN connection status
 */
@Composable
private fun StatusCard(vpnState: VpnState) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = when (vpnState) {
                is VpnState.Connected -> MaterialTheme.colorScheme.primaryContainer
                is VpnState.Connecting -> MaterialTheme.colorScheme.tertiaryContainer
                is VpnState.Error -> MaterialTheme.colorScheme.errorContainer
                else -> MaterialTheme.colorScheme.surfaceVariant
            }
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "Status",
                style = MaterialTheme.typography.labelMedium
            )
            
            VpnStatusIndicator(state = vpnState)
        }
    }
}

/**
 * Quick Actions Row
 * 
 * Quick access buttons for common actions
 */
@Composable
private fun QuickActionsRow(
    onSaveProfile: () -> Unit,
    onLoadProfile: () -> Unit,
    onCopyConfig: () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceEvenly
    ) {
        QuickActionButton(
            icon = Icons.Default.Save,
            label = "Save",
            onClick = onSaveProfile
        )
        
        QuickActionButton(
            icon = Icons.Default.Folder,
            label = "Profiles",
            onClick = onLoadProfile
        )
        
        QuickActionButton(
            icon = Icons.Default.ContentCopy,
            label = "Copy",
            onClick = onCopyConfig
        )
    }
}

@Composable
private fun QuickActionButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    onClick: () -> Unit
) {
    TextButton(onClick = onClick) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(icon, contentDescription = label)
            Text(label, style = MaterialTheme.typography.labelSmall)
        }
    }
}

/**
 * Save Profile Dialog
 */
@Composable
private fun SaveProfileDialog(
    onDismiss: () -> Unit,
    onSave: (String) -> Unit
) {
    var name by remember { mutableStateOf("") }
    
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Save Profile") },
        text = {
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text("Profile Name") },
                placeholder = { Text("My VPN Profile") },
                singleLine = true
            )
        },
        confirmButton = {
            TextButton(
                onClick = { onSave(name) },
                enabled = name.isNotBlank()
            ) {
                Text("Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}
