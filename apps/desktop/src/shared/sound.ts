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
export const ALERTS: Record<string, { label: string; play: () => void }> = {
  glass: { label: 'Glass', play: () => (note(1318.5, 0, 260, 0.07), note(1760, 90, 420, 0.06)) },
  drop: { label: 'Drop', play: () => tone(1100, 380, 160, 'sine', 0.08) },
  chime: { label: 'Chime', play: () => (note(1046.5, 0, 300, 0.05), note(1318.5, 80, 300, 0.05), note(1568, 160, 480, 0.05)) },
  pebble: { label: 'Pebble', play: () => (note(880, 0, 120, 0.07, 'triangle'), note(1174.7, 70, 220, 0.05, 'triangle')) },
  tick: { label: 'Tick', play: () => tone(2200, 1800, 35, 'square', 0.025) },
  none: { label: 'Silent', play: () => undefined },
};

/** Ringing patterns (repeat every ~2 s while a phone rings). */
export const RINGS: Record<string, { label: string; play: () => void }> = {
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
