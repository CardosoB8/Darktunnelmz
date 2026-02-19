package com.darktunnel.vpn.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.darktunnel.vpn.model.Profile
import com.darktunnel.vpn.model.VpnProtocol
import com.darktunnel.vpn.ui.theme.FavoriteActive
import com.darktunnel.vpn.ui.theme.FavoriteInactive

/**
 * Profile Drawer
 * 
 * Bottom sheet or drawer for managing saved profiles
 * 
 * @param profiles List of profiles
 * @param onProfileSelected Callback when a profile is selected
 * @param onProfileEdit Callback when edit is requested
 * @param onProfileDelete Callback when delete is requested
 * @param onProfileFavoriteToggle Callback when favorite is toggled
 * @param onAddNewProfile Callback when add new is requested
 * @param modifier Modifier for customization
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileDrawer(
    profiles: List<Profile>,
    onProfileSelected: (Profile) -> Unit,
    onProfileEdit: (Profile) -> Unit,
    onProfileDelete: (Profile) -> Unit,
    onProfileFavoriteToggle: (Profile) -> Unit,
    onAddNewProfile: () -> Unit,
    modifier: Modifier = Modifier
) {
    var showDeleteDialog by remember { mutableStateOf<Profile?>(null) }
    
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(16.dp)
    ) {
        // Header
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "Saved Profiles",
                style = MaterialTheme.typography.titleLarge
            )
            
            // Add button
            IconButton(onClick = onAddNewProfile) {
                Icon(
                    imageVector = Icons.Default.Add,
                    contentDescription = "Add new profile"
                )
            }
        }
        
        Spacer(modifier = Modifier.height(8.dp))
        
        // Profile list
        if (profiles.isEmpty()) {
            EmptyProfileState(onAddNewProfile = onAddNewProfile)
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(
                    items = profiles,
                    key = { it.id }
                ) { profile ->
                    ProfileListItem(
                        profile = profile,
                        onClick = { onProfileSelected(profile) },
                        onEdit = { onProfileEdit(profile) },
                        onDelete = { showDeleteDialog = profile },
                        onFavoriteToggle = { onProfileFavoriteToggle(profile) }
                    )
                }
            }
        }
    }
    
    // Delete confirmation dialog
    showDeleteDialog?.let { profile ->
        AlertDialog(
            onDismissRequest = { showDeleteDialog = null },
            title = { Text("Delete Profile") },
            text = { Text("Are you sure you want to delete \"${profile.name}\"?") },
            confirmButton = {
                TextButton(
                    onClick = {
                        onProfileDelete(profile)
                        showDeleteDialog = null
                    }
                ) {
                    Text("Delete", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = null }) {
                    Text("Cancel")
                }
            }
        )
    }
}

/**
 * Profile List Item
 * 
 * Individual profile card in the list
 */
@Composable
private fun ProfileListItem(
    profile: Profile,
    onClick: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onFavoriteToggle: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Favorite icon
            IconButton(
                onClick = onFavoriteToggle,
                modifier = Modifier.size(32.dp)
            ) {
                Icon(
                    imageVector = if (profile.isFavorite) {
                        Icons.Default.Star
                    } else {
                        Icons.Default.StarBorder
                    },
                    contentDescription = if (profile.isFavorite) "Remove favorite" else "Add favorite",
                    tint = if (profile.isFavorite) FavoriteActive else FavoriteInactive
                )
            }
            
            // Profile info
            Column(
                modifier = Modifier.weight(1f)
            ) {
                Text(
                    text = profile.name,
                    style = MaterialTheme.typography.bodyLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = profile.config.target,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = profile.config.protocol.name,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary
                )
            }
            
            // Actions
            Row {
                IconButton(onClick = onEdit, modifier = Modifier.size(32.dp)) {
                    Icon(
                        imageVector = Icons.Default.Edit,
                        contentDescription = "Edit",
                        modifier = Modifier.size(20.dp)
                    )
                }
                
                IconButton(onClick = onDelete, modifier = Modifier.size(32.dp)) {
                    Icon(
                        imageVector = Icons.Default.Delete,
                        contentDescription = "Delete",
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
        }
    }
}

/**
 * Empty state when no profiles exist
 */
@Composable
private fun EmptyProfileState(
    onAddNewProfile: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Icon(
            imageVector = Icons.Default.Person,
            contentDescription = null,
            modifier = Modifier.size(64.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
        )
        
        Text(
            text = "No saved profiles",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        
        Text(
            text = "Save your VPN configurations for quick access",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
        )
        
        Button(onClick = onAddNewProfile) {
            Icon(
                imageVector = Icons.Default.Add,
                contentDescription = null,
                modifier = Modifier.size(18.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text("Add Profile")
        }
    }
}

/**
 * Profile Bottom Sheet
 * 
 * Modal bottom sheet version of profile drawer
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileBottomSheet(
    profiles: List<Profile>,
    onProfileSelected: (Profile) -> Unit,
    onProfileEdit: (Profile) -> Unit,
    onProfileDelete: (Profile) -> Unit,
    onProfileFavoriteToggle: (Profile) -> Unit,
    onAddNewProfile: () -> Unit,
    onDismiss: () -> Unit
) {
    val sheetState = rememberModalBottomSheetState()
    
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState
    ) {
        ProfileDrawer(
            profiles = profiles,
            onProfileSelected = { profile ->
                onProfileSelected(profile)
                onDismiss()
            },
            onProfileEdit = onProfileEdit,
            onProfileDelete = onProfileDelete,
            onProfileFavoriteToggle = onProfileFavoriteToggle,
            onAddNewProfile = onAddNewProfile
        )
    }
}
