import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const OUTPUT_PDF = path.resolve('docs/PinchDrop_Overview.pdf');
const TEMP_HTML = path.resolve('docs/overview_temp.html');

// Discover Chrome / Edge executable
const BROWSER_CANDIDATES = [
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

let browserPath = null;
for (const cand of BROWSER_CANDIDATES) {
  if (fs.existsSync(cand)) {
    browserPath = cand;
    break;
  }
}

if (!browserPath) {
  console.error('Error: Neither Chrome nor Edge executable could be located for headless PDF generation.');
  process.exit(1);
}

console.log(`Using browser for PDF compilation: ${browserPath}`);

// Helper to convert SVG files to data URLs for 100% offline self-contained PDF rendering
function svgToDataUrl(relPath) {
  const full = path.resolve(relPath);
  if (!fs.existsSync(full)) return '';
  const content = fs.readFileSync(full, 'utf8');
  return `data:image/svg+xml;utf8,${encodeURIComponent(content)}`;
}

const bannerData = svgToDataUrl('docs/assets/banner-product.svg');
const heroFlowData = svgToDataUrl('docs/assets/hero-flow.svg');
const contextData = svgToDataUrl('docs/assets/context.svg');
const fsmData = svgToDataUrl('docs/assets/gesture-fsm.svg');
const storyboardData = svgToDataUrl('docs/assets/storyboard-grab-catch.svg');
const techStackData = svgToDataUrl('docs/assets/tech-stack.svg');
const paletteData = svgToDataUrl('docs/assets/palette-swatch.svg');
const gestureIconsData = svgToDataUrl('docs/assets/gesture-icons.svg');

const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>PinchDrop Overview · Stage 0 Genesis</title>
  <style>
    @page {
      size: A4;
      margin: 14mm 16mm 16mm 16mm;
      @bottom-right {
        content: counter(page);
        font-family: 'Inter', sans-serif;
        font-size: 8pt;
        color: #8B94B8;
      }
    }
    body {
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
      color: #E8ECFF;
      background-color: #0B1020;
      line-height: 1.5;
      font-size: 9.5pt;
      margin: 0;
      padding: 0;
    }
    .cover {
      page-break-after: always;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      min-height: 90vh;
      text-align: center;
    }
    .cover h1 {
      font-size: 34pt;
      color: #7C5CFF;
      margin: 0 0 8px 0;
      font-weight: 800;
    }
    .cover .subtitle {
      font-size: 15pt;
      color: #22D3EE;
      margin: 0 0 24px 0;
      font-weight: 500;
    }
    .cover .meta {
      font-size: 10pt;
      color: #8B94B8;
      border-top: 1px solid #1C2547;
      padding-top: 16px;
      margin-top: 24px;
      line-height: 1.8;
    }
    h2 {
      font-size: 14pt;
      color: #22D3EE;
      border-bottom: 1.5px solid #1C2547;
      padding-bottom: 4px;
      margin-top: 20px;
      margin-bottom: 10px;
      page-break-after: avoid;
    }
    h3 {
      font-size: 11.5pt;
      color: #7C5CFF;
      margin-top: 14px;
      margin-bottom: 6px;
      page-break-after: avoid;
    }
    p, ul, ol {
      margin-top: 4px;
      margin-bottom: 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0 14px 0;
      font-size: 8.5pt;
      page-break-inside: avoid;
    }
    th, td {
      border: 1px solid #1C2547;
      padding: 6px 8px;
      text-align: left;
    }
    th {
      background-color: #141B34;
      color: #22D3EE;
      font-weight: 600;
    }
    tr:nth-child(even) {
      background-color: #0F162B;
    }
    .callout {
      background-color: #141B34;
      border-left: 4px solid #7C5CFF;
      padding: 8px 12px;
      margin: 10px 0;
      border-radius: 0 8px 8px 0;
      font-size: 9pt;
    }
    .callout-warn {
      border-left-color: #FBBF24;
    }
    .callout-success {
      border-left-color: #34D399;
    }
    .img-box {
      text-align: center;
      margin: 12px 0;
      page-break-inside: avoid;
    }
    .img-box img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      border: 1px solid #1C2547;
    }
    .page-break {
      page-break-after: always;
    }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 7.5pt;
      font-weight: 600;
      background: #1C2547;
      color: #22D3EE;
    }
    code {
      font-family: 'JetBrains Mono', Consolas, monospace;
      color: #22D3EE;
      font-size: 8pt;
      background-color: #141B34;
      padding: 1px 4px;
      border-radius: 3px;
    }
  </style>
