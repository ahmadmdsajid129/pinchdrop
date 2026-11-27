# Google Play: listing and policy answers

Upload: `PinchDrop-play-release.aab` (the **play** version). Package name: `com.pinchdrop.companion`.

## Store listing
- **App name:** PinchDrop
- **Short description (80):** Catch files from your PC with your hand. Your phone's alerts, on your PC.
- **Full description:**

  > Pinch a file on your Windows PC, open your hand over your phone, and it lands here. PinchDrop moves photos, videos, documents, folders and links between your PC and phone over your own Wi-Fi: no cloud, no account.
  >
  > • Catch files from your PC with an open hand (or a tap)
  > • Send from your phone: Share → PinchDrop
  > • Your phone's notifications on your PC; reply from your keyboard
  > • See who's calling on your PC; answer with a click
  > • Recent photos, music controls, find my phone
  > • Several phones at once
  >
  > Needs PinchDrop for Windows (free) on your PC. Everything stays between your phone and your PC. Camera frames are checked in memory for an open hand and discarded: never saved, never sent.

- **Category:** Tools
- **Graphics:**
  - icon: 512 × 512, made from `apps/desktop/src-tauri/icons/icon.png`
  - feature graphic: 1024 × 500
  - 4–8 phone screenshots: Home, the catch screen, Received, Features

## Privacy policy
https://ahmadmdsajid129.github.io/pinchdrop/privacy.html

## Data safety
- **Data collected:** none. Nothing is sent to us or any third party.
- **Data shared:** none.
- **What happens on the device:** files, notifications and contacts go only to the PC the user paired, over the local network and encrypted.
- **Encrypted in transit:** yes (TLS between phone and PC).
- **Deleting data:** uninstalling removes it; the user can clear the Received list in Settings.

## Permissions (play version)
| Permission | Why (what to write in Play Console) |
|---|---|
| Camera | Catching with an open hand and scanning the pairing QR code. Frames are processed on the device and never stored. |
| Notifications access (NotificationListenerService) | "Notifications on your PC": shows the phone's notifications on the paired PC, at the user's request (Settings → Features). Declared as a companion-device / productivity use. |
| READ_CONTACTS | Shows contact names instead of numbers for calls on the PC. |
| READ_PHONE_STATE, ANSWER_PHONE_CALLS, CALL_PHONE | "Calls on your PC": show who's calling, answer or reject from the PC, call a contact. |
| Location (while in use) | "Find my phone": the PC's map shows where the phone is. |
| READ_MEDIA_IMAGES | "Recent photos on your PC". |
| Display over other apps | "Instant catch": opens the catch screen when the PC sends. |
| Nearby Wi-Fi devices | Finding the PC on the local network (no location use). |
| Foreground service (connected device) | Keeping the connection to the user's PC while it's in use. |

Not in the Play version (website APK only): SMS, call log, all-files access, background location, full-screen intent, battery-optimisation request.

## Content rating and audience
- **Content rating:** no violence or sensitive content (questionnaire → Utility).
- **Target audience:** 13+.
- **Ads:** none.
