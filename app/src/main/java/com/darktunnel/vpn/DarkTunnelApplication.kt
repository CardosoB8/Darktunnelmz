package com.darktunnel.vpn

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import dagger.hilt.android.HiltAndroidApp
import timber.log.Timber
import javax.inject.Inject

/**
 * DarkTunnel VPN Application Class
 * 
 * This is the main application class that initializes:
 * - Dependency Injection (Hilt)
 * - Logging (Timber)
 * - Notification Channels
 * - WorkManager
 * 
 * @author DarkTunnel Team
 * @version 1.0.0
 */
@HiltAndroidApp
class DarkTunnelApplication : Application(), Configuration.Provider {

    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    override fun onCreate() {
        super.onOnCreate()
        
        // Initialize logging
        initializeLogging()
        
        // Create notification channels
        createNotificationChannels()
        
        Timber.i("DarkTunnel VPN Application initialized")
    }

    /**
     * Initialize Timber logging
     * In debug builds, plant a DebugTree for detailed logs
     * In release builds, only log warnings and errors
     */
    private fun initializeLogging() {
        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
        } else {
            // In production, only log warnings and above
            Timber.plant(object : Timber.Tree() {
                override fun log(priority: Int, tag: String?, message: String, t: Throwable?) {
                    // TODO: Implement crash reporting service integration
                    // Example: FirebaseCrashlytics.getInstance().log(message)
                }
            })
        }
    }

    /**
     * Create notification channels for Android O+ (API 26+)
     * Required for foreground service notifications
     */
    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            
            // VPN Service Channel
            val vpnChannel = NotificationChannel(
                CHANNEL_VPN_SERVICE,
                getString(R.string.notification_channel_vpn),
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = getString(R.string.notification_channel_vpn_description)
                setShowBadge(false)
                enableLights(false)
                enableVibration(false)
            }
            
            // General Notifications Channel
            val generalChannel = NotificationChannel(
                CHANNEL_GENERAL,
                "General Notifications",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "General app notifications"
            }
            
            notificationManager.createNotificationChannels(listOf(vpnChannel, generalChannel))
        }
    }

    /**
     * WorkManager configuration for background tasks
     */
    override fun getWorkManagerConfiguration(): Configuration {
        return Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .setMinimumLoggingLevel(if (BuildConfig.DEBUG) android.util.Log.DEBUG else android.util.Log.WARN)
            .build()
    }

    companion object {
        const val CHANNEL_VPN_SERVICE = "vpn_service_channel"
        const val CHANNEL_GENERAL = "general_channel"
        
        const val NOTIFICATION_ID_VPN = 1001
        const val NOTIFICATION_ID_RECONNECT = 1002
    }
}
