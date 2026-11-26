# PinchDrop Pro: the plan (not built yet)

Status: ⚪ planned, 2026-11-26. Nothing here is implemented. Prices are a starting point to test.

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

## 9. "PinchDrop Huddle": the hackathon idea

**The problem:** at a hackathon 4 people sit at one table, and code moves through WhatsApp ("bhai paste kar de"), screenshots, half-finished GitHub pushes and pen drives. Venue Wi-Fi is overloaded or blocks devices from seeing each other. Nobody has time to set up Live Share or explain git rebase at 3 a.m.

**The idea:** Huddle turns the laptops at one table into an offline team mesh, driven by gestures and aware of code.

1. **Start a huddle in 5 seconds.** One laptop shows a 4-digit code (or a QR); teammates type it. The laptops link directly: Wi-Fi Direct or one laptop's hotspot, so no venue Wi-Fi or internet is needed.
2. **The table map.** Each laptop plays a short, silent, ultrasonic chirp; the others hear it and work out who sits where (left, right, across). The pill then shows teammates in their real positions.
3. **Throw code at a teammate.** Select code in your editor, pinch, and flick towards where that person sits. It lands at the cursor in their VS Code (a small extension), as a suggestion they accept with Tab, not a paste that breaks their file.
4. **Hand over your work, not a file: "git beam".** Pinch your branch. Huddle packs your uncommitted changes plus local commits into a patch. The teammate's PinchDrop checks whether it applies cleanly to their code, then applies it in a new git worktree so their work is untouched. No push, no internet, no merge panic.
5. **Share your running app.** Pinch the `localhost:3000` tab. Every teammate gets it open in their browser through the local link: like ngrok, but offline and instant. Perfect for "check my frontend" and for judges' demos.
6. **Team shelf.** Anything dropped on the shelf (API keys, .env lines, links, designs, error messages) is visible to the team. Secrets are blurred until clicked and wiped when the huddle ends.
7. **Error beam.** Two-hand frame a stack trace on your screen; it drops onto the teammate who owns that part of the code.
8. **Judging mode.** One gesture puts the demo laptop's screen on every teammate's screen (or on the judges' laptop) for the pitch.

**Why it doesn't exist yet:** existing tools solve one slice and need internet or accounts:
- Live Share and Tuple: remote pairing.
- LocalSend and AirDrop: generic files, not code.
- GitHub: needs a push and a working internet connection.
- ngrok: internet tunnel.

As far as we know, none combines offline team links, spatial "where is my teammate", gesture throws, and payloads that understand git and localhost.

**Business:** free for up to 4 laptops per huddle (spreads through hackathons, colleges and college clubs); Pro or "Huddle for Teams" for bigger groups and organisers. Sponsoring hackathons with it gets PinchDrop in front of thousands of developers.

**What we already have that makes it feasible:** local discovery and pairing, PC ↔ PC links (v2), hand gestures, the pill, transfers with progress. Missing pieces:
- the VS Code extension
- git patch packing and applying
- the localhost relay
- ultrasonic seat mapping
- a quick-join flow for huddles
