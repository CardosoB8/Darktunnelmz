package com.sshtunnel.app.service;

/**
 * Tun2Socks native bridge - versão compatível com as bibliotecas do Psiphon
 * Fonte oficial: https://github.com/psiphon-labs/psiphon-tunnel-core
 */
public class Tun2Socks {
    
    static {
        System.loadLibrary("tun2socks");
        System.loadLibrary("jni");
    }
    
    /**
     * Inicia o tun2socks com os parâmetros fornecidos
     * 
     * @param vpnFd Descritor do arquivo de interface VPN
     * @param mtu MTU da interface
     * @param ipAddr Endereço IP da interface
     * @param netMask Máscara de rede
     * @param socksServer Endereço do servidor SOCKS5 (ex: "127.0.0.1:1080")
     * @param udpgwServer Endereço do servidor UDPGW (opcional)
     * @param udpgwTransparentDNS DNS transparente via UDPGW
     * @return 0 em caso de sucesso, código de erro caso contrário
     */
    public static native int runTun2Socks(
            int vpnFd,
            int mtu,
            String ipAddr,
            String netMask,
            String socksServer,
            String udpgwServer,
            int udpgwTransparentDNS);
    
    /**
     * Para a execução do tun2socks
     */
    public static native void terminateTun2Socks();
}
