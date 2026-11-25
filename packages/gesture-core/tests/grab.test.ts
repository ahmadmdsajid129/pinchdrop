import { describe, expect, it } from 'vitest';
import { GrabMachine, cameraToScreen, grabConfigFor } from '../src/grab';

const cfg = grabConfigFor(55);
const hand = (pinchRatio: number, x = 0.5, y = 0.5) => ({ x, y, pinchRatio });

describe('GrabMachine', () => {
  it('needs the pinch held for the dwell time', () => {
    const m = new GrabMachine(cfg);
    expect(m.step(0, hand(0.1))).toBeNull();
    expect(m.step(60, hand(0.1))).toBeNull();
    expect(m.step(130, hand(0.1))).toEqual({ type: 'grab', x: 0.5, y: 0.5 });
    expect(m.holding).toBe(true);
  });

  it('ignores a quick accidental pinch', () => {
    const m = new GrabMachine(cfg);
    m.step(0, hand(0.1));
    m.step(50, hand(0.9));
    expect(m.step(200, hand(0.9))).toBeNull();
    expect(m.state).toBe('IDLE');
  });

  it('moves while held and releases only after the hand stays open', () => {
    const m = new GrabMachine(cfg);
    m.step(0, hand(0.1));
    m.step(130, hand(0.1));
    expect(m.step(160, hand(0.1, 0.6, 0.4))).toEqual({ type: 'move', x: 0.6, y: 0.4 });
    expect(m.step(200, hand(0.9, 0.7, 0.3))?.type).toBe('move');
    // Wobble back into a pinch: not released.
    expect(m.step(260, hand(0.1, 0.7, 0.3))?.type).toBe('move');
    m.step(300, hand(0.9, 0.8, 0.2));
    expect(m.step(500, hand(0.9, 0.8, 0.2))).toEqual({ type: 'release', x: 0.8, y: 0.2 });
    expect(m.holding).toBe(false);
  });

  it('cancels when the hand is lost while holding', () => {
    const m = new GrabMachine(cfg);
    m.step(0, hand(0.1));
    m.step(130, hand(0.1));
    expect(m.step(1000, null)).toBeNull();
    expect(m.step(1700, null)).toEqual({ type: 'cancel' });
  });

  it('values between the thresholds keep the current state (hysteresis)', () => {
    const m = new GrabMachine(cfg);
    const mid = (cfg.enterRatio + cfg.exitRatio) / 2;
    m.step(0, hand(0.1));
    m.step(130, hand(0.1));
    for (let t = 140; t < 1000; t += 33) expect(m.step(t, hand(mid))?.type).toBe('move');
  });
});

describe('grabConfigFor', () => {
  it('strict needs fingers closer than relaxed', () => {
    expect(grabConfigFor(100).enterRatio).toBeLessThan(grabConfigFor(0).enterRatio);
    expect(grabConfigFor(500).enterRatio).toBeCloseTo(grabConfigFor(100).enterRatio);
    expect(grabConfigFor(40).exitRatio).toBeGreaterThan(grabConfigFor(40).enterRatio);
  });
});

describe('cameraToScreen', () => {
  it('mirrors and stretches the middle of the camera view', () => {
    expect(cameraToScreen(0.5, 0.5)).toEqual({ x: 0.5, y: 0.5 });
    expect(cameraToScreen(0.88, 0.12).x).toBeCloseTo(0);
    expect(cameraToScreen(0.12, 0.88).x).toBeCloseTo(1);
    expect(cameraToScreen(0, 1)).toEqual({ x: 1, y: 1 });
  });
});
