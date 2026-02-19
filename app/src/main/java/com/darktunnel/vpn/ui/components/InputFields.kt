package com.darktunnel.vpn.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.ContentPaste
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.darktunnel.vpn.ui.theme.CustomTypography

/**
 * Target Input Field
 * 
 * Single-line text field for target server input
 * Supports copy/paste operations
 * 
 * @param value Current value
 * @param onValueChange Callback when value changes
 * @param label Label text
 * @param placeholder Placeholder text
 * @param enabled Whether the field is enabled
 * @param modifier Modifier for customization
 */
@Composable
fun TargetInputField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String = "Target",
    placeholder: String = "host:port@protocol…",
    enabled: Boolean = true,
    modifier: Modifier = Modifier
) {
    val clipboardManager = LocalClipboardManager.current
    val focusManager = LocalFocusManager.current
    var isFocused by remember { mutableStateOf(false) }
    
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier
            .fillMaxWidth()
            .onFocusChanged { isFocused = it.isFocused },
        enabled = enabled,
        label = { Text(label) },
        placeholder = { Text(placeholder) },
        textStyle = CustomTypography.MonospaceBody,
        singleLine = true,
        keyboardOptions = KeyboardOptions(
            keyboardType = KeyboardType.Text,
            imeAction = ImeAction.Next
        ),
        keyboardActions = KeyboardActions(
            onNext = { focusManager.moveFocus(FocusDirection.Down) }
        ),
        trailingIcon = {
            Row {
                // Copy button
                IconButton(
                    onClick = {
                        clipboardManager.setText(AnnotatedString(value))
                    },
                    enabled = value.isNotEmpty()
                ) {
                    Icon(
                        imageVector = Icons.Default.ContentCopy,
                        contentDescription = "Copy"
                    )
                }
                
                // Paste button
                IconButton(
                    onClick = {
                        clipboardManager.getText()?.let {
                            onValueChange(it.text)
                        }
                    }
                ) {
                    Icon(
                        imageVector = Icons.Default.ContentPaste,
                        contentDescription = "Paste"
                    )
                }
            }
        },
        shape = MaterialTheme.shapes.medium
    )
}

/**
 * Payload Input Field
 * 
 * Multi-line text field for payload input
 * Supports copy/paste and vertical scrolling
 * 
 * @param value Current value
 * @param onValueChange Callback when value changes
 * @param label Label text
 * @param placeholder Placeholder text
 * @param enabled Whether the field is enabled
 * @param modifier Modifier for customization
 */
@Composable
fun PayloadInputField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String = "Payload",
    placeholder: String = "GET / HTTP/1.1\\r\\nHost: …",
    enabled: Boolean = true,
    modifier: Modifier = Modifier
) {
    val clipboardManager = LocalClipboardManager.current
    var isFocused by remember { mutableStateOf(false) }
    
    Column(modifier = modifier) {
        // Label row with actions
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 4.dp),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface
            )
            
            Row(
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                // Copy button
                TextButton(
                    onClick = {
                        clipboardManager.setText(AnnotatedString(value))
                    },
                    enabled = value.isNotEmpty(),
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)
                ) {
                    Text("Copy", style = MaterialTheme.typography.labelSmall)
                }
                
                // Paste button
                TextButton(
                    onClick = {
                        clipboardManager.getText()?.let {
                            onValueChange(it.text)
                        }
                    },
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)
                ) {
                    Text("Paste", style = MaterialTheme.typography.labelSmall)
                }
                
                // Clear button
                TextButton(
                    onClick = { onValueChange("") },
                    enabled = value.isNotEmpty(),
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)
                ) {
                    Text("Clear", style = MaterialTheme.typography.labelSmall)
                }
            }
        }
        
        // Text field
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier
                .fillMaxWidth()
                .height(120.dp)
                .onFocusChanged { isFocused = it.isFocused },
            enabled = enabled,
            placeholder = { Text(placeholder) },
            textStyle = CustomTypography.MonospaceBody,
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Text,
                imeAction = ImeAction.Default
            ),
            shape = MaterialTheme.shapes.medium
        )
    }
}

/**
 * Profile Name Input Field
 * 
 * Single-line text field for profile name input
 * 
 * @param value Current value
 * @param onValueChange Callback when value changes
 * @param enabled Whether the field is enabled
 * @param modifier Modifier for customization
 */
@Composable
fun ProfileNameInputField(
    value: String,
    onValueChange: (String) -> Unit,
    enabled: Boolean = true,
    modifier: Modifier = Modifier
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier.fillMaxWidth(),
        enabled = enabled,
        label = { Text("Profile Name") },
        placeholder = { Text("My VPN Profile") },
        singleLine = true,
        keyboardOptions = KeyboardOptions(
            keyboardType = KeyboardType.Text,
            imeAction = ImeAction.Done
        ),
        shape = MaterialTheme.shapes.medium
    )
}

/**
 * Toggle Switch with Label
 * 
 * @param checked Current state
 * @param onCheckedChange Callback when state changes
 * @param label Label text
 * @param enabled Whether the toggle is enabled
 * @param modifier Modifier for customization
 */
@Composable
fun ToggleSwitch(
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    label: String,
    enabled: Boolean = true,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = if (enabled) {
                MaterialTheme.colorScheme.onSurface
            } else {
                MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f)
            }
        )
        
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            enabled = enabled
        )
    }
}

/**
 * Protocol Selector
 * 
 * Dropdown menu for selecting VPN protocol
 * 
 * @param selectedProtocol Currently selected protocol
 * @param onProtocolSelected Callback when protocol is selected
 * @param enabled Whether the selector is enabled
 * @param modifier Modifier for customization
 */
@Composable
fun ProtocolSelector(
    selectedProtocol: com.darktunnel.vpn.model.VpnProtocol,
    onProtocolSelected: (com.darktunnel.vpn.model.VpnProtocol) -> Unit,
    enabled: Boolean = true,
    modifier: Modifier = Modifier
) {
    var expanded by remember { mutableStateOf(false) }
    
    Box(modifier = modifier) {
        OutlinedButton(
            onClick = { expanded = true },
            enabled = enabled,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(
                text = selectedProtocol.name,
                modifier = Modifier.weight(1f)
            )
            Text("▼")
        }
        
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false }
        ) {
            com.darktunnel.vpn.model.VpnProtocol.values().forEach { protocol ->
                DropdownMenuItem(
                    text = { Text(protocol.name) },
                    onClick = {
                        onProtocolSelected(protocol)
                        expanded = false
                    }
                )
            }
        }
    }
}
