package com.sshtunnel.app.service;

import android.content.Context;
import android.util.Log;

/**
 * Tun2Socks native bridge - Versão com métodos públicos
 */
public class Tun2Socks {
    
    private static final String TAG = "Tun2Socks";
    private static boolean isInitialized = false;
    
    static {
        try {
            System.loadLibrary("tun2socks");
            Log.i(TAG, "Biblioteca tun2socks carregada");
            isInitialized = true;
        } catch (Throwable t) {
            Log.e(TAG, "Erro fatal ao carregar biblioteca", t);
        }
    }
    
    /**
     * Inicializa (mantido para compatibilidade)
     */
    public static void initialize(Context context) {
        // Já feito no static
    }
    
    /**
     * Método principal - TENTA DIFERENTES NOMES
     */
    public static int runTun2Socks(
            int fd, int mtu, String ip, String mask, 
            String socks, String udpgw, int dns) {
        
        String socksAddr = socks;
        Log.i(TAG, "Iniciando tun2socks: fd=" + fd + ", socks=" + socksAddr);
        
        // Tentar chamar diretamente (pode funcionar)
        return startVpn(fd, mtu, socksAddr);
    }
    
    /**
     * Função principal do Outline (PÚBLICA)
     */
    public static native int startVpn(int fd, int mtu, String socksAddr);
    
    /**
     * Função para parar (PÚBLICA)
     */
    public static native void stopVpn();
    
    /**
     * Aliases para compatibilidade (PÚBLICOS)
     */
    public static native int start(int fd, int mtu, String socksAddr);
    public static native int run(int fd, int mtu, String socksAddr);
    public static native int tun2socks_main(int fd, int mtu, String socksAddr);
    
    /**
     * Para a VPN (alias público)
     */
    public static void stopTun2Socks() {
        stopVpn();
    }
}
