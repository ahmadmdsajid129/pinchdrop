# PinchDrop v2 · Feature Plan

| Attribute | Specification |
|---|---|
| **Status** | 🟡 Planned (v1 is finished and working on real devices) |
| **Owner** | Founder + AI engineer |
| **Last Updated** | 2026-11-25 |
| **Source of Truth For** | What v2 adds, how each feature works, and the v2 gesture set |

v1 made the PC → phone path feel physical. You select, pinch, carry and open your hand over the phone, and the file arrives. **v2 makes it work both ways, puts the phone's life (notifications, messages, calls) on the PC, and adds gestures to control it.** Everything stays local-first. Nothing goes through a cloud, and camera frames are never stored or sent.

---

## 1. Features

Status: 🟢 agreed with the founder · 🔵 proposed (needs a yes before we build it).

| # | Feature | Status |
|---|---|---|
| 1 | Phone → PC with gestures | 🟢 |
| 2 | Phone notifications on the PC (in the Island) | 🟢 |
| 3 | SMS: read and reply from the PC | 🟢 |
| 4 | Contacts on the PC | 🟢 |
| 5 | Calls: see who's calling, answer or reject with your hand | 🟢 |
| 6 | Fast mode for big files | 🟢 |
| 7 | Proximity-sensor catch (no camera needed) | 🟢 |
| 8 | Several phones and tablets, with a cool way to pick the target | 🟢 |
| 9 | Laptop ↔ laptop | 🟢 |
| 10 | New gestures for all of the above (section 2) | 🟢 |
| 11 | Clipboard both ways | 🔵 |
| 12 | Grab a screenshot with a two-hand frame | 🔵 |
| 13 | Find my phone (ring it from the PC) | 🔵 |
| 14 | Pill shows unread messages and incoming calls; the message icon opens the Messages view | 🟢 |

### 1. Phone → PC with gestures
**How it works:**
1. On the phone, open anything: a photo in Google Photos, a link in Chrome, a PDF in Files.
2. Tap **Share → PinchDrop**. The phone shows a small "Pinch to lift" screen with its front camera on.
3. **Pinch** in front of the phone. The item lifts with a haptic tick and a card animation. It is now "in the air". The PC's Island shows it with a countdown, just like a hold in v1, but in reverse.
4. Turn to the laptop and **open your hand** in front of the webcam. The item lands on the PC:
   - **Photo / video / file:** saved to `Downloads\PinchDrop` and opened in its default app.
   - **Link:** opens in the PC's default browser.
   - **Text:** copied to the PC clipboard (long text becomes a `.txt` file and opens).
5. If you drop it while pointing at an open Explorer window or the desktop, it lands **there** instead.

**Under the hood:**
- Android Share target, then the existing CameraX + MediaPipe pinch detector on the phone.
- A new `hold.offer` message in the phone → PC direction (LINK-v1 already has holds; v2 makes them two-way).
- The PC's webcam watches for an open hand only while something is in the air.
- The PC pulls the file in chunks, the same engine as v1 but reversed.

### 2. Phone notifications on the PC
**How it works:**
- A notification on the phone (WhatsApp, Gmail, bank OTP…) drops down from the Island as a small banner: app icon, title, text.
- **Swipe your hand** to dismiss it. **Hold up two fingers** to reply (if the app allows replies). Clicking it works too.
- You choose which apps can show on the PC, and can mute everything with **Do not disturb** (fist gesture).

**Under the hood:** Android `NotificationListenerService` (the user grants "Notification access" once). Notifications travel over the existing encrypted link and are **never stored** on the PC, only shown. Replies use the notification's own reply action (`RemoteInput`).

### 3. SMS: read and reply from the PC
**How it works:**
- A **Messages** tab in the desktop app shows your conversations.
- Incoming SMS also appear as an Island banner.
- To reply, type on the PC keyboard or hold up two fingers to open quick reply. The phone sends the message.

**Limits:** reading and sending SMS needs Android SMS permissions. That's fine for the APK we install directly. Google Play only allows it for apps set as the default SMS app, so the Play Store build will reply through the notification instead (feature 2).

### 4. Contacts on the PC
**How it works:**
- Search your phone's contacts from the desktop app.
- Start an SMS or a call (the phone dials) from a contact.
- Callers' names and photos show on the Island.

**Under the hood:** a read-only sync of contacts (name, numbers, photo) into memory on the PC while the phone is connected. Nothing is written to disk.

