# Security & Privacy Model · `docs/security-privacy.md`

![](assets/banner-security-privacy.svg)

| Attribute | Specification |
|---|---|
| **Status** | 🟢 Locked Specification |
| **Owner** | Lead Security Engineer &amp; Systems Architect |
| **Last Updated** | 2026-11-24 |
| **Source of Truth For** | Threat matrix, camera privacy guarantees, and allow-list containment |

> [!IMPORTANT]
> **Zero-Storage Privacy Promise:** Camera frames never leave volatile GPU memory. No video, image, or landmark stream is ever written to disk or sent over any network.

---

## 1. Threat Model & Mitigations

| Threat | Impact | Mitigation Strategy | Status |
|---|---|---|---|
| **Rogue Device on LAN** | Unauthorized file extraction or disk writes | Strict mutual TLS 1.3 with pinned certificate fingerprints established via out-of-band QR pairing. | 🟢 Mitigated |
| **Replayed Transfer Tokens** | Spoofed file download requests | Short-lived, single-use transfer authorization tokens valid for ≤ 60 seconds. | 🟢 Mitigated |
| **Path Traversal Attacks** | Overwriting system binaries (`../../../Windows`) | Strict canonicalization of all paths; operations rejected if outside user-designated allow-list roots. | 🟢 Mitigated |
| **Malicious Windows Filenames** | Disk corruption or execution injection | Rejection of forbidden characters (`< > : " / \ | ? *`) and reserved names (`CON`, `PRN`, `AUX`, `NUL`). | 🟢 Mitigated |
| **Accidental Gesture Deletion** | Loss of valuable user files | All deletions route through OS Recycle Bin via `trash` crate; 8s visual Undo toast + journal. | 🟢 Mitigated |
| **Camera Feed Leakage** | Invasion of personal visual privacy | MediaPipe processes frames in-memory in WebView2. Immediate buffer discard. Hardware toggle off. | 🟢 Mitigated |
| **Clipboard Snooping** | Unintentional sensitive data sync | Air Clipboard sync is user-initiated or explicit toggle; passwords/tokens excluded via heuristic checks. | 🟢 Mitigated |

---

## 2. Pairing & Mutual Authentication

```
1. PC generates Ed25519 keypair and self-signed X.509 certificate.
2. PC displays QR Code:
   {
     "id": "pc_alex_01",
     "pubKey": "base64...",
     "fingerprint": "SHA256:...",
     "secret": "one_time_nonce",
     "addresses": ["192.168.1.105"],
     "port": 49152
   }
3. Android app scans QR code, validates local Wi-Fi route, and connects over TLS.
4. Mutual auth verifies fingerprints; PC prompts user with "Confirm Pairing" modal.
5. Pinned certificate fingerprints are saved to SQLite and Android EncryptedDataStore.
```

---

## 3. Privacy Commitments in Plain Language

1. **No Cloud Servers:** PinchDrop does not operate a file hosting cloud.
2. **No Accounts or Passwords:** You never create an account or provide an email.
3. **No Video Recording:** The webcam is active only to extract 21 fingertip coordinate points. It cannot record, save, or stream your face or room.
4. **Local Network Only:** File data travels directly between your PC and phone through your home or office Wi-Fi router.
5. **Opt-In Telemetry:** Telemetry is completely disabled by default. Only anonymized crash logs may be submitted if explicitly opted-in by the user.

---

[← Prev: protocol.md](protocol.md) · [Index](../README.md) · [Next: monetization.md →](monetization.md)
