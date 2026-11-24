import fs from 'node:fs';
import path from 'node:path';

const ASSETS_DIR = path.resolve('docs/assets');
const BADGES_DIR = path.resolve('docs/assets/badges');

fs.mkdirSync(ASSETS_DIR, { recursive: true });
fs.mkdirSync(BADGES_DIR, { recursive: true });

// Palette
const PALETTE = {
  bg: '#0B1020',
  surface: '#141B34',
  surface2: '#1C2547',
  primary: '#7C5CFF',
  accent: '#22D3EE',
  success: '#34D399',
  warn: '#FBBF24',
  danger: '#FB7185',
  text: '#E8ECFF',
  muted: '#8B94B8',
};

// Generate Banners
const BANNERS = [
  { name: 'banner-readme.svg', title: 'PinchDrop', subtitle: 'Spatial workspace & gesture file transfer for Windows + Android' },
  { name: 'banner-agents.svg', title: 'PinchDrop · AGENTS.md', subtitle: 'First-read operational instructions for AI agent sessions' },
  { name: 'banner-memory.svg', title: 'PinchDrop · memory.md', subtitle: 'Persistent context, decision registry, and live project memory' },
  { name: 'banner-product.svg', title: 'PinchDrop · product.md', subtitle: 'Canonical product definition, personas, and sharing matrix' },
  { name: 'banner-architecture.svg', title: 'PinchDrop · architecture.md', subtitle: 'System architecture, state machine, and data models' },
  { name: 'banner-rules.svg', title: 'PinchDrop · rules.md', subtitle: 'Non-negotiable coding standards, safety, and testing rules' },
  { name: 'banner-task.svg', title: 'PinchDrop · task.md', subtitle: 'Stage roadmap (S0-S13), sprint tracking, and backlog' },
  { name: 'banner-design.svg', title: 'PinchDrop · design.md', subtitle: 'Aurora glass design system, wireframes, and tokens' },
  { name: 'banner-gestures.svg', title: 'PinchDrop · gestures.md', subtitle: 'Canonical 6-pose gesture spec, thresholds, and cheat sheet' },
  { name: 'banner-protocol.svg', title: 'PinchDrop · protocol.md', subtitle: 'JSON WebSocket messages, HTTP Range transfer, and sync' },
  { name: 'banner-security-privacy.svg', title: 'PinchDrop · security-privacy.md', subtitle: 'Local-first zero-storage privacy model & threat matrix' },
  { name: 'banner-monetization.svg', title: 'PinchDrop · monetization.md', subtitle: 'Free core + Pro hypothesis, packaging, and unit economics' },
];

for (const b of BANNERS) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 240" width="100%" height="240">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0B1020" />
      <stop offset="50%" stop-color="#141B34" />
      <stop offset="100%" stop-color="#1C2547" />
    </linearGradient>
    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#7C5CFF" />
      <stop offset="100%" stop-color="#22D3EE" />
    </linearGradient>
    <radialGradient id="glow" cx="20%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#7C5CFF" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#0B1020" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000" flood-opacity="0.4"/>
    </filter>
  </defs>
  <rect width="1200" height="240" rx="16" fill="url(#bgGrad)" stroke="#1C2547" stroke-width="2"/>
  <circle cx="180" cy="120" r="140" fill="url(#glow)"/>
  
  <!-- Subtle Hand Landmarks Motif -->
  <g opacity="0.22" stroke="#22D3EE" stroke-width="2" fill="none">
    <path d="M1020,180 L1040,140 L1050,90 L1055,60" />
    <path d="M1020,180 L1070,135 L1085,80 L1090,50" />
    <path d="M1020,180 L1100,140 L1115,85 L1120,55" />
    <path d="M1020,180 L1130,150 L1140,105 L1145,80" />
    <path d="M1020,180 L990,150 L970,120 L960,105" />
    <circle cx="1020" cy="180" r="5" fill="#7C5CFF" />
    <circle cx="960" cy="105" r="5" fill="#22D3EE" />
    <circle cx="1055" cy="60" r="5" fill="#22D3EE" />
    <circle cx="1090" cy="50" r="5" fill="#7C5CFF" />
    <circle cx="1120" cy="55" r="5" fill="#22D3EE" />
    <circle cx="1145" cy="80" r="5" fill="#7C5CFF" />
  </g>

  <!-- Accent bar -->
  <rect x="40" y="32" width="6" height="176" rx="3" fill="url(#accentGrad)" />

  <!-- Typography -->
  <text x="64" y="98" font-family="'Poppins', 'Segoe UI', sans-serif" font-weight="700" font-size="44" fill="url(#accentGrad)" filter="url(#shadow)">${b.title}</text>
  <text x="64" y="142" font-family="'Inter', 'Segoe UI', sans-serif" font-weight="400" font-size="18" fill="#E8ECFF" opacity="0.95">${b.subtitle}</text>
  <text x="64" y="186" font-family="'JetBrains Mono', 'Segoe UI', monospace" font-size="12" fill="#8B94B8">STAGE 0 · GENESIS | LOCAL-FIRST | PRIVACY-FIRST | ZERO-CLOUD</text>
