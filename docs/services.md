# External Services & Credentials Guide · `docs/services.md`

![](assets/banner-security-privacy.svg)

| Attribute | Specification |
|---|---|
| **Status** | 🟢 Active Guide |
| **Owner** | Lead DevOps & Security Engineer |
| **Last Updated** | 2026-11-25 |
| **Source of Truth For** | External developer accounts, API credentials, secrets management, and configuration |

> [!IMPORTANT]
> **Zero-Cloud Guarantee in Core:** PinchDrop v1.0 requires **ZERO external API keys** or cloud services to run locally. File transfer, gesture recognition, and pairing operate 100% locally over peer-to-peer Wi-Fi.
>
> However, for development, app store publishing, binary signing, and future Pro relay features (Stage 11–12), specific developer accounts and credentials are required. This document provides step-by-step instructions on how to acquire, configure, and store each of them securely.

---

## 1. Credentials Inventory & Roadmap

| Service / Tool | Purpose | Required In | Free / Paid | Stored Location |
|---|---|---|---|---|
| **Windows Code Signing** | Eliminate SmartScreen untrusted warnings on Windows installer | Stage 11 (Beta Packaging) | Paid (~$200–$400/yr) | Azure Key Vault / Local HSM / Environment |
| **Google Play Console** | Publish Android Companion App to Google Play Store | Stage 11 (Beta Packaging) | $25 one-time registration fee | Google Play Console |
| **Microsoft Partner Center** | Publish Desktop App to Microsoft Store | Stage 11+ / v1.0 | $19 one-time registration fee | Microsoft Partner Center |
| **Sentry (Opt-in Crash Reporting)** | Receive anonymized crash dumps (user opt-in only) | Stage 11 (Packaging) | Free tier | Desktop config / Android `secrets.properties` |
| **STUN / TURN Relay (Pro Tier)** | P2P traversal across strict NATs / symmetric firewalls | Stage 12 (Pro Features) | Free (STUN) / Pay-per-GB (TURN) | Rust Core settings / Encrypted config |

---

## 2. Windows Code Signing Certificate

### Why it is needed:
When users download an `.msi` or `.exe` installer from the internet, Windows Defender SmartScreen blocks execution with an untrusted publisher warning unless the binary is signed with an Authenticode digital certificate.

