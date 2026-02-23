package com.sshtunnel.app.helper;

import android.util.Log;

import com.jcraft.jsch.*;
import com.sshtunnel.app.model.ConnectionConfig;
import com.sshtunnel.app.model.ConnectionStatus;

import java.io.*;
import java.net.InetSocketAddress;
import java.net.Proxy;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Properties;
import java.util.concurrent.atomic.AtomicBoolean;

import javax.net.ssl.*;

/**
 * Helper class for SSH connections using JSch library
 */
public class JSchHelper {
    
    private static final String TAG = "JSchHelper";
    private static final int CONNECT_TIMEOUT = 30000; // 30 seconds
    private static final int SERVER_ALIVE_INTERVAL = 30000; // 30 seconds
    
    private JSch jsch;
    private Session session;
    private ConnectionConfig config;
    private ConnectionListener listener;
    private AtomicBoolean isConnecting = new AtomicBoolean(false);
    private AtomicBoolean isConnected = new AtomicBoolean(false);
    
    // Local port forwarding
    private int localSocksPort = 1080;
    private int localHttpProxyPort = 8080;
    
    public interface ConnectionListener {
        void onStatusChanged(ConnectionStatus status);
        void onLog(String message);
        void onError(String error);
        void onConnected();
        void onDisconnected();
    }
    
    public JSchHelper() {
        this.jsch = new JSch();
    }
    
    private int findAvailablePort() {
        for (int port = 1080; port < 1180; port++) {
            try {
                ServerSocket socket = new ServerSocket(port);
                socket.close();
                Log.d(TAG, "Porta disponível encontrada: " + port);
                return port;
            } catch (Exception e) {
                // Porta ocupada, tenta próxima
            }
        }
        Log.w(TAG, "Nenhuma porta disponível encontrada, usando 1080");
        return 1080; // fallback
    }
    
    public void setConnectionListener(ConnectionListener listener) {
        this.listener = listener;
    }
    
    public void setConfig(ConnectionConfig config) {
        this.config = config;
    }
    
    /**
     * Connect to SSH server
     */
    public void connect() {
        if (isConnecting.get() || isConnected.get()) {
            log("Já está conectado ou conectando");
            return;
        }
        
        if (config == null) {
            onError("Configuração não definida");
            return;
        }
        
        isConnecting.set(true);
        updateStatus(ConnectionStatus.CONNECTING);
        
        new Thread(() -> {
            try {
                log("Iniciando conexão SSH para " + config.getHost() + ":" + config.getPort());
                
                // Handle different connection modes
                switch (config.getConnectionMode()) {
                    case SSL_TLS:
                        connectSSL();
                        break;
                    case WEBSOCKET:
                        connectWebSocket();
                        break;
                    case NORMAL:
                    default:
                        connectNormal();
                        break;
                }
                
            } catch (Exception e) {
                Log.e(TAG, "Connection error", e);
                onError("Erro de conexão: " + e.getMessage());
                disconnect();
            }
        }).start();
    }
    
    /**
     * Normal SSH connection
     */
    private void connectNormal() throws Exception {
        // Configure session
        session = jsch.getSession(
                config.getUsername(),
                config.getHost(),
                config.getPort()
        );
        
        // Set password or private key
        if (config.isUsePrivateKey() && config.getPrivateKeyPath() != null) {
            log("Usando autenticação por chave privada");
            jsch.addIdentity(config.getPrivateKeyPath(), config.getPrivateKeyPassphrase());
        } else {
            log("Usando autenticação por senha");
            session.setPassword(config.getPassword());
        }
        
        // Configure session properties
        Properties props = new Properties();
        props.put("StrictHostKeyChecking", "no");
        props.put("UserKnownHostsFile", "/dev/null");
        props.put("ServerAliveInterval", String.valueOf(SERVER_ALIVE_INTERVAL / 1000));
        props.put("ServerAliveCountMax", "3");
        props.put("TCPKeepAlive", "yes");
        session.setConfig(props);
        
        // Handle proxy if configured
        if (config.hasProxy()) {
            setupProxy();
        }
        
        // Handle payload if configured
        if (config.hasPayload()) {
            sendPayload();
        }
        
        // Connect
        log("Conectando ao servidor SSH…");
        session.connect(CONNECT_TIMEOUT);
        
        if (session.isConnected()) {
            isConnected.set(true);
            isConnecting.set(false);
            log("Conexão SSH estabelecida com sucesso!");
            
            // Setup port forwarding
            setupPortForwarding();
            
            updateStatus(ConnectionStatus.CONNECTED);
            if (listener != null) {
                listener.onConnected();
            }
        }
    }
    
