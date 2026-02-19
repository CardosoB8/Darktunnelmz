# Privacy Policy

**Last Updated: 2024**

## Introduction

DarkTunnel VPN ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we handle information when you use our VPN application.

## Information We Do Not Collect

DarkTunnel VPN is designed with privacy as a core principle:

### We Do NOT Collect:
- **Personal Information**: We do not collect your name, email, phone number, or address
- **VPN Usage Data**: We do not log which websites you visit or what data you transmit
- **Connection Logs**: We do not track connection times, duration, or bandwidth usage
- **IP Addresses**: We do not store your real IP address or assigned VPN IP
- **Device Information**: We do not collect device identifiers or hardware information
- **Location Data**: We do not track your physical location
- **Analytics**: We do not use analytics tools to track app usage

## Information Stored Locally

### VPN Configurations
- Your VPN profiles and configurations are stored **locally** on your device
- All data is encrypted using AES-256 encryption
- Encryption keys are stored in Android Keystore
- We have no access to your configurations

### What is Stored:
- VPN server addresses (as configured by you)
- Authentication credentials (encrypted)
- Certificate data (if provided)
- App preferences (theme, settings)

### Security Measures:
- All sensitive data is encrypted at rest
- Keys are protected by hardware security modules when available
- Data is never transmitted to external servers

## Permissions

The app requests the following permissions:

### Required Permissions:
- **VPN Service**: To establish and manage VPN connections
- **Foreground Service**: To maintain VPN connection in background
- **Internet**: To establish VPN tunnels
- **Notifications**: To show VPN connection status

### Optional Permissions:
- **Storage**: To import VPN configuration files (only when you choose to import)
- **Biometric**: For optional app lock feature

## Third-Party Services

DarkTunnel VPN does not integrate with:
- Analytics services
- Advertising networks
- Crash reporting services (in F-Droid build)
- Cloud storage services

### Open Source Libraries:
We use the following open-source libraries:
- Jetpack Compose (UI)
- Hilt (Dependency Injection)
- Kotlin Coroutines
- Material Design Components

These libraries operate locally and do not transmit data.

## Data Security

### Encryption:
- VPN configurations: AES-256-GCM
- Key storage: Android Keystore with hardware-backed encryption when available
- Network traffic: Depends on VPN protocol (WireGuard, OpenVPN, etc.)

### Local Security:
- App data is sandboxed by Android
- Encrypted backups (when enabled by user)
- Optional biometric app lock

## Your Rights

You have the right to:
- **Access**: View all data stored by the app (accessible within the app)
- **Delete**: Clear all app data through Settings → Clear All Data
- **Export**: Export your VPN configurations for backup
- **Control**: Choose what data to store and when to delete it

## Children's Privacy

DarkTunnel VPN is not intended for use by children under 13. We do not knowingly collect any information from children.

## Changes to This Policy

We may update this Privacy Policy from time to time. We will notify you of any changes by:
- Posting the new Privacy Policy in the app
- Updating the "Last Updated" date

## Contact Us

If you have any questions about this Privacy Policy, please contact us:

- **Email**: privacy@darktunnel.app
- **GitHub Issues**: [github.com/yourusername/darktunnel-vpn/issues](https://github.com/yourusername/darktunnel-vpn/issues)

## Open Source

DarkTunnel VPN is open source software. You can:
- Review the source code on GitHub
- Build the app yourself
- Verify our privacy claims
- Contribute to the project

## Compliance

This Privacy Policy complies with:
- General Data Protection Regulation (GDPR)
- California Consumer Privacy Act (CCPA)
- Other applicable privacy laws

## Disclaimer

While we take every precaution to protect your privacy:
- You are responsible for the VPN configurations you use
- Your VPN provider's privacy policy also applies
- Local laws may require data retention by your VPN provider

---

**By using DarkTunnel VPN, you agree to this Privacy Policy.**

For the complete source code and to verify our privacy claims, visit our GitHub repository.
