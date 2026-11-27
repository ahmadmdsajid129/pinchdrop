// Tiny synthesized sounds (Web Audio, no audio files): UI blips, plus v2 phone alerts —
// minimal tones for chat messages, text messages (SMS) and ringing, chosen per phone in Settings.

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const C = window.AudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(from: number, to: number, ms: number, type: OscillatorType, volume: number) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + ms / 1000);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
  osc.connect(gain).connect(a.destination);
  osc.start(t);
  osc.stop(t + ms / 1000 + 0.01);
}

/** A soft bell-like note: quick attack, gentle decay, a quiet octave above for shimmer. */
function note(freq: number, at: number, ms: number, volume: number, type: OscillatorType = 'sine') {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + at / 1000;
  const end = t + ms / 1000;
  for (const [mult, vol] of [
    [1, volume],
    [2, volume * 0.18],
  ] as const) {
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq * mult, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain).connect(a.destination);
    osc.start(t);
    osc.stop(end + 0.02);
  }
}

export const sound = {
  open: () => tone(520, 880, 90, 'sine', 0.05),
  close: () => tone(700, 420, 80, 'sine', 0.04),
  pop: () => tone(320, 120, 45, 'triangle', 0.07),
};

// ---------------------------------------------------------------- v2 · phone alerts

/** Short alert sounds (messages, texts). */
export const ALERTS: Record<string, { label: string; play: () => void; pro?: boolean }> = {
  glass: { label: 'Glass', play: () => (note(1318.5, 0, 260, 0.07), note(1760, 90, 420, 0.06)) },
  drop: { label: 'Drop', play: () => tone(1100, 380, 160, 'sine', 0.08) },
  chime: { label: 'Chime', play: () => (note(1046.5, 0, 300, 0.05), note(1318.5, 80, 300, 0.05), note(1568, 160, 480, 0.05)) },
  pebble: { label: 'Pebble', play: () => (note(880, 0, 120, 0.07, 'triangle'), note(1174.7, 70, 220, 0.05, 'triangle')) },
  tick: { label: 'Tick', play: () => tone(2200, 1800, 35, 'square', 0.025) },
  none: { label: 'Silent', play: () => undefined },
};

/** Ringing patterns (repeat every ~2 s while a phone rings). */
export const RINGS: Record<string, { label: string; play: () => void; pro?: boolean }> = {
  soft: { label: 'Soft', play: () => (note(659.3, 0, 260, 0.07), note(987.8, 180, 420, 0.06)) },
  marimba: { label: 'Marimba', play: () => (note(784, 0, 160, 0.08, 'triangle'), note(1046.5, 140, 160, 0.08, 'triangle'), note(1318.5, 280, 320, 0.07, 'triangle')) },
  pulse: { label: 'Pulse', play: () => (note(880, 0, 140, 0.06), note(880, 260, 140, 0.06)) },
  classic: { label: 'Classic', play: () => { for (let i = 0; i < 6; i++) note(i % 2 ? 1180 : 960, i * 70, 70, 0.04, 'square'); } },
  none: { label: 'Silent', play: () => undefined },
};

export interface PhoneSoundChoice {
  message: string;
  sms: string;
  call: string;
}

export const DEFAULT_PHONE_SOUNDS: PhoneSoundChoice = { message: 'glass', sms: 'drop', call: 'soft' };

export function playAlert(name: string | undefined) {
  (ALERTS[name ?? ''] ?? ALERTS.glass).play();
}

let ringTimer: number | null = null;

/** Starts a ring pattern that repeats until stopRing(). */
export function startRing(name: string | undefined) {
  stopRing();
  const r = RINGS[name ?? ''] ?? RINGS.soft;
  r.play();
  ringTimer = window.setInterval(() => r.play(), 2000);
}

export function stopRing() {
  if (ringTimer !== null) {
    clearInterval(ringTimer);
    ringTimer = null;
  }
}

// ---------------------------------------------------------------- v2 Pro · sound packs
// Six designed packs (Pill Studio → Sound packs). Each has a chat-message sound, a text (SMS)
// sound and a ring. All synthesized here, nothing downloaded.

