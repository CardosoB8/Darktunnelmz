package com.darktunnel.vpn.vpn

import com.darktunnel.vpn.model.VpnConfig
import com.darktunnel.vpn.model.VpnState
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow

/**
 * VPN Controller Interface
 * 
 * Defines the contract for VPN connection management.
 * All VPN implementations (WireGuard, OpenVPN, SSH, etc.) must implement this interface.
 * 
 * This interface provides:
 * - Connection management (connect/disconnect)
 * - State observation via Flow
 * - Configuration management
 * - Statistics retrieval
 * 
 * @author DarkTunnel Team
 * @version 1.0.0
 */
interface VpnController {

    /**
     * Current VPN state as a StateFlow
     * Observers can collect this to react to state changes
     */
    val state: StateFlow<VpnState>

    /**
     * Connect to VPN with the given configuration
     * 
     * @param config The VPN configuration to use
     * @return Flow of VpnState that emits state changes during connection
     */
    fun connect(config: VpnConfig): Flow<VpnState>

    /**
     * Disconnect from VPN
     * This is a suspending function to ensure disconnection completes
     */
    suspend fun disconnect()

    /**
     * Check if VPN permission is granted
     * 
     * @return true if VPN permission is available
     */
    fun hasVpnPermission(): Boolean

    /**
     * Request VPN permission from the system
     * This will typically launch a system dialog
     * 
     * @return Intent to launch for permission request, or null if already granted
     */
    fun requestVpnPermission(): android.content.Intent?

    /**
     * Get current connection statistics
     * 
     * @return Connection statistics or null if not connected
     */
    fun getStatistics(): com.darktunnel.vpn.model.ConnectionStats?

    /**
     * Check if the controller supports the given protocol
     * 
     * @param protocol The protocol to check
     * @return true if this controller can handle the protocol
     */
    fun supportsProtocol(protocol: com.darktunnel.vpn.model.VpnProtocol): Boolean

    /**
     * Get the protocol type this controller handles
     */
    fun getProtocol(): com.darktunnel.vpn.model.VpnProtocol

    /**
     * Update configuration while connected (if supported)
 * 
     * @param newConfig The new configuration to apply
     * @return true if update was successful
     */
    suspend fun updateConfig(newConfig: VpnConfig): Boolean

    /**
     * Check if currently connected
     */
    fun isConnected(): Boolean = state.value is VpnState.Connected

    /**
     * Check if currently connecting
     */
    fun isConnecting(): Boolean = state.value.let {
        it is VpnState.Connecting || it is VpnState.Reconnecting
    }

    /**
     * Get the last error if any
     */
    fun getLastError(): VpnState.Error? = state.value as? VpnState.Error

    /**
     * Cleanup resources
     * Should be called when the controller is no longer needed
     */
    fun cleanup()
}

/**
 * Factory interface for creating VpnController instances
 */
interface VpnControllerFactory {
    /**
     * Create a VpnController for the given protocol
     * 
     * @param protocol The VPN protocol
     * @return VpnController implementation or null if not supported
     */
    fun createController(protocol: com.darktunnel.vpn.model.VpnProtocol): VpnController?
    
    /**
     * Get all available controllers
     */
    fun getAllControllers(): List<VpnController>
    
    /**
     * Get default controller
     */
    fun getDefaultController(): VpnController
}

/**
 * Exception thrown when VPN operations fail
 */
sealed class VpnException(message: String, cause: Throwable? = null) : Exception(message, cause) {
    class PermissionDenied(message: String = "VPN permission denied") : VpnException(message)
    class InvalidConfig(message: String) : VpnException(message)
    class ConnectionFailed(message: String, cause: Throwable? = null) : VpnException(message, cause)
    class AuthenticationFailed(message: String) : VpnException(message)
    class Timeout(message: String = "Connection timed out") : VpnException(message)
    class NotSupported(message: String) : VpnException(message)
    class ServiceNotRunning(message: String = "VPN service is not running") : VpnException(message)
}
