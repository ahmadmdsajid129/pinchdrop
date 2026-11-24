import fs from 'node:fs';
import path from 'node:path';

const DIAGRAMS_DIR = path.resolve('docs/diagrams');
const ASSETS_DIR = path.resolve('docs/assets');

fs.mkdirSync(DIAGRAMS_DIR, { recursive: true });
fs.mkdirSync(ASSETS_DIR, { recursive: true });

// 1. Context Diagram MMD
const contextMmd = `%%{init: {'theme':'base','themeVariables':{'primaryColor':'#7C5CFF','primaryTextColor':'#fff','lineColor':'#22D3EE','secondaryColor':'#141B34','tertiaryColor':'#1C2547','fontFamily':'Inter'}}}%%
flowchart LR
    subgraph PC["Windows PC (Tauri 2)"]
        UI["WebView2 UI (React + TS)"]
        Vision["MediaPipe HandLandmarker"]
        Core["gesture-core (FSM + Filter)"]
        Rust["Rust Core (Axum + Tokio)"]
        FileOps["Safe File Ops (trash crate)"]
        UI --> Vision --> Core --> UI
        UI <--> Rust
        Rust --> FileOps
    end

    subgraph Phone["Android Phone (Kotlin + Compose)"]
        AndroidUI["Compose UI"]
        ShareTarget["Share Sheet Target"]
        Tiles["Quick Settings Tiles"]
        Tray["Stage Tray & Sync"]
        Worker["WorkManager Transfer"]
        AndroidUI --> Tray
        ShareTarget --> Tray
        Tiles --> Tray
        Tray --> Worker
    end

    Rust <--"TLS 1.3 / WebSocket (Control) & HTTP (Chunked Range)"--> Worker
`;
fs.writeFileSync(path.join(DIAGRAMS_DIR, 'context.mmd'), contextMmd, 'utf8');

// 2. Gesture State Machine MMD
const fsmMmd = `%%{init: {'theme':'base','themeVariables':{'primaryColor':'#7C5CFF','primaryTextColor':'#fff','lineColor':'#22D3EE','secondaryColor':'#141B34','tertiaryColor':'#1C2547','fontFamily':'Inter'}}}%%
stateDiagram-v2
    [*] --> IDLE
    LOCKED --> IDLE: Fist-Hold 800ms
    IDLE --> LOCKED: Fist-Hold 800ms
    IDLE --> HOVER: Hand detected & smoothed
    HOVER --> IDLE: Hand lost
    HOVER --> GRABBING: Pinch ratio <= 0.30 (120ms)
    GRABBING --> HOVER: Release over canvas
    GRABBING --> DROP: Release over Target Zone
    DROP --> HOVER: Op complete (Undo Toast 8s)
    GRABBING --> ARM_DELETE: Over Trash Zone (600ms hold)
    ARM_DELETE --> DROP_TRASH: Release over Trash
    DROP_TRASH --> HOVER: Recycled (+ Undo Toast)
    HOVER --> RENAME_ARMED: Peace-Hold 600ms
    RENAME_ARMED --> RENAMING: Virtual Keyboard / On-screen
    RENAMING --> HOVER: Enter / Dismiss
    IDLE --> ARMED: Phone Grabbed Item (30s)
    HOVER --> ARMED: Phone Grabbed Item (30s)
    ARMED --> GRABBING: Pinch anywhere
    ARMED --> IDLE: 30s Timeout (Item -> Stage Tray)
`;
fs.writeFileSync(path.join(DIAGRAMS_DIR, 'gesture-fsm.mmd'), fsmMmd, 'utf8');

