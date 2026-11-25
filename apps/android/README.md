# Android app (`apps/android`)

> **Phase:** P2 — app shell (see [task.md](../../task.md))
> **Stack:** Kotlin 2.2, Jetpack Compose (Material 3), DataStore · Gradle 8.14.3 wrapper, AGP 8.13, compileSdk 36, minSdk 26

## What works now
- First-run setup: Welcome → Permissions (real Android pop-ups) → Pair → Home.
- Home, Received, Settings and Profile, with every setting saved on the phone.
- Previews of the incoming alert, the Catch screen, the Receiving animation and the Photo-arrived animation (Settings → Preview the animations). Each is marked **DEMO**; nothing is received.
- A "demo PC" switch on the Pair screen shows the connected look until real pairing ships.

## Not yet (by phase)
- **P3** QR scanning, 6-digit code check, the encrypted link to the PC.
- **P4** Real receiving into Gallery / Downloads/PinchDrop, history, resume.
- **P6** Open-hand detection with the front camera.

## Build
Needs JDK 17+ and the Android SDK (platform 36). Point Gradle at the SDK with `local.properties` (`sdk.dir=...`) or `ANDROID_HOME`.

```powershell
.\gradlew.bat assembleDebug testDebugUnitTest
```

The APK lands in `app/build/outputs/apk/debug/app-debug.apk`. Install it with `adb install -r` or copy it to the phone.

## Privacy
Camera frames will only ever be checked in memory for an open hand and then discarded — never saved or uploaded. See [rules.md](../../rules.md).
