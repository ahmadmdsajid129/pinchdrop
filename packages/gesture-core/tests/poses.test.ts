import { describe, expect, it } from 'vitest';
import { PoseMachine, callPoseConfigFor, classifyPose, frameRect, handShape, poseConfigFor, type HandShape } from '../src/poses';

type P = { x: number; y: number; z: number };

/**
 * Builds 21 landmarks for an upright hand (wrist at the bottom). `out` says which fingers are
 * straight; curled fingers fold their tips back towards the palm. `thumb` = 'out' | 'up' | 'in'.
 */
function hand(
  out: { index?: boolean; middle?: boolean; ring?: boolean; pinky?: boolean },
  thumb: 'out' | 'up' | 'in',
  cx = 0.5,
  cy = 0.6,
  s = 0.15,
): P[] {
  const p = (x: number, y: number): P => ({ x: cx + x * s, y: cy + y * s, z: 0 });
  const lm: P[] = new Array(21);
  lm[0] = p(0, 1); // wrist
  // thumb 1..4
  lm[1] = p(-0.35, 0.8);
  lm[2] = p(-0.55, 0.55);
  if (thumb === 'out') {
    lm[3] = p(-0.8, 0.35);
    lm[4] = p(-1.05, 0.15);
  } else if (thumb === 'up') {
    lm[3] = p(-0.55, -0.2);
    lm[4] = p(-0.5, -0.7); // a real thumb sticks up well above the knuckles
  } else {
    lm[3] = p(-0.3, 0.45);
    lm[4] = p(-0.05, 0.4);
  }
  const fingers: [number, number, boolean | undefined][] = [
    [5, -0.3, out.index],
    [9, 0, out.middle],
    [13, 0.25, out.ring],
    [17, 0.48, out.pinky],
  ];
  for (const [mcp, dx, straight] of fingers) {
    lm[mcp] = p(dx, 0);
    lm[mcp + 1] = p(dx, -0.4);
    if (straight) {
      lm[mcp + 2] = p(dx, -0.7);
      lm[mcp + 3] = p(dx, -0.95);
    } else {
      lm[mcp + 2] = p(dx, -0.2);
      lm[mcp + 3] = p(dx, 0.15);
    }
  }
  return lm;
}

const all = { index: true, middle: true, ring: true, pinky: true };

describe('poses from landmarks', () => {
  it('recognises each pose', () => {
    expect(classifyPose(handShape(hand(all, 'out'))!)).toBe('open');
    expect(classifyPose(handShape(hand({}, 'in'))!)).toBe('fist');
    expect(classifyPose(handShape(hand({}, 'up'))!)).toBe('thumbs_up');
    expect(classifyPose(handShape(hand({ index: true, middle: true }, 'in'))!)).toBe('peace');
    expect(classifyPose(handShape(hand({ index: true }, 'in'))!)).toBe('point');
    expect(classifyPose(handShape(hand({ index: true }, 'out'))!)).toBe('l_shape');
  });

  it('a hand closing into a pinch is never a fist', () => {
    const lm = hand({}, 'in');
    // thumb tip on the curled index tip
    lm[4] = { ...lm[8] };
    expect(classifyPose(handShape(lm)!)).not.toBe('fist');
  });

  it('frames a rectangle with two L hands', () => {
    const left = hand({ index: true }, 'out', 0.3, 0.6);
    const right = hand({ index: true }, 'out', 0.7, 0.5);
    const r = frameRect(left, right)!;
    expect(r).not.toBeNull();
    expect(r.x1 - r.x0).toBeGreaterThan(0.3);
    expect(frameRect(left, hand(all, 'out', 0.7, 0.5))).toBeNull();
  });
});

const shape = (pose: 'open' | 'fist' | 'peace' | 'thumbs' | 'point', x = 0.5, y = 0.5, extra: Partial<HandShape> = {}): HandShape => {
  const f = {
    open: { thumb: true, index: true, middle: true, ring: true, pinky: true },
    fist: { thumb: false, index: false, middle: false, ring: false, pinky: false },
    peace: { thumb: false, index: true, middle: true, ring: false, pinky: false },
    thumbs: { thumb: true, index: false, middle: false, ring: false, pinky: false },
    point: { thumb: false, index: true, middle: false, ring: false, pinky: false },
  }[pose];
  return { fingers: f, thumbUp: pose === 'thumbs', pinchRatio: pose === 'open' ? 0.9 : 0.5, x, y, scale: 0.12, score: 0.95, ...extra };
};

function feed(m: PoseMachine, frames: [number, HandShape | null][]) {
  return frames.map(([t, h]) => m.step(t, h)).filter(Boolean);
}
const still = (pose: Parameters<typeof shape>[0], ms: number, start = 0) =>
  Array.from({ length: Math.ceil(ms / 33) }, (_, i) => [start + i * 33, shape(pose)] as [number, HandShape]);

