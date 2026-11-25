# memory.md · Project Memory & Decision Registry

![](docs/assets/banner-memory.svg)

| Attribute | Specification |
|---|---|
| **Status** | 🟢 Active |
| **Owner** | Lead AI Engineer &amp; Systems Architect |
| **Last Updated** | 2026-11-24 |
| **Source of Truth For** | Canonical decisions, project snapshot, glossary, gotchas, and open questions |

> [!NOTE]
> This file preserves persistent memory across agent turns. It follows an **append-only rule for decisions** and is updated at every project stage.

---

## 🧠 Project Snapshot

- **Current Stage:** **Stage 12 (Pro & Monetization Engine)** — Completed. Offline cryptographic licensing engine (`license.rs`), `useLicense` React hook, `ProModal` aurora upgrade showcase, and unit tests (`tests/license_engine.rs`).
- **Active Workspace:** `E:\Pinch Drop`
- **Next Stage:** **Stage 13 (Public Launch & Distribution)** — Final store release prep, demo recordings, landing page assets, and v1.0 public release documentation.
- **Current Stack Status:**
  - Node.js `v20.19.5`, pnpm `12.18.0`, Git `2.51.0`
  - Workspace packages: `@pinchdrop/gesture-core` (10 passing vitest unit tests across 4 suites), `tools/gesture-lab` (built), `apps/desktop` (built + Rust core safe file ops, LAN server, Stage Tray, Air Clipboard, Gesture Gym, Web Audio, NSIS/MSI installers, and Pro licensing engine), `apps/android` (Kotlin/Compose companion app with Release signing config, R8 shrinker & WorkManager)
  - Protocol package: `packages/protocol` (JSON Schemas)

---

## 📜 Canonical Decision Log

| ID | Date | Decision | Rationale | Alternatives Considered | ADR Link |
|---|---|---|---|---|---|
| **DEC-0001** | 2026-11-24 | Tauri 2 + React 18 for Desktop Shell | Small installer (<60MB), safe Rust file ops, native WebView2 GPU acceleration for MediaPipe. | Python desktop (PyQt/Electron) — rejected due to massive bundle size and Python runtime friction. | [ADR-0001](docs/adr/0001-tauri-desktop-shell.md) |
| **DEC-0002** | 2026-11-24 | PC is Server, Phone is Client | Eliminates inbound connection blocks on Android and respects OS background execution limits. | Phone as server — rejected due to aggressive OS socket teardown. | [ADR-0002](docs/adr/0002-pc-server-phone-client.md) |
| **DEC-0003** | 2026-11-24 | Stage Tray & Grab → Catch Architecture | Webcam cannot see inside the phone. Bridge physical reality using Android Share Target / Tiles + PC ARMED state. | Direct camera OCR/vision of phone screen — physically impossible with laptop webcam angle. | [ADR-0003](docs/adr/0003-stage-tray-architecture.md) |
| **DEC-0004** | 2026-11-24 | Android 15 `dataSync` Compliant Transfer Strategy | Android 15 limits `dataSync` foreground services to 6 hours per 24h. Use foreground sessions + WorkManager. | Always-on background service — rejected because Android 15 kills non-compliant services. | [ADR-0004](docs/adr/0004-android-background-strategy.md) |
| **DEC-0005** | 2026-11-24 | Versioned JSON over WebSocket + HTTP Range Transfer | Reliable low-overhead bi-directional control with resume-capable chunked file transfers. | gRPC / Raw TCP sockets — heavier runtime, complex cross-language bindings. | [ADR-0005](docs/adr/0005-protocol-architecture.md) |
| **DEC-0006** | 2026-11-24 | Pure TS Deterministic Gesture Core with Replay Harness | Allows testing gesture classification, smoothing, and FSM against pre-recorded landmark sessions in CI. | Coupling gesture logic to DOM/React components — untestable in headless CI. | [ADR-0006](docs/adr/0006-deterministic-gesture-core.md) |
| **DEC-0007** | 2026-11-24 | Vendored Offline Models & Zero CDN Runtime | Ensures complete offline capability and satisfies zero-cloud privacy commitments. | Runtime CDN fetching (unpkg/cdnjs) — violates privacy and breaks without internet. | [ADR-0007](docs/adr/0007-vendored-local-models.md) |
| **DEC-0008** | 2026-11-25 | Dedicated External Services & Credentials Registry | Centralize developer credentials, keystores, and store accounts into `docs/services.md` with zero-leak policy. | Fragmented instructions in individual app READMEs. | [Services Guide](docs/services.md) |
| **DEC-0009** | 2026-11-25 | Client-Side Gesture Gym & Privacy Dashboard | Provide users immediate tactile confidence with gamified gesture calibration and zero-recording verification. | Relying on static documentation manuals or external web tutorials. | [Task Board](task.md) |
| **DEC-0010** | 2026-11-25 | Procedural Web Audio API for Zero-Asset Sound Design | Synthesize tactile audio cues (pop, click, whoosh, thud, chime) directly in Web Audio without shipping heavy audio files. | Bundling static WAV/MP3 audio assets — increases bundle size and incurs decode latency. | [Design Spec](design.md) |
| **DEC-0011** | 2026-11-25 | Minisign Ed25519 & Dual Windows Installers (NSIS + MSI) | Dual-installer strategy guarantees consumer ease (NSIS setup wizard) and enterprise IT compatibility (silent MSI deployment). | MSI-only or Portable ZIP only — limits consumer adoption and IT administration. | [Services Guide](docs/services.md) |
| **DEC-0012** | 2026-11-25 | Offline-First Zero-Phone-Home Licensing Verification | Enforce Pro tier unlocks via local signature parsing and persistent JSON state without cloud DRM telemetry. | Server-backed cloud licensing / DRM — violates zero-telemetry privacy promise. | [Monetization Spec](docs/monetization.md) |

