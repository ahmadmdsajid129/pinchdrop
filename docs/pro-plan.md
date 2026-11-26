# PinchDrop Pro: the plan (not built yet)

Status: step 1 built (2026-11-26): licence keys, 7-day trial, Pro gating on the PC (§1 table), Pro page, upgrade prompt, lock screens. Step 2 built (2026-11-26): Pill Studio v1 (sidebar → Pill Studio): Aurora, Liquid Glass, Neon Tokyo, Cassette, each reacting to idle / ringing / music / sending; Pill, Soft and Notch shapes; a clock on the pill; live preview with moods, Island view and wallpapers. Step 3 built (2026-11-26): send/receive animation packs Paper Plane, Portal, Comet (§3) in Pill Studio, with "Play on my screen"; the phone plays the matching arrival (LINK-v1 §6.1 `fx`). Step 4 built (2026-11-26): Black Hole, Origami, Pixel Beam, Ink Drop, Liquid; a synthesized sound per pack on the PC (follows Settings → Gestures → Sounds) and a matching vibration + sound on the phone (follows its Arrival sound / Vibrate settings); phone → PC: the PC plays the pack's arrival in the middle of the screen, and the phone plays its send-away (the arrival in reverse). `lift.catch` carries `fx`. Still planned from §2: widget slots beyond the clock, edge lighting, schedules, per-phone colours, theme sharing, festival drops. Prices are a starting point to test.

**How keys work:** `pnpm license --name "Asha" --plan lifetime|year|month` prints a key, signed with the private key in `%USERPROFILE%\.pinchdrop\license-signing-key.pem` (never in the repo; back it up privately). The buyer pastes it into PinchDrop → Pro. The Buy button appears once `BUY_URL` in `apps/desktop/src/shared/pro.ts` is set. Not gated yet: the phone app's own extras (Scan to PC); the PC gates everything that shows on the PC.

## 1. Free vs Pro

| | Free | Pro |
|---|---|---|
| Send PC → phone and phone → PC (pinch, drag, Send to) | ✅ | ✅ |
| Phones | 1 | Unlimited, plus phone → phone drag |
| Notifications on the PC | ✅ view and dismiss | ✅ plus reply |
| Messages (SMS) | Read | Read and reply |
| Calls on the PC | See who's calling | Answer, reject, silence by click or gesture |
| Phone files page, Explorer → phone folder drops | ❌ | ✅ |
| OTP copy, Now Playing, photo strip, Scan to PC, Find my phones map | ❌ | ✅ |
| Transfer size | 2 GB per send | Unlimited |
| Speed | Standard | Turbo modes (§5) |
| Pill themes, send/receive animations, sound packs | 2 built-in looks | Full Studio and every pack (§2–4) |
| Custom gestures | ❌ | ✅ (§4) |

**Price (India):** ₹99/month, ₹799/year or ₹1,499 lifetime. **Abroad:** $2.99/month, $19/year or $29 lifetime.
**Family:** 5 PCs and 10 phones, ₹2,499 lifetime. **Teams / schools:** per seat per year (§7).

**Licence without an account:** a licence key is a signed token (Ed25519) checked offline on the PC, which then unlocks the phone over the pairing. No login, no server needed after purchase, which fits "no cloud". Sell through Lemon Squeezy, Gumroad or Razorpay; later Microsoft Store and Play billing.

## 2. Pill Studio: the theme system people pay for

Goal: make the pill feel like Android's Always-On Display and Lock Screen editors, where the user builds a look they're proud of, not "pick a colour".

