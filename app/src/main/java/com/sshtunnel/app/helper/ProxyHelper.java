package com.sshtunnel.app.helper;

import android.util.Log;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;

/**
 * Helper class for proxy connections (HTTP, HTTPS, SOCKS4, SOCKS5)
 */
public class ProxyHelper {
    
    private static final String TAG = "ProxyHelper";
    private static final int CONNECT_TIMEOUT = 30000;
    private static final int READ_TIMEOUT = 30000;
    
    public enum ProxyType {
        NONE, HTTP, HTTPS, SOCKS4, SOCKS5
    }
    
    /**
     * Create socket through proxy
     */
    public static Socket createSocket(String targetHost, int targetPort,
                                       ProxyType proxyType, String proxyHost, int proxyPort) throws IOException {
        if (proxyType == ProxyType.NONE || proxyHost == null || proxyHost.isEmpty()) {
            // Direct connection
            Socket socket = new Socket();
            socket.connect(new InetSocketAddress(targetHost, targetPort), CONNECT_TIMEOUT);
            return socket;
        }
        
        switch (proxyType) {
            case HTTP:
                return createHttpProxySocket(targetHost, targetPort, proxyHost, proxyPort);
            case HTTPS:
                return createHttpsProxySocket(targetHost, targetPort, proxyHost, proxyPort);
            case SOCKS4:
                return createSocks4Socket(targetHost, targetPort, proxyHost, proxyPort);
            case SOCKS5:
                return createSocks5Socket(targetHost, targetPort, proxyHost, proxyPort);
            default:
                throw new IOException("Tipo de proxy não suportado: " + proxyType);
        }
    }
    
    /**
     * Create HTTP proxy socket (CONNECT method)
     */
    private static Socket createHttpProxySocket(String targetHost, int targetPort,
                                                 String proxyHost, int proxyPort) throws IOException {
        Log.d(TAG, "Criando conexão HTTP proxy: " + proxyHost + ":" + proxyPort);
        
        Socket socket = new Socket();
        socket.connect(new InetSocketAddress(proxyHost, proxyPort), CONNECT_TIMEOUT);
        socket.setSoTimeout(READ_TIMEOUT);
        
        // Send CONNECT request
        String connectRequest = String.format(
                "CONNECT %s:%d HTTP/1.1\r\n" +
                        "Host: %s:%d\r\n" +
                        "Proxy-Connection: Keep-Alive\r\n" +
                        "\r\n",
                targetHost, targetPort, targetHost, targetPort
        );
        
        OutputStream out = socket.getOutputStream();
        out.write(connectRequest.getBytes(StandardCharsets.UTF_8));
        out.flush();
        
        // Read response
        InputStream in = socket.getInputStream();
        StringBuilder response = new StringBuilder();
        int c;
        while ((c = in.read()) != -1) {
            response.append((char) c);
            if (response.toString().endsWith("\r\n\r\n")) {
                break;
            }
        }
        
        String responseStr = response.toString();
        Log.d(TAG, "Resposta do proxy HTTP: " + responseStr.split("\r\n")[0]);
        
        if (!responseStr.startsWith("HTTP/1.1 200") && !responseStr.startsWith("HTTP/1.0 200")) {
            socket.close();
            throw new IOException("HTTP proxy CONNECT failed: " + responseStr.split("\r\n")[0]);
        }
        
        Log.d(TAG, "HTTP proxy CONNECT bem-sucedido");
        return socket;
    }
    
    /**
     * Create HTTPS proxy socket
     */
    private static Socket createHttpsProxySocket(String targetHost, int targetPort,
                                                  String proxyHost, int proxyPort) throws IOException {
        // For HTTPS proxy, we first connect via HTTP CONNECT, then wrap with SSL
        Socket socket = createHttpProxySocket(targetHost, targetPort, proxyHost, proxyPort);
        
        try {
            // Wrap with SSL
            javax.net.ssl.SSLSocketFactory factory = javax.net.ssl.SSLSocketFactory.getDefault();
            javax.net.ssl.SSLSocket sslSocket = (javax.net.ssl.SSLSocket) factory.createSocket(
                    socket, targetHost, targetPort, true);
            sslSocket.startHandshake();
            return sslSocket;
        } catch (Exception e) {
            socket.close();
            throw new IOException("Falha ao estabelecer SSL sobre proxy: " + e.getMessage());
        }
    }
    
