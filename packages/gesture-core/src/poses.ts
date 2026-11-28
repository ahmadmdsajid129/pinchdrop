/**
 * v2 · The extra gestures (docs/v2-plan.md §2). Each one is deliberate: a pose held still for a
 * moment, or a clear motion, so a hand resting or passing by never triggers anything.
 *
 *  | gesture      | how                                   | event        |
 *  |--------------|---------------------------------------|--------------|
 *  | palm hold    | open palm, still, ~0.9 s              | palm_hold    |
 *  | swipe        | flat hand moving fast sideways        | swipe_left / swipe_right |
 *  | ✌️ hold       | index + middle up, ~0.6 s             | peace_hold   |
 *  | 👍            | fist with the thumb up, ~0.5 s         | thumbs_up    |
 *  | fist hold    | closed fist, ~0.8 s                   | fist_hold    |
 *  | wave         | open palm side to side, twice in ~1.2 s | wave       |
 *
 * Pure logic, unit-tested. What each event does depends on what's on screen (the app decides).
 */

type P = { x: number; y: number; z: number };

export interface Fingers {
  thumb: boolean;
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
}

/** One frame's worth of hand facts for pose recognition. Coordinates are camera space (0..1). */
export interface HandShape {
  fingers: Fingers;
  /** Thumb pointing up, above the knuckles (for 👍). */
  thumbUp: boolean;
  /** Thumb tip–index tip distance / palm size. */
  pinchRatio: number;
  /** Palm centre (middle-finger knuckle). */
  x: number;
  y: number;
  /** Wrist → middle knuckle length (closeness). */
  scale: number;
  score: number;
}

export type Pose = 'open' | 'fist' | 'peace' | 'thumbs_up' | 'point' | 'l_shape' | 'pinch' | 'other';

const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Reads the 21 MediaPipe landmarks into a HandShape. */
export function handShape(lm: P[], score = 1): HandShape | null {
  if (lm.length < 21) return null;
  const palm = dist(lm[0], lm[9]) || 1e-6;
  const out = (tip: number, pip: number) => dist(lm[0], lm[tip]) > dist(lm[0], lm[pip]) * 1.1;
  const thumb = dist(lm[4], lm[5]) / palm > 0.6 && dist(lm[4], lm[9]) / palm > 0.75;
  const fingers: Fingers = { thumb, index: out(8, 6), middle: out(12, 10), ring: out(16, 14), pinky: out(20, 18) };
  const thumbUp = thumb && lm[4].y < lm[5].y - 0.35 * palm && lm[4].y < lm[0].y - 0.5 * palm;
  return {
    fingers,
    thumbUp,
    pinchRatio: dist(lm[4], lm[8]) / palm,
    x: lm[9].x,
    y: lm[9].y,
    scale: Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y),
    score,
  };
}

export function classifyPose(h: HandShape): Pose {
  const f = h.fingers;
  const four = [f.index, f.middle, f.ring, f.pinky].filter(Boolean).length;
  if (h.pinchRatio < 0.25 && f.middle) return 'pinch';
  if (four === 4 && f.thumb && h.pinchRatio >= 0.55) return 'open';
  if (four === 0 && h.thumbUp) return 'thumbs_up';
  // A fist has the thumb wrapped over the fingers, not touching the index tip (that's a pinch
  // on its way): fingers curling into a pinch must never read as a fist.
  if (four === 0 && !h.thumbUp && h.pinchRatio >= 0.3) return 'fist';
  if (f.index && f.middle && !f.ring && !f.pinky) return 'peace';
  if (f.index && !f.middle && !f.ring && !f.pinky) return f.thumb ? 'l_shape' : 'point';
  return 'other';
}

export type PoseEvent = 'palm_hold' | 'peace_hold' | 'thumbs_up' | 'fist_hold' | 'swipe_left' | 'swipe_right' | 'wave';

export interface PoseConfig {
  minScale: number;
  minScore: number;
  holdMs: { open: number; peace: number; thumbs_up: number; fist: number };
  /** Image widths per second; a held pose must be steadier than this. */
  stillSpeed: number;
  /** Swipe: distance (image widths) and time window. */
  swipeDist: number;
  swipeMs: number;
  /** Wave: direction changes needed, each leg at least this long (widths), within waveMs. */
  waveTurns: number;
  waveLeg: number;
  waveMs: number;
  /** After any event, ignore everything for this long. */
  cooldownMs: number;
  /** Calls: an open hand counts without the thumb (it often hides behind the palm). */
  lenientOpen?: boolean;
  /** Calls: no wave (a palm moving into place must not count as anything). */
  noWave?: boolean;
  /** A held pose survives this long of unreadable frames (tracking flicker). */
  graceMs?: number;
  /** Judge "still" on a smoothed speed, so a slightly shaky hand still counts. */
  smoothSpeed?: boolean;
  /** No swipes until the hand has been in view this long (raising a hand into view isn't a swipe). */
  settleMs?: number;
}

