package com.sshtunnel.app.helper;

import android.content.Context;
import android.util.Log;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Manager for application logs
 */
public class LogManager {
    
    private static final String TAG = "LogManager";
    private static final int MAX_LOGS = 1000;
    private static final String LOG_FILE = "ssh_tunnel_logs.txt";
    
    private static LogManager instance;
    private final List<LogEntry> logs;
    private final List<LogListener> listeners;
    private final SimpleDateFormat dateFormat;
    private Context context;
    
    public interface LogListener {
        void onNewLog(LogEntry entry);
        void onLogsCleared();
    }
    
    public static class LogEntry {
        public final long timestamp;
        public final String level;
        public final String tag;
        public final String message;
        
        public LogEntry(long timestamp, String level, String tag, String message) {
            this.timestamp = timestamp;
            this.level = level;
            this.tag = tag;
            this.message = message;
        }
        
        public String getFormattedTime() {
            SimpleDateFormat sdf = new SimpleDateFormat("HH:mm:ss", Locale.getDefault());
            return sdf.format(new Date(timestamp));
        }
        
        @Override
        public String toString() {
            return "[" + getFormattedTime() + "] [" + level + "] " + tag + ": " + message;
        }
    }
    
    private LogManager() {
        this.logs = new CopyOnWriteArrayList<>();
        this.listeners = new ArrayList<>();
        this.dateFormat = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault());
    }
    
    public static synchronized LogManager getInstance() {
        if (instance == null) {
            instance = new LogManager();
        }
        return instance;
    }
    
    public void init(Context context) {
        this.context = context.getApplicationContext();
    }
    
    public void addListener(LogListener listener) {
        if (!listeners.contains(listener)) {
            listeners.add(listener);
        }
    }
    
    public void removeListener(LogListener listener) {
        listeners.remove(listener);
    }
    
    public void log(String level, String tag, String message) {
        LogEntry entry = new LogEntry(System.currentTimeMillis(), level, tag, message);
        logs.add(entry);
        
        // Trim logs if too many
        if (logs.size() > MAX_LOGS) {
            logs.remove(0);
        }
        
        // Notify listeners
        for (LogListener listener : listeners) {
            listener.onNewLog(entry);
        }
        
        // Also log to Android log
        switch (level) {
            case "ERROR":
                Log.e(tag, message);
                break;
            case "WARN":
                Log.w(tag, message);
                break;
            case "DEBUG":
                Log.d(tag, message);
                break;
            default:
                Log.i(tag, message);
        }
    }
    
    public void i(String tag, String message) {
        log("INFO", tag, message);
    }
    
    public void d(String tag, String message) {
        log("DEBUG", tag, message);
    }
    
    public void w(String tag, String message) {
        log("WARN", tag, message);
    }
    
    public void e(String tag, String message) {
        log("ERROR", tag, message);
    }
    
    public void e(String tag, String message, Throwable throwable) {
        log("ERROR", tag, message + ": " + throwable.getMessage());
    }
    
    public List<LogEntry> getLogs() {
        return new ArrayList<>(logs);
    }
    
    public List<LogEntry> getLogs(String filter) {
        if (filter == null || filter.isEmpty()) {
            return getLogs();
        }
        
        List<LogEntry> filtered = new ArrayList<>();
        String lowerFilter = filter.toLowerCase();
        
        for (LogEntry entry : logs) {
            if (entry.message.toLowerCase().contains(lowerFilter) ||
                    entry.tag.toLowerCase().contains(lowerFilter) ||
                    entry.level.toLowerCase().contains(lowerFilter)) {
                filtered.add(entry);
            }
        }
        
        return filtered;
    }
    
    public void clearLogs() {
        logs.clear();
        
        for (LogListener listener : listeners) {
            listener.onLogsCleared();
        }
    }
    
    public String getLogsAsString() {
        StringBuilder sb = new StringBuilder();
        for (LogEntry entry : logs) {
            sb.append(entry.toString()).append("\n");
        }
        return sb.toString();
    }
    
    public boolean exportLogs(File file) {
        try {
            FileWriter writer = new FileWriter(file);
            writer.write("SSH Tunnel Logs - Exported " + dateFormat.format(new Date()) + "\n");
            writer.write("=====================================\n\n");
            
            for (LogEntry entry : logs) {
                writer.write(entry.toString() + "\n");
            }
            
            writer.close();
            return true;
        } catch (IOException e) {
            Log.e(TAG, "Failed to export logs", e);
            return false;
        }
    }
    
    public void saveLogsToFile() {
        if (context == null) return;
        
        try {
            File file = new File(context.getFilesDir(), LOG_FILE);
            FileWriter writer = new FileWriter(file);
            
            for (LogEntry entry : logs) {
                writer.write(entry.toString() + "\n");
            }
            
            writer.close();
        } catch (IOException e) {
            Log.e(TAG, "Failed to save logs", e);
        }
    }
}