</svg>`;
  fs.writeFileSync(path.join(ASSETS_DIR, b.name), svg, 'utf8');
}

// Generate Palette Swatch SVG
const paletteSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 220" width="100%" height="220">
  <rect width="960" height="220" rx="12" fill="#0B1020" stroke="#1C2547" stroke-width="2"/>
  <text x="24" y="36" font-family="'Poppins', sans-serif" font-weight="600" font-size="18" fill="#E8ECFF">PinchDrop Design Tokens · Aurora Glass Palette</text>
  <g transform="translate(24, 56)">
    ${Object.entries(PALETTE).map(([key, val], idx) => {
      const x = idx * 90;
      return `<g transform="translate(${x}, 0)">
        <rect width="80" height="80" rx="12" fill="${val}" stroke="#1C2547" stroke-width="1.5"/>
        <text x="40" y="104" font-family="'Inter', sans-serif" font-size="11" font-weight="600" fill="#E8ECFF" text-anchor="middle">--${key}</text>
        <text x="40" y="122" font-family="'JetBrains Mono', monospace" font-size="10" fill="#8B94B8" text-anchor="middle">${val}</text>
      </g>`;
    }).join('\n    ')}
  </g>
</svg>`;
fs.writeFileSync(path.join(ASSETS_DIR, 'palette-swatch.svg'), paletteSvg, 'utf8');

