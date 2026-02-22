package com.sshtunnel.app;

import android.app.Application;

import com.sshtunnel.app.helper.LogManager;

/**
 * Application class for SSH Tunnel App
 */
public class SSHTunnelApplication extends Application {
    
    private static final String TAG = "SSHTunnelApplication";
    
    @Override
    public void onCreate() {
        super.onCreate();
        
        // Initialize LogManager
        LogManager.getInstance().init(this);
        LogManager.getInstance().i(TAG, "SSH Tunnel Application iniciado");
    }
}