describe('PoseMachine', () => {
  const cfg = poseConfigFor(50);

  it('fires each held pose once, after its hold time', () => {
    for (const [pose, ev, ms] of [
      ['open', 'palm_hold', cfg.holdMs.open],
      ['fist', 'fist_hold', cfg.holdMs.fist],
      ['peace', 'peace_hold', cfg.holdMs.peace],
      ['thumbs', 'thumbs_up', cfg.holdMs.thumbs_up],
    ] as const) {
      const m = new PoseMachine(cfg);
      expect(feed(m, still(pose, ms - 100))).toEqual([]);
      expect(feed(m, still(pose, 2000, ms))).toEqual([ev]);
    }
  });

  it('a held pose fires again only after letting go', () => {
    const m = new PoseMachine(cfg);
    expect(feed(m, still('fist', 3000))).toEqual(['fist_hold']);
    feed(m, still('point', 300, 3000));
    expect(feed(m, still('fist', 2000, 4300))).toEqual(['fist_hold']);
  });

  it('moving while holding a pose restarts the hold', () => {
    const m = new PoseMachine(cfg);
    const shaky = Array.from({ length: 60 }, (_, i) => [i * 33, shape('peace', i % 2 ? 0.3 : 0.6)] as [number, HandShape]);
    expect(feed(m, shaky).filter((e) => e === 'peace_hold')).toEqual([]);
  });

  it('a fast sideways sweep is a swipe, in the right direction', () => {
    const m = new PoseMachine(cfg);
    // camera x falls = hand moves to the user's right
    const right = Array.from({ length: 10 }, (_, i) => [i * 33, shape('open', 0.75 - i * 0.05)] as [number, HandShape]);
    expect(feed(m, right)).toEqual(['swipe_right']);
    const m2 = new PoseMachine(cfg);
    const left = Array.from({ length: 10 }, (_, i) => [i * 33, shape('open', 0.25 + i * 0.05)] as [number, HandShape]);
    expect(feed(m2, left)).toEqual(['swipe_left']);
  });

  it('a slow drift is not a swipe', () => {
    const m = new PoseMachine(cfg);
    const slow = Array.from({ length: 60 }, (_, i) => [i * 33, shape('open', 0.3 + i * 0.008)] as [number, HandShape]);
    expect(feed(m, slow).filter((e) => e!.startsWith('swipe'))).toEqual([]);
  });

  it('side to side twice is a wave', () => {
    const m = new PoseMachine(cfg);
    const xs = [0.5, 0.55, 0.6, 0.62, 0.57, 0.52, 0.47, 0.45, 0.5, 0.55, 0.6, 0.62];
    expect(feed(m, xs.map((x, i) => [i * 60, shape('open', x)] as [number, HandShape]))).toEqual(['wave']);
  });

  it('ignores far, unsure or missing hands', () => {
    const m = new PoseMachine(cfg);
    const far = Array.from({ length: 60 }, (_, i) => [i * 33, shape('fist', 0.5, 0.5, { scale: 0.02 })] as [number, HandShape]);
    expect(feed(m, far)).toEqual([]);
    const unsure = Array.from({ length: 60 }, (_, i) => [i * 33, shape('fist', 0.5, 0.5, { score: 0.2 })] as [number, HandShape]);
    expect(feed(m, unsure)).toEqual([]);
    expect(feed(m, [[0, null]])).toEqual([]);
  });
});

describe('call gestures (easier while the phone rings)', () => {
  const cfg = callPoseConfigFor(50);
  const noThumb = (x = 0.5): HandShape => ({ ...shape('open', x), fingers: { thumb: false, index: true, middle: true, ring: true, pinky: true }, pinchRatio: 0.6 });

  it('an open palm with the thumb hidden still answers', () => {
    const m = new PoseMachine(cfg);
    const frames = Array.from({ length: 40 }, (_, i) => [i * 33, noThumb()] as [number, HandShape]);
    expect(feed(m, frames)).toEqual(['palm_hold']);
  });

  it('answers sooner than the normal palm hold', () => {
    expect(cfg.holdMs.open).toBeLessThan(poseConfigFor(50).holdMs.open);
  });

  it('a slightly shaky palm still answers', () => {
    const m = new PoseMachine(cfg);
    const shaky = Array.from({ length: 50 }, (_, i) => [i * 33, shape('open', 0.5 + (i % 2 ? 0.006 : -0.006))] as [number, HandShape]);
    expect(feed(m, shaky)).toEqual(['palm_hold']);
  });

  it('a couple of lost frames do not restart the hold', () => {
    const m = new PoseMachine(cfg);
    const frames: [number, HandShape | null][] = [];
    for (let i = 0; i < 40; i++) frames.push([i * 33, i === 8 || i === 9 ? null : shape('open')]);
    const evs = feed(m, frames);
    expect(evs).toEqual(['palm_hold']);
    // fired by ~hold time + the gap, not hold time after the gap
    const m2 = new PoseMachine(cfg);
    let firedAt = -1;
    for (const [t, h] of frames) if (m2.step(t, h) && firedAt < 0) firedAt = t;
    expect(firedAt).toBeLessThan(cfg.holdMs.open + 120);
  });

  it('raising a hand into view is not a swipe', () => {
    const m = new PoseMachine(cfg);
    const sweep = Array.from({ length: 8 }, (_, i) => [i * 33, shape('open', 0.75 - i * 0.06)] as [number, HandShape]);
    expect(feed(m, sweep)).toEqual([]);
  });

  it('a deliberate swipe once the hand is in view rejects', () => {
    const m = new PoseMachine(cfg);
    const frames: [number, HandShape][] = [];
    for (let i = 0; i < 16; i++) frames.push([i * 33, shape('point', 0.75)]);
    for (let i = 0; i < 10; i++) frames.push([528 + i * 33, shape('open', 0.75 - i * 0.05)]);
    expect(feed(m, frames)).toEqual(['swipe_right']);
  });

  it('never waves', () => {
    const m = new PoseMachine(cfg);
    const wave = Array.from({ length: 60 }, (_, i) => [i * 33, shape('open', 0.5 + 0.08 * Math.sin(i / 2))] as [number, HandShape]);
    expect(feed(m, wave)).not.toContain('wave');
  });
});
