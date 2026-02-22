# SSH Tunnel App para Android

Aplicativo Android de túnel SSH com suporte a payload personalizado, SNI (Server Name Indication) e proxy (HTTP/HTTPS/SOCKS4/SOCKS5).

## Funcionalidades

### Conexão SSH
- Conexão SSH via biblioteca JSch (Java pura, sem NDK)
- Suporte a autenticação por senha ou chave privada
- Múltiplos modos de conexão: Normal, SSL/TLS, WebSocket

### Payload Generator
- Placeholders personalizáveis:
  - `[host]` - Host SSH
  - `[port]` - Porta SSH
  - `[method]` - Método HTTP (GET, POST, CONNECT)
  - `[protocol]` - Protocolo HTTP (HTTP/1.1)
  - `[crlf]` - Quebra de linha (`\r\n`)
  - `[crlf2]` - Dupla quebra de linha (`\r\n\r\n`)
  - `[ua]` - User-Agent padrão
  - `[raw]` - Requisição completa
- Exemplos prontos:
  - CONNECT para proxy HTTP
  - GET request
  - POST request

### SNI (Server Name Indication)
- Configuração personalizada de SNI para conexões SSL/TLS
- Útil para bypass de restrições de rede

### Proxy Support
- HTTP Proxy
- HTTPS Proxy
- SOCKS4 Proxy
- SOCKS5 Proxy

### VPN Service
- Integração com VPNService do Android
- Redirecionamento de tráfego via tun2socks
- Interface VPN para todo o dispositivo

### Gerenciamento de Perfis
- Salvar/carregar configurações
- Criptografia com EncryptedSharedPreferences
- Duplicar e excluir perfis

## Arquitetura

```
com.sshtunnel.app/
├── model/           # Modelos de dados
│   ├── Profile.java
│   ├── ConnectionConfig.java
│   └── ConnectionStatus.java
├── helper/          # Classes auxiliares
│   ├── JSchHelper.java
│   ├── PayloadGenerator.java
│   ├── ProxyHelper.java
│   └── LogManager.java
├── service/         # Serviços Android
│   ├── SSHConnectionService.java
│   └── SSHTunnelVpnService.java
├── ui/              # Activities e Adapters
│   ├── MainActivity.java
│   ├── PayloadGeneratorActivity.java
│   ├── ProfileManagerActivity.java
│   ├── ProfileAdapter.java
│   └── LogViewerActivity.java
└── utils/           # Utilitários
    └── ProfileManager.java
```

## Dependências

```gradle
dependencies {
    implementation 'androidx.appcompat:appcompat:1.6.1'
    implementation 'com.google.android.material:material:1.11.0'
    implementation 'androidx.security:security-crypto:1.1.0-alpha06'
    implementation 'com.jcraft:jsch:0.1.55'
    implementation 'com.google.code.gson:gson:2.10.1'
    implementation 'com.squareup.okhttp3:okhttp:4.12.0'
    implementation 'org.java-websocket:Java-WebSocket:1.5.6'
}
```

## Permissões

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.BIND_VPN_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

## Como Usar

### 1. Configurar Conexão SSH
- Preencha Host, Porta, Usuário e Senha
- Ou selecione uma chave privada para autenticação

### 2. Selecionar Modo de Conexão
- **Normal**: Conexão SSH padrão
- **SSL/TLS**: Conexão com SSL/TLS e suporte a SNI
- **WebSocket**: Conexão via WebSocket

### 3. Configurar Payload (Opcional)
- Use o Payload Generator para criar payloads HTTP/HTTPS personalizados
- Utilize placeholders para valores dinâmicos

### 4. Configurar SNI (Opcional)
- Insira o hostname SNI para conexões SSL/TLS

### 5. Configurar Proxy (Opcional)
- Selecione o tipo de proxy: HTTP, HTTPS, SOCKS4, SOCKS5
- Preencha Host e Porta do proxy

### 6. Conectar
- Clique em "CONECTAR"
- O aplicativo solicitará permissão VPN na primeira vez
- Aguarde a conexão ser estabelecida

### 7. Gerenciar Perfis
- Salve configurações como perfis
- Carregue perfis salvos rapidamente

## Compilação

### Requisitos
- Android Studio Arctic Fox ou superior
- JDK 8 ou superior
- Android SDK 21+ (Android 5.0)

### Passos
1. Clone o repositório
2. Abra o projeto no Android Studio
3. Sincronize o Gradle
4. Execute no dispositivo ou emulador

## Estrutura do Projeto

```
SSHTunnelApp/
├── app/
│   ├── src/main/
│   │   ├── java/com/sshtunnel/app/
│   │   │   ├── model/
│   │   │   ├── helper/
│   │   │   ├── service/
│   │   │   ├── ui/
│   │   │   ├── utils/
│   │   │   └── SSHTunnelApplication.java
│   │   ├── res/
│   │   │   ├── layout/
│   │   │   ├── values/
│   │   │   ├── drawable/
│   │   │   └── menu/
│   │   └── AndroidManifest.xml
│   └── build.gradle
├── build.gradle
├── settings.gradle
└── gradle.properties
```

## Notas

- O aplicativo usa VPNService para redirecionar o tráfego do dispositivo
- A biblioteca JSch é usada para conexões SSH (Java pura, sem NDK)
- As configurações são criptografadas usando EncryptedSharedPreferences
- Logs detalhados estão disponíveis para depuração

## Licença

Este projeto é fornecido como exemplo educacional. Use por sua conta e risco.

## Contribuições

Contribuições são bem-vindas! Sinta-se à vontade para abrir issues e pull requests.
