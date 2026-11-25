import { describe, expect, it } from 'vitest';
import { CatchMachine, catchConfigFor, type CatchFrame } from '../src/catch';

const cfg = catchConfigFor(50);
const open = (t: number, over: Partial<CatchFrame> = {}): CatchFrame => ({ t, extended: 4, pinchRatio: 0.9, scale: 0.12, score: 0.95, x: 0.5, y: 0.5, ...over });
const fist = (t: number): CatchFrame => open(t, { extended: 0, pinchRatio: 0.2 });

function run(m: CatchMachine, frames: (CatchFrame | null)[]) {
  return frames.map((f, i) => m.step(f?.t ?? i * 33, f)).some(Boolean);
}

describe('CatchMachine (catch at the PC webcam)', () => {
  it('catches a closed hand that opens', () => {
    const m = new CatchMachine(cfg);
    const frames = [fist(0), fist(33), fist(66), ...Array.from({ length: 8 }, (_, i) => open(100 + i * 33))];
    expect(run(m, frames)).toBe(true);
    expect(m.hint).toBe('CAUGHT');
  });

  it('catches a steady open palm after the longer hold', () => {
    const m = new CatchMachine(cfg);
    const short = Array.from({ length: 10 }, (_, i) => open(i * 33)); // 300 ms
    expect(run(m, short)).toBe(false);
    const more = Array.from({ length: 15 }, (_, i) => open(330 + i * 33)); // up to ~800 ms
    expect(run(m, more)).toBe(true);
  });

  it('catches only once', () => {
    const m = new CatchMachine(cfg);
    const frames = [fist(0), ...Array.from({ length: 30 }, (_, i) => open(33 + i * 33))];
    const hits = frames.filter((f) => m.step(f.t, f)).length;
    expect(hits).toBe(1);
  });

  it('ignores hands far from the camera', () => {
    const m = new CatchMachine(cfg);
    const far = Array.from({ length: 40 }, (_, i) => open(i * 33, { scale: 0.03 }));
    expect(run(m, far)).toBe(false);
    expect(m.hint).toBe('TOO_FAR');
  });

  it('ignores waving and pointing', () => {
    const m = new CatchMachine(cfg);
    const wave = Array.from({ length: 40 }, (_, i) => open(i * 33, { x: i % 2 ? 0.2 : 0.8 }));
    expect(run(m, wave)).toBe(false);
    m.reset();
    const point = Array.from({ length: 40 }, (_, i) => open(i * 33, { extended: 1, pinchRatio: 0.8 }));
    expect(run(m, point)).toBe(false);
  });

  it('ignores unsure tracking and resets when the hand leaves', () => {
    const m = new CatchMachine(cfg);
    expect(run(m, Array.from({ length: 40 }, (_, i) => open(i * 33, { score: 0.3 })))).toBe(false);
    const gap = [open(0), open(33), null, open(99), open(132)];
    expect(run(m, gap)).toBe(false);
    expect(m.progress).toBeLessThan(1);
  });
});