// 3. Grab -> Catch Sequence MMD
const grabCatchMmd = `%%{init: {'theme':'base','themeVariables':{'primaryColor':'#7C5CFF','primaryTextColor':'#fff','lineColor':'#22D3EE','secondaryColor':'#141B34','tertiaryColor':'#1C2547','fontFamily':'Inter'}}}%%
sequenceDiagram
    autonumber
    actor User
    participant Phone as Android App
    participant PC_UI as PC UI (WebView2)
    participant PC_Rust as PC Rust Core

    User->>Phone: Share -> PinchDrop (Google Photos)
    Phone->>PC_Rust: hold.set (Thumbnail + Metadata only)
    PC_Rust->>PC_UI: armed.state (30s countdown chip)
    Note over PC_UI: PC enters ARMED state
    User->>PC_UI: Air Pinch anywhere (G2)
    PC_UI->>PC_UI: Thumbnail attaches to pointer
    User->>PC_UI: Carry & Release over Folder Zone (G3)
    PC_UI->>PC_Rust: trigger_pull(itemId, targetFolder)
    PC_Rust->>Phone: pull(itemId, targetFolder)
    Phone->>PC_Rust: HTTP Stream (Chunked + BLAKE3 hash)
    PC_Rust->>PC_Rust: Verify Hash & Write to Allow-list Folder
    PC_Rust->>PC_UI: pull.complete -> Show Undo Toast (5-8s)
    PC_Rust->>Phone: hold.clear (Mark Delivered)
`;
fs.writeFileSync(path.join(DIAGRAMS_DIR, 'grab-catch-sequence.mmd'), grabCatchMmd, 'utf8');

