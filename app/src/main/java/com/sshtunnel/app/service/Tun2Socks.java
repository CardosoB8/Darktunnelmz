package com.sshtunnel.app.service;

import android.content.Context;
import android.util.Log;

/**
 * Tun2Socks native bridge - Adaptado para a biblioteca do Outline
 */
public class Tun2Socks {
    
    private static final String TAG = "Tun2Socks";
    private static boolean isInitialized = false;
    
    /**
     * Inicializa a biblioteca
     */
    public static void initialize(Context context) {
        if (isInitialized) return;
        
        try {
            System.loadLibrary("tun2socks");
            Log.i(TAG, "Biblioteca tun2socks carregada com sucesso");
            isInitialized = true;
        } catch (Throwable t) {
            Log.e(TAG, "Erro ao carregar biblioteca", t);
        }
    }
    
    /**
     * Função principal do Outline
     */
    public static native int startVpn(int fd, int mtu, String socksAddr);
    
    /**
     * Função para parar
     */
    public static native void stopVpn();
    
    /**
     * Método wrapper compatível com seu código existente
     */
    public static int runTun2Socks(
            int fd, int mtu, String ip, String mask, 
            String socks, String udpgw, int dns) {
        
        // Extrair apenas host:porta
        String socksAddr = socks;
        if (socks.contains("127.0.0.1:")) {
            socksAddr = socks; // já está no formato correto
        }
        
        Log.i(TAG, "Iniciando Outline tun2socks: fd=" + fd + ", socks=" + socksAddr);
        return startVpn(fd, mtu, socksAddr);
    }
    
    /**
     * Para a VPN
     */
    public static void stopTun2Socks() {
        stopVpn();
    }
}
