import { describe, expect, it } from 'vitest';
import { GrabMachine, cameraToScreen, extendedFingers, grabConfigFor, handScale } from '../src/grab';
import type { HandReading } from '../src/grab';

const cfg = grabConfigFor(55);

/** A good, close, confident hand. Defaults: open palm. */
const hand = (p: Partial<HandReading> = {}): HandReading => ({
  x: 0.5,
  y: 0.5,
  pinchRatio: 0.9,
  extended: 4,
  scale: 0.15,
  score: 0.95,
  ...p,
});
const pinch = (p: Partial<HandReading> = {}) => hand({ pinchRatio: 0.1, extended: 3, ...p });

/** Shows an open hand long enough to settle, returns the next timestamp. */
function settle(m: GrabMachine, t = 0) {
  for (let i = 0; i <= 12; i++) m.step(t + i * 33, hand());
  return t + 13 * 33;
}

/** Settles, then pinches long enough to grab; returns the next timestamp. */
function grab(m: GrabMachine) {
  let t = settle(m);
  for (let i = 0; i < 8; i++, t += 33) m.step(t, pinch());
  expect(m.holding).toBe(true);
  return t;
}

describe('GrabMachine — only a deliberate pinch grabs', () => {
  it('grabs after the hand settled and the pinch was held', () => {
    const m = new GrabMachine(cfg);
    let t = settle(m);
    const events = [];
    for (let i = 0; i < 8; i++, t += 33) events.push(m.step(t, pinch()));
    expect(events.filter((e) => e?.type === 'grab')).toEqual([{ type: 'grab', x: 0.5, y: 0.5 }]);
    expect(events.filter((e) => e && e.type !== 'grab' && e.type !== 'move')).toEqual([]);
  });

  it('ignores a hand that enters the frame already pinched', () => {
    const m = new GrabMachine(cfg);
    for (let t = 0; t < 250; t += 33) expect(m.step(t, pinch())).toBeNull();
    expect(m.ignored).toBe('settling');
    expect(m.holding).toBe(false);
  });

  it('ignores a quick accidental touch', () => {
    const m = new GrabMachine(cfg);
    let t = settle(m);
    m.step(t, pinch());
    t += 60;
    m.step(t, hand());
    for (let i = 0; i < 10; i++) expect(m.step((t += 33), hand())).toBeNull();
  });

  it('ignores a fist (thumb resting on curled fingers)', () => {
    const m = new GrabMachine(cfg);
    let t = settle(m);
    for (let i = 0; i < 20; i++) expect(m.step((t += 33), pinch({ extended: 0 }))).toBeNull();
    expect(m.ignored).toBe('fist');
  });

  it('ignores far-away hands (someone in the background)', () => {
    const m = new GrabMachine(cfg);
    for (let t = 0; t < 2000; t += 33) expect(m.step(t, pinch({ scale: 0.03 }))).toBeNull();
    expect(m.ignored).toBe('far');
  });

  it('ignores readings the tracker is unsure about', () => {
    const m = new GrabMachine(cfg);
    for (let t = 0; t < 2000; t += 33) expect(m.step(t, pinch({ score: 0.4 }))).toBeNull();
    expect(m.ignored).toBe('unsure');
  });

  it('ignores pinches while the hand is waving fast', () => {
    const m = new GrabMachine(cfg);
    let t = settle(m);
    let x = 0.5;
    for (let i = 0; i < 20; i++) {
      x = x === 0.1 ? 0.9 : 0.1; // jumps across the screen every frame
      expect(m.step((t += 33), pinch({ x }))).toBeNull();
    }
    expect(m.holding).toBe(false);
  });
});

describe('GrabMachine — only a clearly open hand drops', () => {
  it('moves while held and drops after the hand stays open', () => {
    const m = new GrabMachine(cfg);
    let t = grab(m);
    expect(m.step((t += 33), pinch({ x: 0.6, y: 0.4 }))).toEqual({ type: 'move', x: 0.6, y: 0.4 });
    let last = null;
    for (let i = 0; i < 10; i++) last = m.step((t += 33), hand({ x: 0.8, y: 0.2 })) ?? last;
    expect(last).toEqual({ type: 'release', x: 0.8, y: 0.2 });
    expect(m.holding).toBe(false);
  });

  it('a half-open hand (fingers apart but curled) keeps holding', () => {
    const m = new GrabMachine(cfg);
    let t = grab(m);
    for (let i = 0; i < 40; i++) expect(m.step((t += 33), hand({ extended: 1 }))?.type).toBe('move');
    expect(m.holding).toBe(true);
  });

  it('values between the thresholds keep holding (hysteresis)', () => {
    const m = new GrabMachine(cfg);
    let t = grab(m);
    const mid = (cfg.enterRatio + cfg.exitRatio) / 2;
    for (let i = 0; i < 30; i++) expect(m.step((t += 33), hand({ pinchRatio: mid }))?.type).toBe('move');
  });

  it('cancels when the hand is lost while holding', () => {
    const m = new GrabMachine(cfg);
    const t = grab(m);
    expect(m.step(t + 1000, null)).toBeNull();
    expect(m.step(t + 1600, null)).toEqual({ type: 'cancel' });
  });

  it('a hand that turns unsure counts as lost, not as a drop', () => {
    const m = new GrabMachine(cfg);
    const t = grab(m);
    expect(m.step(t + 100, hand({ score: 0.2 }))).toBeNull();
    expect(m.holding).toBe(true);
    expect(m.step(t + 1700, hand({ score: 0.2 }))).toEqual({ type: 'cancel' });
  });
});

describe('grabConfigFor', () => {
  it('strict needs fingers closer than relaxed', () => {
    expect(grabConfigFor(100).enterRatio).toBeLessThan(grabConfigFor(0).enterRatio);
    expect(grabConfigFor(500).enterRatio).toBeCloseTo(grabConfigFor(100).enterRatio);
    expect(grabConfigFor(40).exitRatio).toBeGreaterThan(grabConfigFor(40).enterRatio);
  });
});

describe('helpers', () => {
  it('cameraToScreen mirrors and stretches the middle of the camera view', () => {
    expect(cameraToScreen(0.5, 0.5)).toEqual({ x: 0.5, y: 0.5 });
    expect(cameraToScreen(0.88, 0.12).x).toBeCloseTo(0);
    expect(cameraToScreen(0.12, 0.88).x).toBeCloseTo(1);
    expect(cameraToScreen(0, 1)).toEqual({ x: 1, y: 1 });
  });

  it('counts extended fingers and hand size', () => {
    // Wrist at origin; each finger: middle joint at distance 1, tip at 2 (extended) or 0.5 (curled).
    const lm = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
    const set = (i: number, d: number) => (lm[i] = { x: 0, y: -d, z: 0 });
    [6, 10, 14, 18].forEach((pip) => set(pip, 1));
    set(8, 2); // index extended
    set(12, 2); // middle extended
    set(16, 0.5); // ring curled
    set(20, 0.5); // pinky curled
    lm[9] = { x: 0, y: -0.2, z: 0 };
    expect(extendedFingers(lm)).toBe(2);
    expect(handScale(lm)).toBeCloseTo(0.2);
    expect(extendedFingers([])).toBe(0);
  });
});
