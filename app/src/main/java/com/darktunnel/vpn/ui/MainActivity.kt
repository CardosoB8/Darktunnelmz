package com.darktunnel.vpn.ui

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.darktunnel.vpn.ui.screens.MainScreen
import com.darktunnel.vpn.ui.theme.DarkTunnelTheme
import com.darktunnel.vpn.viewmodel.MainViewModel
import com.google.accompanist.systemuicontroller.rememberSystemUiController
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch
import timber.log.Timber

/**
 * Main Activity
 * 
 * Entry point for the DarkTunnel VPN application.
 * Handles VPN permission results and manages the main UI.
 * 
 * @author DarkTunnel Team
 * @version 1.0.0
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    private val viewModel: MainViewModel by viewModels()
    
    /**
     * VPN Permission Launcher
     * Handles the result of VpnService.prepare() intent
     */
    private val vpnPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val granted = result.resultCode == RESULT_OK
        Timber.d("VPN permission result: $granted")
        viewModel.onVpnPermissionResult(granted)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        // Install splash screen
        installSplashScreen()
        
        super.onCreate(savedInstanceState)
        
        // Collect UI events
        collectUiEvents()
        
        setContent {
            DarkTunnelTheme {
                // Configure system UI
                val systemUiController = rememberSystemUiController()
                val useDarkIcons = !isSystemInDarkTheme()
                
                SideEffect {
                    systemUiController.setStatusBarColor(
                        color = androidx.compose.ui.graphics.Color.Transparent,
                        darkIcons = useDarkIcons
                    )
                    systemUiController.setNavigationBarColor(
                        color = androidx.compose.ui.graphics.Color.Transparent,
                        darkIcons = useDarkIcons
                    )
                }
                
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    MainScreen(
                        viewModel = viewModel,
                        onNavigateToProfiles = {
                            // TODO: Navigate to ProfileActivity
                            startActivity(Intent(this, ProfileActivity::class.java))
                        },
                        onNavigateToSettings = {
                            // TODO: Navigate to SettingsActivity
                            startActivity(Intent(this, SettingsActivity::class.java))
                        }
                    )
                }
            }
        }
    }
    
    /**
     * Collect UI events from ViewModel
     */
    private fun collectUiEvents() {
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                // Handle VPN permission requests
                launch {
                    viewModel.vpnPermissionIntent.collect { intent ->
                        vpnPermissionLauncher.launch(intent)
                    }
                }
            }
        }
    }
    
    override fun onResume() {
        super.onResume()
        Timber.d("MainActivity resumed")
    }
    
    override fun onPause() {
        super.onPause()
        Timber.d("MainActivity paused")
    }
    
    override fun onDestroy() {
        super.onDestroy()
        Timber.d("MainActivity destroyed")
    }
}

/**
 * Profile Activity
 * 
 * Activity for managing VPN profiles
 */
@AndroidEntryPoint
class ProfileActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            DarkTunnelTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    // TODO: Implement ProfileScreen
                    Text("Profile Management - TODO")
                }
            }
        }
    }
}

/**
 * Settings Activity
 * 
 * Activity for app settings
 */
@AndroidEntryPoint
class SettingsActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            DarkTunnelTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    // TODO: Implement SettingsScreen
                    Text("Settings - TODO")
                }
            }
        }
    }
}