    /**
     * Create SOCKS4 socket
     */
    private static Socket createSocks4Socket(String targetHost, int targetPort,
                                              String proxyHost, int proxyPort) throws IOException {
        Log.d(TAG, "Criando conexão SOCKS4: " + proxyHost + ":" + proxyPort);
        
        Socket socket = new Socket();
        socket.connect(new InetSocketAddress(proxyHost, proxyPort), CONNECT_TIMEOUT);
        
        OutputStream out = socket.getOutputStream();
        InputStream in = socket.getInputStream();
        
        // Resolve target host to IP
        InetAddress targetAddr = InetAddress.getByName(targetHost);
        byte[] targetIp = targetAddr.getAddress();
        
        // SOCKS4 request: VER CMD DSTPORT DSTIP USERID NULL
        byte[] request = new byte[9 + 1]; // +1 for NULL
        request[0] = 0x04; // SOCKS version 4
        request[1] = 0x01; // CONNECT command
        request[2] = (byte) ((targetPort >> 8) & 0xFF); // Port high byte
        request[3] = (byte) (targetPort & 0xFF); // Port low byte
        System.arraycopy(targetIp, 0, request, 4, 4); // IP address
        request[8] = 0x00; // NULL userid
        
        out.write(request);
        out.flush();
        
        // Read response
        byte[] response = new byte[8];
        int read = in.read(response);
        if (read < 8) {
            socket.close();
            throw new IOException("Resposta SOCKS4 incompleta");
        }
        
        if (response[0] != 0x00) {
            socket.close();
            throw new IOException("Resposta SOCKS4 inválida");
        }
        
        if (response[1] != 0x5A) {
            socket.close();
            throw new IOException("SOCKS4 connection failed: " + String.format("0x%02X", response[1]));
        }
        
        Log.d(TAG, "SOCKS4 conexão estabelecida");
        return socket;
    }
    
    /**
     * Create SOCKS5 socket
     */
    private static Socket createSocks5Socket(String targetHost, int targetPort,
                                              String proxyHost, int proxyPort) throws IOException {
        Log.d(TAG, "Criando conexão SOCKS5: " + proxyHost + ":" + proxyPort);
        
        Socket socket = new Socket();
        socket.connect(new InetSocketAddress(proxyHost, proxyPort), CONNECT_TIMEOUT);
        
        OutputStream out = socket.getOutputStream();
        InputStream in = socket.getInputStream();
        
        // Authentication negotiation
        byte[] authRequest = {0x05, 0x01, 0x00}; // VER=5, NMETHODS=1, METHOD=0 (no auth)
        out.write(authRequest);
        out.flush();
        
        // Read auth response
        byte[] authResponse = new byte[2];
        int read = in.read(authResponse);
        if (read < 2 || authResponse[0] != 0x05 || authResponse[1] != 0x00) {
            socket.close();
            throw new IOException("SOCKS5 autenticação falhou");
        }
        
        // Connection request
        byte[] targetHostBytes = targetHost.getBytes(StandardCharsets.UTF_8);
        byte[] connectRequest = new byte[7 + targetHostBytes.length];
        connectRequest[0] = 0x05; // VER
        connectRequest[1] = 0x01; // CMD = CONNECT
        connectRequest[2] = 0x00; // RSV
        connectRequest[3] = 0x03; // ATYP = DOMAINNAME
        connectRequest[4] = (byte) targetHostBytes.length; // Domain length
        System.arraycopy(targetHostBytes, 0, connectRequest, 5, targetHostBytes.length);
        connectRequest[5 + targetHostBytes.length] = (byte) ((targetPort >> 8) & 0xFF);
        connectRequest[6 + targetHostBytes.length] = (byte) (targetPort & 0xFF);
        
        out.write(connectRequest);
        out.flush();
        
        // Read response
        byte[] response = new byte[256];
        read = in.read(response);
        if (read < 10) {
            socket.close();
            throw new IOException("Resposta SOCKS5 incompleta");
        }
        
        if (response[0] != 0x05) {
            socket.close();
            throw new IOException("Resposta SOCKS5 inválida");
        }
        
        if (response[1] != 0x00) {
            socket.close();
            String errorMsg = getSocks5ErrorMessage(response[1]);
            throw new IOException("SOCKS5 connection failed: " + errorMsg);
        }
        
        Log.d(TAG, "SOCKS5 conexão estabelecida");
        return socket;
    }
    
    private static String getSocks5ErrorMessage(byte code) {
        switch (code) {
            case 0x01:
                return "General SOCKS server failure";
            case 0x02:
                return "Connection not allowed by ruleset";
            case 0x03:
                return "Network unreachable";
            case 0x04:
                return "Host unreachable";
            case 0x05:
                return "Connection refused";
            case 0x06:
                return "TTL expired";
            case 0x07:
                return "Command not supported";
            case 0x08:
                return "Address type not supported";
            default:
                return "Unknown error (0x" + String.format("%02X", code) + ")";
        }
    }
    
    /**
     * Test proxy connection
     */
    public static boolean testProxy(ProxyType proxyType, String proxyHost, int proxyPort) {
        try {
            Socket socket = new Socket();
            socket.connect(new InetSocketAddress(proxyHost, proxyPort), 5000);
            socket.close();
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Proxy test failed: " + e.getMessage());
            return false;
        }
    }
    
    /**
     * Get proxy type from string
     */
    public static ProxyType getProxyTypeFromString(String type) {
        if (type == null) return ProxyType.NONE;
        
        switch (type.toUpperCase()) {
            case "HTTP":
                return ProxyType.HTTP;
            case "HTTPS":
                return ProxyType.HTTPS;
            case "SOCKS4":
                return ProxyType.SOCKS4;
            case "SOCKS5":
                return ProxyType.SOCKS5;
            default:
                return ProxyType.NONE;
        }
    }
}