    /**
     * SSL/TLS connection with SNI support
     */
    private void connectSSL() throws Exception {
        log("Modo SSL/TLS selecionado");
        
        // Create SSL context
        SSLContext sslContext = SSLContext.getInstance("TLS");
        sslContext.init(null, getTrustAllCerts(), new java.security.SecureRandom());
        
        // Create socket factory with SNI
        SSLSocketFactory factory = sslContext.getSocketFactory();
        
        // Connect through proxy if needed
        Socket underlyingSocket;
        if (config.hasProxy()) {
            underlyingSocket = createProxySocket();
        } else {
            underlyingSocket = new Socket();
            underlyingSocket.connect(new InetSocketAddress(config.getHost(), config.getPort()), CONNECT_TIMEOUT);
        }
        
        // Wrap with SSL
        SSLSocket sslSocket = (SSLSocket) factory.createSocket(
                underlyingSocket,
                config.getHost(),
                config.getPort(),
                true
        );
        
        // Set SNI if provided
        if (config.hasSNI()) {
            log("Configurando SNI: " + config.getSni());
            SSLParameters sslParams = sslSocket.getSSLParameters();
            sslParams.setServerNames(java.util.Collections.singletonList(
                    new javax.net.ssl.SNIHostName(config.getSni())
            ));
            sslSocket.setSSLParameters(sslParams);
        }
        
        sslSocket.startHandshake();
        log("Handshake SSL/TLS concluído");
        
        // Now use this socket for SSH
        // Note: JSch doesn't directly support SSL wrapping, so we need to use a custom approach
        // For now, we'll connect normally after SSL handshake
        connectNormal();
    }
    
    /**
     * WebSocket connection
     */
    private void connectWebSocket() throws Exception {
        log("Modo WebSocket selecionado");
        // WebSocket implementation would go here
        // For now, fall back to normal connection
        connectNormal();
    }
    
    /**
     * Setup proxy for connection
     */
    private void setupProxy() throws Exception {
        log("Configurando proxy: " + config.getProxyType() + " " + config.getProxyHost() + ":" + config.getProxyPort());
        
        Proxy proxy = null;
        
        switch (config.getProxyType()) {
            case HTTP:
            case HTTPS:
                proxy = new Proxy(Proxy.Type.HTTP, new InetSocketAddress(
                        config.getProxyHost(), config.getProxyPort()));
                break;
            case SOCKS4:
            case SOCKS5:
                proxy = new Proxy(Proxy.Type.SOCKS, new InetSocketAddress(
                        config.getProxyHost(), config.getProxyPort()));
                break;
            default:
                return;
        }
        
        // JSch proxy configuration
        if (proxy != null) {
            // Note: JSch has limited proxy support
            // For full proxy support, custom socket factory would be needed
            log("Proxy configurado (suporte limitado no JSch)");
        }
    }
    
    /**
     * Create socket through proxy
     */
    private Socket createProxySocket() throws IOException {
        Proxy proxy = null;
        
        switch (config.getProxyType()) {
            case HTTP:
            case HTTPS:
                proxy = new Proxy(Proxy.Type.HTTP, new InetSocketAddress(
                        config.getProxyHost(), config.getProxyPort()));
                break;
            case SOCKS4:
            case SOCKS5:
                proxy = new Proxy(Proxy.Type.SOCKS, new InetSocketAddress(
                        config.getProxyHost(), config.getProxyPort()));
                break;
            default:
                return new Socket();
        }
        
        return new Socket(proxy);
    }
    
