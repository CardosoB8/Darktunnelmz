# DarkTunnel VPN - Quick Start Guide

## Prerequisites

- Android Studio 2023.1.1 (Giraffe) or later
- JDK 17
- Android SDK with API 33

## Setup (5 minutes)

### 1. Open Project
```
Android Studio → File → Open → Select DarkTunnelVPN folder
```

### 2. Sync Project
```
Click "Sync Now" in the notification bar
OR
Run: ./gradlew sync
```

### 3. Build Debug APK
```bash
./gradlew assembleDebug
```

APK location: `app/build/outputs/apk/debug/app-debug.apk`

### 4. Run on Device
```
Click "Run" button (▶) in Android Studio
OR
./gradlew installDebug
```

## First Use

### 1. Grant VPN Permission
- First launch will request VPN permission
- Tap "OK" to allow
- System dialog will appear
- Tap "OK" again to confirm

### 2. Enter Target
```
Example: uk1.example.com:443@ssh
Format: host:port@protocol
```

### 3. Enter Payload (Optional)
```
GET / HTTP/1.1
Host: uk1.example.com
Connection: keep-alive

```

### 4. Tap CONNECT
- Button shows "CONNECTING..." during connection
- Changes to "DISCONNECT" when connected
- Status shows "Connected" with green indicator

### 5. Save Profile (Optional)
- Tap "Save" button
- Enter profile name
- Access saved profiles from menu

## Common Tasks

### Import VPN Configuration
```
Menu → Profiles → Import → Select .conf or .ovpn file
```

### Export Profile
```
Menu → Profiles → Select profile → Export
```

### Clear All Data
```
Menu → Settings → Clear All Data → Confirm
```

### Switch Theme
```
Menu → Settings → Theme → Light/Dark/System
```

## Development

### Run Tests
```bash
# All tests
./gradlew test

# Unit tests only
./gradlew testDebugUnitTest

# Instrumented tests
./gradlew connectedAndroidTest
```

### Code Quality
```bash
# Run Detekt
./gradlew detekt

# Check ktlint
./gradlew ktlintCheck

# Auto-format
./gradlew ktlintFormat
```

### Build Release
```bash
# Requires signing configuration
./gradlew assembleRelease
```

## Troubleshooting

### Build Errors
```bash
# Clean and rebuild
./gradlew clean build

# Invalidate caches
File → Invalidate Caches / Restart
```

### VPN Not Working
1. Check if another VPN is active
2. Verify target format: `host:port`
3. Check network connection
4. Review logs in app

### Permission Denied
1. Go to Settings → Apps → DarkTunnel
2. Tap "VPN" permission
3. Enable permission

## Next Steps

### For Users
- Import your VPN configurations
- Save frequently used profiles
- Enable auto-connect in settings

### For Developers
1. Review `TODO` comments in code
2. Integrate real VPN libraries
3. Add your VPN server endpoints
4. Customize UI colors in `Color.kt`

## Need Help?

- Check README.md for detailed documentation
- Review sample configs in `app/src/main/assets/profiles/`
- Open an issue on GitHub

---

**Happy Tunneling! 🚀**