// 4. Storyboard 4-Panel SVG (Grab -> Armed -> Pinch -> Catch)
const storyboardSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 320" width="100%" height="320">
  <rect width="1000" height="320" rx="16" fill="#0B1020" stroke="#1C2547" stroke-width="2"/>
  <text x="500" y="34" font-family="'Poppins', sans-serif" font-weight="700" font-size="18" fill="#E8ECFF" text-anchor="middle">Grab → Catch Interaction Storyboard</text>
  
  <!-- Panel 1: Phone Grab -->
  <g transform="translate(25, 55)">
    <rect width="225" height="235" rx="12" fill="#141B34" stroke="#1C2547" stroke-width="1.5"/>
    <text x="112" y="28" font-family="'Poppins', sans-serif" font-size="13" font-weight="600" fill="#7C5CFF" text-anchor="middle">1. GRAB (Phone)</text>
    <rect x="40" y="45" width="145" height="110" rx="8" fill="#1C2547" stroke="#22D3EE" stroke-width="1"/>
    <text x="112" y="95" font-family="'Inter', sans-serif" font-size="11" fill="#E8ECFF" text-anchor="middle">Share → PinchDrop</text>
    <text x="112" y="115" font-family="'Inter', sans-serif" font-size="9" fill="#8B94B8" text-anchor="middle">Google Photos / Files</text>
    <text x="112" y="180" font-family="'Inter', sans-serif" font-size="11" fill="#34D399" text-anchor="middle" font-weight="600">Held ✓ — Catch on PC</text>
    <text x="112" y="205" font-family="'Inter', sans-serif" font-size="10" fill="#8B94B8" text-anchor="middle">Thumbnail sent via LAN</text>
  </g>

  <!-- Panel 2: PC Armed -->
  <g transform="translate(265, 55)">
    <rect width="225" height="235" rx="12" fill="#141B34" stroke="#7C5CFF" stroke-width="2"/>
    <text x="112" y="28" font-family="'Poppins', sans-serif" font-size="13" font-weight="600" fill="#22D3EE" text-anchor="middle">2. ARMED (PC)</text>
    <rect x="25" y="45" width="175" height="110" rx="8" fill="#1C2547" stroke="#7C5CFF" stroke-width="1.5"/>
    <circle cx="112" cy="85" r="24" fill="#141B34" stroke="#FBBF24" stroke-width="2"/>
    <text x="112" y="90" font-family="'JetBrains Mono', monospace" font-size="11" fill="#FBBF24" text-anchor="middle">30s</text>
    <text x="112" y="132" font-family="'Inter', sans-serif" font-size="11" fill="#E8ECFF" text-anchor="middle">📷 1 Photo Ready</text>
    <text x="112" y="180" font-family="'Inter', sans-serif" font-size="11" fill="#22D3EE" text-anchor="middle" font-weight="600">Quick Catch Active</text>
    <text x="112" y="205" font-family="'Inter', sans-serif" font-size="10" fill="#8B94B8" text-anchor="middle">Uncaught falls to Stage Tray</text>
  </g>

  <!-- Panel 3: Pinch Anywhere -->
  <g transform="translate(505, 55)">
    <rect width="225" height="235" rx="12" fill="#141B34" stroke="#1C2547" stroke-width="1.5"/>
    <text x="112" y="28" font-family="'Poppins', sans-serif" font-size="13" font-weight="600" fill="#34D399" text-anchor="middle">3. CATCH (Air Pinch)</text>
    <rect x="25" y="45" width="175" height="110" rx="8" fill="#1C2547" stroke="#34D399" stroke-width="1"/>
    <circle cx="112" cy="85" r="26" fill="#141B34" stroke="#34D399" stroke-width="2"/>
    <text x="112" y="92" font-family="'Inter', sans-serif" font-size="20" text-anchor="middle">🤏</text>
    <text x="112" y="132" font-family="'Inter', sans-serif" font-size="11" fill="#34D399" text-anchor="middle">Item Attaches to Hand</text>
    <text x="112" y="180" font-family="'Inter', sans-serif" font-size="11" fill="#E8ECFF" text-anchor="middle" font-weight="600">Pinch Anywhere in Box</text>
    <text x="112" y="205" font-family="'Inter', sans-serif" font-size="10" fill="#8B94B8" text-anchor="middle">Zero phone touch needed</text>
  </g>

  <!-- Panel 4: Drop over Zone -->
  <g transform="translate(745, 55)">
    <rect width="225" height="235" rx="12" fill="#141B34" stroke="#1C2547" stroke-width="1.5"/>
    <text x="112" y="28" font-family="'Poppins', sans-serif" font-size="13" font-weight="600" fill="#FBBF24" text-anchor="middle">4. DROP (Zone Save)</text>
    <rect x="25" y="45" width="175" height="110" rx="8" fill="#1C2547" stroke="#FBBF24" stroke-width="1.5"/>
    <text x="112" y="80" font-family="'Inter', sans-serif" font-size="12" fill="#E8ECFF" text-anchor="middle">📁 Projects / Inbox</text>
    <text x="112" y="105" font-family="'Inter', sans-serif" font-size="11" fill="#34D399" text-anchor="middle">Open Hand → Saved</text>
    <text x="112" y="132" font-family="'Inter', sans-serif" font-size="10" fill="#8B94B8" text-anchor="middle">BLAKE3 chunk verified</text>
    <text x="112" y="180" font-family="'Inter', sans-serif" font-size="11" fill="#34D399" text-anchor="middle" font-weight="600">Saved + Undo Toast (8s)</text>
    <text x="112" y="205" font-family="'Inter', sans-serif" font-size="10" fill="#8B94B8" text-anchor="middle">Non-destructive &amp; Safe</text>
  </g>
