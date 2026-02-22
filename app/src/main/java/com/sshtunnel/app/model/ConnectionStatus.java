package com.sshtunnel.app.model;

/**
 * Enum representing connection status
 */
public enum ConnectionStatus {
    DISCONNECTED("Desconectado", 0),
    CONNECTING("Conectando…", 1),
    CONNECTED("Conectado", 2),
    ERROR("Erro", 3),
    DISCONNECTING("Desconectando…", 4);
    
    private final String displayName;
    private final int code;
    
    ConnectionStatus(String displayName, int code) {
        this.displayName = displayName;
        this.code = code;
    }
    
    public String getDisplayName() {
        return displayName;
    }
    
    public int getCode() {
        return code;
    }
    
    public boolean isConnected() {
        return this == CONNECTED;
    }
    
    public boolean isConnecting() {
        return this == CONNECTING;
    }
    
    public boolean isDisconnected() {
        return this == DISCONNECTED;
    }
}
