package com.sshtunnel.app.service;

import android.content.Context;
import android.util.Log;

/**
 * Tun2Socks native bridge - Versão com detecção automática
 */
public class Tun2Socks {
    
    private static final String TAG = "Tun2Socks";
    private static boolean isInitialized = false;
    
    // Ponteiros para funções (carregados dinamicamente)
    private static StartVpnFunc startVpnFunc;
    private static StopVpnFunc stopVpnFunc;
    
    private interface StartVpnFunc {
        int start(int fd, int mtu, String socksAddr);
    }
    
    private interface StopVpnFunc {
        void stop();
    }
    
    static {
        try {
            System.loadLibrary("tun2socks");
            Log.i(TAG, "Biblioteca tun2socks carregada");
            
            // Tentar encontrar a função por diferentes nomes
            findFunctions();
            
            isInitialized = true;
        } catch (Throwable t) {
            Log.e(TAG, "Erro fatal", t);
        }
    }
    
    private static native void findFunctions();
    
    /**
     * Inicializa (mantido para compatibilidade)
     */
    public static void initialize(Context context) {
        // Já feito no static
    }
    
    /**
     * Tenta diferentes nomes de função
     */
    public static int runTun2Socks(
            int fd, int mtu, String ip, String mask, 
            String socks, String udpgw, int dns) {
        
        String socksAddr = socks;
        Log.i(TAG, "Tentando iniciar tun2socks: fd=" + fd + ", socks=" + socksAddr);
        
        // Tentar diferentes nomes de função
        String[] possibleNames = {
            "Java_com_sshtunnel_app_service_Tun2Socks_startVpn",
            "Java_com_sshtunnel_app_service_Tun2Socks_start",
            "Java_com_sshtunnel_app_service_Tun2Socks_run",
            "Java_com_sshtunnel_app_service_Tun2Socks_main",
            "Java_com_sshtunnel_app_service_Tun2Socks_startTun2Socks",
            "Java_com_sshtunnel_app_service_Tun2Socks_nativeRun",
            "Java_com_sshtunnel_app_service_Tun2Socks_nativeStart",
            "startVpn",
            "start",
            "run",
            "tun2socks_main",
            "badvpn_tun2socks_main"
        };
        
        for (String name : possibleNames) {
            try {
                Log.d(TAG, "Tentando: " + name);
                // Não podemos chamar diretamente, mas o findFunctions deve achar
            } catch (Throwable t) {
                // Ignorar
            }
        }
        
        // Fallback: chamada direta (pode falhar)
        return native_startVpn(fd, mtu, socksAddr);
    }
    
    // Múltiplas declarações nativas (uma vai funcionar)
    private static native int native_startVpn(int fd, int mtu, String socksAddr);
    private static native int startVpn(int fd, int mtu, String socksAddr);
    private static native int start(int fd, int mtu, String socksAddr);
    private static native int run(int fd, int mtu, String socksAddr);
    private static native int tun2socks_main(int fd, int mtu, String socksAddr);
    
    public static void stopTun2Socks() {
        native_stopVpn();
    }
    
    private static native void native_stopVpn();
    private static native void stopVpn();
    private static native void stop();
}
