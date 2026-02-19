package com.darktunnel.vpn.viewmodel

import android.content.Intent
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.darktunnel.vpn.data.ProfileRepository
import com.darktunnel.vpn.model.*
import com.darktunnel.vpn.storage.SecureStorage
import com.darktunnel.vpn.vpn.VpnController
import com.darktunnel.vpn.vpn.VpnException
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import timber.log.Timber
import javax.inject.Inject

/**
 * Main ViewModel
 * 
 * Manages the UI state for the main screen including:
 * - VPN connection state
 * - Target and payload input
 * - Connection logs
 * - Profile selection
 * 
 * @param vpnController VPN controller instance
 * @param profileRepository Profile repository
 * @param secureStorage Secure storage instance
 * @author DarkTunnel Team
 * @version 1.0.0
 */
@HiltViewModel
class MainViewModel @Inject constructor(
    private val vpnController: VpnController,
    private val profileRepository: ProfileRepository,
    private val secureStorage: SecureStorage
) : ViewModel() {

    // ==================== UI STATE ====================
    
    /**
     * Current VPN state
     */
    val vpnState: StateFlow<VpnState> = vpnController.state
    
    /**
     * Target input field state
     */
    private val _target = MutableStateFlow("")
    val target: StateFlow<String> = _target.asStateFlow()
    
    /**
     * Payload input field state
     */
    private val _payload = MutableStateFlow("")
    val payload: StateFlow<String> = _payload.asStateFlow()
    
    /**
     * Selected protocol
     */
    private val _selectedProtocol = MutableStateFlow(VpnProtocol.SSH)
    val selectedProtocol: StateFlow<VpnProtocol> = _selectedProtocol.asStateFlow()
    
    /**
     * Performance mode toggle
     */
    private val _performanceMode = MutableStateFlow(false)
    val performanceMode: StateFlow<Boolean> = _performanceMode.asStateFlow()
    
    /**
     * Direct to target toggle
     */
    private val _directTarget = MutableStateFlow(false)
    val directTarget: StateFlow<Boolean> = _directTarget.asStateFlow()
    
    /**
     * Connection logs
     */
    private val _logs = MutableStateFlow<List<LogEntry>>(emptyList())
    val logs: StateFlow<List<LogEntry>> = _logs.asStateFlow()
    
    /**
     * Current profile (if loaded from saved profiles)
     */
    private val _currentProfile = MutableStateFlow<Profile?>(null)
    val currentProfile: StateFlow<Profile?> = _currentProfile.asStateFlow()
    
    /**
     * Error messages to display
     */
    private val _errorMessage = MutableSharedFlow<String>()
    val errorMessage: SharedFlow<String> = _errorMessage.asSharedFlow()
    
    /**
     * Success messages to display
     */
    private val _successMessage = MutableSharedFlow<String>()
    val successMessage: SharedFlow<String> = _successMessage.asSharedFlow()
    
    /**
     * VPN permission request intent
     */
    private val _vpnPermissionIntent = MutableSharedFlow<Intent>()
    val vpnPermissionIntent: SharedFlow<Intent> = _vpnPermissionIntent.asSharedFlow()
    
    /**
     * Connection statistics
     */
    private val _connectionStats = MutableStateFlow<ConnectionStats?>(null)
    val connectionStats: StateFlow<ConnectionStats?> = _connectionStats.asStateFlow()

    // ==================== INITIALIZATION ====================
    
    init {
        // Load last used configuration
        loadLastConfig()
        
        // Load settings
        loadSettings()
        
        // Start stats collection when connected
        viewModelScope.launch {
            vpnState.collect { state ->
                when (state) {
                    is VpnState.Connected -> startStatsCollection()
                    is VpnState.Disconnected -> stopStatsCollection()
                    else -> { /* No action */ }
                }
            }
        }
        
        // Add initial log
        addLog(LogLevel.INFO, "DarkTunnel initialized")
        addLog(LogLevel.INFO, "Device: ${android.os.Build.MODEL}, Android ${android.os.Build.VERSION.RELEASE}")
    }

    // ==================== INPUT HANDLERS ====================
    
    fun onTargetChange(newTarget: String) {
        _target.value = newTarget
    }
    
    fun onPayloadChange(newPayload: String) {
        _payload.value = newPayload
    }
    
    fun onProtocolChange(protocol: VpnProtocol) {
        _selectedProtocol.value = protocol
        addLog(LogLevel.INFO, "Protocol changed to ${protocol.name}")
    }
    
    fun onPerformanceModeChange(enabled: Boolean) {
        _performanceMode.value = enabled
        secureStorage.saveBoolean(SecureStorage.KEY_PERFORMANCE_MODE, enabled)
        addLog(LogLevel.INFO, "Performance mode ${if (enabled) "enabled" else "disabled"}")
    }
    
    fun onDirectTargetChange(enabled: Boolean) {
        _directTarget.value = enabled
        secureStorage.saveBoolean(SecureStorage.KEY_DIRECT_TARGET, enabled)
        addLog(LogLevel.INFO, "Direct target ${if (enabled) "enabled" else "disabled"}")
    }
    
    // ==================== VPN OPERATIONS ====================
    
    /**
     * Connect to VPN
     */
    fun connect() {
        if (!validateInputs()) return
        
        viewModelScope.launch {
            try {
                // Check VPN permission
                if (!vpnController.hasVpnPermission()) {
                    val intent = vpnController.requestVpnPermission()
                    if (intent != null) {
                        _vpnPermissionIntent.emit(intent)
                        return@launch
                    }
                }
                
                // Create config
                val config = VpnConfig(
                    target = _target.value.trim(),
                    payload = _payload.value,
                    protocol = _selectedProtocol.value
                )
                
                // Save as last used
                secureStorage.saveLastConfig(config)
                
                addLog(LogLevel.INFO, "Connecting to ${config.target}...")
                
                // Start connection
                vpnController.connect(config)
                    .collect { state ->
                        handleVpnStateChange(state)
                    }
                
            } catch (e: VpnException.PermissionDenied) {
                _errorMessage.emit("VPN permission denied")
                addLog(LogLevel.ERROR, "VPN permission denied")
            } catch (e: VpnException.InvalidConfig) {
                _errorMessage.emit("Invalid configuration: ${e.message}")
                addLog(LogLevel.ERROR, "Invalid config: ${e.message}")
            } catch (e: VpnException.ConnectionFailed) {
                _errorMessage.emit("Connection failed: ${e.message}")
                addLog(LogLevel.ERROR, "Connection failed: ${e.message}")
            } catch (e: Exception) {
                _errorMessage.emit("Error: ${e.message}")
                addLog(LogLevel.ERROR, "Error: ${e.message}")
                Timber.e(e, "Connection error")
            }
        }
    }
    
    /**
     * Disconnect from VPN
     */
    fun disconnect() {
        viewModelScope.launch {
            addLog(LogLevel.INFO, "Disconnecting...")
            vpnController.disconnect()
            addLog(LogLevel.INFO, "Disconnected")
        }
    }
    
    /**
     * Toggle connection state
     */
    fun toggleConnection() {
        when (val state = vpnState.value) {
            is VpnState.Disconnected,
            is VpnState.Error -> connect()
            is VpnState.Connected,
            is VpnState.Connecting,
            is VpnState.Reconnecting -> disconnect()
            else -> { /* No action */ }
        }
    }
    
    /**
     * Handle VPN permission result
     */
    fun onVpnPermissionResult(granted: Boolean) {
        if (granted) {
            connect()
        } else {
            viewModelScope.launch {
                _errorMessage.emit("VPN permission is required")
                addLog(LogLevel.ERROR, "VPN permission denied by user")
            }
        }
    }
    
    // ==================== PROFILE OPERATIONS ====================
    
    /**
     * Load a profile
     */
    fun loadProfile(profile: Profile) {
        _currentProfile.value = profile
        _target.value = profile.config.target
        _payload.value = profile.config.payload
        _selectedProtocol.value = profile.config.protocol
        
        addLog(LogLevel.INFO, "Profile loaded: ${profile.name}")
        
        // Mark as used
        viewModelScope.launch {
            profileRepository.markProfileUsed(profile.id)
        }
    }
    
    /**
     * Save current configuration as a profile
     */
    fun saveCurrentAsProfile(name: String) {
        if (name.isBlank()) {
            viewModelScope.launch {
                _errorMessage.emit("Profile name cannot be empty")
            }
            return
        }
        
        viewModelScope.launch {
            val config = VpnConfig(
                target = _target.value,
                payload = _payload.value,
                protocol = _selectedProtocol.value
            )
            
            profileRepository.createProfile(name, config)
                .onSuccess {
                    _successMessage.emit("Profile saved: $name")
                    addLog(LogLevel.INFO, "Profile saved: $name")
                }
                .onFailure {
                    _errorMessage.emit("Failed to save profile")
                    addLog(LogLevel.ERROR, "Failed to save profile: ${it.message}")
                }
        }
    }
    
    /**
     * Clear current profile selection
     */
    fun clearProfile() {
        _currentProfile.value = null
    }
    
    // ==================== LOGGING ====================
    
    /**
     * Add a log entry
     */
    fun addLog(level: LogLevel, message: String) {
        val entry = LogEntry(
            level = level,
            message = message
        )
        _logs.value = _logs.value + entry
        
        // Keep only last 100 logs
        if (_logs.value.size > 100) {
            _logs.value = _logs.value.takeLast(100)
        }
    }
    
    /**
     * Clear all logs
     */
    fun clearLogs() {
        _logs.value = emptyList()
        addLog(LogLevel.INFO, "Logs cleared")
    }
    
    /**
     * Get logs as formatted string
     */
    fun getLogsAsString(): String {
        return _logs.value.joinToString("\n") { it.toFormattedString() }
    }
    
    // ==================== UTILITY ====================
    
    /**
     * Copy target to clipboard
     */
    fun copyTarget(): String {
        return _target.value
    }
    
    /**
     * Paste to target field
     */
    fun pasteTarget(text: String) {
        _target.value = text
    }
    
    /**
     * Paste to payload field
     */
    fun pastePayload(text: String) {
        _payload.value = text
    }
    
    /**
     * Clear target field
     */
    fun clearTarget() {
        _target.value = ""
    }
    
    /**
     * Clear payload field
     */
    fun clearPayload() {
        _payload.value = ""
    }
    
    // ==================== PRIVATE METHODS ====================
    
    private fun validateInputs(): Boolean {
        if (_target.value.isBlank()) {
            viewModelScope.launch {
                _errorMessage.emit("Target cannot be empty")
            }
            return false
        }
        return true
    }
    
    private fun handleVpnStateChange(state: VpnState) {
        when (state) {
            is VpnState.Connecting -> {
                addLog(LogLevel.INFO, "Connecting... ${state.progress}% - ${state.message}")
            }
            is VpnState.Connected -> {
                addLog(LogLevel.SUCCESS, "Connected! Local IP: ${state.localIp}")
                viewModelScope.launch {
                    _successMessage.emit("Connected successfully")
                }
            }
            is VpnState.Disconnected -> {
                addLog(LogLevel.INFO, "Disconnected")
            }
            is VpnState.Error -> {
                addLog(LogLevel.ERROR, "Error: ${state.message}")
                viewModelScope.launch {
                    _errorMessage.emit(state.message)
                }
            }
            is VpnState.Reconnecting -> {
                addLog(LogLevel.WARNING, "Reconnecting... Attempt ${state.attempt}/${state.maxAttempts}")
            }
            else -> { /* No action */ }
        }
    }
    
    private fun loadLastConfig() {
        secureStorage.getLastConfig()?.let { config ->
            _target.value = config.target
            _payload.value = config.payload
            _selectedProtocol.value = config.protocol
            addLog(LogLevel.INFO, "Last configuration loaded")
        }
    }
    
    private fun loadSettings() {
        _performanceMode.value = secureStorage.getBoolean(SecureStorage.KEY_PERFORMANCE_MODE, false)
        _directTarget.value = secureStorage.getBoolean(SecureStorage.KEY_DIRECT_TARGET, false)
    }
    
    private var statsJob: Job? = null
    
    private fun startStatsCollection() {
        statsJob?.cancel()
        statsJob = viewModelScope.launch {
            while (isActive) {
                delay(1000)
                _connectionStats.value = vpnController.getStatistics()
            }
        }
    }
    
    private fun stopStatsCollection() {
        statsJob?.cancel()
        statsJob = null
        _connectionStats.value = null
    }
    
    override fun onCleared() {
        super.onCleared()
        statsJob?.cancel()
    }
}