</svg>`;
fs.writeFileSync(path.join(ASSETS_DIR, 'storyboard-grab-catch.svg'), storyboardSvg, 'utf8');

// 5. Context Diagram SVG Fallback
const contextSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 300" width="100%" height="300">
  <rect width="960" height="300" rx="16" fill="#0B1020" stroke="#1C2547" stroke-width="2"/>
  <text x="480" y="32" font-family="'Poppins', sans-serif" font-weight="700" font-size="18" fill="#E8ECFF" text-anchor="middle">PinchDrop Context &amp; Architecture</text>

  <!-- Windows Box -->
  <g transform="translate(30, 55)">
    <rect width="420" height="215" rx="12" fill="#141B34" stroke="#7C5CFF" stroke-width="2"/>
    <text x="210" y="30" font-family="'Poppins', sans-serif" font-size="14" font-weight="600" fill="#7C5CFF" text-anchor="middle">Windows PC (Tauri 2 Shell)</text>
    
    <rect x="20" y="50" width="180" height="60" rx="8" fill="#1C2547" stroke="#1C2547" stroke-width="1"/>
    <text x="110" y="75" font-family="'Inter', sans-serif" font-size="11" font-weight="600" fill="#E8ECFF" text-anchor="middle">WebView2 UI</text>
    <text x="110" y="93" font-family="'Inter', sans-serif" font-size="9" fill="#8B94B8" text-anchor="middle">React 18 + Tailwind</text>

    <rect x="220" y="50" width="180" height="60" rx="8" fill="#1C2547" stroke="#1C2547" stroke-width="1"/>
    <text x="310" y="75" font-family="'Inter', sans-serif" font-size="11" font-weight="600" fill="#22D3EE" text-anchor="middle">MediaPipe + FSM</text>
    <text x="310" y="93" font-family="'Inter', sans-serif" font-size="9" fill="#8B94B8" text-anchor="middle">Pure TS gesture-core</text>

    <rect x="20" y="125" width="380" height="65" rx="8" fill="#1C2547" stroke="#34D399" stroke-width="1"/>
    <text x="210" y="150" font-family="'Inter', sans-serif" font-size="12" font-weight="600" fill="#34D399" text-anchor="middle">Rust Core (tokio + axum + rustls)</text>
    <text x="210" y="170" font-family="'Inter', sans-serif" font-size="10" fill="#8B94B8" text-anchor="middle">HTTP/WS Server · Safe File Ops (trash) · BLAKE3 Hash Engine</text>
  </g>

  <!-- Network Connectors -->
  <g transform="translate(460, 140)">
    <line x1="0" y1="0" x2="35" y2="0" stroke="#22D3EE" stroke-width="3" stroke-dasharray="4,4"/>
    <text x="20" y="-12" font-family="'JetBrains Mono', monospace" font-size="9" fill="#22D3EE" text-anchor="middle">TLS 1.3</text>
    <text x="20" y="18" font-family="'JetBrains Mono', monospace" font-size="8" fill="#8B94B8" text-anchor="middle">WS/HTTP</text>
  </g>

  <!-- Android Box -->
  <g transform="translate(505, 55)">
    <rect width="425" height="215" rx="12" fill="#141B34" stroke="#22D3EE" stroke-width="2"/>
    <text x="212" y="30" font-family="'Poppins', sans-serif" font-size="14" font-weight="600" fill="#22D3EE" text-anchor="middle">Android Phone (Kotlin + Jetpack Compose)</text>
    
    <rect x="20" y="50" width="180" height="60" rx="8" fill="#1C2547" stroke="#1C2547" stroke-width="1"/>
    <text x="110" y="75" font-family="'Inter', sans-serif" font-size="11" font-weight="600" fill="#E8ECFF" text-anchor="middle">Share Target &amp; Tiles</text>
    <text x="110" y="93" font-family="'Inter', sans-serif" font-size="9" fill="#8B94B8" text-anchor="middle">ACTION_SEND / Photo grab</text>

    <rect x="220" y="50" width="185" height="60" rx="8" fill="#1C2547" stroke="#1C2547" stroke-width="1"/>
    <text x="312" y="75" font-family="'Inter', sans-serif" font-size="11" font-weight="600" fill="#FBBF24" text-anchor="middle">Stage Tray Client</text>
    <text x="312" y="93" font-family="'Inter', sans-serif" font-size="9" fill="#8B94B8" text-anchor="middle">Ktor Client (OkHttp engine)</text>

    <rect x="20" y="125" width="385" height="65" rx="8" fill="#1C2547" stroke="#7C5CFF" stroke-width="1"/>
    <text x="212" y="150" font-family="'Inter', sans-serif" font-size="12" font-weight="600" fill="#7C5CFF" text-anchor="middle">WorkManager Transfer Engine</text>
    <text x="212" y="170" font-family="'Inter', sans-serif" font-size="10" fill="#8B94B8" text-anchor="middle">MediaStore / SAF Storage · Android 15 dataSync compliant</text>
  </g>
</svg>`;
fs.writeFileSync(path.join(ASSETS_DIR, 'context.svg'), contextSvg, 'utf8');