/** Sensitivity 0–100 → thresholds (more sensitive = shorter holds, closer hands not needed). */
export function poseConfigFor(sensitivity: number): PoseConfig {
  const s = Math.min(100, Math.max(0, sensitivity)) / 100;
  const k = 1.15 - 0.3 * s; // 1.15 … 0.85
  // v2.0.1: easier to hit (real-use feedback): shorter holds, farther hands, shaky hands and
  // tracking flicker forgiven, an open hand counts with the thumb tucked, shorter swipes.
  return {
    minScale: 0.055 - 0.015 * s,
    minScore: 0.6 - 0.1 * s,
    holdMs: { open: Math.round(650 * k), peace: Math.round(480 * k), thumbs_up: Math.round(420 * k), fist: Math.round(600 * k) },
    stillSpeed: 0.85,
    swipeDist: 0.22 - 0.05 * s,
    swipeMs: 550,
    waveTurns: 3,
    waveLeg: 0.06,
    waveMs: 1300,
    cooldownMs: 900,
    lenientOpen: true,
    graceMs: 250,
    smoothSpeed: true,
    settleMs: 200,
  };
}

/**
 * While the phone rings: easier to hit. Palm needn't show the thumb, shorter holds, a shaky hand
 * still counts, brief tracking loss doesn't restart the hold, and a slower, shorter swipe works.
 */
export function callPoseConfigFor(sensitivity: number): PoseConfig {
  const base = poseConfigFor(sensitivity);
  return {
    ...base,
    minScale: base.minScale * 0.7,
    minScore: Math.min(base.minScore, 0.55),
    holdMs: { ...base.holdMs, open: Math.round(base.holdMs.open * 0.75), fist: Math.round(base.holdMs.fist * 0.85) },
    stillSpeed: 1.2,
    swipeMs: 550,
    settleMs: 450,
    cooldownMs: 1500,
    lenientOpen: true,
    noWave: true,
    graceMs: 400,
    smoothSpeed: true,
  };
}

const HOLD_EVENT: Record<'open' | 'peace' | 'thumbs_up' | 'fist', PoseEvent> = {
  open: 'palm_hold',
  peace: 'peace_hold',
  thumbs_up: 'thumbs_up',
  fist: 'fist_hold',
};

/** Turns a stream of hand frames into the v2 gesture events. */
export class PoseMachine {
  private trail: { t: number; x: number; open: boolean }[] = [];
  private pose: Pose = 'other';
  private poseSince = 0;
  /** A held pose fires once; it must be released before it can fire again. */
  private fired = false;
  private coolUntil = -Infinity;
  private last: { t: number; x: number; y: number } | null = null;
  private speedEma = 0;
  private firstSeen = 0;
  /** Last time the held pose was actually seen (for graceMs). */
  private seenAt = 0;
  /** The pose being held and how far along it is (0..1), for a progress ring. */
  holding: { pose: Pose; progress: number } | null = null;

  constructor(private readonly config: PoseConfig) {}

  reset() {
    this.trail = [];
    this.speedEma = 0;
    this.pose = 'other';
    this.fired = false;
    this.last = null;
    this.holding = null;
  }

