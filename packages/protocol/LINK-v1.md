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

## 7. Storage

| Where | What |
|---|---|
| PC `link_identity.json` (app config folder) | `pcId`, certificate DER and PKCS#8 private key DER (both base64) |
| PC `devices.json` | Paired phones: `id`, `name`, `model`, `secret`, `pairedAt`, `lastSeen` |
| Phone (app-private DataStore, backups off) | Paired PC: `pcId`, `name`, `fingerprint`, `deviceId`, `secret`, last host and port |
| PC `transfers.json` | The last 200 sends: item names, sizes, state. Paths are kept only until the transfer finishes. |
| Phone `received.json` (app-private) | The last 500 received items: name, size, where it was saved (content URI), time, sending PC; unfinished transfers with their byte offset |

Both files stay on the device and are never uploaded. Unpairing deletes the entry on both sides; resetting the app deletes all entries.