// Generate Gesture Icon Sheet SVG (G1-G6)
const gestureIconsSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 240" width="100%" height="240">
  <rect width="960" height="240" rx="12" fill="#0B1020" stroke="#1C2547" stroke-width="2"/>
  <text x="24" y="34" font-family="'Poppins', sans-serif" font-weight="600" font-size="18" fill="#22D3EE">Canonical Gesture Language (G1–G6)</text>
  <g transform="translate(30, 56)">
    <!-- G1 Point / Hover -->
    <g transform="translate(0, 0)">
      <rect width="136" height="150" rx="10" fill="#141B34" stroke="#1C2547" stroke-width="1.5"/>
      <circle cx="68" cy="50" r="28" fill="#1C2547" />
      <path d="M68,30 L68,60 M68,30 L60,40 M68,30 L76,40" stroke="#7C5CFF" stroke-width="3" stroke-linecap="round" fill="none"/>
      <text x="68" y="102" font-family="'Inter', sans-serif" font-size="13" font-weight="600" fill="#E8ECFF" text-anchor="middle">G1 Point/Hover</text>
      <text x="68" y="122" font-family="'Inter', sans-serif" font-size="10" fill="#8B94B8" text-anchor="middle">Index cursor</text>
    </g>
    <!-- G2 Pinch-Grab -->
    <g transform="translate(152, 0)">
      <rect width="136" height="150" rx="10" fill="#141B34" stroke="#7C5CFF" stroke-width="2"/>
      <circle cx="68" cy="50" r="28" fill="#1C2547" />
      <path d="M52,50 C58,40 78,40 84,50" stroke="#22D3EE" stroke-width="3" fill="none"/>
      <circle cx="56" cy="50" r="4" fill="#22D3EE"/>
      <circle cx="80" cy="50" r="4" fill="#7C5CFF"/>
      <text x="68" y="102" font-family="'Inter', sans-serif" font-size="13" font-weight="600" fill="#E8ECFF" text-anchor="middle">G2 Pinch-Grab</text>
      <text x="68" y="122" font-family="'Inter', sans-serif" font-size="10" fill="#8B94B8" text-anchor="middle">Thumb+Index pick</text>
    </g>
    <!-- G3 Release-Drop -->
    <g transform="translate(304, 0)">
      <rect width="136" height="150" rx="10" fill="#141B34" stroke="#1C2547" stroke-width="1.5"/>
      <circle cx="68" cy="50" r="28" fill="#1C2547" />
      <path d="M50,42 L56,58 M62,34 L65,58 M74,34 L71,58 M86,42 L80,58" stroke="#34D399" stroke-width="2.5" stroke-linecap="round"/>
      <text x="68" y="102" font-family="'Inter', sans-serif" font-size="13" font-weight="600" fill="#E8ECFF" text-anchor="middle">G3 Release-Drop</text>
      <text x="68" y="122" font-family="'Inter', sans-serif" font-size="10" fill="#8B94B8" text-anchor="middle">Open fingers drop</text>
    </g>
    <!-- G4 Peace-Hold -->
    <g transform="translate(456, 0)">
      <rect width="136" height="150" rx="10" fill="#141B34" stroke="#1C2547" stroke-width="1.5"/>
      <circle cx="68" cy="50" r="28" fill="#1C2547" />
      <path d="M60,65 L60,35 M76,65 L76,35" stroke="#FBBF24" stroke-width="3" stroke-linecap="round"/>
      <text x="68" y="102" font-family="'Inter', sans-serif" font-size="13" font-weight="600" fill="#E8ECFF" text-anchor="middle">G4 Peace-Hold</text>
      <text x="68" y="122" font-family="'Inter', sans-serif" font-size="10" fill="#8B94B8" text-anchor="middle">Rename (600ms)</text>
    </g>
    <!-- G5 Fist-Hold -->
    <g transform="translate(608, 0)">
      <rect width="136" height="150" rx="10" fill="#141B34" stroke="#1C2547" stroke-width="1.5"/>
      <circle cx="68" cy="50" r="28" fill="#1C2547" />
      <rect x="52" y="38" width="32" height="26" rx="6" fill="#FB7185" opacity="0.8"/>
      <text x="68" y="102" font-family="'Inter', sans-serif" font-size="13" font-weight="600" fill="#E8ECFF" text-anchor="middle">G5 Fist-Hold</text>
      <text x="68" y="122" font-family="'Inter', sans-serif" font-size="10" fill="#8B94B8" text-anchor="middle">Lock/Sleep (800ms)</text>
    </g>
    <!-- G6 Wave-Summon -->
    <g transform="translate(760, 0)">
      <rect width="136" height="150" rx="10" fill="#141B34" stroke="#1C2547" stroke-width="1.5"/>
      <circle cx="68" cy="50" r="28" fill="#1C2547" />
      <path d="M50,50 C58,36 68,64 76,50 M58,58 C64,48 72,66 82,56" stroke="#22D3EE" stroke-width="2.5" fill="none"/>
      <text x="68" y="102" font-family="'Inter', sans-serif" font-size="13" font-weight="600" fill="#E8ECFF" text-anchor="middle">G6 Wave-Summon</text>
      <text x="68" y="122" font-family="'Inter', sans-serif" font-size="10" fill="#8B94B8" text-anchor="middle">Show/Hide UI (x2)</text>
    </g>
  </g>