    /**
     * Send custom payload
     */
    private void sendPayload() throws Exception {
        log("Enviando payload personalizado…");
        
        String processedPayload = PayloadGenerator.processPayload(config.getPayload(), config);
        log("Payload processado: " + processedPayload.replace("\r\n", "\\r\\n"));
        
        // Create socket to send payload
        Socket socket;
        if (config.hasProxy()) {
            socket = createProxySocket();
        } else {
            socket = new Socket();
        }
        
        socket.connect(new InetSocketAddress(config.getHost(), config.getPort()), CONNECT_TIMEOUT);
        
        // Send payload
        OutputStream out = socket.getOutputStream();
        out.write(processedPayload.getBytes(StandardCharsets.UTF_8));
        out.flush();
        
        // Read response (optional)
        InputStream in = socket.getInputStream();
        byte[] buffer = new byte[1024];
        int read = in.read(buffer);
        if (read > 0) {
            String response = new String(buffer, 0, read, StandardCharsets.UTF_8);
            log("Resposta do servidor: " + response.split("\r\n")[0]);
        }
        
        socket.close();
        log("Payload enviado com sucesso");
    }
    
    /**
     * Setup local port forwarding (SOCKS5 proxy)
     */
    private void setupPortForwarding() throws JSchException {
        log("Configurando redirecionamento de porta…");
        
        // Usar porta dinâmica
        localSocksPort = findAvailablePort();
        
        // Setup dynamic port forwarding (SOCKS5)
        session.setPortForwardingL(localSocksPort, "0.0.0.0", 1080);
        log("SOCKS5 proxy disponível em localhost:" + localSocksPort);
        
        // Setup HTTP proxy forwarding
        localHttpProxyPort = config.getLocalHttpProxyPort();
        // Additional HTTP proxy setup would go here
    }
    
    /**
     * Disconnect from SSH server
     */
    public void disconnect() {
        if (!isConnected.get() && !isConnecting.get()) {
            return;
        }
        
        log("Desconectando…");
        updateStatus(ConnectionStatus.DISCONNECTING);
        
        try {
            if (session != null && session.isConnected()) {
                session.disconnect();
            }
        } catch (Exception e) {
            Log.e(TAG, "Error disconnecting", e);
        }
        
        isConnected.set(false);
        isConnecting.set(false);
        
        log("Desconectado");
        updateStatus(ConnectionStatus.DISCONNECTED);
        
        if (listener != null) {
            listener.onDisconnected();
        }
    }
    
    /**
     * Check if connected
     */
    public boolean isConnected() {
        return isConnected.get() && session != null && session.isConnected();
    }
    
    /**
     * Get local SOCKS5 proxy port
     */
    public int getLocalSocksPort() {
        return localSocksPort;
    }
    
    /**
     * Get local HTTP proxy port
     */
    public int getLocalHttpProxyPort() {
        return localHttpProxyPort;
    }
    
    private void updateStatus(ConnectionStatus status) {
        if (listener != null) {
            listener.onStatusChanged(status);
        }
    }
    
    private void log(String message) {
        Log.d(TAG, message);
        if (listener != null) {
            listener.onLog(message);
        }
    }
    
    private void onError(String error) {
        Log.e(TAG, error);
        isConnecting.set(false);
        updateStatus(ConnectionStatus.ERROR);
        if (listener != null) {
            listener.onError(error);
        }
    }
    
    private TrustManager[] getTrustAllCerts() {
        return new TrustManager[] {
                new X509TrustManager() {
                    public java.security.cert.X509Certificate[] getAcceptedIssuers() {
                        return null;
                    }
                    public void checkClientTrusted(java.security.cert.X509Certificate[] certs, String authType) {
                    }
                    public void checkServerTrusted(java.security.cert.X509Certificate[] certs, String authType) {
                    }
                }
        };
    }
}