</head>
<body>

  <!-- COVER PAGE -->
  <div class="cover">
    <h1>PinchDrop</h1>
    <div class="subtitle">Move things with your hands.</div>
    <div style="width: 80%; margin: 20px 0;">
      <img src="${bannerData}" style="width: 100%; border-radius: 12px; border: 1px solid #1C2547;" alt="Banner" />
    </div>
    <div class="meta">
      <strong>Product &amp; Technical Architecture Overview · Stage 0 (Genesis)</strong><br>
      Local-First · Zero-Cloud · Camera Frames Processed In-Memory Only<br>
      Target Platforms: Windows 10/11 Desktop + Android Companion App<br>
      Date: November 2026 · Author: Lead Systems Engineer &amp; Product Designer
    </div>
  </div>

  <!-- SECTION 1: WHAT IS PINCHDROP & HONEST LANDSCAPE -->
  <h2>1. What is PinchDrop &amp; Honest Problem Landscape</h2>
  <p>
    <strong>PinchDrop</strong> is a Windows desktop application paired with an Android companion app that lets you organise and move files, links, and text between your PC and phone using <strong>hand gestures seen by your laptop webcam</strong> — grab with a pinch, drop by opening your hand.
  </p>
  <div class="callout callout-success">
    <strong>Core Interaction Value:</strong> File transfer between phone and PC is already commoditised by Google Quick Share and Microsoft Phone Link. Our primary value is the <em>interaction model</em>: a dedicated spatial workspace with oversized targets, forgiving gestures, and zero-touch "Throw" mechanics that make moving digital files feel like handling physical paper.
  </div>

  <div class="img-box">
    <img src="${heroFlowData}" alt="Hero Flow" />
  </div>

  <h3>Competitive Landscape (Honest Assessment as of Nov 2026)</h3>
  <table>
    <thead>
      <tr>
        <th>Category</th>
        <th>Representative Products</th>
        <th>What They Lack vs. PinchDrop</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Phone↔PC Transfer</strong></td>
        <td>Quick Share for Windows, Microsoft Phone Link, LocalSend, KDE Connect</td>
        <td>No gesture interaction, no spatial workspace, rely strictly on standard desktop menus.</td>
      </tr>
      <tr>
        <td><strong>Webcam Gesture Mice</strong></td>
        <td>AirTouch (Neural Lab), UCL MotionInput, Gestura, MediaPipe demos</td>
        <td>Generic pointer emulators without phone awareness, file ops, or safety. High precision fatigue.</td>
      </tr>
      <tr>
        <td><strong>Gesture File Demos</strong></td>
        <td>Air Flick research scripts, Huawei gesture transfer demos</td>
        <td>Unfinished tech demos, images only, no Android app, no BLAKE3 verified resume engine.</td>
      </tr>
    </tbody>
  </table>

  <!-- SECTION 2: TARGET PERSONAS & ERGONOMICS -->
  <h2>2. Target Personas &amp; Ergonomic Principles</h2>
  <table>
    <thead>
      <tr>
        <th>Persona</th>
        <th>Core Workflow &amp; Need</th>
        <th>Why Gestures Provide Polish &amp; Relief</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>P1 Student / Knowledge Worker</strong></td>
        <td>Notes, lecture slides, PDFs, and links hopping constantly across phone and laptop.</td>
        <td>Instant transfer without clicking through Share dialogs; engaging demo factor.</td>
      </tr>
      <tr>
        <td><strong>P2 Video / Photo Creator</strong></td>
        <td>Multi-GB 4K footage and b-roll batches requiring quick sorting and triage.</td>
        <td>Two-hand lasso selection, large visual drop zones, non-blocking LAN streaming.</td>
      </tr>
      <tr>
        <td><strong>P3 Presenter / Educator</strong></td>
        <td>Showing slides, pausing media, moving teaching materials while standing away from keyboard.</td>
        <td>Hands-free distance control without carrying a clicker or approaching the laptop.</td>
      </tr>
      <tr>
        <td><strong>P4 Accessibility User</strong></td>
        <td>Limited fine motor control, RSI, or one-handed operation.</td>
        <td>96 px minimum target sizes, dwell-to-select alternative, magnetic snapping.</td>
      </tr>
      <tr>
        <td><strong>P5 Hands-Busy Context</strong></td>
        <td>Cooking, workshop, hardware lab, or greasy hands requiring PC control.</td>
        <td>Zero physical contact required to review diagrams, preview docs, or advance files.</td>
      </tr>
    </tbody>
  </table>

  <div class="callout callout-warn">
    <strong>Gorilla Arm Guard:</strong> Continuous mid-air gestures cause rapid shoulder fatigue. PinchDrop is designed exclusively for <strong>burst interactions</strong> (2–10 seconds). Standard mouse, trackpad, and keyboard shortcuts remain first-class fallbacks at all times.
  </div>

  <div class="page-break"></div>

  <!-- SECTION 3: THE CORE INTERACTION — GRAB -> CATCH -->
  <h2>3. The Core Interaction: The Grab → Catch Architecture</h2>
  <p>
    Laptops webcams can only see the user's hands and the PC environment. A webcam cannot see inside a phone or interact with private third-party apps like Google Photos. PinchDrop bridges this physical reality using the <strong>Grab → Catch</strong> pipeline:
  </p>

  <div class="img-box">
    <img src="${storyboardData}" alt="Storyboard Grab Catch" />
  </div>

  <ol>
    <li><strong>1. GRAB (Phone):</strong> In Google Photos or any Android app, tap <em>Share → PinchDrop</em> (or tap the "Grab latest photo" Quick Settings tile). The phone immediately holds the item and sends a lightweight thumbnail and metadata over local TLS.</li>
    <li><strong>2. ARMED (PC):</strong> The PC instantly displays a floating pointer chip (e.g. <em>"📷 1 Photo Ready"</em>) and enters the <strong>ARMED state for 30 seconds</strong>.</li>
    <li><strong>3. CATCH (Air Gesture):</strong> The user pinches anywhere in front of the laptop camera (G2 Pinch-Grab). The item thumbnail snaps to their hand cursor.</li>
    <li><strong>4. DROP (Zone):</strong> Move over any folder or action zone and open the hand (G3 Release-Drop). The PC initiates a verified chunked pull, saves the file, and triggers an <strong>8-second Undo Toast</strong>. If not caught within 30 seconds, it settles safely into the <strong>Stage Tray</strong>.</li>
  </ol>

  <!-- SECTION 4: CANONICAL SHARING MATRIX -->
  <h2>4. Canonical Sharing Matrix</h2>
  <table>
    <thead>
      <tr>
        <th>Content</th>
        <th>📱→💻 Grab Source (Phone)</th>
        <th>📱→💻 Land Target (PC)</th>
        <th>💻→📱 Pinch Source (PC)</th>
        <th>💻→📱 Land Target (Phone)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Photos</strong></td>
        <td>Share → PinchDrop · Tile "Grab latest photo" · Peek</td>
        <td>Folder · Default viewer · Clipboard · Inbox</td>
        <td>Image files</td>
        <td>Gallery (MediaStore Pictures)</td>
      </tr>
      <tr>
        <td><strong>Videos</strong></td>
        <td>Share → PinchDrop · Peek mode</td>
        <td>Folder · Default player · Inbox</td>
        <td>Video files (multi-GB)</td>
        <td>Movies folder (MediaStore)</td>
      </tr>
      <tr>
        <td><strong>Screenshots</strong></td>
        <td>Tile "Grab latest screenshot" · Share</td>
        <td>Folder · PC clipboard</td>
        <td>Screen region capture card</td>
        <td>Gallery (Screenshots)</td>
      </tr>
      <tr>
        <td><strong>Documents / PDFs</strong></td>
        <td>Share → PinchDrop (Files, Drive, WhatsApp)</td>
        <td>Folder · Open in viewer · Inbox</td>
        <td>Any document file</td>
        <td>Downloads (SAF) · "Open on phone"</td>
      </tr>
      <tr>
        <td><strong>Links / URLs</strong></td>
        <td>Share → PinchDrop (Chrome, YouTube, Maps)</td>
        <td>Open in Browser Zone · Clipboard</td>
        <td>Link card / clipboard</td>
        <td>Open on phone Zone (Phone browser)</td>
      </tr>
      <tr>
        <td><strong>Text Snippets</strong></td>
        <td>Share → PinchDrop · Tile "Grab clipboard"</td>
        <td>Clipboard · .txt in folder</td>
        <td>Text card / selection</td>
        <td>Phone clipboard · Note file</td>
      </tr>
      <tr>
        <td><strong>Document Scan</strong></td>
        <td>In-app ML Kit scanner direct to PDF</td>
        <td>Folder · Open in viewer</td>
        <td>—</td>
        <td>—</td>
      </tr>
      <tr>
        <td><strong>Camera / Voice</strong></td>
        <td>In-app snapshot / memo direct to PC</td>
        <td>Folder · Open in player</td>
        <td>—</td>
        <td>—</td>
      </tr>
    </tbody>
  </table>

  <div class="page-break"></div>

  <!-- SECTION 5: GESTURE LANGUAGE SPECIFICATION -->
  <h2>5. Canonical Gesture Language Specification</h2>
  <div class="img-box">
    <img src="${gestureIconsData}" alt="Gesture Icons" />
  </div>

  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Gesture Name</th>
        <th>Hand Pose &amp; Landmark Criteria</th>
        <th>Action &amp; Target Zone</th>
        <th>Safety &amp; Anti-Jitter Guards</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>G1</strong></td>
        <td>Point / Hover</td>
        <td>Index finger leading, palm facing webcam.</td>
        <td>Moves smoothed cursor over workspace cards.</td>
        <td>Active only within interaction box (central 65% of frame). One-Euro filter.</td>
      </tr>
      <tr>
        <td><strong>G2</strong></td>
        <td>Pinch-Grab</td>
        <td>Thumb tip(4) to Index tip(8) pinch ratio ≤ 0.30.</td>
        <td>Picks up file under cursor; or catches ARMED item.</td>
        <td>Scale-invariant normalisation by Palm width(0-9); 120ms dwell; exit ratio ≥ 0.45.</td>
      </tr>
      <tr>
        <td><strong>G3</strong></td>
        <td>Release-Drop</td>
        <td>All fingers open; pinch ratio exits ≥ 0.45.</td>
        <td>Drops held item into target zone or folder.</td>
        <td>Debounced; edge cancel zone outside active UI.</td>
      </tr>
      <tr>
        <td><strong>G3b</strong></td>
        <td>Throw (Flick)</td>
        <td>Pinch-hold, flick toward edge, open hand.</td>
        <td>Direct instant send to default Phone or Inbox.</td>
        <td>Velocity threshold ≥ 0.6 screen-widths/s; always provides 8s Undo Toast.</td>
      </tr>
      <tr>
        <td><strong>G4</strong></td>
        <td>Peace-Hold</td>
        <td>Index + Middle fingers extended, hold 600ms.</td>
        <td>Opens Rename overlay on targeted card.</td>
        <td>Radial countdown ring; aborts instantly if hand drops.</td>
      </tr>
      <tr>
        <td><strong>G5</strong></td>
        <td>Fist-Hold (Lock)</td>
        <td>Closed fist held for 800ms.</td>
        <td>Puts gesture engine to Sleep (0% camera CPU).</td>
        <td>Distinct from pinch (all fingers curled); repeat 800ms to wake.</td>
      </tr>
      <tr>
        <td><strong>G6</strong></td>
        <td>Wave-Summon</td>
        <td>Open palm side-to-side oscillation (2x in 1s).</td>
        <td>Toggles Air Workspace overlay visibility.</td>
        <td>Frequency window guard prevents incidental gestures from toggling UI.</td>
      </tr>
    </tbody>
  </table>

  <h3>Gesture State Machine</h3>
  <div class="img-box">
    <img src="${fsmData}" alt="Gesture FSM" />
  </div>

  <!-- SECTION 6: SYSTEM ARCHITECTURE & TECH STACK -->
  <h2>6. System Architecture &amp; Technology Stack</h2>
  <div class="img-box">
    <img src="${contextData}" alt="Context Architecture" />
  </div>
  <div class="img-box">
    <img src="${techStackData}" alt="Tech Stack" />
  </div>

  <div class="page-break"></div>

  <!-- SECTION 7: SECURITY, PRIVACY & FILE SAFETY -->
  <h2>7. Security, Privacy &amp; File Safety Model</h2>
  <div class="callout callout-success">
    <strong>Zero-Cloud Guarantee:</strong> Camera frames are processed strictly in volatile GPU memory and immediately discarded. No video, image, or landmark data is ever written to disk or transmitted across any network.
  </div>

  <table>
    <thead>
      <tr>
        <th>Domain</th>
        <th>Design Standard</th>
        <th>Implementation &amp; Mitigations</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Camera Privacy</strong></td>
        <td>Local-Only Processing</td>
        <td>MediaPipe GPU delegate inside local WebView2. Hard hardware toggle for camera off.</td>
      </tr>
      <tr>
        <td><strong>Pairing Security</strong></td>
        <td>Mutual Ed25519 Authentication</td>
        <td>QR code exchange with pinned self-signed certificate fingerprints over TLS 1.3.</td>
      </tr>
      <tr>
        <td><strong>File System Safety</strong></td>
        <td>Strict Allow-List Containment</td>
        <td>File operations restricted to user-designated roots. Path traversal (<code>..</code>) blocked.</td>
      </tr>
      <tr>
        <td><strong>Delete Safety</strong></td>
        <td>Recycle Bin Only + Undo</td>
        <td>No permanent delete via gestures. Deletions route via <code>trash</code> crate with 8s toast.</td>
      </tr>
      <tr>
        <td><strong>Data Transfer</strong></td>
        <td>BLAKE3 Chunk Verification</td>
        <td>Resume-capable chunked streaming with per-chunk cryptographic hash verification.</td>
      </tr>
    </tbody>
  </table>

  <!-- SECTION 8: ROADMAP & BUSINESS MODEL -->
  <h2>8. Project Roadmap &amp; Monetization Hypotheses</h2>
  <table>
    <thead>
      <tr>
        <th>Stage</th>
        <th>Deliverable &amp; Focus</th>
        <th>Estimated Timeline (Part-Time)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>S0</strong></td>
        <td><strong>Genesis:</strong> Monorepo, architecture, design system, asset pipeline, PDF overview.</td>
        <td>1–2 Days (Complete)</td>
      </tr>
      <tr>
        <td><strong>S1</strong></td>
        <td><strong>Gesture Lab:</strong> Standalone webcam testbed, One-Euro filter tuning, HUD.</td>
        <td>1–2 Weeks</td>
      </tr>
      <tr>
        <td><strong>S2</strong></td>
        <td><strong>Gesture Core:</strong> Pure TS FSM, replay test harness, false-trigger metrics.</td>
        <td>2 Weeks</td>
      </tr>
      <tr>
        <td><strong>S3</strong></td>
        <td><strong>Air Workspace UI:</strong> Tauri 2 shell, oversized card grid, gesture cursor ring.</td>
        <td>3 Weeks</td>
      </tr>
      <tr>
        <td><strong>S4–S7</strong></td>
        <td><strong>Core Pipeline:</strong> Rust file ops, LAN TLS engine, Android companion, Grab→Catch.</td>
        <td>11 Weeks</td>
      </tr>
      <tr>
        <td><strong>S8–S13</strong></td>
        <td><strong>Polish &amp; Launch:</strong> Clipboard sync, Gesture Gym, packaging, store releases.</td>
        <td>12 Weeks</td>
      </tr>
    </tbody>
  </table>

  <h3>Monetization Hypotheses (Generous Core Model)</h3>
  <p>
    <strong>Free Forever Core:</strong> All 6 hand gestures, Air Workspace, 1 paired phone, unlimited LAN file transfers, and Recycle Bin undo safety remain 100% free without ads or accounts. Transfers are commoditised; our interaction model is the differentiator.
  </p>
  <p>
    <strong>PinchDrop Pro Hypothesis ($3.99/mo · $29/yr · $59 lifetime):</strong> Unlocks batch lasso selection, custom gesture remapping, Smart Zones with automatic file renaming templates, Explorer Mode (system-wide cursor), and encrypted off-LAN relay.
  </p>

  <div style="margin-top: 30px; text-align: center; color: #8B94B8; font-size: 8pt; border-top: 1px solid #1C2547; padding-top: 10px;">
    PinchDrop Stage 0 (Genesis) Overview · All documentation is maintained in the project repository root.
  </div>

</body>
</html>
`;

fs.writeFileSync(TEMP_HTML, htmlContent, 'utf8');

console.log('Rendering HTML to PDF via headless browser...');
const args = [
  '--headless',
  '--disable-gpu',
  '--no-pdf-header-footer',
  `--print-to-pdf=${OUTPUT_PDF}`,
  TEMP_HTML
];

const proc = spawn(browserPath, args);

proc.on('close', (code) => {
  if (fs.existsSync(TEMP_HTML)) {
    fs.unlinkSync(TEMP_HTML);
  }
  if (code === 0 && fs.existsSync(OUTPUT_PDF)) {
    const stats = fs.statSync(OUTPUT_PDF);
    console.log(`PDF built successfully: ${OUTPUT_PDF} (${(stats.size / 1024).toFixed(1)} KB)`);
  } else {
    console.error(`Browser exited with code ${code}. Failed to generate PDF.`);
    process.exit(1);
  }
});
