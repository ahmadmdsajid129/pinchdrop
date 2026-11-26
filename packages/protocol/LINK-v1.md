# PinchDrop Link v1 — PC ↔ phone connection

| | |
|---|---|
| **Status** | 🟢 Implemented in Phase P3 |
| **Source of truth for** | Discovery, pairing, the encrypted link and phone status. Constants below are mirrored in `apps/desktop/src-tauri/src/link/proto.rs` and `apps/android/.../link/Proto.kt`; change all three together. |

## 1. Shape

- The **PC is the server**, the phone is the client.
- Transport: **WebSocket over TLS** (`wss://<pc-ip>:<port>/link`). TLS 1.2+ (rustls on the PC).
- The PC has a **self-signed certificate** (ECDSA P-256), created on first run and kept in the app config folder.
  - Its **fingerprint** is the SHA-256 of the certificate's DER bytes, written as 64 lowercase hex characters.
  - The phone **pins** that fingerprint. It never trusts the system CA store for the link.
- Every message is one JSON text frame in the standard envelope (see [docs/protocol.md](../../docs/protocol.md)):

```json
{ "v": 1, "id": "…", "type": "status", "ts": 1732438800000, "payload": { } }
```

## 2. Constants

| Name | Value |
|---|---|
| Default port | `47821`. If it's busy the PC uses any free port and advertises that one. |
| mDNS service | `_pinchdrop._tcp.local.` |
| mDNS TXT | `id=<pcId>`, `v=1`, `fp=<fingerprint hex>`, `name=<pc name>` |
| WebSocket path | `/link` |
| Heartbeat | Both sides send WebSocket pings every 15 s. A side drops the link after 45 s of silence. |
| Pairing window | Open while the PC's Pair screen is showing, for at most 10 minutes. |
| Nonces | 32 random bytes each, base64 (standard, padded). |
| Status cadence | The phone sends `status` on connect, whenever battery % or charging state changes, and at least every 60 s. |

## 3. Pairing QR

```
pinchdrop://pair?v=1&id=<pcId>&n=<pc name, URL-encoded>&h=<ip1>,<ip2>&p=<port>&fp=<fingerprint hex>&t=<token>
```

`t` is a one-time 128-bit token, base64url without padding. It is valid only while the pairing window is open.

## 4. Session flow

1. The phone opens TLS.
   - **QR path:** it checks that the certificate fingerprint equals `fp` from the QR. On a mismatch it aborts.
   - **Reconnect path:** it checks the fingerprint saved at pairing.
   - **Code path (no QR):** it accepts the certificate found through mDNS. The 6-digit code in step 3 protects this path.
2. The PC sends `server.hello`: `{ pcId, pcName, nonce }`.
3. The phone then takes one of two paths.

   **a) Pairing.** The phone sends `pair.request`: `{ token?, nonce, phone: { name, model } }`.
   - The PC rejects it unless its pairing window is open. If a token is given, it must match.
   - Both sides compute the **6-digit code** (§5) and show it.
   - The phone sends `pair.confirm` once its user presses *Codes match*.
   - The PC user presses *Pair*.
   - When both have confirmed, the PC sends `pair.accept`: `{ deviceId, secret }`. The secret is 32 random bytes, base64.
   - Either side can send `pair.reject`: `{ reason }`, where `reason` is one of `"mismatch" | "cancelled" | "window_closed" | "bad_token" | "timeout"`. The link then closes.
   - After `pair.accept`, the session is authenticated (step 4).

   **b) Reconnect.** The phone sends `auth`: `{ deviceId, proof }`, where `proof = base64(HMAC-SHA256(secret, "pinchdrop-auth-v1" ‖ pcNonceBytes))`.
   - On success the PC answers `welcome`: `{ pcName }`.
   - Otherwise it answers `auth.fail`: `{ reason: "unknown_device" | "bad_proof" }` and closes. On `unknown_device` the phone forgets that PC and shows "This PC no longer knows this phone — pair again".

