package com.sshtunnel.app.service;

/**
 * Tun2Socks native bridge - baseado no código da Psiphon VPN
 * Fonte: https://oss.psiphon.io/hg/psiphon-circumvention-system/comparison/1791a1d73424/Android/badvpn/tun2socks/jni/ca/psiphon/Tun2Socks.java
 */
public class Tun2Socks {
    
    static {
        System.loadLibrary("tun2socks");
    }
    
    /**
     * runTun2Socks takes a tun device file descriptor (from Android's VpnService,
     * for example) and plugs it into tun2socks, which routes the tun TCP traffic
     * through the specified SOCKS proxy. UDP traffic is sent to the specified
     * udpgw server.
     *
     * The tun device file descriptor should be set to non-blocking mode.
     * tun2Socks takes ownership of the tun device file descriptor and will close
     * it when tun2socks is stopped.
     *
     * runTun2Socks blocks until tun2socks is stopped by calling terminateTun2Socks.
     * It's safe to call terminateTun2Socks from a different thread.
     */
    public native static int runTun2Socks(
            int vpnInterfaceFileDescriptor,
            int vpnInterfaceMTU,
            String vpnIpAddress,
            String vpnNetMask,
            String socksServerAddress,
            String udpgwServerAddress,
            int udpgwTransparentDNS);
    
    public native static int terminateTun2Socks();
    
    public static void logTun2Socks(String level, String channel, String msg) {
        android.util.Log.d("Tun2Socks", "[" + level + "] " + channel + ": " + msg);
    }
}