### How to get it:
1. **Choose a Certificate Authority (CA):**
   - [DigiCert](https://www.digicert.com/signing/code-signing-certificates) (Standard or EV)
   - [Sectigo](https://sectigo.com/ssl-certificates-tls/code-signing)
   - [SSL.com](https://www.ssl.com/certificates/ev-code-signing/) (supports cloud eSigner)
2. **Company / Identity Verification:**
   - Complete identity validation (passport, business registration, or organization DUNS number).
3. **Hardware / Cloud HSM Requirement (Post-June 2023 Rules):**
   - CA/Browser Forum mandates that private keys cannot be exported as raw `.pfx` files on disk; they must reside on a FIPS-compliant USB token (YubiKey) or a Cloud HSM (Azure Key Vault / AWS CloudHSM).

### Where to configure it:
In `apps/desktop/src-tauri/tauri.conf.json` or as environment variables in GitHub Actions:
```env
# In .env.local or CI Secrets (NEVER commit to git)
TAURI_SIGNING_PRIVATE_KEY="path/to/key.pem"
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="your-strong-password"
AZURE_KEY_VAULT_URI="https://your-vault.vault.azure.net"
AZURE_CLIENT_ID="xxx"
AZURE_CLIENT_SECRET="xxx"
```

---

## 3. Google Play Console (Android Companion App)

### Why it is needed:
To distribute the Android companion APK / AAB so users can easily install it from the Google Play Store without manually enabling Android sideloading ("Install from Unknown Sources").

### How to get it:
1. Visit the [Google Play Console](https://play.google.com/console/signup).
2. Sign in with your Google account.
3. Accept the Developer Agreement and pay the **$25 USD one-time registration fee**.
4. Complete your identity verification (Government ID).
5. Generate an Android Upload Keystore locally:
   ```bash
   keytool -genkey -v -keystore apps/android/pinchdrop-upload-key.jks \
     -keyalg RSA -keysize 2048 -validity 10000 \
     -alias pinchdrop-upload
   ```

### Where to configure it:
Create `apps/android/keystore.properties` (this file is git-ignored):
```properties
storePassword=YOUR_STORE_PASSWORD
keyPassword=YOUR_KEY_PASSWORD
keyAlias=pinchdrop-upload
storeFile=../pinchdrop-upload-key.jks
```

---

## 4. Microsoft Partner Center (Windows Store)

### Why it is needed:
To distribute PinchDrop through the official Microsoft Store on Windows 10 & 11, giving users one-click install, auto-updates, and built-in SmartScreen trust.

### How to get it:
1. Visit the [Microsoft Partner Center](https://partner.microsoft.com/dashboard/registration).
2. Register an individual or company developer account.
3. Pay the **$19 USD one-time registration fee** (individual) or $99 (company).
4. Reserve your app name (e.g., `PinchDrop`).
5. Obtain your **Publisher ID** and **Package Identity Name**.

### Where to configure it:
In `apps/desktop/src-tauri/tauri.conf.json` under `bundle -> windows -> wix`:
```json
{
  "bundle": {
    "windows": {
      "certificateThumbprint": "...",
      "digestAlgorithm": "sha256",
      "timestampUrl": "http://timestamp.digicert.com"
    }
  }
}
```

---

## 5. Sentry (Opt-In Crash Reporting)

### Why it is needed:
To catch unhandled native crashes or WebView2 runtime errors during beta testing. **Completely opt-in and disabled by default** in adherence with our [Privacy Policy](security-privacy.md).

### How to get it:
1. Create a free account at [sentry.io](https://sentry.io).
2. Create two projects:
   - `pinchdrop-desktop` (Rust / React)
   - `pinchdrop-android` (Kotlin)
3. Copy the client DSN keys: `https://[key]@o[org].ingest.sentry.io/[project]`.

### Where to configure it:
Create a `.env.local` file in `apps/desktop/` and `apps/android/secrets.properties`:
```env
# Desktop: apps/desktop/.env.local
VITE_SENTRY_DSN="https://examplePublicKey@o0.ingest.sentry.io/0"

# Android: apps/android/secrets.properties
SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/1
```
*Note: In the code, Sentry initialization is guarded strictly by `if (settings.optInCrashReporting === true)`.*

---

## 6. STUN / TURN Relay (Stage 12 Pro Feature)

### Why it is needed:
In v1.0 Free tier, file transfer works directly on the local Wi-Fi network (0 cloud cost). In Stage 12 (Pro tier), we will offer an off-LAN relay so users can send files even when their PC and phone are on different networks or behind strict carrier-grade NATs.

### Recommended Providers:
1. **Metered.ca:** Free tier provides 50 GB/month STUN/TURN bandwidth.
2. **Twilio Network Traversal Service:** Pay-as-you-go TURN relay.
3. **Self-hosted Coturn:** Open-source TURN server deployed on a lightweight VPS (Hetzner / DigitalOcean).

### Where to configure it:
Managed by the Rust backend in SQLite settings or loaded via environment variable:
```env
RELAY_STUN_SERVER="stun:relay.pinchdrop.app:3478"
RELAY_TURN_SERVER="turn:relay.pinchdrop.app:3478"
RELAY_TURN_USERNAME="user"
RELAY_TURN_CREDENTIAL="secretPassword"
```

---

## 7. Secrets Management Checklist

- [ ] Never commit `.env`, `keystore.properties`, `.jks`, or `.pem` files to Git (all pre-configured in `.gitignore`).
- [ ] For CI/CD automation (GitHub Actions), store all tokens in **GitHub Repository Settings → Secrets and variables → Actions**.
- [ ] Local development runs 100% offline with stub or mock keys.

---

[← Prev: monetization.md](monetization.md) · [Index](../README.md) · [Next: adr/0001-tauri-desktop-shell.md](adr/0001-tauri-desktop-shell.md)