</svg>`;
fs.writeFileSync(path.join(ASSETS_DIR, 'gesture-icons.svg'), gestureIconsSvg, 'utf8');

// Generate Hero Flow Diagram SVG
const heroFlowSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 260" width="100%" height="260">
  <defs>
    <linearGradient id="flowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#7C5CFF"/>
      <stop offset="100%" stop-color="#22D3EE"/>
    </linearGradient>
  </defs>
  <rect width="960" height="260" rx="16" fill="#0B1020" stroke="#1C2547" stroke-width="2"/>
  <text x="480" y="38" font-family="'Poppins', sans-serif" font-weight="700" font-size="20" fill="#E8ECFF" text-anchor="middle">PinchDrop Core Interaction Flow</text>
  
  <!-- Step 1: Laptop Screen -->
  <g transform="translate(60, 65)">
    <rect width="210" height="145" rx="12" fill="#141B34" stroke="#1C2547" stroke-width="1.5"/>
    <text x="105" y="32" font-family="'Poppins', sans-serif" font-size="14" font-weight="600" fill="#E8ECFF" text-anchor="middle">1. PC / Screen</text>
    <rect x="25" y="48" width="160" height="60" rx="8" fill="#1C2547" stroke="#7C5CFF" stroke-width="1.5"/>
    <text x="105" y="78" font-family="'Inter', sans-serif" font-size="12" fill="#7C5CFF" text-anchor="middle">Target File / Card</text>
    <text x="105" y="96" font-family="'Inter', sans-serif" font-size="10" fill="#8B94B8" text-anchor="middle">Hover with cursor</text>
    <text x="105" y="130" font-family="'Inter', sans-serif" font-size="11" font-weight="600" fill="#34D399" text-anchor="middle">💻 PINCH</text>
  </g>

  <!-- Arrow 1 -->
  <path d="M285,135 L335,135" stroke="url(#flowGrad)" stroke-width="3" marker-end="url(#arrow)" stroke-dasharray="6,4"/>

  <!-- Step 2: Air Gesture -->
  <g transform="translate(350, 65)">
    <rect width="230" height="145" rx="12" fill="#141B34" stroke="#7C5CFF" stroke-width="2"/>
    <text x="115" y="32" font-family="'Poppins', sans-serif" font-size="14" font-weight="600" fill="#E8ECFF" text-anchor="middle">2. Air Gesture</text>
    <circle cx="115" cy="78" r="32" fill="#1C2547" stroke="#22D3EE" stroke-width="2"/>
    <text x="115" y="84" font-family="'Inter', sans-serif" font-size="22" text-anchor="middle">✋</text>
    <text x="115" y="130" font-family="'Inter', sans-serif" font-size="11" font-weight="600" fill="#22D3EE" text-anchor="middle">✋ MOVE &amp; CARRY</text>
  </g>

  <!-- Arrow 2 -->
  <path d="M595,135 L645,135" stroke="url(#flowGrad)" stroke-width="3" stroke-dasharray="6,4"/>

  <!-- Step 3: Phone / Drop Zone -->
  <g transform="translate(660, 65)">
    <rect width="220" height="145" rx="12" fill="#141B34" stroke="#1C2547" stroke-width="1.5"/>
    <text x="110" y="32" font-family="'Poppins', sans-serif" font-size="14" font-weight="600" fill="#E8ECFF" text-anchor="middle">3. Drop / Zone</text>
    <rect x="25" y="48" width="170" height="60" rx="8" fill="#1C2547" stroke="#22D3EE" stroke-width="1.5"/>
    <text x="110" y="76" font-family="'Inter', sans-serif" font-size="12" fill="#22D3EE" text-anchor="middle">📱 Phone Edge Zone</text>
    <text x="110" y="94" font-family="'Inter', sans-serif" font-size="10" fill="#8B94B8" text-anchor="middle">Encrypted LAN Stream</text>
    <text x="110" y="130" font-family="'Inter', sans-serif" font-size="11" font-weight="600" fill="#34D399" text-anchor="middle">📱 RELEASE &amp; DROP</text>
  </g>
</svg>`;
fs.writeFileSync(path.join(ASSETS_DIR, 'hero-flow.svg'), heroFlowSvg, 'utf8');

