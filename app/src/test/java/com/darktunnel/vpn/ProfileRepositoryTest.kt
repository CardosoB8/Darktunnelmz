package com.darktunnel.vpn

import android.content.Context
import com.darktunnel.vpn.data.ProfileRepository
import com.darktunnel.vpn.model.Profile
import com.darktunnel.vpn.model.VpnConfig
import com.darktunnel.vpn.model.VpnProtocol
import com.darktunnel.vpn.storage.SecureStorage
import io.mockk.*
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

/**
 * ProfileRepository Unit Tests
 * 
 * Tests for the profile repository implementation
 * 
 * @author DarkTunnel Team
 * @version 1.0.0
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ProfileRepositoryTest {

    private lateinit var context: Context
    private lateinit var secureStorage: SecureStorage
    private lateinit var profileRepository: ProfileRepository

    @Before
    fun setup() {
        context = mockk(relaxed = true)
        secureStorage = mockk(relaxed = true)
        profileRepository = ProfileRepository(secureStorage)
    }

    @Test
    fun `getAllProfiles should return empty list initially`() = runTest {
        every { secureStorage.getAllProfiles() } returns emptyList()
        
        val profiles = profileRepository.getAllProfiles().first()
        
        assertTrue(profiles.isEmpty())
    }

    @Test
    fun `createProfile should save and return profile`() = runTest {
        val config = VpnConfig(
            name = "Test",
            target = "test.com:443",
            protocol = VpnProtocol.SSH
        )
        
        every { secureStorage.saveProfile(any()) } returns true
        
        val result = profileRepository.createProfile("Test Profile", config)
        
        assertTrue(result.isSuccess)
        assertEquals("Test Profile", result.getOrNull()?.name)
    }

    @Test
    fun `createProfile should fail when save fails`() = runTest {
        val config = VpnConfig.sample()
        
        every { secureStorage.saveProfile(any()) } returns false
        
        val result = profileRepository.createProfile("Test", config)
        
        assertTrue(result.isFailure)
    }

    @Test
    fun `deleteProfile should remove profile`() = runTest {
        val profileId = "test-id"
        
        every { secureStorage.deleteProfile(profileId) } returns true
        
        val result = profileRepository.deleteProfile(profileId)
        
        assertTrue(result.isSuccess)
    }

    @Test
    fun `toggleFavorite should update favorite status`() = runTest {
        val profileId = "test-id"
        
        every { secureStorage.toggleFavorite(profileId) } returns true
        
        val result = profileRepository.toggleFavorite(profileId)
        
        assertTrue(result.isSuccess)
    }

    @Test
    fun `getProfile should return profile by id`() {
        val profile = Profile(
            id = "test-id",
            name = "Test",
            config = VpnConfig.sample()
        )
        
        every { secureStorage.getAllProfiles() } returns listOf(profile)
        
        // Refresh profiles
        profileRepository.refreshProfiles()
        
        val result = profileRepository.getProfile("test-id")
        
        assertNotNull(result)
        assertEquals("Test", result?.name)
    }

    @Test
    fun `getProfile should return null for non-existent id`() {
        every { secureStorage.getAllProfiles() } returns emptyList()
        
        profileRepository.refreshProfiles()
        
        val result = profileRepository.getProfile("non-existent")
        
        assertNull(result)
    }

    @Test
    fun `profileExists should return true for existing profile`() {
        val profile = Profile(
            id = "test-id",
            name = "Test",
            config = VpnConfig.sample()
        )
        
        every { secureStorage.getAllProfiles() } returns listOf(profile)
        
        profileRepository.refreshProfiles()
        
        assertTrue(profileRepository.profileExists("test-id"))
    }

    @Test
    fun `profileExists should return false for non-existent profile`() {
        every { secureStorage.getAllProfiles() } returns emptyList()
        
        profileRepository.refreshProfiles()
        
        assertFalse(profileRepository.profileExists("non-existent"))
    }

    @Test
    fun `getProfileCount should return number of profiles`() {
        val profiles = listOf(
            Profile(id = "1", name = "Profile 1", config = VpnConfig.sample()),
            Profile(id = "2", name = "Profile 2", config = VpnConfig.sample())
        )
        
        every { secureStorage.getAllProfiles() } returns profiles
        
        profileRepository.refreshProfiles()
        
        assertEquals(2, profileRepository.getProfileCount())
    }

    @Test
    fun `duplicateProfile should create copy with new id`() = runTest {
        val original = Profile(
            id = "original-id",
            name = "Original",
            config = VpnConfig.sample()
        )
        
        every { secureStorage.getAllProfiles() } returns listOf(original)
        every { secureStorage.saveProfile(any()) } returns true
        
        profileRepository.refreshProfiles()
        
        val result = profileRepository.duplicateProfile("original-id")
        
        assertTrue(result.isSuccess)
        assertEquals("Original (Copy)", result.getOrNull()?.name)
        assertNotEquals("original-id", result.getOrNull()?.id)
    }

    @Test
    fun `exportProfiles should return json string`() {
        val json = "[{\"id\":\"1\",\"name\":\"Test\"}]"
        
        every { secureStorage.exportProfiles() } returns json
        
        val result = profileRepository.exportProfiles()
        
        assertEquals(json, result)
    }

    @Test
    fun `importProfiles should parse and save profiles`() = runTest {
        val json = "[{\"id\":\"1\",\"name\":\"Test\",\"config\":{\"target\":\"test.com\"}}]"
        
        every { secureStorage.importProfiles(json) } returns true
        
        val result = profileRepository.importProfiles(json)
        
        assertTrue(result.isSuccess)
    }

    @Test
    fun `deleteAllProfiles should clear all data`() = runTest {
        every { secureStorage.clearAllData() } returns Unit
        
        val result = profileRepository.deleteAllProfiles()
        
        assertTrue(result.isSuccess)
    }

    @Test
    fun `updateProfile should modify existing profile`() = runTest {
        val profile = Profile(
            id = "test-id",
            name = "Old Name",
            config = VpnConfig.sample()
        )
        
        every { secureStorage.getAllProfiles() } returns listOf(profile)
        every { secureStorage.saveProfile(any()) } returns true
        
        profileRepository.refreshProfiles()
        
        val result = profileRepository.updateProfile(
            profileId = "test-id",
            name = "New Name"
        )
        
        assertTrue(result.isSuccess)
        assertEquals("New Name", result.getOrNull()?.name)
    }

    @Test
    fun `updateProfile should fail for non-existent profile`() = runTest {
        every { secureStorage.getAllProfiles() } returns emptyList()
        
        profileRepository.refreshProfiles()
        
        val result = profileRepository.updateProfile(
            profileId = "non-existent",
            name = "New Name"
        )
        
        assertTrue(result.isFailure)
    }

    @Test
    fun `markProfileUsed should increment use count`() = runTest {
        val profile = Profile(
            id = "test-id",
            name = "Test",
            config = VpnConfig.sample(),
            useCount = 5
        )
        
        every { secureStorage.getAllProfiles() } returns listOf(profile)
        every { secureStorage.saveProfile(any()) } returns true
        
        profileRepository.refreshProfiles()
        
        val result = profileRepository.markProfileUsed("test-id")
        
        assertTrue(result.isSuccess)
        assertEquals(6, result.getOrNull()?.useCount)
        assertNotNull(result.getOrNull()?.lastUsed)
    }
}
