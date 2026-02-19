package com.darktunnel.vpn

import android.content.Context
import com.darktunnel.vpn.model.VpnConfig
import com.darktunnel.vpn.model.VpnProtocol
import com.darktunnel.vpn.model.VpnState
import com.darktunnel.vpn.vpn.MockVpnController
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

/**
 * VpnController Unit Tests
 * 
 * Tests for the VPN controller implementation
 * 
 * @author DarkTunnel Team
 * @version 1.0.0
 */
@OptIn(ExperimentalCoroutinesApi::class)
class VpnControllerTest {

    private lateinit var context: Context
    private lateinit var vpnController: MockVpnController

    @Before
    fun setup() {
        context = mockk(relaxed = true)
        vpnController = MockVpnController(context)
    }

    @Test
    fun `initial state should be Disconnected`() = runTest {
        val state = vpnController.state.value
        assertTrue(state is VpnState.Disconnected)
    }

    @Test
    fun `connect should emit Connecting then Connected states`() = runTest {
        val config = VpnConfig.sample()
        val states = mutableListOf<VpnState>()
        
        val job = launch(UnconfinedTestDispatcher()) {
            vpnController.connect(config).collect { state ->
                states.add(state)
            }
        }
        
        // Wait for connection to complete
        kotlinx.coroutines.delay(3000)
        job.cancel()
        
        // Verify state progression
        assertTrue(states.isNotEmpty())
        assertTrue(states.last() is VpnState.Connected)
    }

    @Test
    fun `disconnect should set state to Disconnected`() = runTest {
        // First connect
        val config = VpnConfig.sample()
        launch {
            vpnController.connect(config).collect()
        }
        kotlinx.coroutines.delay(3000)
        
        // Then disconnect
        vpnController.disconnect()
        kotlinx.coroutines.delay(500)
        
        val state = vpnController.state.value
        assertTrue(state is VpnState.Disconnected)
    }

    @Test
    fun `isConnected should return true when connected`() = runTest {
        // Initially not connected
        assertFalse(vpnController.isConnected())
        
        // Connect
        val config = VpnConfig.sample()
        launch {
            vpnController.connect(config).collect()
        }
        kotlinx.coroutines.delay(3000)
        
        // Should be connected
        assertTrue(vpnController.isConnected())
    }

    @Test
    fun `isConnecting should return true when connecting`() = runTest {
        val config = VpnConfig.sample()
        
        launch {
            vpnController.connect(config).collect()
        }
        
        // Immediately check (should be connecting)
        kotlinx.coroutines.delay(100)
        assertTrue(vpnController.isConnecting())
        
        // Wait for connection
        kotlinx.coroutines.delay(3000)
        assertFalse(vpnController.isConnecting())
    }

    @Test
    fun `supportsProtocol should return true for all protocols in mock`() {
        VpnProtocol.values().forEach { protocol ->
            assertTrue(vpnController.supportsProtocol(protocol))
        }
    }

    @Test
    fun `getProtocol should return SSH by default`() {
        assertEquals(VpnProtocol.SSH, vpnController.getProtocol())
    }

    @Test
    fun `hasVpnPermission should return true in mock`() {
        assertTrue(vpnController.hasVpnPermission())
    }

    @Test
    fun `requestVpnPermission should return null in mock`() {
        assertNull(vpnController.requestVpnPermission())
    }

    @Test
    fun `getStatistics should return null when disconnected`() {
        assertNull(vpnController.getStatistics())
    }

    @Test
    fun `getStatistics should return stats when connected`() = runTest {
        val config = VpnConfig.sample()
        launch {
            vpnController.connect(config).collect()
        }
        kotlinx.coroutines.delay(3000)
        
        val stats = vpnController.getStatistics()
        assertNotNull(stats)
        assertTrue(stats!!.bytesSent >= 0)
        assertTrue(stats.bytesReceived >= 0)
    }

    @Test
    fun `canConnect should return true when disconnected`() {
        assertTrue(vpnController.canConnect())
    }

    @Test
    fun `canConnect should return false when connected`() = runTest {
        val config = VpnConfig.sample()
        launch {
            vpnController.connect(config).collect()
        }
        kotlinx.coroutines.delay(3000)
        
        assertFalse(vpnController.canConnect())
    }

    @Test
    fun `canDisconnect should return false when disconnected`() {
        assertFalse(vpnController.canDisconnect())
    }

    @Test
    fun `canDisconnect should return true when connected`() = runTest {
        val config = VpnConfig.sample()
        launch {
            vpnController.connect(config).collect()
        }
        kotlinx.coroutines.delay(3000)
        
        assertTrue(vpnController.canDisconnect())
    }

    @Test
    fun `simulateError should set Error state`() {
        vpnController.simulateError("Test error")
        
        val state = vpnController.state.value
        assertTrue(state is VpnState.Error)
        assertEquals("Test error", (state as VpnState.Error).message)
    }

    @Test
    fun `simulateReconnection should set Reconnecting state when connected`() = runTest {
        val config = VpnConfig.sample()
        launch {
            vpnController.connect(config).collect()
        }
        kotlinx.coroutines.delay(3000)
        
        vpnController.simulateReconnection()
        
        val state = vpnController.state.value
        assertTrue(state is VpnState.Reconnecting)
    }
}
