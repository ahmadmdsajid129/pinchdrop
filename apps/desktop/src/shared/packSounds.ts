// v2 · The sound of each animation pack (Pill Studio). Synthesized live with Web Audio: no audio
// files, nothing downloaded. Quiet and short, matched to the animation's timing.

import type { FxPack } from './pillThemes';

let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  if (typeof window === 'undefined' || !window.AudioContext) return null;
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

const VOL = 0.5;

/** A pitched note with a soft attack and decay. */
function tone(freq: number, at: number, ms: number, vol: number, type: OscillatorType = 'sine', to?: number) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + at;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + ms / 1000);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol * VOL, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + ms / 1000 + 0.02);
}

let noiseBuf: AudioBuffer | null = null;
/** Filtered noise sweeping between two frequencies: whooshes, rustles, pours. */
function noise(at: number, ms: number, vol: number, f0: number, f1: number, type: BiquadFilterType = 'bandpass', q = 1.2) {
  const a = ac();
  if (!a) return;
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = a.currentTime + at;
  const src = a.createBufferSource();
  src.buffer = noiseBuf;
  const f = a.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + ms / 1000);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol * VOL, t + (ms / 1000) * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
  src.stop(t + ms / 1000 + 0.02);
}

/** A bright little chord when something lands. */
function chord(at: number, notes: number[], vol = 0.12) {
  notes.forEach((n, i) => tone(n, at + i * 0.045, 600, vol, 'sine'));
}

type Kind = 'launch' | 'landed' | 'arrive';

/** Each pack's sound. Launch starts with the lift-off (~0.65 s in, the pack takes over). */
const SOUNDS: Record<Exclude<FxPack, 'default'>, (k: Kind) => void> = {
  plane: (k) => {
    if (k === 'landed') return chord(0, [784, 988, 1319]);
    noise(k === 'arrive' ? 0 : 0.62, 700, 0.25, 500, 2400);
    tone(660, k === 'arrive' ? 0.75 : 1.4, 220, 0.12, 'triangle', 990);
  },
  portal: (k) => {
    if (k === 'landed') return chord(0, [523, 659, 988]);
    tone(140, 0.05, 1300, 0.2, 'sine', 620);
    tone(280, 0.1, 1100, 0.08, 'triangle', 1240);
    noise(0.1, 1200, 0.1, 300, 1800, 'bandpass', 6);
  },
  comet: (k) => {
    if (k === 'landed') return chord(0, [880, 1175, 1568]);
    const at = k === 'arrive' ? 0 : 0.62;
    noise(at, 600, 0.3, 4000, 800, 'highpass', 0.7);
    [0, 1, 2, 3].forEach((i) => tone(1800 + i * 300, at + 0.1 + i * 0.09, 120, 0.06, 'sine'));
    tone(220, at + 0.58, 300, 0.25, 'sine', 90);
  },
  blackhole: (k) => {
    if (k === 'landed') return chord(0, [392, 494, 740]);
    if (k === 'arrive') {
      tone(60, 0, 700, 0.35, 'sine', 300);
      return noise(0.1, 700, 0.15, 200, 3000, 'lowpass', 0.8);
    }
    tone(320, 0.65, 900, 0.3, 'sine', 40);
    noise(0.65, 800, 0.15, 3000, 120, 'lowpass', 0.8);
    tone(55, 1.45, 260, 0.4, 'sine', 35);
  },
  origami: (k) => {
    if (k === 'landed') return chord(0, [659, 880, 1047]);
    const at = k === 'arrive' ? 0 : 0.62;
    [0, 1, 2, 3, 4].forEach((i) => noise(at + i * 0.13, 90, 0.18, 2500, 5000, 'bandpass', 2));
    tone(1047, at + 0.75, 500, 0.1, 'sine');
  },
  pixel: (k) => {
    if (k === 'landed') return [523, 659, 784, 1047].forEach((n, i) => tone(n, i * 0.06, 110, 0.07, 'square'));
    const at = k === 'arrive' ? 0 : 0.62;
    const notes = k === 'arrive' ? [1047, 880, 784, 659, 523] : [523, 659, 784, 880, 1047];
    notes.forEach((n, i) => tone(n, at + i * 0.07, 90, 0.06, 'square'));
  },
  ink: (k) => {
    if (k === 'landed') return chord(0, [440, 554, 659]);
    const at = k === 'arrive' ? 0.1 : 0.85;
    tone(900, at, 160, 0.2, 'sine', 300);
    tone(600, at + 0.25, 140, 0.12, 'sine', 240);
    noise(at + 0.2, 700, 0.08, 400, 200, 'lowpass', 0.7);
  },
  liquid: (k) => {
    if (k === 'landed') return chord(0, [587, 740, 880]);
    const at = k === 'arrive' ? 0 : 0.62;
    noise(at, 900, 0.18, 300, 1200, 'lowpass', 1.5);
    [0, 1, 2, 3].forEach((i) => tone(500 + ((i * 173) % 400), at + 0.2 + i * 0.15, 90, 0.1, 'sine', 900));
  },
};

export function playPackSound(pack: FxPack, kind: Kind) {
  if (pack === 'default') return;
  try {
    SOUNDS[pack](kind);
  } catch {
    // no audio device: silent
  }
}
