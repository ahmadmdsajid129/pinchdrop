# Launch guide: everything you do before PinchDrop goes on sale

All of it is free except the Google Play developer account ($25, once). The code is done. These steps are the accounts and settings only you can create. When a step says **send me**, paste the values in chat and I'll wire them in, commit and push.

**Order:** 0 → 1 → 2 → 3 → 4, then 5 and 6 in any order (start 6 early: Play makes new accounts wait 14 days).

The finished installers are in **`E:\Pinch Drop\release\`** (not in git): `PinchDrop_2.0.0_x64-setup.exe`, `PinchDrop.apk` (website version, everything included) and `PinchDrop-play-release.aab` (for Google Play).

---

## 0. Back up your secret keys (do this first, 5 minutes)

Everything secret lives in **`C:\Users\HP\.pinchdrop\`**. It is never in the repo (the repo is public). Copy the **whole folder** to:
1. a pen drive you keep at home, and
2. a private cloud folder (Google Drive / OneDrive), or a password manager's file attachments.

| File | What it does | If you lose it |
|---|---|---|
| `license-signing-key.pem` | Makes Pro licence keys (used by the licence service) | Keys made with a new one don't work in installed apps |
| `updater.key` | Signs app updates | Installed PCs can never auto-update again |
| `updater-password.txt` | Password for `updater.key` | Same as above |
| `updater.key.pub` | Public half (also inside the app) | Nothing serious |
| `pinchdrop-release.jks` | Signs the phone app | You can't update the website APK; on Play you'd have to ask Google to reset your upload key |
| `keystore.properties` | Password and alias for the `.jks` | Same as above |

Also save somewhere safe:
- **GitHub 2FA recovery codes** (github.com → Settings → Password and authentication).
- Your logins for Dodo Payments, Cloudflare, Microsoft Partner Center and Google Play Console.

Never paste any of these files into chat, email, GitHub issues or the repo.

---

## 1. Website (already live)

**https://ahmadmdsajid129.github.io/pinchdrop/**: pricing, downloads, Privacy, Terms, Refunds and the thank-you page. Every push that changes `site/` republishes it. Nothing to do.

---

## 2. Payments: Dodo Payments (free; about 4% + $0.40 per sale)

Dodo is the *merchant of record*: it takes the payment, handles tax and invoices worldwide, pays out to your Indian bank account, and emails the buyer a licence key.

1. Sign up at **dodopayments.com**.
   - Business type: **Individual**, country **India**.
   - **Website:** `https://ahmadmdsajid129.github.io/pinchdrop/`
   - Product category: software / digital downloads.
   - Verification: PAN, ID proof and the bank account for payouts.
2. Switch the dashboard to **Test mode** first.
3. **Products → Create product**, three times:

   | Name | Type | Price |
   |---|---|---|
   | PinchDrop Pro Lifetime | One-time payment | $29 |
   | PinchDrop Pro Yearly | Subscription, every 1 year | $19 |
   | PinchDrop Pro Monthly | Subscription, every 1 month | $2.99 |

   *(Optional, later)* **PinchDrop Pro Family**: one-time $59, licence activation limit **5** (5 PCs). The licence service already understands it once you send me its product ID.
4. On **each** product:
   - Turn on **License keys**: **activation limit 2** (5 for Family), **expiry: none** (subscription keys stop working when the subscription ends).
   - **Redirect / return URL:** `https://ahmadmdsajid129.github.io/pinchdrop/thanks.html`
5. Copy each product's **payment link** and **product ID** (starts with `pdt_`). **Send me both** (test ones first). I put the links on the Buy page and the IDs in the licence service.
6. Buy once with Dodo's test card (shown in their docs). You should land on the thank-you page with a key, press **Open in PinchDrop**, then **Activate**.
7. When that works, switch to **Live mode**, create the same products, and **send me the live links and IDs**.

---

## 3. Licence service: Cloudflare Workers (free)

It turns a Dodo key into a PinchDrop key that works offline.

1. Sign up at **cloudflare.com** (free plan). Open **Workers & Pages**. When it asks for your **workers.dev subdomain**, type `ahmadmdsajid129`. (If you choose another name, send it to me.)
2. In PowerShell, one at a time:
   ```powershell
   cd "E:\Pinch Drop\cloud\licence-worker"
   ```
   ```powershell
   npx wrangler login
   ```
   (a browser opens; press **Allow**)
   ```powershell
   Get-Content "$env:USERPROFILE\.pinchdrop\license-signing-key.pem" -Raw | npx wrangler secret put PD_SIGNING_KEY
   ```
3. After I've added your product IDs (step 2.5):
   ```powershell
   npx wrangler deploy
   ```
   It prints `https://pinchdrop-licence.ahmadmdsajid129.workers.dev`. Done.
4. While testing with Dodo **test mode**, tell me and I'll point the service at Dodo's test server; I switch it back for live.

---

## 4. GitHub secrets (automatic releases and updates)

**github.com/ahmadmdsajid129/pinchdrop → Settings → Secrets and variables → Actions → New repository secret.** Add these 6. Each command copies the value to your clipboard; paste it into the **Secret** box.