// 6. Gesture State Machine SVG Fallback
const gestureFsmSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 300" width="100%" height="300">
  <rect width="960" height="300" rx="16" fill="#0B1020" stroke="#1C2547" stroke-width="2"/>
  <text x="480" y="30" font-family="'Poppins', sans-serif" font-weight="700" font-size="18" fill="#E8ECFF" text-anchor="middle">Gesture Finite State Machine (with ARMED State)</text>

  <!-- States -->
  <g transform="translate(40, 60)">
    <!-- LOCKED -->
    <rect x="0" y="80" width="100" height="45" rx="8" fill="#141B34" stroke="#FB7185" stroke-width="1.5"/>
    <text x="50" y="108" font-family="'Inter', sans-serif" font-size="12" font-weight="600" fill="#FB7185" text-anchor="middle">LOCKED</text>

    <!-- IDLE -->
    <rect x="150" y="80" width="110" height="45" rx="8" fill="#141B34" stroke="#8B94B8" stroke-width="1.5"/>
    <text x="205" y="108" font-family="'Inter', sans-serif" font-size="12" font-weight="600" fill="#E8ECFF" text-anchor="middle">IDLE</text>

    <!-- HOVER -->
    <rect x="310" y="80" width="110" height="45" rx="8" fill="#141B34" stroke="#7C5CFF" stroke-width="1.5"/>
    <text x="365" y="108" font-family="'Inter', sans-serif" font-size="12" font-weight="600" fill="#7C5CFF" text-anchor="middle">HOVER</text>

    <!-- GRABBING -->
    <rect x="470" y="80" width="120" height="45" rx="8" fill="#141B34" stroke="#22D3EE" stroke-width="2"/>
    <text x="530" y="108" font-family="'Inter', sans-serif" font-size="12" font-weight="600" fill="#22D3EE" text-anchor="middle">GRABBING</text>

    <!-- DROP / DROP_TRASH -->
    <rect x="640" y="40" width="130" height="45" rx="8" fill="#141B34" stroke="#34D399" stroke-width="1.5"/>
    <text x="705" y="68" font-family="'Inter', sans-serif" font-size="12" font-weight="600" fill="#34D399" text-anchor="middle">DROP (Zone)</text>

    <rect x="640" y="120" width="130" height="45" rx="8" fill="#141B34" stroke="#FB7185" stroke-width="1.5"/>
    <text x="705" y="148" font-family="'Inter', sans-serif" font-size="12" font-weight="600" fill="#FB7185" text-anchor="middle">ARM_DELETE</text>

    <!-- ARMED (Phone Grabbed) -->
    <rect x="230" y="190" width="200" height="45" rx="8" fill="#141B34" stroke="#FBBF24" stroke-width="2"/>
    <text x="330" y="218" font-family="'Inter', sans-serif" font-size="12" font-weight="600" fill="#FBBF24" text-anchor="middle">ARMED (Phone 30s)</text>

    <!-- Connectors -->
    <path d="M100,102 L150,102" stroke="#8B94B8" stroke-width="2" marker-end="url(#arr)"/>
    <path d="M260,102 L310,102" stroke="#7C5CFF" stroke-width="2"/>
    <path d="M420,102 L470,102" stroke="#22D3EE" stroke-width="2"/>
    <path d="M590,95 L640,65" stroke="#34D399" stroke-width="2"/>
    <path d="M590,110 L640,140" stroke="#FB7185" stroke-width="2"/>
    <path d="M205,125 L205,212 L230,212" stroke="#FBBF24" stroke-width="2" stroke-dasharray="4,4"/>
    <path d="M430,212 L530,212 L530,125" stroke="#22D3EE" stroke-width="2" stroke-dasharray="4,4"/>
  </g>
