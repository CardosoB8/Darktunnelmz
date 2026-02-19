package com.darktunnel.vpn.vpn

import android.content.Context
import com.darktunnel.vpn.model.VpnProtocol
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Hilt Module for VPN Dependencies
 * 
 * Provides VpnController instances and factory for dependency injection.
 * 
 * TODO: Switch to real implementations when VPN libraries are integrated
 * 
 * @author DarkTunnel Team
 * @version 1.0.0
 */
@Module
@InstallIn(SingletonComponent::class)
object VpnModule {

    /**
     * Provides the default VpnController
     * Currently returns MockVpnController for development
     * 
     * TODO: Replace with real implementation
     */
    @Provides
    @Singleton
    fun provideVpnController(
        @ApplicationContext context: Context
    ): VpnController {
        // For development, use mock controller
        // In production, switch to real implementation
        return MockVpnController(context)
    }

    /**
     * Provides VpnControllerFactory for creating protocol-specific controllers
     */
    @Provides
    @Singleton
    fun provideVpnControllerFactory(
        @ApplicationContext context: Context
    ): VpnControllerFactory {
        return object : VpnControllerFactory {
            override fun createController(protocol: VpnProtocol): VpnController? {
                return when (protocol) {
                    VpnProtocol.WIREGUARD -> WireGuardVpnController(context)
                    VpnProtocol.OPENVPN -> OpenVpnController(context)
                    else -> MockVpnController(context)
                }
            }

            override fun getAllControllers(): List<VpnController> {
                return listOf(
                    WireGuardVpnController(context),
                    OpenVpnController(context),
                    MockVpnController(context)
                )
            }

            override fun getDefaultController(): VpnController {
                return MockVpnController(context)
            }
        }
    }
}