### 5. Calls: answer or reject with your hand
**How it works:**
- When the phone rings, the Island grows into a call card with the caller's name, photo and number.
- **Open palm held toward the webcam (≈1 s) = answer.** The call is answered on the phone (speaker on, or your earbuds).
- **Swipe your hand sideways = reject.** An optional quick SMS goes out ("Can't talk, call you back").
- **Fist = silence the ringing** without rejecting.

**Later, a bigger project:** hearing and speaking through the PC's speakers and mic. This needs Bluetooth hands-free (HFP) between the PC and phone. We'll do it after the basic answer/reject works.

**Under the hood:** `TelecomManager` / `InCallService` permissions on the phone (answer and end call), plus `READ_PHONE_STATE` to know it is ringing.

### 6. Fast mode for big files
**How it works:** sending a multi-GB movie should take minutes, not tens of minutes. The Island shows the speed live, plus a "Fast mode" badge when it kicks in.

**Under the hood:**
- **Several parallel streams** instead of one. Today the phone pulls one 512 KB chunk at a time with a small window. v2 uses 4–8 parallel lanes and bigger chunks.
- **No compression** of media that is already compressed.
- **Wi-Fi Direct** when both devices support it. This is a direct radio link that skips the router, often 2–3× faster on busy home Wi-Fi.
- Resume after a drop is kept (the journal already exists).

### 7. Proximity-sensor catch
**How it works:** while something is "in the air", just **hover your hand over the top of the phone** (where the earpiece is). The phone catches it. No need to open the app or start the camera, and it works with the phone lying on the desk with the screen off.

**Under the hood:** the phone's proximity sensor (the one that turns the screen off during calls). The sensor is only listened to during the catch window (the 30-second hold), so it costs no battery the rest of the time. "Near then far within 1.5 s" = catch, so a phone in a pocket doesn't trigger it.

