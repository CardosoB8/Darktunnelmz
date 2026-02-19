package com.darktunnel.vpn.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

/**
 * DarkTunnel VPN - Theme Configuration
 * 
 * Material3 theme with light and dark color schemes
 */

// Light color scheme
private val LightColorScheme = lightColorScheme(
    primary = PrimaryBlue,
    onPrimary = Color.White,
    primaryContainer = PrimaryBlueLight,
    onPrimaryContainer = PrimaryBlueDark,
    
    secondary = AccentOrange,
    onSecondary = Color.White,
    secondaryContainer = AccentOrangeLight,
    onSecondaryContainer = AccentOrangeDark,
    
    tertiary = InfoBlue,
    onTertiary = Color.White,
    
    error = ErrorRed,
    onError = Color.White,
    errorContainer = ErrorRedLight,
    onErrorContainer = ErrorRedDark,
    
    background = BackgroundLight,
    onBackground = TextPrimaryLight,
    
    surface = SurfaceLight,
    onSurface = TextPrimaryLight,
    surfaceVariant = CardLight,
    onSurfaceVariant = TextSecondaryLight,
    
    outline = BorderLight,
    
    scrim = Scrim
)

// Dark color scheme
private val DarkColorScheme = darkColorScheme(
    primary = PrimaryBlueLight,
    onPrimary = Color.White,
    primaryContainer = PrimaryBlueDark,
    onPrimaryContainer = PrimaryBlueLight,
    
    secondary = AccentOrangeLight,
    onSecondary = Color.Black,
    secondaryContainer = AccentOrangeDark,
    onSecondaryContainer = AccentOrangeLight,
    
    tertiary = InfoBlue,
    onTertiary = Color.White,
    
    error = ErrorRedLight,
    onError = Color.Black,
    errorContainer = ErrorRedDark,
    onErrorContainer = ErrorRedLight,
    
    background = BackgroundDark,
    onBackground = TextPrimaryDark,
    
    surface = SurfaceDark,
    onSurface = TextPrimaryDark,
    surfaceVariant = CardDark,
    onSurfaceVariant = TextSecondaryDark,
    
    outline = BorderDark,
    
    scrim = Scrim
)

/**
 * DarkTunnel Theme
 * 
 * @param darkTheme Whether to use dark theme
 * @param dynamicColor Whether to use dynamic colors (Android 12+)
 * @param content Composable content
 */
@Composable
fun DarkTunnelTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = false, // Disabled by default for consistent branding
    content: @Composable () -> Unit
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColorScheme
        else -> LightColorScheme
    }
    
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colorScheme.background.toArgb()
            window.navigationBarColor = colorScheme.background.toArgb()
            
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = !darkTheme
                isAppearanceLightNavigationBars = !darkTheme
            }
        }
    }
    
    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}

/**
 * Get VPN status color based on state
 */
@Composable
fun getVpnStatusColor(status: String): Color {
    return when (status.lowercase()) {
        "connected" -> VpnConnected
        "connecting" -> VpnConnecting
        "disconnected" -> VpnDisconnected
        "error" -> VpnError
        else -> VpnDisconnected
    }
}

/**
 * Get VPN status background color
 */
@Composable
fun getVpnStatusBackgroundColor(status: String): Color {
    return when (status.lowercase()) {
        "connected" -> VpnConnectedBg
        "connecting" -> VpnConnectingBg
        "disconnected" -> VpnDisconnectedBg
        "error" -> VpnErrorBg
        else -> VpnDisconnectedBg
    }
}
