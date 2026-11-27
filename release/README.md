# PinchDrop 2.0.0: the finished apps

| File | What it is |
|---|---|
| `PinchDrop_2.0.0_x64-setup.exe` | Windows installer (website download, auto-updates once releases are on GitHub) |
| `PinchDrop.apk` | Android app with every feature (website download) |
| `PinchDrop-play-release.aab` | Android bundle for Google Play (leaves out SMS, call history, all-files access and background location, as Play requires) |

The installers aren't stored in git (they're rebuilt from the code); this note is.

## What you do next
Everything is in **[docs/launch.md](../docs/launch.md)**, in order, with a checklist:

0. Back up `C:\Users\HP\.pinchdrop\` and turn on 2-factor sign-in everywhere.
1. Website: already live.
2. Dodo Payments → send me the checkout links and product IDs.
3. Cloudflare → `wrangler login`, `secret put`, `deploy`.
4. GitHub secrets → tell me "release it".
5. Microsoft Store → send me the 3 identity values.
6. Google Play → start the 12-tester closed test early.
7. Demo video.

## Security
See **[docs/security-report.md](../docs/security-report.md)**: what was tested, what was fixed, and one decision for you (making the code private).

## Installing on your own devices
- **PC:** run the `.exe`. If Windows says "Windows protected your PC": **More info → Run anyway** (only until the Microsoft Store version is live).
- **Phone:** if an older PinchDrop is installed from a debug build, uninstall it once first, then install `PinchDrop.apk`.