**What the user can change**
- **Shape:** pill, notch (fused to the top edge), orb, floating island, ticker bar (thin strip across the top), corner badge.
- **Material:** frosted glass, liquid glass (refracts what's behind it), brushed metal, matte paper, neon tube, OLED black.
- **Living background inside the pill:** slow aurora, flowing gradient mesh, particles, a waveform that reacts to the music playing on the phone, or a charge level that fills like liquid.
- **Slots (widgets):** clock, battery ring per phone, now-playing art, next calendar event, unread count, weather, network speed. Drag them in and out, left or right of the name.
- **Typography:** 6 curated font pairs, with weight and letter spacing.
- **Event looks:** separate looks for idle, ringing, receiving, holding and charging. For example, a ringing call pulses in the caller's contact colour.
- **Edge lighting:** a message or call lights up the edges of the screen in the app's colour, like Samsung's edge lighting. Works over full-screen apps.
- **Schedules:** a different theme by time of day, or automatically for meetings or games.
- **Per-phone identity:** each phone gets its own colour, icon and sound, so you know which phone it is from across the room.

**Our designed themes (made by us, launched in drops)**
| Theme | Idea |
|---|---|
| Aurora | Northern-lights gradient that drifts slowly; the colour shifts with battery level |
| Liquid Glass | Refractive glass with a soft specular highlight that follows the cursor |
| Neon Tokyo | Neon tube outline that flickers on, with a magenta and cyan glow |
| Terminal | Green-on-black monospace with a blinking cursor; notifications type themselves out |
| Paper & Ink | Off-white paper texture; text appears as ink bleeding in |
| Cassette | Retro tape deck; spools turn while music plays and a transfer runs |
| Orbit | Planets orbit the name, one per connected phone, sized by battery |
| Festival drops | Diwali diyas, Holi colour bursts, Eid moon, Christmas snow: limited-time, a reason to stay subscribed |

Quality bar: every theme is hand-tuned, built from our own SVG and shader work (no stock or AI-generated art), runs at 120 fps, and costs under 1% CPU when idle.
**Sharing:** export a theme as a small file or code and share it; later a community gallery.

## 3. Send and receive animations (matched pairs, PC ↔ phone)

| Pack | On the PC when sending | On the phone when receiving |
|---|---|---|
| Paper Plane | The file folds into a plane and flies off the screen edge | The plane lands and unfolds into the file |
| Portal | A swirling portal opens at the edge; the file is pulled in | A portal opens on the phone and the file drops out |
| Comet | The file streaks away with a glowing tail | A comet arcs in and bursts into the file |
| Black Hole | Pinching shrinks the file into a singularity | A white hole expands it back out |
| Origami | Folds into a crane | The crane flaps in and unfolds |
| Pixel Beam | Dissolves into pixels that stream up | Pixels rain down and assemble |
| Ink Drop | Drops into water like ink | Ink blooms into the file |
| Liquid | Pours out of the hand | Fills the phone screen like liquid, then settles |

Each pack comes with a matched sound and haptic pattern on the phone. Packs also change the catch ring and the progress bar.

## 4. Sound packs and gesture packs

**Sound packs:** Soft UI (default), Arcade, Sci-fi Console, Nature (water drop, birds), Mechanical (keyboard clacks), Lo-fi, Glass, Silent haptics only. Sounds can be chosen per phone and per event.

**Gesture packs and custom gestures**
- **Gesture Studio:** map any gesture to any action. For example, ✌️ takes a screenshot to the phone, 🤘 mutes the meeting, 👍 approves, ✊ locks the PC.
- **Record your own gesture:** do it 5 times; PinchDrop learns it on the device, using the hand-landmark shape plus movement over time. Nothing is uploaded.
- **Packs:** Presenter (next or previous slide, laser pointer), Media (volume dial by rotating the hand), Meeting (mute, camera off, raise hand), Gamer (push to talk), Accessibility (bigger, slower gestures with longer holds).

## 5. Speed tech (for the "fastest local transfer" marketing)

| Tech | What it does | Marketing line |
|---|---|---|
| **Head-start sending** | Starts sending the moment you pinch, before you drop. By the time your hand opens over the phone, much of it is already there; it's discarded if you cancel | "It's there before you let go." |
| **Wi-Fi Direct / hotspot link** | A direct phone ↔ PC link on 5 or 6 GHz that bypasses a slow or busy router. Falls back to normal Wi-Fi | "No router? No problem. Faster on bad Wi-Fi." |
| **Multipath** | Splits one transfer across Wi-Fi + Wi-Fi Direct + USB cable at the same time (when plugged in) | "Uses every path at once." |
| **QUIC + BBR** | Modern transport: faster start, holds up on lossy Wi-Fi, survives network switches without restarting | "Doesn't stall when the Wi-Fi hiccups." |
| **Smart compression** | Compresses text, code and documents on the fly (zstd); skips photos and videos | "Big folders, smaller sends." |
| **Delta sync** | Content-defined chunks: re-sending a changed file sends only the changed parts; files the phone already has are skipped | "Resend in a blink." |
| **Resume anywhere** | Already partly built (pause and resume); extend it across app restarts | |

Measure and publish honest numbers (for example, 1 GB folder on the same Wi-Fi: PinchDrop vs Quick Share vs LocalSend vs Phone Link).

## 6. Release basics (before charging)

- **Code signing (removes "Unknown publisher"):** see §8.
- Play Store listing (Messages and Call log need a permission declaration; or keep SMS features for the website APK only).
- Auto-update (Tauri updater with signed update files).
- A 30-second demo video of pinch → drop.

## 7. Teams, schools, hackathons (later)

Per-seat licence with central settings and an allow-list of folders. Hackathon / classroom mode: see the separate idea "PinchDrop Huddle" (§9).

## 8. Signing the Windows installer

Unsigned installers show "Windows protected your PC / Unknown publisher". Options:

1. **Microsoft Store (recommended first):** free to register as an individual developer. The Store signs and hosts the app and installs without any warning. Tauri can produce the package the Store needs.
2. **Azure Trusted Signing:** about $10/month, needs identity verification (individual eligibility depends on country; a registered business is the safe path). Tauri supports it through a sign command.
3. **Standard (OV) code-signing certificate:** for example Certum (has a low-cost individual option), Sectigo or SSL.com, about $70–300/year on a USB token or cloud HSM. It shows your name as publisher. SmartScreen still warns until downloads build reputation; EV certificates no longer skip that.

Once a certificate or Trusted Signing account exists, the build signs automatically (`bundle.windows.signCommand` or certificate thumbprint). The APK needs a release keystore for the Play Store.

## 9. "PinchDrop Huddle": the hackathon idea (no gestures, just drag and drop)

**One line:** your teammates appear as faces on the edge of your screen; drag anything onto a face and it lands in the right place on their laptop. No internet, no accounts, no WhatsApp.

**The problem:** at a hackathon, moving one code snippet takes about 30–60 seconds: open WhatsApp Web, find the group, paste, they copy, find the right file, paste, and fix the formatting WhatsApp broke. Sharing work in progress means commit → push → they pull → conflicts. Showing your running app means deploy it or set up ngrok. And the venue Wi-Fi is down half the time. A team does this 100+ times a night.

**How it works: 4 moves, nothing to learn**

| Move | What you do | What happens | Time saved |
|---|---|---|---|
| **1. Join** | Click "Start huddle". Teammates on the same Wi-Fi or hotspot see "Join Rahul's huddle?" and click Yes | Everyone's face appears on a strip at the screen edge | No group, no link, no sign-up |
| **2. Drop text or code** | Select code, drag it onto a face (or onto "Everyone") | It's on their clipboard with formatting intact; a small note says "From Rahul: 24 lines. Ctrl+V". Also saved on the team shelf | ~45 s → 2 s |
| **3. Drop your changes** | Drag your project folder onto a face | PinchDrop sends only the files you changed (it reads git). They see "Rahul changed 3 files: Accept" and one click puts them in place. If they also edited the same file, it shows both versions side by side | Commit, push, pull and fix conflicts: ~3 min → 10 s |
| **4. Drop your running app** | Drag your `localhost:3000` browser tab onto a face | Your app opens in their browser, running live from your laptop | Deploy or ngrok: ~5 min → 3 s |

**Plus**
- **Team shelf:** everything shared in the huddle, newest first and searchable. API keys and `.env` values are blurred until clicked. Everything is wiped when the huddle ends.
- **Ask for it:** click a teammate's face → "Get Rahul's latest" pulls their changed files without waiting for them.
- **Works without internet:** if the venue Wi-Fi blocks laptops from seeing each other, one laptop turns on a hotspot and the rest join it automatically.

**Why it's new:** Live Share and Tuple are for remote pairing and need accounts; LocalSend and AirDrop move plain files and don't understand code; GitHub needs a push and internet; ngrok needs internet. As far as we know, nothing gives a table of laptops "drag onto a face" sharing that understands code changes and running apps, offline.

**Business:** free for up to 4 laptops per huddle, which spreads it through hackathons and college clubs. Paid "Huddle for Teams" for bigger teams and organisers. Sponsoring hackathons puts it in front of thousands of developers.

**What we already have:** local discovery and pairing, PC ↔ PC links, transfers with progress, the pill (it becomes the face strip). To build: the huddle join flow, the clipboard drop, git-aware "changed files" sending with Accept, the localhost relay, the team shelf, hotspot fallback.
