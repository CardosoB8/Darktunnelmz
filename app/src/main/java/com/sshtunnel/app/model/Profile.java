package com.sshtunnel.app.model;

import java.io.Serializable;
import java.util.UUID;

/**
 * Model class representing a saved SSH connection profile
 */
public class Profile implements Serializable {
    
    private String id;
    private String name;
    private String host;
    private int port;
    private String username;
    private String password;
    private boolean usePrivateKey;
    private String privateKeyPath;
    private String privateKeyPassphrase;
    private String connectionMode;
    private String payload;
    private String sni;
    private String proxyType;
    private String proxyHost;
    private int proxyPort;
    private long createdAt;
    private long updatedAt;
    
    public Profile() {
        this.id = UUID.randomUUID().toString();
        this.port = 22;
        this.usePrivateKey = false;
        this.connectionMode = "NORMAL";
        this.proxyType = "NONE";
        this.createdAt = System.currentTimeMillis();
        this.updatedAt = System.currentTimeMillis();
    }
    
    public Profile(String name, String host, int port, String username) {
        this();
        this.name = name;
        this.host = host;
        this.port = port;
        this.username = username;
    }
    
    // Getters and Setters
    public String getId() {
        return id;
    }
    
    public void setId(String id) {
        this.id = id;
    }
    
    public String getName() {
        return name;
    }
    
    public void setName(String name) {
        this.name = name;
    }
    
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
    
    public String getConnectionMode() {
        return connectionMode;
    }
    
    public void setConnectionMode(String connectionMode) {
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
    
    public String getProxyType() {
        return proxyType;
    }
    
    public void setProxyType(String proxyType) {
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
    
    public long getCreatedAt() {
        return createdAt;
    }
    
    public void setCreatedAt(long createdAt) {
        this.createdAt = createdAt;
    }
    
    public long getUpdatedAt() {
        return updatedAt;
    }
    
    public void setUpdatedAt(long updatedAt) {
        this.updatedAt = updatedAt;
    }
    
    public String getDisplayInfo() {
        return username + "@" + host + ":" + port;
    }
    
    @Override
    public String toString() {
        return "Profile{" +
                "id='" + id + '\'' +
                ", name='" + name + '\'' +
                ", host='" + host + '\'' +
                ", port=" + port +
                ", username='" + username + '\'' +
                ", connectionMode='" + connectionMode + '\'' +
                ", proxyType='" + proxyType + '\'' +
                '}';
    }
}
