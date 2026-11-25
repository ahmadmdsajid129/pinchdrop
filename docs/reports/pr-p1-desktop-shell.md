## v1 complete + v1.1 founder polish, v2 plan

Brings `main` up to the version of PinchDrop that works end to end on real hardware (HP laptop + POCO F7): pair, see live battery, pinch a file on the PC, catch it with an open hand over the phone.

### What changed
**Desktop (Tauri 2 + React)**
- Pill + Dynamic Island: always on top (even over full-screen apps), Ctrl+Shift+Space toggles it, and the camera either auto-starts or waits for "Start gestures" (a setting).
- Pinch-grab of the Explorer/desktop selection. With nothing selected, the clipboard is sent instead: a link opens on the phone, short text goes to its clipboard, long text becomes a `.txt`, formatted text an `.html`.
- An icon-sized preview card rides under your fingers: real Windows shell thumbnails in their true shape, folder contents, first lines of text, a link card, and a stack for multi-select. It moves at display rate (glide between camera frames + critically damped follow).
- Sends: a lift-off animation shows the item itself, then the Island opens on live progress. The Island no longer gets clipped during transfers.
- Fresh white Apple-style look; jet-black Island; the sidebar fits small windows.

**Android (Kotlin + Compose)**
- Pairing, encrypted link, saving to the Gallery/Downloads, resume, history.
- Catch with an open hand. With "Open PinchDrop by itself" (Display over other apps + the Xiaomi background-windows switch), the Catch camera opens automatically, over the lock screen too.
- Receive bottom sheet with live progress, then a green tick. Links open on arrival.

**Docs**
- README rewritten for how the app works today.
- `docs/v2-plan.md`: all v2 features, how each works, and the v2 gesture set.
- memory.md / task.md updated (decisions, gotchas, checklists).

### Checks
- Rust: `cargo clippy --all-targets` clean, 35 tests pass (including a real shell-thumbnail test).
- Android: `assembleDebug testDebugUnitTest` pass.
- Desktop: `tsc --noEmit` clean; `pnpm docs:check` passes.
- Installer and APK built and installed on the founder's devices.

### For reviewers
- The camera never stores or sends frames; thumbnails are made in memory only.
- `SYSTEM_ALERT_WINDOW` / `USE_FULL_SCREEN_INTENT` are new Android permissions, used only to open Catch / the receive sheet.
- Not yet re-checked by the founder: drag feel, auto-open on the phone, receive sheet.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