4. **Authenticated session.**
   - Phone → PC: `status` `{ name, model, battery, charging, network, freeSpaceGb }`
   - PC → phone: `pc.info` `{ pcName }`, sent when the PC is renamed.
   - Either side: `unpair` `{}`. The receiver deletes the pairing, then the link closes.

Any message that is unknown or comes in the wrong state is ignored, not answered.

## 5. The 6-digit code (SAS)

```
digest = SHA-256( "pinchdrop-sas-v1" ‖ fingerprintBytes(32) ‖ pcNonce(32) ‖ phoneNonce(32) )
code   = (u32 big-endian of digest[0..4]) mod 1 000 000, zero-padded to 6 digits
```

Test vector: fingerprint `00…00` (32 zero bytes), pcNonce = 32 × `0x01`, phoneNonce = 32 × `0x02` → **`749713`**. Both implementations' unit tests check this value.

Someone in the middle would hold a different certificate, so the two screens would show different codes. Users are told to press Pair only when the codes match.

## 6. Sending (Phase P4): PC → phone

Sending only happens inside an authenticated session (§4).

### 6.1 Offer
The PC sends `push.offer`:

```json
{ "transferId": "…", "label": "CPP", "destination": "auto",
  "openFirst": false, "totalBytes": 50331648,
  "files": [ { "index": 0, "path": "CPP/main.cpp", "size": 1834 } ],
  "texts": [ "https://example.com" ] }
```

- `path` uses `/` separators.
  - A file picked on its own is just its name.
  - Files in a picked folder start with the folder name.
  - The PC never sends absolute paths. The phone rejects `..`, empty segments and leading `/`.
- `destination` is `auto` or `downloads`.
  - `auto`: a photo or video picked **on its own** goes to the Gallery (`Pictures/PinchDrop`, `Movies/PinchDrop`).
  - Everything else goes to `Download/PinchDrop/…`, keeping the folder structure.
- `texts` are notes or links. They are saved to the phone's Received list straight away, and copied to the clipboard when the app is on screen.

The phone replies with one of:
- `push.accept` `{ transferId }`. This is automatic when its "Manual sends" setting is *Auto*; otherwise the user is asked.
- `push.decline` `{ transferId }`.

### 6.2 Data — the phone pulls
- The phone asks for data with `chunk.req` `{ transferId, index, offset, length }`, where `length ≤ 524288`.
- It keeps up to 4 requests in flight and asks for files in index order.
- The PC answers each request with one **binary** WebSocket frame:

```
u32 big-endian headerLength ‖ header JSON (UTF-8) ‖ data bytes
header = { "t": transferId, "i": index, "o": offset }
```

- The PC serves only files listed in that transfer's offer, and only to the phone it was offered to. A file whose size changed since the offer fails with `transfer.error` `{ transferId, index, reason: "changed" | "unreadable" }`.
- When a file has been fully written, the phone sends `file.done` `{ transferId, index }`.
- When every file is done, it sends `transfer.complete` `{ transferId }`. Only then may the PC apply **Move** (it sends the picked items to the Recycle Bin, never a permanent delete).
- Either side can send `transfer.cancel` `{ transferId }`. The phone keeps the files it already finished and removes the partial one.

### 6.3 Resume
- If the link drops, both sides keep the transfer and the phone keeps its partial file.
- After the phone reconnects, it sends `chunk.req` from the byte where it stopped. The PC keeps unfinished transfers on disk, so this also works after either side restarts.
- If the PC doesn't know the transfer any more, it answers `transfer.error` `{ reason: "unknown" }` and the phone marks the transfer as failed.

### 6.4 Grab and catch (Phases P5 / P6)

When the user pinches something on the PC and opens their hand, the PC **holds** it for the catch window (Settings → "Time to catch", 15–60 s).

