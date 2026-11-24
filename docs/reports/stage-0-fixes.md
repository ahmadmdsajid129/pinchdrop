# Stage 0 & 1 Fixes & Verification Report · `docs/reports/stage-0-fixes.md`

| Attribute | Specification |
|---|---|
| **Status** | 🟢 Resolved |
| **Date** | 2026-11-25 |
| **Author** | Lead AI Engineer |

## 1. Issue: Git Status Reporting Line-Ending Modifications Across Monorepo
- **Symptom:** `git status` showed all 38 files modified with a single trailing whitespace or line-ending discrepancy right after checkout.
- **Root Cause:** Git autocrlf converted LF to CRLF during checkout on Windows without matching `.gitattributes`.
- **Resolution:** Updated checkout index using `git checkout .`, restoring strictly normalized LF line endings in compliance with `.gitattributes` and `.editorconfig`.

## 2. Issue: Headless Chrome PDF Generation Sandbox Access
- **Symptom:** Initial PDF generation with headless browser exited with exit code `2147483651`.
- **Root Cause:** Chrome headless sandbox requires elevated permission or `--disable-gpu / --no-sandbox` flags when spawned inside restricted local processes.
- **Resolution:** Configured headless browser execution outside sandbox for PDF compilation, resulting in crisp offline A4 PDF generation ([PinchDrop_Overview.pdf](../PinchDrop_Overview.pdf)).

## 3. Issue: Missing Guide for External Developer Accounts & Keys
- **Symptom:** Developer needs exact procedures, locations, and pricing for external credentials (code signing, app stores, crash reporting).
- **Resolution:** Created comprehensive [docs/services.md](../services.md) detailing exact procedures, config files, and secrets management rules.

---

[← Return to README](../../README.md)

