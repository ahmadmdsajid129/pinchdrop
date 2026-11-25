/**
 * v2 · Catch at the PC: something the phone lifted is "in the air", and an open hand at the
 * laptop's webcam takes it. Same rules as the phone's CatchDetector (apps/android/.../vision):
 *
 *  * a closed / pinched hand seen recently, then fingers spread for `openAfterClosedMs` → catch, or
 *  * an already-open, steady palm held for `openSteadyMs` → catch.
 *
 * Far hands (people walking past), fists, pointing, waving and unsure tracking never catch.
 * Pure logic, unit-tested.
 */

export interface CatchConfig {
  /** Hand size in the image (wrist → middle knuckle); smaller = too far away. */
  minScale: number;
  minScore: number;
  /** Fingers (of index/middle/ring/pinky) that must be extended for an open hand. */
  openFingers: number;
  /** Thumb–index distance / palm size at or above which the hand counts as open. */
  openRatio: number;
  /** At or below this (or ≤ 1 finger extended) the hand counts as closed. */
  closedRatio: number;
  openAfterClosedMs: number;
  openSteadyMs: number;
  closedMemoryMs: number;
  /** Image widths per second; faster = waving, ignored. */
  maxSpeed: number;
}

/** Sensitivity 0–100 (Settings → Gestures) → thresholds. */
export function catchConfigFor(sensitivity: number): CatchConfig {
  const s = Math.min(100, Math.max(0, sensitivity)) / 100;
  return {
    minScale: 0.07 - 0.02 * s, // webcam at arm's length: hands look smaller than over a phone
    minScore: 0.7 - 0.1 * s,
    openFingers: s > 0.66 ? 3 : 4,
    openRatio: 0.6 - 0.05 * s,
    closedRatio: 0.4,
    openAfterClosedMs: 160,
    openSteadyMs: 650 - 200 * s,
    closedMemoryMs: 3000,
    maxSpeed: 2.2,
  };
}

export interface CatchFrame {
  t: number;
  extended: number;
  pinchRatio: number;
  scale: number;
  score: number;
  x: number;
  y: number;
}

export type CatchHint = 'LOOKING' | 'TOO_FAR' | 'HAND_SEEN' | 'OPENING' | 'CAUGHT';

export class CatchMachine {
  private lastClosedAt = -Infinity;
  private openSince: number | null = null;
  private last: CatchFrame | null = null;
  private caught = false;
  hint: CatchHint = 'LOOKING';
  /** 0..1 while opening: how far along the hold is (for a progress ring). */
  progress = 0;

  constructor(private readonly config: CatchConfig) {}

  reset() {
    this.lastClosedAt = -Infinity;
    this.openSince = null;
    this.last = null;
    this.caught = false;
    this.hint = 'LOOKING';
    this.progress = 0;
  }

  /** Feed one frame (null = no hand). Returns true exactly once, when the catch happens. */
  step(t: number, frame: CatchFrame | null): boolean {
    if (this.caught) return false;
    const c = this.config;
    const prev = this.last;
    this.progress = 0;
    if (!frame || frame.score < c.minScore) {
      this.openSince = null;
      this.last = null;
      this.hint = 'LOOKING';
      return false;
    }
    this.last = frame;
    if (frame.scale < c.minScale) {
      this.openSince = null;
      this.hint = 'TOO_FAR';
      return false;
    }
    const speed = prev && frame.t > prev.t ? (Math.hypot(frame.x - prev.x, frame.y - prev.y) * 1000) / (frame.t - prev.t) : 0;
    const closed = frame.pinchRatio <= c.closedRatio || frame.extended <= 1;
    const open = frame.extended >= c.openFingers && frame.pinchRatio >= c.openRatio;
    if (closed) {
      this.lastClosedAt = t;
      this.openSince = null;
      this.hint = 'HAND_SEEN';
    } else if (open && speed <= c.maxSpeed) {
      if (this.openSince === null) this.openSince = t;
      const needed = t - this.lastClosedAt <= c.closedMemoryMs ? c.openAfterClosedMs : c.openSteadyMs;
      this.hint = 'OPENING';
      this.progress = Math.min(1, (t - this.openSince) / needed);
      if (t - this.openSince >= needed) {
        this.caught = true;
        this.hint = 'CAUGHT';
        this.progress = 1;
        return true;
      }
    } else {
      this.openSince = null;
      this.hint = 'HAND_SEEN';
    }
    return false;
  }
}