  step(t: number, h: HandShape | null): PoseEvent | null {
    const c = this.config;
    this.holding = null;
    const grace = c.graceMs ?? 0;
    if (!h || h.score < c.minScore || h.scale < c.minScale) {
      // Lost the hand for a moment while holding: keep the hold (progress paused).
      if (grace > 0 && this.pose in HOLD_EVENT && !this.fired && t - this.seenAt <= grace) return null;
      this.reset();
      return null;
    }
    const prev = this.last;
    const raw = prev && t > prev.t ? (Math.hypot(h.x - prev.x, h.y - prev.y) * 1000) / (t - prev.t) : 0;
    this.speedEma = prev ? this.speedEma * 0.6 + raw * 0.4 : 0;
    const speed = c.smoothSpeed ? this.speedEma : raw;
    if (!prev) this.firstSeen = t;
    this.last = { t, x: h.x, y: h.y };
    let pose = classifyPose(h);
    if (c.lenientOpen && pose === 'other') {
      const f = h.fingers;
      if (f.index && f.middle && f.ring && f.pinky && h.pinchRatio >= 0.35) pose = 'open';
    }
    // A frame or two misread in the middle of a hold doesn't restart it (but only for graceMs:
    // a stand-in frame doesn't count as seeing the pose, so a real change still gets through).
    let standIn = false;
    if (grace > 0 && pose !== this.pose && this.pose in HOLD_EVENT && (pose === 'other' || pose === 'point' || pose === 'pinch') && t - this.seenAt <= grace) {
      pose = this.pose;
      standIn = true;
    }
    if (pose === this.pose && !standIn) this.seenAt = t;
    if (pose !== this.pose) {
      this.pose = pose;
      this.poseSince = t;
      this.seenAt = t;
      this.fired = false;
    }
    if (t < this.coolUntil) return null;

    // ---- motions (open-ish flat hand): swipe and wave
    const flat = pose === 'open' || (h.fingers.index && h.fingers.middle && h.fingers.ring);
    this.trail.push({ t, x: h.x, open: flat });
    this.trail = this.trail.filter((p) => t - p.t <= Math.max(c.waveMs, c.swipeMs));
    const motion = t - this.firstSeen >= (c.settleMs ?? 0) ? this.motion(t) : null;
    if (motion) {
      this.fire(t);
      return motion;
    }

    // ---- held poses
    if (pose in HOLD_EVENT && !this.fired) {
      if (speed > c.stillSpeed) {
        this.poseSince = t; // moving: start the hold again
        return null;
      }
      const need = c.holdMs[pose as keyof PoseConfig['holdMs']];
      const progress = Math.min(1, (t - this.poseSince) / need);
      this.holding = { pose, progress };
      if (progress >= 1) {
        this.fired = true;
        this.fire(t);
        return HOLD_EVENT[pose as keyof typeof HOLD_EVENT];
      }
    }
    return null;
  }

  private fire(t: number) {
    this.coolUntil = t + this.config.cooldownMs;
    this.trail = [];
  }

  private motion(t: number): PoseEvent | null {
    const c = this.config;
    const pts = this.trail.filter((p) => p.open);
    if (pts.length < 3) return null;
    // Wave: the hand turns back several times, each leg at least waveLeg long.
    let dir = 0;
    let ext = pts[0].x;
    let turns = 0;
    for (const p of pts) {
      if (dir === 0) {
        if (Math.abs(p.x - ext) >= c.waveLeg) {
          dir = Math.sign(p.x - ext);
          ext = p.x;
        }
      } else if (dir > 0) {
        if (p.x > ext) ext = p.x;
        else if (ext - p.x >= c.waveLeg) {
          turns++;
          dir = -1;
          ext = p.x;
        }
      } else if (p.x < ext) ext = p.x;
      else if (p.x - ext >= c.waveLeg) {
        turns++;
        dir = 1;
        ext = p.x;
      }
    }
    if (!c.noWave && turns >= c.waveTurns - 1) return 'wave';
    // Swipe: one fast sweep in one direction.
    const recent = pts.filter((p) => t - p.t <= c.swipeMs);
    if (recent.length >= 3) {
      const dx = recent[recent.length - 1].x - recent[0].x;
      let monotonic = true;
      for (let i = 1; i < recent.length; i++) {
        if (Math.sign(recent[i].x - recent[i - 1].x) === -Math.sign(dx) && Math.abs(recent[i].x - recent[i - 1].x) > 0.02) monotonic = false;
      }
      // The camera image isn't mirrored: moving your hand to your right lowers x.
      if (monotonic && Math.abs(dx) >= c.swipeDist) return dx < 0 ? 'swipe_right' : 'swipe_left';
    }
    return null;
  }
}

/**
 * Two hands each making an "L" (thumb + index out) frame a rectangle (for the screenshot
 * gesture). Returns the rectangle in camera space, or null.
 */
export function frameRect(a: P[], b: P[]): { x0: number; y0: number; x1: number; y1: number } | null {
  const ha = handShape(a);
  const hb = handShape(b);
  if (!ha || !hb || classifyPose(ha) !== 'l_shape' || classifyPose(hb) !== 'l_shape') return null;
  const xs = [a[4].x, a[8].x, b[4].x, b[8].x];
  const ys = [a[4].y, a[8].y, b[4].y, b[8].y];
  const r = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  if (r.x1 - r.x0 < 0.15 || r.y1 - r.y0 < 0.1) return null; // too small to mean anything
  return r;
}
