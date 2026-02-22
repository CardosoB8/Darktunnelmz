package com.sshtunnel.app.model;

import java.io.Serializable;

/**
 * Configuration class for SSH connection
 */
public class ConnectionConfig implements Serializable {
    
    public enum ConnectionMode {
        NORMAL("Normal"),
        SSL_TLS("SSL/TLS"),
        WEBSOCKET("WebSocket");
        
        private final String displayName;
        
        ConnectionMode(String displayName) {
            this.displayName = displayName;
        }
        
        public String getDisplayName() {
            return displayName;
        }
        
        public static ConnectionMode fromString(String mode) {
            for (ConnectionMode m : values()) {
                if (m.name().equalsIgnoreCase(mode) || m.displayName.equalsIgnoreCase(mode)) {
                    return m;
                }
            }
            return NORMAL;
        }
    }
    
    public enum ProxyType {
        NONE("Nenhum"),
        HTTP("HTTP"),
        HTTPS("HTTPS"),
        SOCKS4("SOCKS4"),
        SOCKS5("SOCKS5");
        
        private final String displayName;
        
        ProxyType(String displayName) {
            this.displayName = displayName;
        }
        
        public String getDisplayName() {
            return displayName;
        }
        
        public static ProxyType fromString(String type) {
            for (ProxyType t : values()) {
                if (t.name().equalsIgnoreCase(type) || t.displayName.equalsIgnoreCase(type)) {
                    return t;
                }
            }
            return NONE;
        }
    }
    
    private String host;
    private int port;
    private String username;
    private String password;
    private boolean usePrivateKey;
    private String privateKeyPath;
    private String privateKeyPassphrase;
    private ConnectionMode connectionMode;
    private String payload;
    private String sni;
    private ProxyType proxyType;
    private String proxyHost;
    private int proxyPort;
    private int localSocksPort;
    private int localHttpProxyPort;
    
    public ConnectionConfig() {
        this.port = 22;
        this.connectionMode = ConnectionMode.NORMAL;
        this.proxyType = ProxyType.NONE;
        this.localSocksPort = 1080;
        this.localHttpProxyPort = 8080;
    }
    
    public static ConnectionConfig fromProfile(Profile profile) {
        ConnectionConfig config = new ConnectionConfig();
        config.setHost(profile.getHost());
        config.setPort(profile.getPort());
        config.setUsername(profile.getUsername());
        config.setPassword(profile.getPassword());
        config.setUsePrivateKey(profile.isUsePrivateKey());
        config.setPrivateKeyPath(profile.getPrivateKeyPath());
        config.setPrivateKeyPassphrase(profile.getPrivateKeyPassphrase());
        config.setConnectionMode(ConnectionMode.fromString(profile.getConnectionMode()));
        config.setPayload(profile.getPayload());
        config.setSni(profile.getSni());
        config.setProxyType(ProxyType.fromString(profile.getProxyType()));
        config.setProxyHost(profile.getProxyHost());
        config.setProxyPort(profile.getProxyPort());
        return config;
    }
    
    // Getters and Setters
    public String getHost() {
        return host;
    }
    
    public void setHost(String host) {
        this.host = host;
    }
    
    public int getPort() {
        return port;
    }
    
    public void setPort(int port) {
        this.port = port;
    }
    
    public String getUsername() {
        return username;
    }
    
    public void setUsername(String username) {
        this.username = username;
    }
    
    public String getPassword() {
        return password;
    }
    
    public void setPassword(String password) {
        this.password = password;
    }
    
    public boolean isUsePrivateKey() {
        return usePrivateKey;
    }
    
    public void setUsePrivateKey(boolean usePrivateKey) {
        this.usePrivateKey = usePrivateKey;
    }
    
    public String getPrivateKeyPath() {
        return privateKeyPath;
    }
    
    public void setPrivateKeyPath(String privateKeyPath) {
        this.privateKeyPath = privateKeyPath;
    }
    
    public String getPrivateKeyPassphrase() {
        return privateKeyPassphrase;
    }
    
    public void setPrivateKeyPassphrase(String privateKeyPassphrase) {
        this.privateKeyPassphrase = privateKeyPassphrase;
    }
    
    public ConnectionMode getConnectionMode() {
        return connectionMode;
    }
    
    public void setConnectionMode(ConnectionMode connectionMode) {
        this.connectionMode = connectionMode;
    }
    
    public String getPayload() {
        return payload;
    }
    
    public void setPayload(String payload) {
        this.payload = payload;
    }
    
    public String getSni() {
        return sni;
    }
    
    public void setSni(String sni) {
        this.sni = sni;
    }
    
    public ProxyType getProxyType() {
        return proxyType;
    }
    
    public void setProxyType(ProxyType proxyType) {
        this.proxyType = proxyType;
    }
    
    public String getProxyHost() {
        return proxyHost;
    }
    
    public void setProxyHost(String proxyHost) {
        this.proxyHost = proxyHost;
    }
    
    public int getProxyPort() {
        return proxyPort;
    }
    
    public void setProxyPort(int proxyPort) {
        this.proxyPort = proxyPort;
    }
    
    public int getLocalSocksPort() {
        return localSocksPort;
    }
    
    public void setLocalSocksPort(int localSocksPort) {
        this.localSocksPort = localSocksPort;
    }
    
    public int getLocalHttpProxyPort() {
        return localHttpProxyPort;
    }
    
    public void setLocalHttpProxyPort(int localHttpProxyPort) {
        this.localHttpProxyPort = localHttpProxyPort;
    }
    
    public boolean hasProxy() {
        return proxyType != ProxyType.NONE && proxyHost != null && !proxyHost.isEmpty() && proxyPort > 0;
    }
    
    public boolean hasPayload() {
        return payload != null && !payload.isEmpty();
    }
    
    public boolean hasSNI() {
        return sni != null && !sni.isEmpty();
    }
    
    @Override
    public String toString() {
        return "ConnectionConfig{" +
                "host='" + host + '\'' +
                ", port=" + port +
                ", username='" + username + '\'' +
                ", connectionMode=" + connectionMode +
                ", proxyType=" + proxyType +
                ", hasProxy=" + hasProxy() +
                ", hasPayload=" + hasPayload() +
                ", hasSNI=" + hasSNI() +
                '}';
    }
}