// Generate Tech Stack Grid SVG
const techStackSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 210" width="100%" height="210">
  <rect width="960" height="210" rx="12" fill="#0B1020" stroke="#1C2547" stroke-width="2"/>
  <text x="24" y="32" font-family="'Poppins', sans-serif" font-weight="600" font-size="18" fill="#E8ECFF">PinchDrop Canonical Technology Stack</text>
  <g transform="translate(24, 52)">
    <!-- Tauri 2 -->
    <g transform="translate(0, 0)">
      <rect width="215" height="125" rx="10" fill="#141B34" stroke="#1C2547" stroke-width="1.5"/>
      <text x="18" y="30" font-family="'Poppins', sans-serif" font-size="14" font-weight="600" fill="#7C5CFF">Tauri 2 + Rust Core</text>
      <text x="18" y="52" font-family="'Inter', sans-serif" font-size="11" fill="#E8ECFF">Tokio, Axum, Rustls, Trash</text>
      <text x="18" y="70" font-family="'Inter', sans-serif" font-size="10" fill="#8B94B8">Lightweight native Windows shell</text>
      <text x="18" y="105" font-family="'JetBrains Mono', monospace" font-size="10" fill="#34D399">&lt; 60 MB Installer Target</text>
    </g>
    <!-- React 18 UI -->
    <g transform="translate(230, 0)">
      <rect width="215" height="125" rx="10" fill="#141B34" stroke="#1C2547" stroke-width="1.5"/>
      <text x="18" y="30" font-family="'Poppins', sans-serif" font-size="14" font-weight="600" fill="#22D3EE">React 18 + TS UI</text>
      <text x="18" y="52" font-family="'Inter', sans-serif" font-size="11" fill="#E8ECFF">Vite, Tailwind, Framer Motion</text>
      <text x="18" y="70" font-family="'Inter', sans-serif" font-size="10" fill="#8B94B8">WebView2 60 fps aurora glass</text>
      <text x="18" y="105" font-family="'JetBrains Mono', monospace" font-size="10" fill="#22D3EE">p95 &lt; 60ms latency</text>
    </g>
    <!-- Vision & Gesture -->
    <g transform="translate(460, 0)">
      <rect width="215" height="125" rx="10" fill="#141B34" stroke="#1C2547" stroke-width="1.5"/>
      <text x="18" y="30" font-family="'Poppins', sans-serif" font-size="14" font-weight="600" fill="#34D399">MediaPipe + One-Euro</text>
      <text x="18" y="52" font-family="'Inter', sans-serif" font-size="11" fill="#E8ECFF">Tasks-Vision GPU Delegate</text>
      <text x="18" y="70" font-family="'Inter', sans-serif" font-size="10" fill="#8B94B8">Pure TS deterministic gesture FSM</text>
      <text x="18" y="105" font-family="'JetBrains Mono', monospace" font-size="10" fill="#FBBF24">Bundled local models (no CDN)</text>
    </g>
    <!-- Android App -->
    <g transform="translate(690, 0)">
      <rect width="215" height="125" rx="10" fill="#141B34" stroke="#1C2547" stroke-width="1.5"/>
      <text x="18" y="30" font-family="'Poppins', sans-serif" font-size="14" font-weight="600" fill="#FBBF24">Android Kotlin App</text>
      <text x="18" y="52" font-family="'Inter', sans-serif" font-size="11" fill="#E8ECFF">Jetpack Compose, Hilt, Room</text>
      <text x="18" y="70" font-family="'Inter', sans-serif" font-size="10" fill="#8B94B8">WorkManager, Share Sheet target</text>
      <text x="18" y="105" font-family="'JetBrains Mono', monospace" font-size="10" fill="#34D399">Android 15 dataSync compliant</text>
    </g>
  </g>
</svg>`;
fs.writeFileSync(path.join(ASSETS_DIR, 'tech-stack.svg'), techStackSvg, 'utf8');

// Generate Badge SVGs
const BADGES = [
  { name: 'badge-status.svg', label: 'status', val: 'Genesis Complete', color: '#34D399' },
  { name: 'badge-stage.svg', label: 'stage', val: 'S0 · Genesis', color: '#7C5CFF' },
  { name: 'badge-privacy.svg', label: 'privacy', val: 'Local-first · Zero Cloud', color: '#22D3EE' },
  { name: 'badge-platform.svg', label: 'platform', val: 'Windows + Android', color: '#7C5CFF' },
  { name: 'badge-license.svg', label: 'license', val: 'TBD · All Rights Reserved', color: '#8B94B8' },
];

for (const b of BADGES) {
  const labelWidth = b.label.length * 7 + 16;
  const valWidth = b.val.length * 7 + 16;
  const totalWidth = labelWidth + valWidth;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20">
  <linearGradient id="b" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="a">
    <rect width="${totalWidth}" height="20" rx="4" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#a)">
    <rect width="${labelWidth}" height="20" fill="#1C2547"/>
    <rect x="${labelWidth}" width="${valWidth}" height="20" fill="${b.color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#b)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${b.label}</text>
    <text x="${labelWidth / 2}" y="14">${b.label}</text>
    <text x="${labelWidth + valWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${b.val}</text>
    <text x="${labelWidth + valWidth / 2}" y="14">${b.val}</text>
  </g>
</svg>`;
  fs.writeFileSync(path.join(BADGES_DIR, b.name), svg, 'utf8');
}

console.log('Successfully generated SVGs in docs/assets/');