- PC → phone `hold.offer`:
  ```json
  { "holdId": "…", "label": "CPP", "fileCount": 12, "totalBytes": 50331648, "isFolder": true, "expiresInSecs": 30 }
  ```
  - If the app is open, the phone shows its Catch screen.
  - Otherwise it shows a high-priority notification that opens the Catch screen; Android doesn't let apps start the camera in the background.
- Phone → PC `hold.catch` `{ holdId }`: an open hand was seen (P6), or the user pressed *Accept without gesture*.
  - The PC then sends the held items as a normal `push.offer` that carries the same `holdId`.
  - The phone accepts that offer without asking.
- PC → phone `hold.cancel` `{ holdId, reason }`, where `reason` is `"expired" | "cancelled"`. The phone closes its Catch screen.
- If the PC user presses *Send now* on the Island, the PC sends the `push.offer` with the `holdId` directly. Receiving it closes the phone's Catch screen, and the phone's normal Accept/Ask setting applies.

### 6.5 Lift: phone → PC (v2)

The other direction. On the phone the user taps **Share → PinchDrop** and **pinches** in front of the phone, which lifts the item into the air. Then they **open their hand at the laptop's webcam**, and the item lands on the PC.

- Phone → PC `lift.offer`:
  ```json
  { "liftId": "…", "label": "IMG_2041.jpg", "totalBytes": 3145728, "expiresInSecs": 30,
    "files": [ { "index": 0, "name": "IMG_2041.jpg", "size": 3145728, "mime": "image/jpeg" } ],
    "texts": [], "thumb": "data:image/jpeg;base64,…", "sendNow": false }
  ```
  - `name` is a plain file name (no folders). The PC strips anything path-like and Windows-reserved, and never writes outside its save folder.
  - `thumb` is optional: a small JPEG, at most 64 KB, used for the PC's preview card.
  - `texts` are links or notes shared from the phone (no files then).
  - `sendNow: true` means the user pressed *Send without gesture*. The PC catches it at once.
  - If the PC is busy with another lift, the newer one replaces it (the older one gets `lift.cancel` `{ reason: "replaced" }`).
- PC → phone `lift.catch` `{ liftId }`. The PC user opened their hand at the webcam, or pressed *Take it* on the Island.
  - Texts are handled at once: a link opens in the PC's browser (http/https only), short text goes on the PC clipboard, and long text becomes a `.txt` that opens.
- **Data: the PC pulls.** This mirrors §6.2.
  - The PC sends `lift.req` `{ liftId, index, offset, length }`, with `length ≤ 524288`. Up to 4 requests are in flight, files go in index order.
  - The phone answers each request with one binary frame in the §6.2 layout, with header `{ "t": liftId, "i": index, "o": offset }`.
- PC → phone `lift.done` `{ liftId }` once every file is saved.
  - Files are saved in `Downloads\PinchDrop` (name clashes become `name (2).ext`).
  - A single file opens in its default app. Several files open the folder.
- Either side can send `lift.cancel` `{ liftId, reason }`, where `reason` is one of `"expired" | "cancelled" | "failed" | "unreadable" | "replaced"`. The PC deletes any partial file.
- Lifts are not resumed in v2.0. If the link drops mid-way, the lift fails and the partial file is removed.
- The PC turns its webcam on for a lift only while one is in the air (at most `expiresInSecs`). The camera rules of §6.4 apply: frames are never stored or sent.

## 6.6 The phone's notifications, messages and contacts (v2)

These all travel inside the authenticated session. The PC keeps them **in memory only**: nothing is written to disk, and everything is forgotten when the phone disconnects or PinchDrop closes. The phone only sends what the user has allowed on the phone, through Android's own permission switches.

### Requests and replies
The PC asks; the phone answers once.
- PC → phone: `<kind>` with a `reqId` in its payload.
- Phone → PC: `phone.reply` `{ reqId, ok: true, data }` or `{ reqId, ok: false, error }`.
- The PC gives up after 15 s.
- `error` is one of:
  - `"no_permission"`: the user hasn't allowed this on the phone
  - `"failed"`: it was allowed but didn't work
  - `"unknown"`: the request kind isn't recognised

