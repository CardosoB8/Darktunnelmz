package com.darktunnel.vpn.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.darktunnel.vpn.data.ProfileRepository
import com.darktunnel.vpn.model.Profile
import com.darktunnel.vpn.model.VpnConfig
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

/**
 * Profile ViewModel
 * 
 * Manages profile-related UI state including:
 * - Profile list
 * - Profile CRUD operations
 * - Import/Export functionality
 * 
 * @param profileRepository Profile repository instance
 * @author DarkTunnel Team
 * @version 1.0.0
 */
@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val profileRepository: ProfileRepository
) : ViewModel() {

    // ==================== UI STATE ====================
    
    /**
     * All profiles
     */
    val allProfiles: StateFlow<List<Profile>> = profileRepository.getAllProfiles()
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )
    
    /**
     * Favorite profiles
     */
    val favoriteProfiles: StateFlow<List<Profile>> = profileRepository.getFavoriteProfiles()
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )
    
    /**
     * Profiles sorted by last used
     */
    val recentProfiles: StateFlow<List<Profile>> = profileRepository.getProfilesSortedByLastUsed()
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )
    
    /**
     * Search query
     */
    private val _searchQuery = MutableStateFlow("")
    val searchQuery: StateFlow<String> = _searchQuery.asStateFlow()
    
    /**
     * Filtered profiles based on search
     */
    val filteredProfiles: StateFlow<List<Profile>> = _searchQuery
        .flatMapLatest { query ->
            if (query.isBlank()) {
                profileRepository.getAllProfiles()
            } else {
                profileRepository.searchProfiles(query)
            }
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )
    
    /**
     * Selected profile for editing
     */
    private val _selectedProfile = MutableStateFlow<Profile?>(null)
    val selectedProfile: StateFlow<Profile?> = _selectedProfile.asStateFlow()
    
    /**
     * Loading state
     */
    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()
    
    /**
     * Error messages
     */
    private val _errorMessage = MutableSharedFlow<String>()
    val errorMessage: SharedFlow<String> = _errorMessage.asSharedFlow()
    
    /**
     * Success messages
     */
    private val _successMessage = MutableSharedFlow<String>()
    val successMessage: SharedFlow<String> = _successMessage.asSharedFlow()
    
    /**
     * Import/Export dialog state
     */
    private val _showImportDialog = MutableStateFlow(false)
    val showImportDialog: StateFlow<Boolean> = _showImportDialog.asStateFlow()
    
    private val _showExportDialog = MutableStateFlow(false)
    val showExportDialog: StateFlow<Boolean> = _showExportDialog.asStateFlow()
    
    /**
     * Export data
     */
    private val _exportData = MutableStateFlow<String?>(null)
    val exportData: StateFlow<String?> = _exportData.asStateFlow()

    // ==================== SEARCH ====================
    
    fun onSearchQueryChange(query: String) {
        _searchQuery.value = query
    }
    
    fun clearSearch() {
        _searchQuery.value = ""
    }
    
    // ==================== PROFILE OPERATIONS ====================
    
    /**
     * Create a new profile
     */
    fun createProfile(name: String, config: VpnConfig) {
        viewModelScope.launch {
            _isLoading.value = true
            
            profileRepository.createProfile(name, config)
                .onSuccess {
                    _successMessage.emit("Profile created: $name")
                    Timber.d("Profile created: $name")
                }
                .onFailure {
                    _errorMessage.emit("Failed to create profile: ${it.message}")
                    Timber.e(it, "Failed to create profile")
                }
            
            _isLoading.value = false
        }
    }
    
    /**
     * Update an existing profile
     */
    fun updateProfile(profileId: String, name: String, config: VpnConfig) {
        viewModelScope.launch {
            _isLoading.value = true
            
            profileRepository.updateProfile(
                profileId = profileId,
                name = name,
                config = config
            )
                .onSuccess {
                    _successMessage.emit("Profile updated: $name")
                    Timber.d("Profile updated: $name")
                }
                .onFailure {
                    _errorMessage.emit("Failed to update profile: ${it.message}")
                    Timber.e(it, "Failed to update profile")
                }
            
            _isLoading.value = false
        }
    }
    
    /**
     * Delete a profile
     */
    fun deleteProfile(profileId: String) {
        viewModelScope.launch {
            _isLoading.value = true
            
            profileRepository.deleteProfile(profileId)
                .onSuccess {
                    _successMessage.emit("Profile deleted")
                    Timber.d("Profile deleted: $profileId")
                }
                .onFailure {
                    _errorMessage.emit("Failed to delete profile: ${it.message}")
                    Timber.e(it, "Failed to delete profile")
                }
            
            _isLoading.value = false
        }
    }
    
    /**
     * Toggle favorite status
     */
    fun toggleFavorite(profileId: String) {
        viewModelScope.launch {
            profileRepository.toggleFavorite(profileId)
                .onSuccess { isFavorite ->
                    val message = if (isFavorite) "Added to favorites" else "Removed from favorites"
                    _successMessage.emit(message)
                }
                .onFailure {
                    _errorMessage.emit("Failed to update favorite: ${it.message}")
                }
        }
    }
    
    /**
     * Duplicate a profile
     */
    fun duplicateProfile(profileId: String) {
        viewModelScope.launch {
            _isLoading.value = true
            
            profileRepository.duplicateProfile(profileId)
                .onSuccess {
                    _successMessage.emit("Profile duplicated: ${it.name}")
                    Timber.d("Profile duplicated: ${it.id}")
                }
                .onFailure {
                    _errorMessage.emit("Failed to duplicate profile: ${it.message}")
                    Timber.e(it, "Failed to duplicate profile")
                }
            
            _isLoading.value = false
        }
    }
    
    /**
     * Select a profile for editing
     */
    fun selectProfile(profile: Profile?) {
        _selectedProfile.value = profile
    }
    
    // ==================== IMPORT/EXPORT ====================
    
    /**
     * Show import dialog
     */
    fun showImportDialog() {
        _showImportDialog.value = true
    }
    
    /**
     * Hide import dialog
     */
    fun hideImportDialog() {
        _showImportDialog.value = false
    }
    
    /**
     * Import profiles from JSON
     */
    fun importProfiles(json: String) {
        viewModelScope.launch {
            _isLoading.value = true
            
            profileRepository.importProfiles(json)
                .onSuccess { count ->
                    _successMessage.emit("Imported $count profiles")
                    _showImportDialog.value = false
                    Timber.d("Profiles imported: $count")
                }
                .onFailure {
                    _errorMessage.emit("Failed to import: ${it.message}")
                    Timber.e(it, "Failed to import profiles")
                }
            
            _isLoading.value = false
        }
    }
    
    /**
     * Show export dialog
     */
    fun showExportDialog() {
        _exportData.value = profileRepository.exportProfiles()
        _showExportDialog.value = true
    }
    
    /**
     * Hide export dialog
     */
    fun hideExportDialog() {
        _showExportDialog.value = false
        _exportData.value = null
    }
    
    // ==================== BULK OPERATIONS ====================
    
    /**
     * Delete all profiles
     */
    fun deleteAllProfiles() {
        viewModelScope.launch {
            _isLoading.value = true
            
            profileRepository.deleteAllProfiles()
                .onSuccess {
                    _successMessage.emit("All profiles deleted")
                    Timber.w("All profiles deleted")
                }
                .onFailure {
                    _errorMessage.emit("Failed to delete all profiles: ${it.message}")
                    Timber.e(it, "Failed to delete all profiles")
                }
            
            _isLoading.value = false
        }
    }
    
    // ==================== UTILITY ====================
    
    /**
     * Get profile by ID
     */
    fun getProfile(profileId: String): Profile? {
        return profileRepository.getProfile(profileId)
    }
    
    /**
     * Refresh profiles
     */
    fun refreshProfiles() {
        profileRepository.refreshProfiles()
    }
    
    /**
     * Check if profile exists
     */
    fun profileExists(profileId: String): Boolean {
        return profileRepository.profileExists(profileId)
    }
    
    /**
     * Get profile count
     */
    fun getProfileCount(): Int {
        return profileRepository.getProfileCount()
    }
}
