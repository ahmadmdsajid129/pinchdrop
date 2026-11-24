# Desktop Application (`apps/desktop`)

> **Stage:** Scheduled for **Stage 3 (S3)**  
> **Stack:** Tauri 2 (Rust) + React 18 / TypeScript / Vite / Tailwind CSS / Motion (Framer Motion) / Zustand / XState

## Responsibilities
- Windows desktop window management, overlay, and system tray integration.
- WebView2 UI hosting the Air Workspace, Gesture HUD, and Settings.
- Rust tokio core hosting the local axum HTTP/WS server, file operations with allow-list check, Recycle Bin deletion via `trash`, transfer engine with BLAKE3 hashing, and mDNS discovery.

See [architecture.md](../../architecture.md) for full module specifications.
