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

## 6. Storage

| Where | What |
|---|---|
| PC `link_identity.json` (app config folder) | `pcId`, certificate DER and PKCS#8 private key DER (both base64) |
| PC `devices.json` | Paired phones: `id`, `name`, `model`, `secret`, `pairedAt`, `lastSeen` |
| Phone (app-private DataStore, backups off) | Paired PC: `pcId`, `name`, `fingerprint`, `deviceId`, `secret`, last host and port |

Both files stay on the device and are never uploaded. Unpairing deletes the entry on both sides; resetting the app deletes all entries.
