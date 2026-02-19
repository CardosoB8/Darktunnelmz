package com.darktunnel.vpn.data

import com.darktunnel.vpn.model.Profile
import com.darktunnel.vpn.model.VpnConfig
import com.darktunnel.vpn.storage.SecureStorage
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Profile Repository
 * 
 * Repository pattern implementation for profile management.
 * Provides clean API for profile CRUD operations with Flow support.
 * 
 * Features:
 * - Reactive profile updates via StateFlow
 * - Sorting and filtering
 * - Import/Export functionality
 * - Favorites management
 * 
 * @param secureStorage Secure storage instance
 * @author DarkTunnel Team
 * @version 1.0.0
 */
@Singleton
class ProfileRepository @Inject constructor(
    private val secureStorage: SecureStorage
) {
    private val _profiles = MutableStateFlow<List<Profile>>(emptyList())
    val profiles: Flow<List<Profile>> = _profiles.asStateFlow()
    
    init {
        // Load profiles on initialization
        refreshProfiles()
    }
    
    /**
     * Refresh profiles from storage
     */
    fun refreshProfiles() {
        _profiles.value = secureStorage.getAllProfiles()
        Timber.d("Profiles refreshed: ${_profiles.value.size} profiles loaded")
    }
    
    /**
     * Get all profiles as Flow
     */
    fun getAllProfiles(): Flow<List<Profile>> = profiles
    
    /**
     * Get profiles sorted by name
     */
    fun getProfilesSortedByName(): Flow<List<Profile>> {
        return profiles.map { list ->
            list.sortedBy { it.name.lowercase() }
        }
    }
    
    /**
     * Get profiles sorted by last used (most recent first)
     */
    fun getProfilesSortedByLastUsed(): Flow<List<Profile>> {
        return profiles.map { list ->
            list.sortedByDescending { it.lastUsed ?: 0 }
        }
    }
    
    /**
     * Get favorite profiles
     */
    fun getFavoriteProfiles(): Flow<List<Profile>> {
        return profiles.map { list ->
            list.filter { it.isFavorite }
        }
    }
    
    /**
     * Get a specific profile
     */
    fun getProfile(id: String): Profile? {
        return _profiles.value.find { it.id == id }
    }
    
    /**
     * Save a new or existing profile
     */
    suspend fun saveProfile(profile: Profile): Result<Profile> {
        return try {
            val success = secureStorage.saveProfile(profile)
            if (success) {
                refreshProfiles()
                Timber.d("Profile saved: ${profile.name}")
                Result.success(profile)
            } else {
                Result.failure(Exception("Failed to save profile"))
            }
        } catch (e: Exception) {
            Timber.e(e, "Error saving profile")
            Result.failure(e)
        }
    }
    
    /**
     * Create a new profile from config
     */
    suspend fun createProfile(name: String, config: VpnConfig): Result<Profile> {
        val profile = Profile(
            name = name,
            config = config
        )
        return saveProfile(profile)
    }
    
    /**
     * Update an existing profile
     */
    suspend fun updateProfile(
        profileId: String,
        name: String? = null,
        config: VpnConfig? = null,
        isFavorite: Boolean? = null
    ): Result<Profile> {
        val existing = getProfile(profileId)
            ?: return Result.failure(Exception("Profile not found"))
        
        val updated = existing.copy(
            name = name ?: existing.name,
            config = config ?: existing.config,
            isFavorite = isFavorite ?: existing.isFavorite
        )
        
        return saveProfile(updated)
    }
    
    /**
     * Delete a profile
     */
    suspend fun deleteProfile(profileId: String): Result<Unit> {
        return try {
            val success = secureStorage.deleteProfile(profileId)
            if (success) {
                refreshProfiles()
                Timber.d("Profile deleted: $profileId")
                Result.success(Unit)
            } else {
                Result.failure(Exception("Failed to delete profile"))
            }
        } catch (e: Exception) {
            Timber.e(e, "Error deleting profile")
            Result.failure(e)
        }
    }
    
    /**
     * Toggle favorite status
     */
    suspend fun toggleFavorite(profileId: String): Result<Boolean> {
        return try {
            val success = secureStorage.toggleFavorite(profileId)
            if (success) {
                refreshProfiles()
                val isNowFavorite = getProfile(profileId)?.isFavorite ?: false
                Timber.d("Favorite toggled: $profileId = $isNowFavorite")
                Result.success(isNowFavorite)
            } else {
                Result.failure(Exception("Failed to toggle favorite"))
            }
        } catch (e: Exception) {
            Timber.e(e, "Error toggling favorite")
            Result.failure(e)
        }
    }
    
    /**
     * Mark profile as used
     */
    suspend fun markProfileUsed(profileId: String): Result<Profile> {
        val profile = getProfile(profileId)
            ?: return Result.failure(Exception("Profile not found"))
        
        return saveProfile(profile.markUsed())
    }
    
    /**
     * Search profiles by name
     */
    fun searchProfiles(query: String): Flow<List<Profile>> {
        return profiles.map { list ->
            list.filter { 
                it.name.contains(query, ignoreCase = true) ||
                it.config.target.contains(query, ignoreCase = true)
            }
        }
    }
    
    /**
     * Duplicate a profile
     */
    suspend fun duplicateProfile(profileId: String): Result<Profile> {
        val existing = getProfile(profileId)
            ?: return Result.failure(Exception("Profile not found"))
        
        val duplicate = existing.copy(
            id = java.util.UUID.randomUUID().toString(),
            name = "${existing.name} (Copy)",
            createdAt = System.currentTimeMillis(),
            useCount = 0,
            lastUsed = null
        )
        
        return saveProfile(duplicate)
    }
    
    /**
     * Export all profiles
     */
    fun exportProfiles(): String? {
        return secureStorage.exportProfiles()
    }
    
    /**
     * Import profiles from JSON
     */
    suspend fun importProfiles(json: String): Result<Int> {
        return try {
            val success = secureStorage.importProfiles(json)
            if (success) {
                refreshProfiles()
                val count = _profiles.value.size
                Timber.d("Profiles imported: $count profiles")
                Result.success(count)
            } else {
                Result.failure(Exception("Failed to import profiles"))
            }
        } catch (e: Exception) {
            Timber.e(e, "Error importing profiles")
            Result.failure(e)
        }
    }
    
    /**
     * Delete all profiles
     * WARNING: This cannot be undone
     */
    suspend fun deleteAllProfiles(): Result<Unit> {
        return try {
            secureStorage.clearAllData()
            refreshProfiles()
            Timber.w("All profiles deleted")
            Result.success(Unit)
        } catch (e: Exception) {
            Timber.e(e, "Error deleting all profiles")
            Result.failure(e)
        }
    }
    
    /**
     * Get profile count
     */
    fun getProfileCount(): Int = _profiles.value.size
    
    /**
     * Check if profile exists
     */
    fun profileExists(profileId: String): Boolean {
        return getProfile(profileId) != null
    }
}