| Request | Payload | `data` in the reply |
|---|---|---|
| `sms.threads` | `{ reqId, limit ≤ 100 }` | `{ threads: [ { threadId, address, name?, snippet, date, unread, outgoing } ] }`, newest first |
| `sms.thread` | `{ reqId, threadId, limit ≤ 300 }` | `{ threadId, address, name?, messages: [ { id, body, date, outgoing, status } ] }`, oldest first. `status` is `"received" \| "sent" \| "sending" \| "failed"` |
| `sms.send` | `{ reqId, address, text }` | `{}` once Android has accepted the message for sending |
| `contacts.list` | `{ reqId }` | `{ contacts: [ { id, name, numbers: [ { number, label } ], starred } ] }`, sorted by name, at most 5000 |
| `call.dial` | `{ reqId, number }` | `{}`: the phone starts the call (or opens its dialer if calling isn't allowed) |
| `notif.dismiss` | `{ reqId, key }` | `{}`: the notification is cleared on the phone too |
| `notif.reply` | `{ reqId, key, text }` | `{}`: sent with the notification's own Reply action |

Dates are milliseconds since 1970 (UTC). Phone numbers are passed exactly as the phone stores them.

### Events from the phone
- `notif.posted` `{ key, pkg, app, title, text, time, canReply, icon? }`
  - Sent for a new or updated notification.
  - Ongoing, silent and group-summary notifications, and the phone's own PinchDrop notifications, are not sent.
  - `icon` is the app's icon as `data:image/png;base64,…` (≤ 16 KB). It's sent the first time that app appears in a session.
- `notif.removed` `{ key }`: the notification was cleared on the phone.
- `notif.sync` `{ items: [ notif.posted payloads ] }`: everything currently showing, sent on connect (up to 30).
- `sms.new` `{ threadId?, address, name?, body, date }`: a text message just arrived.

### Calls, unread texts, find my phone, clipboard (v2)

| Request (PC → phone) | `data` |
|---|---|
| `call.answer` / `call.reject` / `call.silence` `{ reqId }` | `{}`. Answers / ends / stops the ringing of the current call (needs "Calls on your PC") |
| `phone.ring` / `phone.ring.stop` `{ reqId }` | `{}`. Find my phone: loud alarm for up to 60 s |

Events from the phone:
- `call.state` `{ state, number?, name? }`, where `state` is one of:
  - `"ringing"`
  - `"active"`: answered
  - `"ended"`
  - `"missed"`: rang and stopped without being answered
- `status.messages` `{ unread }`: unread SMS count. Sent on connect and whenever it changes.
- `clip.set` `{ text }`: text copied on the phone. Only sent while sharing is on, and only when PinchDrop is opened, because Android blocks reading the clipboard in the background.

Events from the PC (no reply):
- `clip.config` `{ enabled }`: sent after `welcome` and whenever the setting changes.
- `clip.set` `{ text }`: text copied on the PC (≤ 100 000 characters), sent only while sharing is on.

### Several phones and tablets (v2)
- `hold.offer` goes to **every** connected device. The first `hold.catch` wins; the others get `hold.cancel` `{ reason: "caught_elsewhere" }`.
- A send aimed at one device (a device chip on the PC, or the Send screen) goes only to that device.

### More from the phone (v2.1)

| Message | Direction | Payload | Notes |
|---|---|---|---|
| `call.state` | phone → PC | adds `app` | Who's calling through an app (WhatsApp, Instagram, Messenger…). `null` means a SIM call. App calls are seen from their call notification; `call.answer` / `call.reject` press that notification's own buttons. |
| `notif.posted` | phone → PC | adds `kind` | One of `"sms" \| "message" \| "other"`. It picks the PC's sound. A code in an `sms` notification is copied to the PC clipboard (OTP). |
| `media.state` | phone → PC | `{ app, title, artist, art?, playing }` | Now playing. An empty `title` means nothing is playing. `art` is a JPEG data URL of at most 48 KB. |
| `media.cmd` | PC → phone, request | `{ reqId, action }` | `action` is one of `"play" \| "pause" \| "toggle" \| "next" \| "previous"`. |
| `location` | phone → PC | `{ lat, lon, accuracy, time }` | About once a minute while connected. The PC keeps the last one per phone (`places.json`). |
| `photos.recent` | PC → phone, request | `{ reqId, limit ≤ 24 }` | Returns `{ photos: [ { id, name, date, size, thumb } ] }`, newest first. |
| `photos.send` | PC → phone, request | `{ reqId, id }` | The phone sends that photo as a lift with `sendNow: true` (§6.5). |
| `clip.set` | phone → PC | adds `explicit` | `true` when the user tapped the phone's "Copy to PC" tile. The PC takes it even with clipboard sharing switched off. |

The PC also emits a battery alert when a phone's `status` crosses 15 % or 5 % unplugged, or reaches 100 % while charging.

## 6.7 Fast mode (v2)
- `welcome` carries `caps: ["chunk2m"]`. A phone that sees it may ask for chunks of up to **2 MiB** (`length ≤ 2097152`) and keep up to **6** requests in flight.
- PCs without `caps` stay at 512 KiB / 4.
- Lifts (§6.5) keep 512 KiB.

## 6.8 Laptop ↔ laptop (v2)

Every PC is a LINK-v1 server. To pair two PCs, PC **B** connects to PC **A** as a client, exactly like a phone:
1. B finds A through mDNS (the `fp` TXT value is pinned).
2. B sends `pair.request` `{ nonce, phone: { name: <B's name>, model: "Windows PC" } }` while A's pairing window is open.
3. Both PCs show the §5 code. B's user confirms (`pair.confirm`) and A's user presses Pair (`pair.accept`).
4. B stores A's `pcId`, fingerprint, `deviceId`, secret and last address, and reconnects with `auth` like a phone.

That single connection carries both directions:
- **A → B** works as with a phone: `hold.offer` → `hold.catch` → `push.offer` (accepted automatically) → `chunk.req` (up to 2 MiB, §6.7).
  - B keeps the files' folders, with every path part cleaned, under `Downloads\PinchDrop`.
  - B sends `file.done` for each file and `transfer.complete` at the end.
- **B → A** uses lifts (§6.5):
  - B's hold, or a direct send, goes to A as `lift.offer`. File `name`s may contain `/` folders, which A cleans the same way.
  - A catches it (`lift.catch`) and pulls with `lift.req`. B serves only the files of that lift.
  - When a lift is caught on A, B's own phones get `hold.cancel` `{ reason: "caught_elsewhere" }`. When a phone catches first, A gets `lift.cancel`.
- B sends `status` `{ name, model: "Windows PC", battery, charging, network }`, with the laptop battery if it has one.
- B answers phone-only requests with `phone.reply` `{ ok: false, error: "unknown" }`. A never sends them to a PC: texts, contacts and calls go to a phone.
- `unpair` from either side removes the pairing on both.

## 7. Storage

| Where | What |
|---|---|
| PC `link_identity.json` (app config folder) | `pcId`, certificate DER and PKCS#8 private key DER (both base64) |
| PC `devices.json` | Paired phones: `id`, `name`, `model`, `secret`, `pairedAt`, `lastSeen` |
| Phone (app-private DataStore, backups off) | Paired PC: `pcId`, `name`, `fingerprint`, `deviceId`, `secret`, last host and port |
| PC `transfers.json` | The last 200 sends: item names, sizes, state. Paths are kept only until the transfer finishes. |
| Phone `received.json` (app-private) | The last 500 received items: name, size, where it was saved (content URI), time, sending PC; unfinished transfers with their byte offset |

Both files stay on the device and are never uploaded. Unpairing deletes the entry on both sides; resetting the app deletes all entries.
