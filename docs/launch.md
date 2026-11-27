# Launch checklist: selling PinchDrop Pro

Everything here is free except the Google Play developer account ($25, one time). The code is ready; these are the accounts and settings only you can create. When a step says "send me", paste the values in chat and I'll wire them in.

Your private keys live in `%USERPROFILE%\.pinchdrop\` (never in the repo). **Back up that whole folder privately** (pen drive and/or a password manager):

| File | What it does | If lost |
|---|---|---|
| `license-signing-key.pem` | Makes Pro licence keys | New keys stop matching the app |
| `updater.key` + `updater-password.txt` | Signs app updates | Installed apps can't update any more |
| `pinchdrop-release.jks` + `keystore.properties` | Signs the phone app | You can't update the app on Play or the website |

---

## 1. Website and Buy page (GitHub Pages, free)
1. On GitHub: **pinchdrop repo → Settings → Pages → Source: GitHub Actions**.
2. That's all. Every push that changes `site/` publishes **https://ahmadmdsajid129.github.io/pinchdrop/**. The app's **Get Pro** button opens its Pro section.

## 2. Payments (Lemon Squeezy, free; they take a cut per sale)
1. Sign up at lemonsqueezy.com and create a store. Add your payout details (bank account).
2. Create one product, **PinchDrop Pro**, with 3 variants:
   - **Lifetime**: single payment, $29
   - **Yearly**: subscription, $19 / year
   - **Monthly**: subscription, $2.99 / month
3. In the product, turn on **License keys** with an **activation limit of 2** (two PCs per key). Leave the length unlimited: subscriptions keep their key active while paid.
4. **Send me:**
   - the 3 checkout links (product → Share)
   - your **Store ID** (Settings → Stores)
   - the 3 **variant IDs** (each variant's ID number)

   I put the links on the Buy page (`site/config.js`) and the IDs in the licence service.

Buyers get their licence key by email from Lemon Squeezy automatically. They paste it in **PinchDrop → Pro → Activate**.

## 3. Licence service (Cloudflare Workers, free)
This is what turns a Lemon Squeezy key into a PinchDrop key that works offline. The code is in `cloud/licence-worker`.
1. Sign up at cloudflare.com (free plan). When asked for a **workers.dev subdomain**, choose `ahmadmdsajid129`. Then the app's address `https://pinchdrop-licence.ahmadmdsajid129.workers.dev/redeem` is already right. If you pick another name, send it to me.
2. In a terminal:
   ```powershell
   cd "E:\Pinch Drop\cloud\licence-worker"
   npx wrangler login
   npx wrangler secret put PD_SIGNING_KEY
   ```
   When it asks, paste the text **between** the `BEGIN` and `END` lines of `%USERPROFILE%\.pinchdrop\license-signing-key.pem`.
3. After I've added your Lemon Squeezy IDs to `wrangler.toml`, run `npx wrangler deploy`.

## 4. Automatic updates (GitHub Releases, free)
1. **repo → Settings → Secrets and variables → Actions → New repository secret**, twice:
   - `TAURI_SIGNING_PRIVATE_KEY`: the full contents of `%USERPROFILE%\.pinchdrop\updater.key`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: the contents of `updater-password.txt`
2. To release a new version:
   - raise the version in `apps/desktop/src-tauri/tauri.conf.json` (I do this)
   - push a tag like `v2.0.1`
   - GitHub builds the installer, publishes the release, and every installed PinchDrop offers the update

## 5. Phone app signing (for the release workflow)
Add 4 more repository secrets:
- `ANDROID_KEYSTORE_BASE64`: run this, then paste the output:
  ```powershell
  [Convert]::ToBase64String([IO.File]::ReadAllBytes("$env:USERPROFILE\.pinchdrop\pinchdrop-release.jks"))
  ```
- `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_PASSWORD`: the password in `keystore.properties` (both are the same)
- `ANDROID_KEY_ALIAS`: `pinchdrop`

## 6. Microsoft Store (free for individuals; removes "Unknown publisher")
1. Sign up at **partner.microsoft.com** as an *individual developer* (free).
2. **Create a new app** and reserve the name **PinchDrop**.
3. Open **Product management → Product identity** and copy three values into `apps/desktop/store/identity.json`:
   - `Package/Identity/Name`
   - `Package/Identity/Publisher` (starts with `CN=`)
   - `Package/Properties/PublisherDisplayName`

   Or send them to me.
4. Run:
   ```powershell
   powershell -ExecutionPolicy Bypass -File "E:\Pinch Drop\apps\desktop\store\build-msix.ps1"
   ```
   This makes `apps\desktop\store\PinchDrop.msix`. Upload it under **Packages**, fill in the listing (text in `docs/store-listing.md`) and submit. The Store signs it and keeps it updated.

   **Store version differences:**
   - "Start with Windows" is controlled in Windows Settings → Apps → Startup.
   - **Send to → PinchDrop** in Explorer isn't available (Windows keeps Store apps out of the Send To menu).

## 7. Google Play ($25 once)
1. Create a developer account at **play.google.com/console**.
2. Create the app **PinchDrop**.
3. Upload the **Play bundle**: `PinchDrop-play-release.aab`, from the release workflow's artifacts, or built locally in `apps/android/app/build/outputs/bundle/playRelease/`.
4. Fill in the store listing, Data safety and permission answers from `docs/play-store.md`.

The Play version leaves out text messages, call history, all-files access and background location, because Google only allows those for certain kinds of app. The full app with everything is the **website APK**.

## 8. Demo video
See `docs/demo-video.md`: a 30-second shot list you can film with your phone, and free tools to edit it.