| Name | Copy the value with |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | `Get-Content "$env:USERPROFILE\.pinchdrop\updater.key" -Raw \| Set-Clipboard` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | `Get-Content "$env:USERPROFILE\.pinchdrop\updater-password.txt" -Raw \| Set-Clipboard` |
| `ANDROID_KEYSTORE_BASE64` | `[Convert]::ToBase64String([IO.File]::ReadAllBytes("$env:USERPROFILE\.pinchdrop\pinchdrop-release.jks")) \| Set-Clipboard` |
| `ANDROID_KEYSTORE_PASSWORD` | what comes after `storePassword=` in `keystore.properties` |
| `ANDROID_KEY_PASSWORD` | what comes after `keyPassword=` |
| `ANDROID_KEY_ALIAS` | type `pinchdrop` |

Then tell me **"release it"**. I push the tag `v2.0.0`; GitHub builds the installer and the APK, publishes them on the Releases page, and from then on every installed PinchDrop offers new versions by itself.

---

## 5. Microsoft Store (free for individuals; removes the "Unknown publisher" warning)

1. Sign up at **partner.microsoft.com** → *Windows & Xbox* → **Individual developer**. Complete the ID check.
2. **Apps and games → New product → MSIX or PWA app** → reserve the name **PinchDrop**.
3. **Product management → Product identity.** **Send me** these three:
   - `Package/Identity/Name`
   - `Package/Identity/Publisher` (starts with `CN=`)
   - `Package/Properties/PublisherDisplayName`

   I build `PinchDrop.msix` with them.
4. Fill in the submission:
   - **Pricing:** Free, all markets.
   - **Properties:** category **Productivity**; privacy policy `https://ahmadmdsajid129.github.io/pinchdrop/privacy.html`; website `https://ahmadmdsajid129.github.io/pinchdrop/`.
   - **Age ratings:** answer the questionnaire (no violence, no chat with strangers; usually 3+ / Everyone).
   - **Packages:** upload `PinchDrop.msix`.
   - **Store listing:** text from `docs/store-listing.md`, at least 1 screenshot (1366×768 or bigger; Home, Pro, Pill Studio and Huddle are good).
   - **Submission options → restricted capabilities:** it asks why the app needs **runFullTrust**. Paste:
     > PinchDrop is a desktop app built with Tauri. It needs full trust to run its floating window above other apps, read the files selected in File Explorer when the user grabs them, send files over the local network to the user's own phone, and use the webcam for hand-gesture control (frames are processed in memory only).
5. **Submit.** Review usually takes 1–3 days.

Store version differences: start-with-Windows is set in Windows Settings → Apps → Startup, and **Send to → PinchDrop** in Explorer isn't available.

---

## 6. Google Play ($25 once)

1. **play.google.com/console** → create a **Personal** developer account, pay $25, verify your ID and phone.
2. **Important:** new personal accounts must run a **closed test with at least 12 testers for 14 days in a row** before Google lets the app go public. Collect 12+ friends' Gmail addresses now.
3. **Create app** → name **PinchDrop**, App, Free.
4. **Testing → Closed testing → Create track** → add the testers' emails → upload **`PinchDrop-play-release.aab`** (from `release\`). Play App Signing: accept Google's default.
5. Fill in **App content**, using `docs/play-store.md`:
   - Privacy policy: `https://ahmadmdsajid129.github.io/pinchdrop/privacy.html`
   - Ads: **No**
   - App access: no login needed
   - Content rating questionnaire
   - Target audience: 13+
   - Data safety: the answers in `docs/play-store.md`
   - Foreground service: "Connected device"; explain it keeps the link to the user's own PC. Google may ask for a short screen recording.
6. Send the testers the opt-in link. After 14 days: **Production → Apply for production access**.

The Play version leaves out SMS, call history, all-files access and background location (Google only allows those for certain app types). The **website APK** has everything.

---

## 7. Demo video
`docs/demo-video.md`: a 30-second shot list you can film with your phone, and free editors.

---

## Checklist

- [ ] 0. Backed up `C:\Users\HP\.pinchdrop\` (pen drive + private cloud) and GitHub recovery codes
- [ ] 2. Dodo account verified
- [ ] 2. Test products made → sent me links + IDs
- [ ] 3. Cloudflare: signed up, `wrangler login`, `secret put PD_SIGNING_KEY`, `deploy`
- [ ] 2. Test purchase works end to end
- [ ] 2. Live products made → sent me links + IDs → I update, you `wrangler deploy` again
- [ ] 4. 6 GitHub secrets added → told me "release it"
- [ ] 5. Partner Center → sent me the 3 identity values → uploaded the MSIX → submitted
- [ ] 6. Play account → 12 testers → closed test running → production after 14 days
- [ ] 7. Demo video filmed

## How buying works for a customer
1. In PinchDrop they click **Get Pro** → the website's pricing opens.
2. They pay on Dodo's checkout.
3. The thank-you page shows the key with **Open in PinchDrop** and **Copy key**; Dodo also emails it.
4. **Open in PinchDrop** opens the app's Pro page with the key filled in → they press **Activate**.
