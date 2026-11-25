# Network Protocol Specification · `docs/protocol.md`

![](assets/banner-protocol.svg)

| Attribute | Specification |
|---|---|
| **Status** | 🟢 Locked Specification |
| **Owner** | Lead Systems Architect |
| **Last Updated** | 2026-11-24 |
| **Source of Truth For** | WebSocket JSON envelopes, HTTP chunk transfer, and sync handshakes |

> [!NOTE]
> All local network communication is encrypted over **TLS 1.3** using self-signed device certificates pinned during QR pairing.

---

## 1. Canonical Message Envelope

All control, stage synchronization, and transfer coordination messages use a standardized JSON envelope:

```json
{
  "v": 1,
  "id": "msg_01JB3D4Z9X8Y",
  "type": "hold.set",
  "ts": 1732438800000,
  "payload": {}
}
```

- `v` *(integer)*: Protocol version. Must be `1`.
- `id` *(string)*: Unique ULID or UUIDv4 message identifier.
- `type` *(string)*: Message action type.
- `ts` *(integer)*: Millisecond Unix epoch timestamp.
- `payload` *(object)*: Action-specific typed payload.

---

## 2. Core Message Types

### 2.1 Handshake & Pairing

> **Implemented in P3 as [Link v1](../packages/protocol/LINK-v1.md)** — that spec is the source of truth for discovery, pairing, the 6-digit code, reconnect proofs and `status`. The list below is the original outline.
- `hello`: Client initiates connection with device identity and protocol version.
- `pair.begin`: Transmits ephemeral secret and public key.
- `pair.confirm`: Confirms certificate fingerprint storage.
- `ping` / `pong`: Heartbeat validation every 15 seconds.

### 2.2 Stage Tray & Quick Catch (Grab → Catch)
- `hold.set`: Phone grabs item (Share Target or Quick Settings tile). Contains lightweight thumbnail base64 and metadata. PC transitions to ARMED state.
- `hold.clear`: Dispatches when item is caught, dismissed, or expired.
- `stage.add`: Appends un-caught item into persistent PC Stage Tray.
- `stage.remove`: Removes item from Stage Tray.
- `peek.list`: PC requests recent photo metadata from phone.
- `peek.thumb`: Phone returns thumbnail for PC browsing.

### 2.3 Transfer Coordination
- `pull`: PC requests phone to stream a held item to a designated target folder.
- `push.offer`: PC offers file or batch to paired phone.
- `push.accept`: Phone confirms ready to receive and designates storage target.
- `transfer.progress`: Real-time byte progress, transfer rate, and ETA.
- `transfer.complete`: Transfer verification with BLAKE3 cryptographic digest.
- `transfer.error`: Error codes with retry capability.

### 2.4 Air Clipboard & Remote Open
- `clipboard.push`: Sends text or URL to update remote system clipboard.
- `open.request`: Triggers remote opening of URL or document on other device.

---

## 3. Data Transfer: HTTP/1.1 Range Streaming

File data is transferred over authenticated HTTP/1.1 with support for chunked range requests:

```http
GET /api/v1/transfers/{transferId}/chunks/{chunkIndex} HTTP/1.1
Host: 192.168.1.105:49152
Authorization: Bearer {transferToken}
Range: bytes=1048576-2097151
```

### Resume & Verification Algorithm
1. File is partitioned into **1 MB to 4 MB chunks**.
2. Each chunk is hashed via **BLAKE3**.
3. Receiver validates chunk hashes sequentially.
4. On network interruption (e.g. Wi-Fi drop), receiver queries `GET /api/v1/transfers/{transferId}/status` to identify verified chunks and resumes seamlessly.

---

[← Prev: gestures.md](gestures.md) · [Index](../README.md) · [Next: security-privacy.md →](security-privacy.md)