</svg>`;
fs.writeFileSync(path.join(ASSETS_DIR, 'gesture-fsm.svg'), gestureFsmSvg, 'utf8');

// 7. Grab Catch Sequence SVG Fallback
const grabCatchSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 320" width="100%" height="320">
  <rect width="960" height="320" rx="16" fill="#0B1020" stroke="#1C2547" stroke-width="2"/>
  <text x="480" y="32" font-family="'Poppins', sans-serif" font-weight="700" font-size="18" fill="#E8ECFF" text-anchor="middle">Grab → Catch Protocol Sequence</text>

  <!-- Lifelines -->
  <g transform="translate(80, 50)">
    <text x="60" y="20" font-family="'Inter', sans-serif" font-size="12" font-weight="600" fill="#7C5CFF" text-anchor="middle">User</text>
    <line x1="60" y1="30" x2="60" y2="240" stroke="#1C2547" stroke-width="2"/>

    <text x="280" y="20" font-family="'Inter', sans-serif" font-size="12" font-weight="600" fill="#22D3EE" text-anchor="middle">Android App</text>
    <line x1="280" y1="30" x2="280" y2="240" stroke="#1C2547" stroke-width="2"/>

    <text x="520" y="20" font-family="'Inter', sans-serif" font-size="12" font-weight="600" fill="#34D399" text-anchor="middle">PC UI (WebView2)</text>
    <line x1="520" y1="30" x2="520" y2="240" stroke="#1C2547" stroke-width="2"/>

    <text x="740" y="20" font-family="'Inter', sans-serif" font-size="12" font-weight="600" fill="#FBBF24" text-anchor="middle">PC Rust Core</text>
    <line x1="740" y1="30" x2="740" y2="240" stroke="#1C2547" stroke-width="2"/>

    <!-- Messages -->
    <path d="M60,60 L280,60" stroke="#22D3EE" stroke-width="2"/>
    <text x="170" y="55" font-family="'Inter', sans-serif" font-size="10" fill="#E8ECFF" text-anchor="middle">1. Share → PinchDrop</text>

    <path d="M280,90 L740,90" stroke="#7C5CFF" stroke-width="2"/>
    <text x="510" y="85" font-family="'Inter', sans-serif" font-size="10" fill="#7C5CFF" text-anchor="middle">2. hold.set (thumbnail + metadata)</text>

    <path d="M740,115 L520,115" stroke="#FBBF24" stroke-width="2"/>
    <text x="630" y="110" font-family="'Inter', sans-serif" font-size="10" fill="#FBBF24" text-anchor="middle">3. armed.state (30s chip)</text>

    <path d="M60,145 L520,145" stroke="#34D399" stroke-width="2"/>
    <text x="290" y="140" font-family="'Inter', sans-serif" font-size="10" fill="#34D399" text-anchor="middle">4. Air Pinch (G2) &amp; Drop (G3)</text>

    <path d="M520,175 L740,175" stroke="#22D3EE" stroke-width="2"/>
    <text x="630" y="170" font-family="'Inter', sans-serif" font-size="10" fill="#22D3EE" text-anchor="middle">5. trigger_pull(targetFolder)</text>

    <path d="M740,205 L280,205" stroke="#7C5CFF" stroke-width="2"/>
    <text x="510" y="200" font-family="'Inter', sans-serif" font-size="10" fill="#7C5CFF" text-anchor="middle">6. pull() &amp; HTTP Stream (BLAKE3 hash)</text>

    <path d="M740,230 L520,230" stroke="#34D399" stroke-width="2"/>
    <text x="630" y="225" font-family="'Inter', sans-serif" font-size="10" fill="#34D399" text-anchor="middle">7. pull.complete -&gt; Undo Toast (8s)</text>
  </g>
</svg>`;
fs.writeFileSync(path.join(ASSETS_DIR, 'grab-catch-sequence.svg'), grabCatchSvg, 'utf8');

console.log('Successfully generated offline SVGs and Mermaid sources in docs/diagrams/ and docs/assets/');
