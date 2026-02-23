package com.sshtunnel.app.service;

import android.os.ParcelFileDescriptor;
import android.util.Log;

/**
 * Tun2Socks native bridge - baseado no código do Tor Project (Orbot) e Psiphon
 * Fonte: https://gitweb.torproject.org/orbot.git
 */
public class Tun2Socks {
    
    private static final String TAG = "Tun2Socks";
    private static boolean isLibraryLoaded = false;
    
    static {
        try {
            // Tenta carregar libv2tun2socks primeiro (da sua imagem)
            System.loadLibrary("v2tun2socks");
            Log.i(TAG, "Biblioteca v2tun2socks carregada com sucesso");
            isLibraryLoaded = true;
        } catch (UnsatisfiedLinkError e) {
            Log.w(TAG, "v2tun2socks não encontrada, tentando tun2socks-udp");
            try {
                System.loadLibrary("tun2socks-udp");
                Log.i(TAG, "Biblioteca tun2socks-udp carregada com sucesso");
                isLibraryLoaded = true;
            } catch (UnsatisfiedLinkError e2) {
                Log.w(TAG, "tun2socks-udp não encontrada, tentando tun2socks");
                try {
                    System.loadLibrary("tun2socks");
                    Log.i(TAG, "Biblioteca tun2socks carregada com sucesso");
                    isLibraryLoaded = true;
                } catch (UnsatisfiedLinkError e3) {
                    Log.e(TAG, "Nenhuma biblioteca tun2socks encontrada!", e3);
                }
            }
        }
    }
    
    /**
     * Inicia o tun2socks - assinatura compatível com Tor/Psiphon
     */
    public static int runTun2Socks(
            ParcelFileDescriptor vpnInterfaceFileDescriptor,
            int vpnInterfaceMTU,
            String vpnIpAddress,
            String vpnNetMask,
            String socksServerAddress,
            String udpgwServerAddress,
            boolean udpgwTransparentDNS) {
        
        if (!isLibraryLoaded) {
            Log.e(TAG, "Biblioteca tun2socks não carregada");
            return -1;
        }
        
        if (vpnInterfaceFileDescriptor == null) {
            Log.e(TAG, "FileDescriptor nulo");
            return -1;
        }
        
        return nativeRunTun2Socks(
                vpnInterfaceFileDescriptor.detachFd(),
                vpnInterfaceMTU,
                vpnIpAddress,
                vpnNetMask,
                socksServerAddress,
                udpgwServerAddress,
                udpgwTransparentDNS ? 1 : 0);
    }
    
    /**
     * Para o tun2socks
     */
    public static native void terminateTun2Socks();
    
    /**
     * Callback para logs (chamado pela biblioteca nativa)
     */
    public static void logTun2Socks(String level, String channel, String msg) {
        String logMsg = level + "(" + channel + "): " + msg;
        if ("ERROR".equals(level)) {
            Log.e(TAG, logMsg);
        } else {
            Log.d(TAG, logMsg);
        }
    }
    
    // Método nativo com a assinatura do Tor/Psiphon
    private static native int nativeRunTun2Socks(
            int vpnInterfaceFileDescriptor,
            int vpnInterfaceMTU,
            String vpnIpAddress,
            String vpnNetMask,
            String socksServerAddress,
            String udpgwServerAddress,
            int udpgwTransparentDNS);
}
