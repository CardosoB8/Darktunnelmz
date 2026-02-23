package com.sshtunnel.app.service;

import android.content.Context;
import android.net.VpnService;
import android.os.ParcelFileDescriptor;
import android.text.TextUtils;
import android.util.Log;

import androidx.annotation.Nullable;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * Tun2Socks native bridge - versão oficial do projeto cowby123/tun2socks-android
 * Fonte: https://github.com/cowby123/tun2socks-android
 */
public class Tun2Socks {

    private static final String TAG = "Tun2Socks";
    private static volatile boolean isInitialized = false;

    /**
     * Inicializa as bibliotecas nativas
     */
    public static void initialize(Context context) {
        if (isInitialized) {
            Log.w(TAG, "Inicialização já foi feita");
            return;
        }

        System.loadLibrary("tun2socks");
        isInitialized = true;
        Log.i(TAG, "Biblioteca tun2socks carregada com sucesso");
    }

    /**
     * Inicia o tun2socks (chamar em thread separada)
     *
     * @param logLevel Nível de log (0-5)
     * @param vpnInterfaceFileDescriptor File descriptor da interface VPN
     * @param vpnInterfaceMtu MTU da interface
     * @param socksServerAddress Endereço do servidor SOCKS5
     * @param socksServerPort Porta do servidor SOCKS5
     * @param netIPv4Address Endereço IPv4 da interface
     * @param netIPv6Address Endereço IPv6 (pode ser null)
     * @param netmask Máscara de rede (ex: 255.255.255.0)
     * @param forwardUdp Se true, encaminha UDP
     * @param extraArgs Argumentos extras
     * @return true se funcionou, false caso contrário
     */
    public static boolean startTun2Socks(
            LogLevel logLevel,
            ParcelFileDescriptor vpnInterfaceFileDescriptor,
            int vpnInterfaceMtu,
            String socksServerAddress,
            int socksServerPort,
            String netIPv4Address,
            @Nullable String netIPv6Address,
            String netmask,
            boolean forwardUdp,
            List<String> extraArgs) {

        if (!isInitialized) {
            Log.e(TAG, "Biblioteca não inicializada! Chame initialize() primeiro");
            return false;
        }

        ArrayList<String> arguments = new ArrayList<>();
        arguments.add("badvpn-tun2socks");
        arguments.addAll(Arrays.asList("--logger", "stdout"));
        arguments.addAll(Arrays.asList("--loglevel", String.valueOf(logLevel.ordinal())));
        arguments.addAll(Arrays.asList("--tunfd", String.valueOf(vpnInterfaceFileDescriptor.getFd())));
        arguments.addAll(Arrays.asList("--tunmtu", String.valueOf(vpnInterfaceMtu)));
        arguments.addAll(Arrays.asList("--netif-ipaddr", netIPv4Address));

        if (!TextUtils.isEmpty(netIPv6Address)) {
            arguments.addAll(Arrays.asList("--netif-ip6addr", netIPv6Address));
        }

        arguments.addAll(Arrays.asList("--netif-netmask", netmask));
        arguments.addAll(
                Arrays.asList(
                        "--socks-server-addr",
                        String.format(Locale.US, "%s:%d", socksServerAddress, socksServerPort)));

        if (forwardUdp) {
            arguments.add("--socks5-udp");
        }
        arguments.addAll(extraArgs);

        Log.d(TAG, "Iniciando tun2socks com argumentos: " + arguments);

        int exitCode = start_tun2socks(arguments.toArray(new String[]{}));
        return exitCode == 0;
    }

    /**
     * Versão simplificada para SSH Tunnel (usa valores padrão)
     */
    public static boolean startSimpleTun2Socks(
            ParcelFileDescriptor vpnInterfaceFileDescriptor,
            int vpnInterfaceMtu,
            String socksServerAddress,
            int socksServerPort) {

        return startTun2Socks(
                LogLevel.INFO,
                vpnInterfaceFileDescriptor,
                vpnInterfaceMtu,
                socksServerAddress,
                socksServerPort,
                "10.0.0.2",
                null,
                "255.255.255.0",
                false,
                new ArrayList<>()
        );
    }

    /**
     * Inicia o tun2socks com parâmetros mínimos (método compatível com código anterior)
     */
    public static int runTun2Socks(
            int vpnFd,
            int mtu,
            String ipAddr,
            String netMask,
            String socksServer,
            String udpgwServer,
            int udpgwTransparentDNS) {

        // Converter parâmetros para o formato esperado
        ParcelFileDescriptor pfd = ParcelFileDescriptor.adoptFd(vpnFd);
        String[] parts = socksServer.split(":");
        String host = parts[0];
        int port = parts.length > 1 ? Integer.parseInt(parts[1]) : 1080;

        boolean success = startSimpleTun2Socks(
                pfd,
                mtu,
                host,
                port
        );

        return success ? 0 : -1;
    }

    /**
     * Para o tun2socks
     */
    public static native void stopTun2Socks();

    /**
     * Método nativo que inicia o tun2socks com array de argumentos
     */
    private static native int start_tun2socks(String[] args);

    /**
     * Níveis de log do tun2socks
     */
    public enum LogLevel {
        NONE,
        ERROR,
        WARNING,
        NOTICE,
        INFO,
        DEBUG
    }
}
