package com.sshtunnel.app.helper;

import com.sshtunnel.app.model.ConnectionConfig;

/**
 * Helper class for generating HTTP/HTTPS payloads with placeholders
 */
public class PayloadGenerator {
    
    // Placeholder constants
    public static final String PLACEHOLDER_HOST = "[host]";
    public static final String PLACEHOLDER_PORT = "[port]";
    public static final String PLACEHOLDER_METHOD = "[method]";
    public static final String PLACEHOLDER_PROTOCOL = "[protocol]";
    public static final String PLACEHOLDER_CRLF = "[crlf]";
    public static final String PLACEHOLDER_CRLF2 = "[crlf2]";
    public static final String PLACEHOLDER_UA = "[ua]";
    public static final String PLACEHOLDER_RAW = "[raw]";
    
    // Default User-Agent
    private static final String DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    
    // Example payloads
    public static final String EXAMPLE_CONNECT = "CONNECT [host]:[port] HTTP/1.1[crlf]Host: [host][crlf][crlf]";
    public static final String EXAMPLE_GET = "GET / HTTP/1.1[crlf]Host: [host][crlf]User-Agent: [ua][crlf][crlf]";
    public static final String EXAMPLE_POST = "POST / HTTP/1.1[crlf]Host: [host][crlf]Content-Length: 0[crlf][crlf]";
    
    /**
     * Process payload template and replace placeholders with actual values
     */
    public static String processPayload(String template, ConnectionConfig config) {
        if (template == null || template.isEmpty()) {
            return "";
        }
        
        String result = template;
        
        // Replace placeholders
        result = result.replace(PLACEHOLDER_HOST, config.getHost() != null ? config.getHost() : "");
        result = result.replace(PLACEHOLDER_PORT, String.valueOf(config.getPort()));
        result = result.replace(PLACEHOLDER_METHOD, detectMethod(template));
        result = result.replace(PLACEHOLDER_PROTOCOL, "HTTP/1.1");
        result = result.replace(PLACEHOLDER_CRLF, "\r\n");
        result = result.replace(PLACEHOLDER_CRLF2, "\r\n\r\n");
        result = result.replace(PLACEHOLDER_UA, DEFAULT_USER_AGENT);
        result = result.replace(PLACEHOLDER_RAW, generateRawRequest(config));
        
        return result;
    }
    
    /**
     * Process payload with custom values
     */
    public static String processPayload(String template, String host, int port, String method) {
        if (template == null || template.isEmpty()) {
            return "";
        }
        
        String result = template;
        
        result = result.replace(PLACEHOLDER_HOST, host != null ? host : "");
        result = result.replace(PLACEHOLDER_PORT, String.valueOf(port));
        result = result.replace(PLACEHOLDER_METHOD, method != null ? method : "GET");
        result = result.replace(PLACEHOLDER_PROTOCOL, "HTTP/1.1");
        result = result.replace(PLACEHOLDER_CRLF, "\r\n");
        result = result.replace(PLACEHOLDER_CRLF2, "\r\n\r\n");
        result = result.replace(PLACEHOLDER_UA, DEFAULT_USER_AGENT);
        result = result.replace(PLACEHOLDER_RAW, generateRawRequest(host, port, method));
        
        return result;
    }
    
    /**
     * Preview payload without actual values (shows placeholders)
     */
    public static String previewPayload(String template) {
        if (template == null || template.isEmpty()) {
            return "(vazio)";
        }
        
        String result = template;
        result = result.replace(PLACEHOLDER_CRLF, "\\r\\n");
        result = result.replace(PLACEHOLDER_CRLF2, "\\r\\n\\r\\n");
        
        return result;
    }
    
    /**
     * Detect HTTP method from payload template
     */
    private static String detectMethod(String template) {
        String upper = template.toUpperCase();
        if (upper.contains("CONNECT")) {
            return "CONNECT";
        } else if (upper.contains("POST")) {
            return "POST";
        } else if (upper.contains("PUT")) {
            return "PUT";
        } else if (upper.contains("DELETE")) {
            return "DELETE";
        } else if (upper.contains("HEAD")) {
            return "HEAD";
        } else if (upper.contains("OPTIONS")) {
            return "OPTIONS";
        } else if (upper.contains("PATCH")) {
            return "PATCH";
        }
        return "GET";
    }
    
    /**
     * Generate raw HTTP request
     */
    private static String generateRawRequest(ConnectionConfig config) {
        String method = detectMethod(config.getPayload());
        return generateRawRequest(config.getHost(), config.getPort(), method);
    }
    
    private static String generateRawRequest(String host, int port, String method) {
        StringBuilder sb = new StringBuilder();
        
        if ("CONNECT".equalsIgnoreCase(method)) {
            sb.append("CONNECT ").append(host).append(":").append(port).append(" HTTP/1.1\r\n");
            sb.append("Host: ").append(host).append("\r\n");
        } else {
            sb.append(method).append(" / HTTP/1.1\r\n");
            sb.append("Host: ").append(host).append("\r\n");
            sb.append("User-Agent: ").append(DEFAULT_USER_AGENT).append("\r\n");
        }
        
        sb.append("\r\n");
        return sb.toString();
    }
    
    /**
     * Validate payload template
     */
    public static boolean isValidPayload(String payload) {
        if (payload == null || payload.isEmpty()) {
            return true; // Empty payload is valid (no payload mode)
        }
        
        // Check for basic HTTP format
        String upper = payload.toUpperCase();
        return upper.contains("HTTP") || upper.contains("CONNECT");
    }
    
    /**
     * Get list of available placeholders
     */
    public static String[] getPlaceholders() {
        return new String[] {
            PLACEHOLDER_HOST,
            PLACEHOLDER_PORT,
            PLACEHOLDER_METHOD,
            PLACEHOLDER_PROTOCOL,
            PLACEHOLDER_CRLF,
            PLACEHOLDER_CRLF2,
            PLACEHOLDER_UA,
            PLACEHOLDER_RAW
        };
    }
    
    /**
     * Get placeholder description
     */
    public static String getPlaceholderDescription(String placeholder) {
        switch (placeholder) {
            case PLACEHOLDER_HOST:
                return "Host SSH";
            case PLACEHOLDER_PORT:
                return "Porta SSH";
            case PLACEHOLDER_METHOD:
                return "Método HTTP (GET, POST, CONNECT)";
            case PLACEHOLDER_PROTOCOL:
                return "Protocolo (HTTP/1.1)";
            case PLACEHOLDER_CRLF:
                return "Quebra de linha (\\r\\n)";
            case PLACEHOLDER_CRLF2:
                return "Dupla quebra de linha (\\r\\n\\r\\n)";
            case PLACEHOLDER_UA:
                return "User-Agent padrão";
            case PLACEHOLDER_RAW:
                return "Requisição completa";
            default:
                return "";
        }
    }
    
    /**
     * Insert placeholder at cursor position in text
     */
    public static String insertAtPosition(String original, String placeholder, int position) {
        if (original == null) {
            return placeholder;
        }
        
        if (position < 0 || position > original.length()) {
            return original + placeholder;
        }
        
        return original.substring(0, position) + placeholder + original.substring(position);
    }
}