### 8. Several phones and tablets
**How it works:**
- Pair as many devices as you like. The pill shows a stack of small device chips.
- While carrying something with a pinch, **the device chips fan out along the top of the screen**. Move your hand under one and it glows. Open your hand there and it goes to that device.
- Or just open your hand over the physical phone you want (whichever device's camera or proximity sensor sees it catches it).
- **Flick (throw) toward a chip** to send without stopping.

**Under the hood:** the link server already supports multiple paired devices. v2 adds "hold for any of them", first-to-catch wins, plus the device-picker UI.

### 9. Laptop ↔ laptop
**How it works:**
- Two PCs on one desk pair exactly like a phone (QR code or 6-digit code).
- Pinch a file on one laptop, carry it toward the other, and open your hand in front of **the other laptop's webcam**. It lands on that desktop.

**Under the hood:** the Windows app gains the phone's "receiver" role (it already has the sender). Same protocol, same encryption.

### 10. New gestures
See section 2.

### 11. Clipboard both ways 🔵
**How it works:**
- Copy on the phone, then pinch at the laptop: it pastes on the PC.
- Copy on the PC: it's on the phone's clipboard.
- Off by default, and a per-device switch.

### 12. Grab a screenshot with a two-hand frame 🔵
**How it works:**
- Make an **"L" with both hands** (thumbs and index fingers) as if framing a photo. The area between your hands is highlighted on the screen.
- Pinch to capture it. The screenshot card sticks to your fingers, and you carry it to the phone like any file.

### 13. Find my phone 🔵
**How it works:** a button on the Island makes the phone ring loudly at full volume, even if it's on silent, until you tap it.

### 14. Messages and calls on the pill
The pill becomes a glanceable status bar for the phone, so you see what's happening without opening anything.

**Unread messages:**
- When a message arrives, a **message icon with a count badge** (e.g. 💬 3) appears on the pill, next to the battery.
- It slides in with a small pop and stays until you've **opened and read** those messages. Reading them on the PC or on the phone both clear it, because the count follows the phone.
- **Clicking the message icon** opens the **Messages view** in the PinchDrop app (from feature 3) on the newest unread conversation. Clicking the rest of the pill still opens the Island as before.
- Over 9 shows "9+".

**Incoming call:**
- While the phone is ringing, a **phone icon that shakes like a vibrating phone** appears on the pill, beside the message icon.
- The pill widens just enough to show the **caller's name** (from contacts, feature 4), or the number if unknown.
- You don't have to answer from the PC. This is so you *know* the phone is ringing even when it's in another room or on silent.
- If the Island is open (camera on), the call gestures from feature 5 still work: palm = answer on the phone, swipe = reject, fist = silence.
- When the ringing stops, the icon leaves. A **missed call** leaves a small red dot on the phone icon until you open the app or the phone.

**Order on the pill (left to right):** status dot · phone name · battery · 💬 unread · 📞 ringing (name). On a small pill size, the name is dropped first, then the battery %, so the icons always fit.

**Under the hood:**
- The phone sends a tiny `status.messages { unread }` and `call.state { ringing | ended | missed, name, number }` update over the existing link, the same way it already sends battery level.
- The unread count comes from the SMS inbox (feature 3) and/or message notifications (feature 2).
- The ringing state comes from `READ_PHONE_STATE` (feature 5).
- Nothing is stored on the PC. The pill only shows the current numbers.

---

## 2. The v2 gesture set

v1 has three gestures: **pinch** (grab), **carry** (move while pinched) and **open hand** (drop). v2 adds these. Every new gesture is **only active when it means something**. For example, "answer" only works while the phone is ringing, so a random wave never does anything. Each one needs a short hold or a clear motion, shows its progress ring on screen, and can be switched off in Settings → Gestures.

| ID | Gesture | How to do it | What it does | Only active when | Safety |
|---|---|---|---|---|---|
| **G1** | Pinch | Thumb + index tips together | Grab the selection / the item in the air | Camera on (Island open) | v1 rules: steady 150 ms, hand close enough, confident tracking |
| **G2** | Carry | Move while pinched | Moves the card, ring follows your fingers | Holding something | — |
| **G3** | Open hand | Spread all fingers | Drop / catch / land on the PC | Holding, or something is in the air | 200 ms release, 3+ fingers open |
| **G4** | **Palm hold** | Open palm facing the camera, still, ~1 s | **Answer the call** · open the newest notification | Phone ringing · banner showing | Progress ring fills; lower your hand to cancel |
| **G5** | **Swipe** | Flat hand moving quickly sideways | **Reject call** · dismiss notification · next item | Ringing · banner showing | Must cross ⅓ of the frame in < 0.4 s |
| **G6** | **Two fingers (✌️) hold** | Index + middle up, ~0.6 s | **Reply** (opens quick reply box) | Banner / SMS / missed call showing | Progress ring; any other pose cancels |
| **G7** | **Thumbs up** | Fist with thumb up, ~0.5 s | **Confirm**: accept an incoming file, mark read, "yes" | A question is on screen | Thumb must point up (not sideways) |
| **G8** | **Fist hold** | Closed fist, ~0.8 s | **Silence** a ringing call · **Do not disturb** on/off · pause camera | Any time the camera is on | Distinct from pinch (all fingers closed) |
| **G9** | **Throw (flick)** | Pinch, then flick toward a device chip and open | Send straight to that device | Holding + 2 or more devices | Speed threshold + 8 s Undo |
| **G10** | **Point & dwell** | Point under a device chip, hold ~0.4 s | Choose the target device | Holding + device chips showing | Chip glows; leave to cancel |
| **G11** | **Wave** | Open palm side to side, twice in ~1 s | Open / close the Island (no keyboard) | Camera on | Frequency filter; must be 2 waves |
| **G12** | **Two-hand frame** 🔵 | Both hands make an "L", framing an area | Screenshot that area (then pinch to carry it) | Camera on | Both hands visible and steady 0.5 s |
| **Phone G13** | **Pinch at the phone** | Pinch in front of the phone's front camera | Lift a shared item into the air (phone → PC) | Share → PinchDrop screen is open | Same rules as G1 |
| **Phone G14** | **Hover over the phone** | Hand over the top of the phone | Catch without the camera | Something is in the air | Near → far within 1.5 s |

**Gesture practice:** Settings → Gestures gets a practice screen for each new gesture. It shows your hand, how close you are to the pose, and a ✓ when it's recognised, so you can learn them without sending anything.

---

## 3. Build order (suggested)

1. **Phone → PC with gestures** (feature 1): the most visible missing half of the core idea.
2. **Notifications + G4/G5/G6** (features 2, 10): unlocks the gesture vocabulary that calls and SMS reuse.
   The **pill message badge and ringing-call icon** (feature 14) ship with this step: they reuse the same phone → PC status channel.
3. **Calls** (feature 5), then **SMS + contacts** (features 3, 4).
4. **Fast mode** (feature 6) and **proximity catch** (feature 7).
5. **Multiple devices + device picker** (feature 8), then **laptop ↔ laptop** (feature 9).
6. Proposed extras (features 11–13), if approved.

---

## 4. Things to decide

- **Play Store vs direct APK:** SMS (feature 3) and full call control need permissions Google Play restricts. Direct APK installs get everything; a Play build would use the notification-reply path instead.
- **Call audio through the PC:** this is a separate, larger project (Bluetooth HFP). Do we want it in v2 or v3?
- **Proposed features 11–13:** yes or no?

---

[← Back to README](../README.md) · [task.md](../task.md)
