# PinchDrop security review (pre-launch)

**Date:** 27 November 2026 · **Version:** 2.0.0 · **Scope:** Windows app, Android app, licence service, website.

This is an internal vulnerability assessment and penetration test (VAPT), done before launch: automated scans plus hands-on attacks against the real, installed app. It is **not** a certificate from an outside firm. When PinchDrop earns enough, a paid third-party pentest is worth doing (see the end).

## Summary

| Area | Test | Result |
|---|---|---|
| Secrets | Whole git history scanned for private keys, keystores, passwords, tokens | ✅ None. Only placeholders. All keys live in `%USERPROFILE%\.pinchdrop\` |
| Dependencies (JS) | `pnpm audit` (all packages) | ✅ 0 known vulnerabilities (15 in dev tools fixed by upgrading Vite and Vitest) |
| Dependencies (Rust) | `cargo audit` | ✅ 0 vulnerabilities. 6 warnings: 5 unmaintained libraries, 1 Linux-only (not in the Windows app) |
| Network surface | Ports the running app opens | ✅ 1 LAN port (47821, TLS) + Huddle's port only while a huddle runs; everything else is local-only |
| Phone link: pairing | Live attack: fake sign-in, unpaired requests, pairing while not pairing, junk, 5 MB message | ✅ All refused. **Fixed:** junk / unknown messages before sign-in now hang up; messages capped at 4 MB |
| Phone link: crypto | TLS, certificate pinning on the phone, HMAC sign-in | ✅ The phone trusts only the paired PC's certificate (SHA-256 pin); proofs checked in constant time; pairing needs a matching code on both screens |
| Huddle | Encryption and proofs | ✅ X25519 + ChaCha20-Poly1305 + check code. **Fixed:** member proof now compared in constant time; messages capped at 2 MB |
| Files | Path traversal (`..`, absolute paths) | ✅ Refused on both PC (`safe_join`, tested) and phone (whole offer refused) |
| Deep links | `pinchdrop://activate?key=` | ✅ Only key characters accepted; the key is only filled in (the user presses Activate) |
| Gesture actions | Can the page press arbitrary keys? | ✅ No: only 15 named actions exist in Rust; tests prove anything else is refused |
| WebView | Content security policy, permissions, devtools | ✅ Strict CSP (no remote scripts), minimal permissions, devtools off. **Fixed:** WebView remote debugging can no longer be switched on with an environment variable in release builds |
| Updates | Update integrity | ✅ Updates are signed (minisign) and checked before installing; downloaded over HTTPS |
| Licence keys | Forging | ✅ Ed25519 signatures; tests prove edited or self-signed keys are refused |
| Trial | Delete / edit the licence file, roll the clock back | **Fixed:** trial start is sealed to the PC (HMAC) and kept in the file **and** the registry; editing either ends the trial; the app never believes a clock earlier than the latest it has seen |
| Key sharing | Copying a PC's activated key to other PCs | **Fixed:** keys from the licence service now carry the PC's fingerprint and only work there; Dodo limits each purchase to 2 activations |
| Licence service | Malformed / oversized requests, wrong products | ✅ Refused before contacting Dodo; security headers; 16 automated flow tests |
| Website | XSS on the thank-you page, CSP | ✅ The key is shown as text only after a format check, then removed from the address bar; **added** a CSP to every page, no inline scripts |
| Android | Manifest review | ✅ Backup off; exported components need system-only permissions; file provider private; no cleartext traffic |

## Fixed during this review

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | High (revenue) | Deleting `license.json` restarted the 7-day trial; editing it gave an endless trial | Sealed trial anchor in file + registry; tamper ends the trial (`guard.rs`) |
| 2 | High (revenue) | An activated key could be copied to any number of PCs | Keys bound to the PC fingerprint (`guard.rs`, licence service) |
| 3 | Medium | Release app accepted `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port`, letting anyone flip Pro on in the page | Debugging flags stripped before any window opens (release builds) |
| 4 | Medium | Turning the PC clock back revived an ended trial or subscription | Latest-seen time kept and sealed |
| 5 | Low | Unauthenticated phone-link connections could send junk / 64 MB messages until timeout | Hang up on anything but pairing / sign-in; 4 MB cap |
| 6 | Low | Huddle member proof compared with `==` (timing) | Constant-time HMAC verify; 2 MB cap |
| 7 | Low | 15 advisories in development tools (Vite, Vitest) | Upgraded; audit clean |
| 8 | Low | Website had no content security policy | CSP on every page; inline script moved to a file |

## About cracking: what's realistic

No app that runs on the customer's own PC can be made uncrackable: Adobe, Microsoft and every game studio get cracked. The goal is to make it **not worth the effort**, and to make sure the parts that matter can't be faked:

- **Keys can't be forged:** only your private key can make them, and it never leaves `%USERPROFILE%\.pinchdrop\` and the Cloudflare secret.
- **The easy tricks are closed:** resetting or editing the trial, turning back the clock, sharing an activated key, attaching a debugger.
- **The Microsoft Store version** is signed by Microsoft; a modified copy won't install from the Store.
- **What's left** is someone rewriting the program itself (patching the `.exe`). That takes real skill, and the cracked copy then can't update itself (updates are signed).

### ⚠️ One decision for you: the source code is public
The GitHub repository `ahmadmdsajid129/pinchdrop` is **public**. Anyone can download the code, delete the Pro check and build their own unlocked PinchDrop. No in-app protection can stop that. The `LICENSE` file ("All rights reserved") makes it illegal, but not impossible.

**Recommended (free):** make the code repository private, and keep a small public repository just for the website and the downloads (GitHub Pages and the auto-updater need those to be public). Tell me and I'll set up the split; you click "Make private" on GitHub.

## Not covered (and when to do them)
- **Third-party pentest:** when revenue allows; send the tester this report.
- **Fuzzing** the link protocol for crashes; worth doing for a 2.1 release.
- **Malware already on the PC:** out of scope for any app (it can read the screen and the keyboard).
- **Your accounts:** turn on **2-factor sign-in** for GitHub, Dodo Payments, Cloudflare, Microsoft Partner Center and Google Play. An attacker in one of those can do far more damage than one in the app.

## Re-running the checks
```powershell
pnpm audit
```
```powershell
cd apps\desktop\src-tauri; cargo audit; cargo test
```
```powershell
cd cloud\licence-worker; npm test
```
