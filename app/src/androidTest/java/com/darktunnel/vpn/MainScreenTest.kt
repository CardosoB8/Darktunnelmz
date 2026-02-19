package com.darktunnel.vpn

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.darktunnel.vpn.ui.MainActivity
import com.darktunnel.vpn.ui.theme.DarkTunnelTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Main Screen UI Tests
 * 
 * Instrumented tests for the main screen UI
 * 
 * @author DarkTunnel Team
 * @version 1.0.0
 */
@RunWith(AndroidJUnit4::class)
class MainScreenTest {

    @get:Rule
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun appBar_showsCorrectTitle() {
        composeTestRule.onNodeWithText("DarkTunnel").assertIsDisplayed()
    }

    @Test
    fun connectButton_isDisplayed() {
        composeTestRule.onNodeWithText("CONNECT").assertIsDisplayed()
    }

    @Test
    fun targetInputField_isDisplayed() {
        composeTestRule.onNodeWithText("Target").assertIsDisplayed()
    }

    @Test
    fun payloadInputField_isDisplayed() {
        composeTestRule.onNodeWithText("Payload").assertIsDisplayed()
    }

    @Test
    fun logConsole_isDisplayed() {
        composeTestRule.onNodeWithText("Connection Log").assertIsDisplayed()
    }

    @Test
    fun menuButton_isClickable() {
        composeTestRule.onNodeWithContentDescription("More options").assertIsDisplayed()
        composeTestRule.onNodeWithContentDescription("More options").performClick()
        
        // Check menu items appear
        composeTestRule.onNodeWithText("Profiles").assertIsDisplayed()
        composeTestRule.onNodeWithText("Settings").assertIsDisplayed()
    }

    @Test
    fun targetInput_acceptsText() {
        val testTarget = "test.example.com:443"
        
        composeTestRule.onNodeWithText("Target")
            .performTextClearance()
        
        composeTestRule.onNodeWithText("Target")
            .performTextInput(testTarget)
        
        composeTestRule.onNodeWithText(testTarget).assertIsDisplayed()
    }

    @Test
    fun payloadInput_acceptsText() {
        val testPayload = "GET / HTTP/1.1"
        
        composeTestRule.onNode(hasText("Payload"))
            .performTextClearance()
        
        composeTestRule.onNode(hasText("Payload"))
            .performTextInput(testPayload)
        
        composeTestRule.onNodeWithText(testPayload).assertIsDisplayed()
    }

    @Test
    fun connectButton_changesStateOnClick() {
        // Enter target to enable connection
        composeTestRule.onNodeWithText("Target")
            .performTextInput("test.example.com:443")
        
        // Click connect
        composeTestRule.onNodeWithText("CONNECT").performClick()
        
        // Wait for state change
        composeTestRule.waitForIdle()
        
        // Button should show connecting or connected state
        // Note: This depends on the mock implementation
        val button = composeTestRule.onNode(
            hasText("CONNECTING…") or hasText("DISCONNECT")
        )
        button.assertExists()
    }

    @Test
    fun performanceModeToggle_isClickable() {
        composeTestRule.onNodeWithText("Performance Mode").assertIsDisplayed()
        composeTestRule.onNode(hasText("Performance Mode").and(hasParent(hasTestTag("switch"))))
            .performClick()
    }

    @Test
    fun directTargetToggle_isClickable() {
        composeTestRule.onNodeWithText("Direct → Target").assertIsDisplayed()
    }

    @Test
    fun clearButton_clearsFields() {
        // Enter some text
        composeTestRule.onNodeWithText("Target")
            .performTextInput("test.example.com")
        
        // Click delete/clear button
        composeTestRule.onNodeWithContentDescription("Clear fields").performClick()
        
        // Confirm dialog should appear
        composeTestRule.onNodeWithText("Clear Fields").assertIsDisplayed()
        
        // Click clear
        composeTestRule.onNodeWithText("Clear").performClick()
        
        // Field should be cleared
        composeTestRule.onNodeWithText("test.example.com").assertDoesNotExist()
    }

    @Test
    fun logConsole_showsInitialMessage() {
        // Log should show initialization message
        composeTestRule.onNodeWithText("DarkTunnel initialized", substring = true)
            .assertExists()
    }

    @Test
    fun statusIndicator_showsDisconnectedInitially() {
        composeTestRule.onNodeWithText("Status").assertIsDisplayed()
        composeTestRule.onNodeWithText("Disconnected").assertIsDisplayed()
    }

    @Test
    fun quickActions_areDisplayed() {
        composeTestRule.onNodeWithText("Save").assertIsDisplayed()
        composeTestRule.onNodeWithText("Profiles").assertIsDisplayed()
        composeTestRule.onNodeWithText("Copy").assertIsDisplayed()
    }

    @Test
    fun saveProfileDialog_showsOnSaveClick() {
        // Enter target first
        composeTestRule.onNodeWithText("Target")
            .performTextInput("test.example.com:443")
        
        // Click save
        composeTestRule.onNodeWithText("Save").performClick()
        
        // Dialog should appear
        composeTestRule.onNodeWithText("Save Profile").assertIsDisplayed()
        composeTestRule.onNodeWithText("Profile Name").assertIsDisplayed()
    }
}

/**
 * Connect Flow Test
 * 
 * Tests the complete connect/disconnect flow
 */
@RunWith(AndroidJUnit4::class)
class ConnectFlowTest {

    @get:Rule
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun connectFlow_connectsAndDisconnects() {
        // Enter valid target
        composeTestRule.onNodeWithText("Target")
            .performTextInput("test.example.com:443")
        
        // Click connect
        composeTestRule.onNodeWithText("CONNECT").performClick()
        
        // Wait for connection
        composeTestRule.waitUntil(timeoutMillis = 5000) {
            try {
                composeTestRule.onNodeWithText("DISCONNECT").assertExists()
                true
            } catch (e: AssertionError) {
                false
            }
        }
        
        // Status should show connected
        composeTestRule.onNodeWithText("Connected").assertIsDisplayed()
        
        // Click disconnect
        composeTestRule.onNodeWithText("DISCONNECT").performClick()
        
        // Wait for disconnection
        composeTestRule.waitUntil(timeoutMillis = 3000) {
            try {
                composeTestRule.onNodeWithText("CONNECT").assertExists()
                true
            } catch (e: AssertionError) {
                false
            }
        }
        
        // Status should show disconnected
        composeTestRule.onNodeWithText("Disconnected").assertIsDisplayed()
    }
}
