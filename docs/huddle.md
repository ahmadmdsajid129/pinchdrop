# PinchDrop Huddle

Status: built (2026-11-26). Code: `apps/desktop/src-tauri/src/huddle.rs`, `apps/desktop/src/app/screens/Huddle.tsx`.

The laptops at one table, connected in one click. Teammates appear as faces (on the Huddle page and on the pill). Drag files onto a face, copy code and press Paste on a face, drop a project folder to send its changed files, or share a running localhost app. No internet, no accounts, no gestures.

## Flow
1. **Start:** sidebar → Huddle → *Start a huddle*. It's announced on the Wi-Fi as mDNS `_pdhuddle._tcp` (TXT: `hid`, `name`, `host`, `n`).
2. **Join:** teammates see it under *Huddles on this Wi-Fi* and click *Join*. The host's PinchDrop window opens with "<name> wants to join" and a 4-digit code; the teammate's screen shows the same code. The host clicks *Allow*.
3. **Mesh:** the host's `welcome` carries the huddle key and the member list. The newcomer connects to every member directly and proves membership. The host tells existing members with `joined`.
4. **Leave / end:** *Leave* (or *End huddle* for the host) sends `bye`, closes everything and wipes the shelf and inbox.
5. **Reconnect:** a connection that drops without `bye` keeps the teammate (greyed out, "Reconnecting…"). The laptop that opened that connection redials every 2–15 s with a fresh key exchange and a `member` proof. After 2 minutes without them they're removed.

## Join codes and the hotspot fallback
- Every huddle has an 8-character join code (`KX7Q-49MZ`; no 0/O/1/I/L), shown on the Huddle page and in its announcement (TXT `code`). The server prefers port **47700**.
- **Join with a code:** first looks for that code on the current Wi-Fi. If it isn't visible (Wi-Fi that keeps laptops apart), it connects to the host's hotspot `PinchDrop-<first 4>` (password `pinchdrop-<code>`): it adds a Wi-Fi profile, connects, then finds the huddle there (discovery, or the hotspot's fixed address `192.168.137.1:47700`). Leaving deletes the profile and reconnects to the Wi-Fi it was on.
- **Host: "Team can't see it? Share a hotspot":** turns on Windows' Mobile Hotspot with that name and password (the laptop must be online). The previous hotspot name and password are put back when it's turned off or the huddle ends.

Free huddles hold up to 4 laptops (`FREE_MAX_LAPTOPS`); more need PinchDrop Pro on the host.

## Wire format
- WebSocket over TCP, on a random port per laptop.
- **Handshake:** each side sends `PDH1` followed by its 32-byte X25519 public key. HKDF-SHA256 (salt `pinchdrop-huddle-v1`) of the shared secret gives:
  - `c2s` and `s2c`: ChaCha20-Poly1305 keys, one per direction
  - `bind`: 32 bytes
  - the 4-digit check code: the first 4 bytes of `bind`, as a big-endian number mod 10000
- **Frames:** a 12-byte nonce (bytes 4–11 are a counter that must increase), followed by the ciphertext and its tag. The plaintext is JSON.
- **First message:**
  - `join {name, port}`: the host asks its user.
  - or `member {hid, id, name, color, port, proof}`, where `proof` = HMAC-SHA256(huddle key, `hid|id|bind`). It's bound to this connection.

## Messages
| `t` | What |
|---|---|
| `welcome` / `denied` | Host's answer to `join` |
| `joined` / `bye` | Member list changes |
| `text {text, all}` | Code or text. It lands on the receiver's clipboard and the shelf |
| `files {id, kind: files\|changes, label, repo, items[{path,size,status}]}` → `chunk {id,i,off,data}`… → `end {id}` | Files go to `Downloads\PinchDrop\Huddle\<from>`. Changes wait in the inbox for *Accept* |
| `url {url, label}` | A shared running app. The receiver's browser opens it |
| `pull` | "Get <name>'s latest": they send changes from the project they last shared |
| `note {text}` | A short message |

## Safety
- **Incoming paths:** must be plain relative paths, with no `..`, drive letters or absolute paths. They never land outside the target folder.
- **Accepting changes:**
  - A file you've also changed (per `git status`) that differs from theirs is shown side by side, and you pick a version.
  - Deleted files go to the Recycle Bin.
  - The project's location is remembered in `huddle-projects.json`.
- **Shared localhost apps:** the forwarder listens on a random port and accepts connections only from huddle members' IPs.
- **Size:** up to 500 MB per drop.
- **Shelf:** text that looks like a key or password is blurred until clicked.

## Not yet
- dropping files onto the faces on the pill (clicking a face sends your clipboard)
- moving the host role when the host leaves
- following a teammate whose address changed while they were away (they rejoin)