---

## 🔤 Project Glossary

- **Air Workspace:** The desktop overlay UI featuring oversized folder targets, action zones, and magnetic card snapping.
- **ARMED State:** Transient 30-second window on the PC triggered when the paired phone sends a `hold.set` payload. Pinching anywhere during ARMED catches the item.
- **Grab → Catch:** The two-step sharing interaction bridging phone and PC: user taps Share on phone (Grab), then executes a mid-air pinch on PC (Catch).
- **Stage Tray:** Persistent staging area on PC hosting items sent from phone that were not caught during the initial 30-second ARMED window.
- **Interaction Box:** Central 60–70% boundary of the webcam frame mapped to 100% of the PC display screen, preventing awkward arm over-extension.
- **One-Euro Filter:** Adaptive low-pass filter providing jitter reduction at low velocities and lag elimination at high velocities.
- **Pinch Ratio:** Scale-invariant ratio calculated as `dist(ThumbTip_4, IndexTip_8) / dist(Wrist_0, MiddleMCP_9)`.
- **Throw Gesture (G3b):** High-velocity ballistic flick toward a screen edge that triggers instant transfer to the default destination without fine aiming.
- **Zones:** Dedicated screen edge drop targets: Phone Zone, Quick Folders, Rename Zone, Browser Zone, Clipboard Zone, and Trash Zone.

---

## ⚠️ Gotchas & Technical Learnings

1. **Android 15 Foreground Service Limits:** `dataSync` foreground services are capped at ~6 hours in a rolling 24-hour window. Service timers reset when the user brings the app to the foreground. PinchDrop must rely on user-initiated jobs and WorkManager.
2. **Wi-Fi Client / AP Isolation:** Public and university Wi-Fi networks frequently block direct peer-to-peer LAN sockets. Fallbacks: Wi-Fi Hotspot, USB tethering, or `adb reverse` (dev only).
3. **WebView2 Camera Access:** Requires explicit permission initialization and camera device selection inside the Tauri WebView runtime.
4. **Windows Reserved File Characters:** Paths containing `< > : " / \ | ? *` or reserved names (`CON`, `PRN`, `AUX`, `NUL`) must be sanitized before disk writes.
5. **SmartScreen & Code Signing:** Unsigned Windows binaries encounter severe SmartScreen warnings. Stage 11 must introduce valid code signing certificates.
6. **No-CDN Policy:** All MediaPipe WASM binaries and HandLandmarker `.task` model files must be bundled inside the desktop package.

---

## ❓ Open Questions & Decisions Needed

1. **Name & Trademark Check:** `PinchDrop` is a working title. Need formal trademark, domain, and store-name availability check. (Recommendation: Keep name abstracted in `GESTURE_CONFIG.APP_NAME`).
2. **Python Vision Spike vs. Pure JS/Rust:** Should we write a throwaway Python MediaPipe script for calibration or proceed directly to Stage 1 Gesture Lab in Vite/TS? (Recommendation: Skip Python spike; Stage 1 in Vite/TS validates WebView2 directly).
3. **Google Photos Original Quality Handover:** Does the Android Share Sheet provide the original raw file or a downsampled version from Google Photos cloud cache? (Recommendation: Validate with real Android device in Stage 7).
4. **Offline Voice Rename Engine:** For Stage 1.1 voice rename, should we bundle `whisper.cpp` as a sidecar or leverage Windows Speech Recognition APIs? (Recommendation: Test whisper.cpp sidecar for privacy and cross-version consistency).
5. **Distribution Priority:** Windows Direct Download (MSI/NSIS) vs. Microsoft Store submission first. (Recommendation: Direct NSIS installer first for rapid beta iteration).
6. **Commercial Licensing Strategy:** Dual-license (AGPLv3 for open core + Commercial for Pro) vs. Source-Available. (Recommendation: Clarify before Stage 12).

---

## 🙋 Founder Preferences

- **Aesthetic:** Highly polished, colourful, dark-first "aurora glass" aesthetic.
- **Quality Standard:** Rock-solid reliability; no glitchy camera stutter; forgiving thresholds.
- **Working Style:** Solo builder, part-time (~15–20 hours/week), clean documentation.

---

[← Prev: AGENTS.md](AGENTS.md) · [Index](README.md) · [Next: product.md →](product.md)
