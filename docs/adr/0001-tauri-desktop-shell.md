# ADR-0001: Tauri 2 + React 18 for Desktop Shell

| Attribute | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-24 |
| **Decision Makers** | Lead Systems Architect, Lead AI Engineer |

## Context
PinchDrop requires a responsive desktop application running on Windows 10 and 11 capable of hosting a 60 fps spatial workspace, running local in-memory computer vision inference (MediaPipe Tasks-Vision), and executing low-level safe file operations and high-throughput networking.

Traditional options include:
1. **Electron:** Familiar web stack, but massive bundle size (>150 MB), heavy memory consumption (>250 MB idle), and slower startup.
2. **Python Desktop (PyQt / PySide):** Excellent for quick CV scripting, but painful distribution on Windows, heavy installer size, poor touch/spring animation performance, and high runtime packaging friction.
3. **Tauri 2 (Rust + WebView2):** Lightweight installer target (<60 MB), native Windows WebView2 hardware acceleration, high-performance Rust core with memory safety for file I/O and async network sockets.

## Decision
We select **Tauri 2 + React 18 / TypeScript**.
The UI runs inside WebView2 utilizing modern CSS and Framer Motion for spring physics. MediaPipe Tasks-Vision runs in the WebView2 GPU context. The backend uses Rust (`tokio`, `axum`, `rustls`, `trash`, `blake3`). A Python prototype is permitted only as a temporary throw-away spike.

## Consequences
- **Positive:** Installer size under 60 MB; minimal idle RAM; robust systems safety in Rust for file handling.
- **Risk:** WebView2 camera access and GPU delegation must be verified across OEM laptop drivers. Mitigation: Stage 1 Gesture Lab explicitly benchmarks latency and jitter on WebView2.

[← Return to Architecture Index](../../architecture.md)
