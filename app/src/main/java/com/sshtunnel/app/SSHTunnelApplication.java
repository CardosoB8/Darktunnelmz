package com.sshtunnel.app;

import android.app.Application;

import com.sshtunnel.app.utils.CrashHandler;

public class SSHTunnelApplication extends Application {

    @Override
    public void onCreate() {
        super.onCreate();

        // Instalar o CrashHandler
        Thread.setDefaultUncaughtExceptionHandler(
            new CrashHandler(this)
        );
    }
}
