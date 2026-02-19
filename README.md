# DarkTunnel VPN

[![Android](https://img.shields.io/badge/Android-5.0%2B-green.svg)](https://android.com)
[![Kotlin](https://img.shields.io/badge/Kotlin-1.9-blue.svg)](https://kotlinlang.org)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

DarkTunnel VPN is a secure, fast, and private VPN client for Android supporting multiple protocols including WireGuard, OpenVPN, and SSH-based tunnels.

## Features

- **Multiple Protocols**: Support for WireGuard, OpenVPN, SSH, Shadowsocks, and more
- **Secure Storage**: AES-256 encrypted profile storage using Android Keystore
- **Modern UI**: Built with Jetpack Compose and Material Design 3
- **Connection Logs**: Real-time connection monitoring
- **Profile Management**: Save, edit, and organize VPN profiles
- **Quick Connect**: One-tap connection to favorite servers
- **Foreground Service**: Persistent notification while connected
- **Dark Mode**: Full support for light and dark themes

## Architecture

The app follows **MVVM (Model-View-ViewModel)** architecture:

```
com.darktunnel.vpn/
├── ui/           # Jetpack Compose UI components and screens
├── viewmodel/    # ViewModels for UI state management
├── data/         # Repositories and data handling
├── vpn/          # VPN controller implementations
├── storage/      # Encrypted storage and preferences
├── model/        # Data classes and models
├── service/      # VPN foreground services
└── util/         # Utility classes and helpers
```

## Requirements

- **minSdk**: 21 (Android 5.0)
- **targetSdk**: 33 (Android 13)
- **compileSdk**: 33
- **Kotlin**: 1.9.0
- **Java**: 17

## Getting Started

### Prerequisites

1. [Android Studio](https://developer.android.com/studio) 2023.1.1 (Giraffe) or later
2. JDK 17 or later
3. Android SDK with API 33

### Installation

1. **Clone or download the project**:
   ```bash
   git clone https://github.com/yourusername/darktunnel-vpn.git
   cd darktunnel-vpn
   ```

2. **Open in Android Studio**:
   - Launch Android Studio
   - Select "Open an existing Android Studio project"
   - Choose the `darktunnel-vpn` folder
   - Wait for Gradle sync to complete

3. **Build the project**:
   ```bash
   ./gradlew assembleDebug
   ```

4. **Install on device**:
   ```bash
   ./gradlew installDebug
   ```

   Or use Android Studio's "Run" button (▶)

### Generating APK

To generate a release APK:

```bash
# Debug APK
./gradlew assembleDebug

# Release APK (requires signing configuration)
./gradlew assembleRelease
```

APKs will be located at:
- Debug: `app/build/outputs/apk/debug/app-debug.apk`
- Release: `app/build/outputs/apk/release/app-release.apk`

## Configuration

### Adding VPN Profiles

#### WireGuard Configuration

1. Create a `.conf` file with your WireGuard settings:
   ```ini
   [Interface]
   PrivateKey = YOUR_PRIVATE_KEY
   Address = 10.0.0.2/24
   DNS = 1.1.1.1

   [Peer]
   PublicKey = SERVER_PUBLIC_KEY
   AllowedIPs = 0.0.0.0/0
   Endpoint = server.com:51820
   PersistentKeepalive = 25
   ```

2. Import the file into DarkTunnel:
   - Open the app
   - Tap "Profiles" → "Import"
   - Select your `.conf` file

#### OpenVPN Configuration

1. Create a `.ovpn` file with your OpenVPN settings (see `sample_openvpn.ovpn`)

2. Import the file:
   - Open the app
   - Tap "Profiles" → "Import"
   - Select your `.ovpn` file

### Security Configuration

#### Adding Credentials Securely

**IMPORTANT**: Never commit real credentials to version control!

1. Create a `credentials.properties` file in the project root (this file is gitignored):
   ```properties
   # credentials.properties - DO NOT COMMIT THIS FILE
   VPN_USERNAME=your_username
   VPN_PASSWORD=your_password
   ```

2. Or use Android Keystore for secure storage (implemented in the app)

#### TODO: Add Your Credentials

Search for `// TODO` comments in the codebase to find where you need to add:
- VPN server endpoints
- Authentication credentials
- API keys (if using external services)

## Security Notes

### Data Storage

- All VPN profiles are stored using **EncryptedSharedPreferences**
- Encryption uses **AES-256-GCM** with keys stored in Android Keystore
- Private keys and passwords are never logged or transmitted

### Permissions

The app requires these permissions:
- `BIND_VPN_SERVICE`: Required for VPN functionality
- `FOREGROUND_SERVICE`: For persistent VPN notification
- `INTERNET`: Network connectivity
- `POST_NOTIFICATIONS`: Connection status (Android 13+)

### Best Practices

1. **Never share your private keys**
2. **Use strong, unique passwords**
3. **Keep the app updated**
4. **Verify server certificates**
5. **Regularly rotate keys**

### Clearing All Data

To remove all stored profiles and settings:
1. Go to Settings → Clear All Data
2. Confirm the action
3. All encrypted data will be permanently deleted

## Testing

### Running Unit Tests

```bash
./gradlew test
```

### Running Instrumented Tests

```bash
./gradlew connectedAndroidTest
```

### Test Coverage

The project includes:
- Unit tests for ViewModels
- Repository tests with mocked dependencies
- UI tests with Compose testing framework

## Code Quality

### Lint

```bash
./gradlew lint
```

### Detekt (Static Analysis)

```bash
./gradlew detekt
```

### ktlint (Code Formatting)

```bash
./gradlew ktlintCheck  # Check formatting
./gradlew ktlintFormat # Auto-format code
```

## Troubleshooting

### Build Issues

**Gradle sync fails**:
- Check your internet connection
- Verify JDK 17 is installed and configured
- Try: `File → Invalidate Caches / Restart`

**Dependency conflicts**:
- Run: `./gradlew app:dependencies` to analyze
- Check for version mismatches in `build.gradle`

### Runtime Issues

**VPN permission denied**:
- Ensure no other VPN app is active
- Check system VPN settings
- Grant VPN permission when prompted

**Connection fails**:
- Verify your configuration is correct
- Check network connectivity
- Review connection logs in the app

### Native Library Issues

If you encounter issues with native libraries (WireGuard/OpenVPN):

1. The app includes a **mock implementation** for testing
2. To use real implementations:
   - Add the required dependencies in `app/build.gradle`
   - Uncomment the native library initialization code
   - Build with NDK support

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/my-feature`
5. Submit a pull request

### Code Style

- Follow Kotlin coding conventions
- Use meaningful variable names
- Add documentation for public APIs
- Write tests for new features

## Privacy Policy

DarkTunnel VPN respects your privacy:
- No user data is collected or transmitted
- VPN configurations are stored locally and encrypted
- No analytics or tracking
- Open source for transparency

See [PRIVACY_POLICY.md](PRIVACY_POLICY.md) for details.

## Terms of Use

By using this application, you agree to:
- Use VPN services in compliance with local laws
- Not use for illegal activities
- Respect the terms of your VPN provider

See [TERMS_OF_USE.md](TERMS_OF_USE.md) for full terms.

## License

```
MIT License

Copyright (c) 2024 DarkTunnel

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Acknowledgments

- [WireGuard](https://www.wireguard.com/) - For the WireGuard protocol
- [OpenVPN](https://openvpn.net/) - For the OpenVPN protocol
- [Jetpack Compose](https://developer.android.com/jetpack/compose) - For the UI framework
- [Hilt](https://dagger.dev/hilt/) - For dependency injection

## Support

For issues, questions, or contributions:
- GitHub Issues: [github.com/yourusername/darktunnel-vpn/issues](https://github.com/yourusername/darktunnel-vpn/issues)
- Email: support@darktunnel.app

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

---

**Disclaimer**: This software is provided for educational and legitimate privacy purposes only. Users are responsible for complying with local laws and regulations.
