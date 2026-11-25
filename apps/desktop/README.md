# PinchDrop for Windows (`apps/desktop`)

Tauri 2 (Rust) + React 18 / TypeScript / Vite / Tailwind / Framer Motion.

## Windows
- **`pill`** (`pill.html`, `src/pill/`) — the always-on-top pill. Click → Dynamic Island, double-click → main window, drag to move (snaps to edges, position remembered), right-click → menu. The OS window is resized to exactly fit the pill or Island (`pill_resize`), keeping the anchored edge still.
- **`main`** (`index.html`, `src/app/`) — first-run setup, Home, Send, Transfers, Devices, Pair, Settings, Profile. Closing hides it to the tray.

## Rust (`src-tauri/src`)
| File | Role |
|---|---|
| `lib.rs` | App setup, tray, commands, window events |
| `settings.rs` | Settings model, load/save (atomic), JSON patch merge |
| `pill.rs` | Pill placement, anchored resize, edge snapping, full-screen detection |
| `phone.rs` | Phone status (P1: none or demo) |
| `fs_info.rs` | Read-only sizes / file counts for the Send list |

## Commands
```powershell
pnpm --dir apps/desktop tauri dev     # run the app with hot reload
pnpm --dir apps/desktop tauri build   # release exe + NSIS installer
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```
Requires Rust (MSVC) and Visual Studio C++ Build Tools. In a plain browser (`pnpm --dir apps/desktop dev`) the UI runs against a localStorage mock.