/** A pitch sweep that starts `at` ms from now. */
function sweep(from: number, to: number, at: number, ms: number, type: OscillatorType, volume: number) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + at / 1000;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + ms / 1000);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
  osc.connect(gain).connect(a.destination);
  osc.start(t);
  osc.stop(t + ms / 1000 + 0.02);
}

/** A slow-swelling pad note (glass harmonica, lo-fi keys). */
function pad(freq: number, at: number, ms: number, volume: number, type: OscillatorType = 'sine', cutoff = 0) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + at / 1000;
  const end = t + ms / 1000;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  // a little wobble, like old tape
  const lfo = a.createOscillator();
  const depth = a.createGain();
  lfo.frequency.value = 5.2;
  depth.gain.value = freq * 0.004;
  lfo.connect(depth).connect(osc.frequency);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + Math.min(0.12, ms / 3000));
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  let out: AudioNode = osc;
  if (cutoff) {
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    osc.connect(f);
    out = f;
  }
  out.connect(gain).connect(a.destination);
  osc.start(t);
  lfo.start(t);
  osc.stop(end + 0.02);
  lfo.stop(end + 0.02);
}

let noiseBuffer: AudioBuffer | null = null;
/** A burst of filtered noise: clicks, taps, rustles. */
function hiss(at: number, ms: number, volume: number, freq: number, type: BiquadFilterType = 'highpass') {
  const a = audio();
  if (!a) return;
  if (!noiseBuffer) {
    noiseBuffer = a.createBuffer(1, a.sampleRate / 2, a.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = a.currentTime + at / 1000;
  const src = a.createBufferSource();
  src.buffer = noiseBuffer;
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const gain = a.createGain();
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
  src.connect(f).connect(gain).connect(a.destination);
  src.start(t);
  src.stop(t + ms / 1000 + 0.02);
}

const PENTA = [1046.5, 1174.7, 1318.5, 1568, 1760, 2093];

Object.assign(ALERTS, {
  'arcade-coin': { label: 'Arcade · Coin', pro: true, play: () => (note(988, 0, 70, 0.05, 'square'), note(1319, 70, 260, 0.05, 'square')) },
  'arcade-up': { label: 'Arcade · Power-up', pro: true, play: () => [523, 659, 784, 1047, 1319].forEach((f, i) => note(f, i * 45, 90, 0.04, 'square')) },
  'scifi-zap': { label: 'Sci-fi · Zap', pro: true, play: () => (sweep(2400, 260, 0, 220, 'sawtooth', 0.035), sweep(1600, 300, 40, 200, 'sine', 0.04)) },
  'scifi-comm': { label: 'Sci-fi · Comm', pro: true, play: () => (note(1396.9, 0, 90, 0.05), note(1396.9, 130, 90, 0.05), sweep(900, 1800, 260, 160, 'sine', 0.04)) },
  'nature-drip': { label: 'Nature · Drip', pro: true, play: () => (sweep(700, 1900, 0, 90, 'sine', 0.09), sweep(1100, 2600, 140, 70, 'sine', 0.04)) },
  'nature-bird': { label: 'Nature · Bird', pro: true, play: () => [0, 110, 260].forEach((at, i) => sweep(2600 + i * 300, 4200, at, 80, 'sine', 0.05)) },
  'mech-type': { label: 'Mechanical · Type', pro: true, play: () => (hiss(0, 25, 0.25, 3000), hiss(70, 25, 0.2, 3500), tone(1800, 1500, 30, 'square', 0.02)) },
  'mech-ding': { label: 'Mechanical · Ding', pro: true, play: () => (hiss(0, 30, 0.22, 2800), hiss(60, 30, 0.22, 2800), note(2093, 140, 900, 0.05, 'triangle')) },
  'lofi-keys': { label: 'Lo-fi · Keys', pro: true, play: () => (pad(523.3, 0, 700, 0.05, 'triangle', 1400), pad(659.3, 40, 700, 0.04, 'triangle', 1400), pad(987.8, 80, 800, 0.03, 'triangle', 1400)) },
  'lofi-tap': { label: 'Lo-fi · Tap', pro: true, play: () => (hiss(0, 40, 0.08, 900, 'lowpass'), pad(392, 20, 520, 0.05, 'triangle', 1100)) },
  'glass-ping': { label: 'Glass · Ping', pro: true, play: () => (note(2637, 0, 900, 0.035), note(3520, 10, 700, 0.02)) },
  'glass-tap': { label: 'Glass · Tap', pro: true, play: () => (note(2349, 0, 380, 0.035), note(3136, 120, 600, 0.03)) },
});

Object.assign(RINGS, {
  'arcade-ring': { label: 'Arcade', pro: true, play: () => [784, 988, 1175, 988, 784, 1175, 1568].forEach((f, i) => note(f, i * 110, 100, 0.04, 'square')) },
  'scifi-ring': {
    label: 'Sci-fi',
    pro: true,
    play: () => {
      for (let i = 0; i < 4; i++) sweep(700, 1400, i * 220, 200, 'sine', 0.05);
    },
  },
  'nature-ring': { label: 'Nature (wind chimes)', pro: true, play: () => [0, 1, 2, 3, 4].forEach((i) => note(PENTA[Math.floor(Math.random() * PENTA.length)], i * 170 + Math.random() * 60, 900, 0.035)) },
  'mech-ring': {
    label: 'Mechanical (old bell)',
    pro: true,
    play: () => {
      for (let i = 0; i < 10; i++) note(i % 2 ? 1250 : 1180, i * 55, 60, 0.035, 'triangle');
      hiss(560, 40, 0.1, 2000);
    },
  },
  'lofi-ring': { label: 'Lo-fi', pro: true, play: () => [261.6, 329.6, 392, 493.9].forEach((f, i) => pad(f * 2, i * 160, 1100, 0.04, 'triangle', 1500)) },
  'glass-ring': { label: 'Glass harmonica', pro: true, play: () => [1318.5, 1568, 1975.5].forEach((f, i) => pad(f, i * 120, 1500, 0.03)) },
});

export interface SoundPack {
  id: string;
  name: string;
  line: string;
  pro: boolean;
  sounds: PhoneSoundChoice;
}

export const SOUND_PACKS: SoundPack[] = [
  { id: 'pinchdrop', name: 'PinchDrop', line: 'Soft bells. Free.', pro: false, sounds: { message: 'glass', sms: 'drop', call: 'soft' } },
  { id: 'arcade', name: 'Arcade', line: 'Coins, power-ups and an 8-bit ring.', pro: true, sounds: { message: 'arcade-coin', sms: 'arcade-up', call: 'arcade-ring' } },
  { id: 'scifi', name: 'Sci-fi', line: 'Zaps, comm beeps and a starship hail.', pro: true, sounds: { message: 'scifi-zap', sms: 'scifi-comm', call: 'scifi-ring' } },
  { id: 'nature', name: 'Nature', line: 'Water drips, birdsong and wind chimes.', pro: true, sounds: { message: 'nature-drip', sms: 'nature-bird', call: 'nature-ring' } },
  { id: 'mech', name: 'Mechanical', line: 'Typewriter keys and an old desk bell.', pro: true, sounds: { message: 'mech-type', sms: 'mech-ding', call: 'mech-ring' } },
  { id: 'lofi', name: 'Lo-fi', line: 'Warm, wobbly keys and a slow chord.', pro: true, sounds: { message: 'lofi-keys', sms: 'lofi-tap', call: 'lofi-ring' } },
  { id: 'glass', name: 'Glass', line: 'Crystal pings and a glass harmonica.', pro: true, sounds: { message: 'glass-ping', sms: 'glass-tap', call: 'glass-ring' } },
];

/** A Pro sound is replaced by the free default without Pro. */
export function freeSounds(s: PhoneSoundChoice, pro: boolean): PhoneSoundChoice {
  if (pro) return s;
  const ok = (name: string, table: Record<string, { pro?: boolean }>) => !table[name]?.pro;
  return {
    message: ok(s.message, ALERTS) ? s.message : DEFAULT_PHONE_SOUNDS.message,
    sms: ok(s.sms, ALERTS) ? s.sms : DEFAULT_PHONE_SOUNDS.sms,
    call: ok(s.call, RINGS) ? s.call : DEFAULT_PHONE_SOUNDS.call,
  };
}
