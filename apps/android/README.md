# Android Companion App (`apps/android`)

> **Stage:** Scheduled for **Stage 6 (S6)**  
> **Stack:** Kotlin, Jetpack Compose (Material 3), Coroutines/Flow, Hilt, Room, DataStore, Ktor Client (OkHttp engine), WorkManager

## Responsibilities
- QR code pairing and pinned certificate storage.
- Share Sheet Target (`ACTION_SEND`, `ACTION_SEND_MULTIPLE`) for Google Photos, Files, Chrome, WhatsApp.
- Quick Settings tiles: "Grab latest photo", "Grab clipboard".
- In-app capture: camera photo, voice memo, ML Kit document scanner direct to PC.
- Stage Tray sync and WorkManager background data transfers with Android 15 `dataSync` compliance.

See [architecture.md](../../architecture.md) for full module specifications.
