# Changelog

All notable changes to the DarkTunnel VPN project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial project structure and architecture
- MVVM architecture implementation
- Jetpack Compose UI framework
- Hilt dependency injection
- EncryptedSharedPreferences for secure storage
- Mock VPN controller for testing
- Profile management (CRUD operations)
- Connection logging system
- Foreground VPN service
- Notification channel for VPN status
- Dark and light theme support
- Unit tests for core components
- UI tests with Compose testing framework

### Security
- AES-256 encryption for stored profiles
- Android Keystore integration
- Secure credential storage
- Biometric authentication placeholder

## [1.0.0] - 2024-XX-XX

### Added
- First stable release
- WireGuard protocol support (placeholder)
- OpenVPN protocol support (placeholder)
- SSH tunnel support (mock)
- Profile import/export functionality
- Quick connect feature
- Connection statistics display
- Performance mode toggle
- Direct target routing option

### Changed
- N/A (initial release)

### Deprecated
- N/A (initial release)

### Removed
- N/A (initial release)

### Fixed
- N/A (initial release)

### Security
- Implemented secure key storage
- Added certificate pinning placeholder
- Enabled ProGuard/R8 code obfuscation

## [0.9.0] - 2024-XX-XX (Beta)

### Added
- Beta testing release
- Core VPN functionality
- Basic UI implementation
- Profile management

### Known Issues
- WireGuard native library not fully integrated
- OpenVPN native library not fully integrated
- Some UI animations may be choppy on older devices

## [0.8.0] - 2024-XX-XX (Alpha)

### Added
- Alpha testing release
- Project scaffolding
- Basic architecture setup
- Initial UI components

## Roadmap

### [1.1.0] - Planned
- Full WireGuard integration with native library
- Full OpenVPN integration with ics-openvpn
- Auto-connect on boot option
- Kill switch functionality
- Split tunneling support

### [1.2.0] - Planned
- Shadowsocks protocol support
- Trojan protocol support
- VLESS/Vmess protocol support
- Custom routing rules
- Per-app VPN settings

### [1.3.0] - Planned
- Widget support
- Quick settings tile
- Tasker/Automate integration
- Connection scheduling
- Bandwidth usage statistics

### [2.0.0] - Planned
- Multi-hop VPN support
- Obfuscation techniques
- Advanced security features
- Plugin architecture

## Contributing

When contributing to this project, please:
1. Update the CHANGELOG.md with your changes
2. Follow the existing format
3. Categorize changes under appropriate sections
4. Reference issue numbers where applicable

## Version Numbering

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR** version for incompatible API changes
- **MINOR** version for backwards-compatible functionality additions
- **PATCH** version for backwards-compatible bug fixes

---

For the complete list of changes, see the [Git commit history](https://github.com/yourusername/darktunnel-vpn/commits/main).
