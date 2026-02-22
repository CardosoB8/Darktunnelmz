package com.sshtunnel.app.utils;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;
import com.sshtunnel.app.model.Profile;

import java.io.IOException;
import java.lang.reflect.Type;
import java.security.GeneralSecurityException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/**
 * Manager for saving and loading profiles using EncryptedSharedPreferences
 */
public class ProfileManager {
    
    private static final String TAG = "ProfileManager";
    private static final String PREFS_FILE = "encrypted_profiles";
    private static final String KEY_PROFILES = "profiles";
    
    private static ProfileManager instance;
    private EncryptedSharedPreferences encryptedPrefs;
    private Gson gson;
    
    private ProfileManager(Context context) {
        this.gson = new Gson();
        initEncryptedPrefs(context);
    }
    
    public static synchronized ProfileManager getInstance(Context context) {
        if (instance == null) {
            instance = new ProfileManager(context.getApplicationContext());
        }
        return instance;
    }
    
    private void initEncryptedPrefs(Context context) {
        try {
            MasterKey masterKey = new MasterKey.Builder(context)
                    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                    .build();
            
            encryptedPrefs = (EncryptedSharedPreferences) EncryptedSharedPreferences.create(
                    context,
                    PREFS_FILE,
                    masterKey,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            );
            
        } catch (GeneralSecurityException | IOException e) {
            Log.e(TAG, "Failed to initialize EncryptedSharedPreferences", e);
            // Fallback to regular SharedPreferences (not recommended for production)
            encryptedPrefs = null;
        }
    }
    
    /**
     * Save a profile
     */
    public boolean saveProfile(Profile profile) {
        if (encryptedPrefs == null) {
            Log.e(TAG, "EncryptedSharedPreferences not initialized");
            return false;
        }
        
        try {
            List<Profile> profiles = getProfiles();
            
            // Check if profile already exists
            boolean found = false;
            for (int i = 0; i < profiles.size(); i++) {
                if (profiles.get(i).getId().equals(profile.getId())) {
                    profiles.set(i, profile);
                    found = true;
                    break;
                }
            }
            
            // Add new profile
            if (!found) {
                profiles.add(profile);
            }
            
            // Save to encrypted preferences
            String json = gson.toJson(profiles);
            encryptedPrefs.edit().putString(KEY_PROFILES, json).apply();
            
            Log.d(TAG, "Profile saved: " + profile.getName());
            return true;
            
        } catch (Exception e) {
            Log.e(TAG, "Failed to save profile", e);
            return false;
        }
    }
    
    /**
     * Get all profiles
     */
    public List<Profile> getProfiles() {
        if (encryptedPrefs == null) {
            return new ArrayList<>();
        }
        
        String json = encryptedPrefs.getString(KEY_PROFILES, null);
        if (json == null || json.isEmpty()) {
            return new ArrayList<>();
        }
        
        try {
            Type type = new TypeToken<List<Profile>>() {}.getType();
            List<Profile> profiles = gson.fromJson(json, type);
            if (profiles == null) {
                return new ArrayList<>();
            }
            
            // Sort by name
            Collections.sort(profiles, new Comparator<Profile>() {
                @Override
                public int compare(Profile p1, Profile p2) {
                    return p1.getName().compareToIgnoreCase(p2.getName());
                }
            });
            
            return profiles;
            
        } catch (Exception e) {
            Log.e(TAG, "Failed to parse profiles", e);
            return new ArrayList<>();
        }
    }
    
    /**
     * Get profile by ID
     */
    public Profile getProfile(String id) {
        List<Profile> profiles = getProfiles();
        for (Profile profile : profiles) {
            if (profile.getId().equals(id)) {
                return profile;
            }
        }
        return null;
    }
    
    /**
     * Delete a profile
     */
    public boolean deleteProfile(String id) {
        if (encryptedPrefs == null) {
            return false;
        }
        
        try {
            List<Profile> profiles = getProfiles();
            
            for (int i = 0; i < profiles.size(); i++) {
                if (profiles.get(i).getId().equals(id)) {
                    profiles.remove(i);
                    
                    String json = gson.toJson(profiles);
                    encryptedPrefs.edit().putString(KEY_PROFILES, json).apply();
                    
                    Log.d(TAG, "Profile deleted: " + id);
                    return true;
                }
            }
            
            return false;
            
        } catch (Exception e) {
            Log.e(TAG, "Failed to delete profile", e);
            return false;
        }
    }
    
    /**
     * Delete all profiles
     */
    public boolean deleteAllProfiles() {
        if (encryptedPrefs == null) {
            return false;
        }
        
        try {
            encryptedPrefs.edit().remove(KEY_PROFILES).apply();
            Log.d(TAG, "All profiles deleted");
            return true;
            
        } catch (Exception e) {
            Log.e(TAG, "Failed to delete all profiles", e);
            return false;
        }
    }
    
    /**
     * Duplicate a profile
     */
    public boolean duplicateProfile(String id) {
        Profile original = getProfile(id);
        if (original == null) {
            return false;
        }
        
        Profile copy = new Profile();
        copy.setName(original.getName() + " (Cópia)");
        copy.setHost(original.getHost());
        copy.setPort(original.getPort());
        copy.setUsername(original.getUsername());
        copy.setPassword(original.getPassword());
        copy.setUsePrivateKey(original.isUsePrivateKey());
        copy.setPrivateKeyPath(original.getPrivateKeyPath());
        copy.setPrivateKeyPassphrase(original.getPrivateKeyPassphrase());
        copy.setConnectionMode(original.getConnectionMode());
        copy.setPayload(original.getPayload());
        copy.setSni(original.getSni());
        copy.setProxyType(original.getProxyType());
        copy.setProxyHost(original.getProxyHost());
        copy.setProxyPort(original.getProxyPort());
        
        return saveProfile(copy);
    }
    
    /**
     * Check if profile exists
     */
    public boolean profileExists(String id) {
        return getProfile(id) != null;
    }
    
    /**
     * Get profile count
     */
    public int getProfileCount() {
        return getProfiles().size();
    }
    
    /**
     * Export profiles to JSON
     */
    public String exportProfilesToJson() {
        List<Profile> profiles = getProfiles();
        return gson.toJson(profiles);
    }
    
    /**
     * Import profiles from JSON
     */
    public boolean importProfilesFromJson(String json) {
        try {
            Type type = new TypeToken<List<Profile>>() {}.getType();
            List<Profile> profiles = gson.fromJson(json, type);
            
            if (profiles == null) {
                return false;
            }
            
            for (Profile profile : profiles) {
                profile.setId(null); // Generate new ID
                saveProfile(profile);
            }
            
            return true;
            
        } catch (Exception e) {
            Log.e(TAG, "Failed to import profiles", e);
            return false;
        }
    }
}
