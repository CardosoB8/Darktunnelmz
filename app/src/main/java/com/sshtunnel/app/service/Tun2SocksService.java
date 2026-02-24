package com.sshtunnel.app.service;

import android.content.Context;
import android.net.LocalServerSocket;
import android.net.LocalSocket;
import android.net.LocalSocketAddress;
import android.os.ParcelFileDescriptor;
import android.util.Log;

import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * Tun2SocksService baseado no v2raybase/tekidoer
 * Executa libtun2socks.so como processo separado e passa o fd via LocalSocket
 */
public class Tun2SocksService {
    
    private static final String TAG = "Tun2SocksService";
    private Process process;
    private final Context context;
    private final ParcelFileDescriptor vpnInterface;
    private final int socksPort;
    private Thread monitorThread;
    private Thread outputThread;
    private boolean isRunning = false;
    
    public Tun2SocksService(Context context, ParcelFileDescriptor vpnInterface, int socksPort) {
        this.context = context;
        this.vpnInterface = vpnInterface;
        this.socksPort = socksPort;
    }
    
    public void start() {
        if (isRunning) return;
        
        try {
            // Caminho para a biblioteca nativa
            String libPath = context.getApplicationInfo().nativeLibraryDir 
                    + File.separator + "libv2tun2socks.so";
            
            File libFile = new File(libPath);
            if (!libFile.exists()) {
                // Tentar libtun2socks.so como fallback
                libPath = context.getApplicationInfo().nativeLibraryDir 
                        + File.separator + "libtun2socks.so";
                libFile = new File(libPath);
            }
            
            if (!libFile.exists()) {
                Log.e(TAG, "Biblioteca tun2socks não encontrada!");
                return;
            }
            
            Log.i(TAG, "Iniciando tun2socks de: " + libPath);
            Log.i(TAG, "Permissões: " + (libFile.canExecute() ? "executável" : "não executável"));
            
            // Tornar executável se necessário
            if (!libFile.canExecute()) {
                libFile.setExecutable(true);
            }
            
            // Preparar argumentos (similar ao v2raybase)
            List<String> args = new ArrayList<>();
            args.add(libPath);
            args.add("--tunfd");
            args.add(String.valueOf(vpnInterface.getFd()));
            args.add("--tunmtu");
            args.add("1500");
            args.add("--socks-server-addr");
            args.add("127.0.0.1:" + socksPort);
            args.add("--netif-ipaddr");
            args.add("10.0.0.2");
            args.add("--netif-netmask");
            args.add("255.255.255.0");
            args.add("--logger");
            args.add("stdout");
            args.add("--loglevel");
            args.add("4");
            
            Log.i(TAG, "Argumentos: " + args);
            
            // Iniciar processo
            ProcessBuilder pb = new ProcessBuilder(args);
            pb.redirectErrorStream(true);
            pb.directory(context.getFilesDir());
            process = pb.start();
            
            isRunning = true;
            
            // Capturar output do processo
            outputThread = new Thread(() -> {
                try {
                    java.io.BufferedReader reader = new java.io.BufferedReader(
                            new java.io.InputStreamReader(process.getInputStream()));
                    String line;
                    while ((line = reader.readLine()) != null) {
                        Log.i("tun2socks", line);
                    }
                } catch (IOException e) {
                    Log.e(TAG, "Erro ao ler output", e);
                }
            });
            outputThread.start();
            
            // Monitorar o processo em thread separada
            monitorThread = new Thread(() -> {
                try {
                    int exitCode = process.waitFor();
                    Log.i(TAG, "tun2socks encerrou com código: " + exitCode);
                    
                    // Se encerrou inesperadamente, reiniciar?
                    if (isRunning && exitCode != 0) {
                        Log.e(TAG, "tun2socks caiu inesperadamente");
                    }
                    
                    isRunning = false;
                    
                } catch (InterruptedException e) {
                    Log.i(TAG, "Monitor interrompido");
                }
            });
            monitorThread.start();
            
            Log.i(TAG, "tun2socks iniciado com sucesso");
            
        } catch (IOException e) {
            Log.e(TAG, "Erro ao iniciar tun2socks", e);
            stop();
        }
    }
    
    public void stop() {
        isRunning = false;
        
        if (process != null) {
            process.destroy();
            try {
                process.waitFor(1000, java.util.concurrent.TimeUnit.MILLISECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            process = null;
        }
        
        if (monitorThread != null) {
            monitorThread.interrupt();
            try {
                monitorThread.join(1000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            monitorThread = null;
        }
        
        if (outputThread != null) {
            outputThread.interrupt();
            try {
                outputThread.join(1000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            outputThread = null;
        }
        
        Log.i(TAG, "tun2socks parado");
    }
    
    public boolean isRunning() {
        return isRunning && process != null && process.isAlive();
    }
}
