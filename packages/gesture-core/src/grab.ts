/**
 * Grab machine for the PC overlay: turns per-frame hand readings into grab / move /
 * release events. Pure and deterministic, so it can be replay-tested.
 *
 * Only two gestures do anything — a deliberate PINCH (grab) and a clearly OPEN hand
 * (drop). Everything else (fists, pointing, waving, half-closed hands, far-away or
 * passing hands) is ignored on purpose:
 *
 *   IDLE ─hand steady ≥ settleMs─▶ READY ─pinch held ≥ dwellMs─▶ GRABBED
 *   GRABBED ─hand fully open ≥ releaseMs─▶ (release) READY
 *   GRABBED ─hand lost ≥ lostMs─▶ (cancel) IDLE
 */

export interface HandReading {
  /** Pinch point on screen, 0..1 (already mirrored). */
  x: number;
  y: number;
  /** dist(thumb tip, index tip) / dist(wrist, middle MCP). */
  pinchRatio: number;
  /** How many of index/middle/ring/pinky are extended (0..4). */
  extended: number;
  /** Hand size in the camera image (wrist → middle knuckle, 0..1). Small = far away. */
  scale: number;
  /** Tracker confidence that this is a hand (0..1). */
  score: number;
}

export type GrabEvent =
  | { type: 'grab'; x: number; y: number }
  | { type: 'move'; x: number; y: number }
  | { type: 'release'; x: number; y: number }
  | { type: 'cancel' };

/** Why a reading was ignored — surfaced as hints, never acted on. */
export type IgnoreReason = 'far' | 'unsure' | 'fist' | 'fast' | 'settling' | null;

export interface GrabConfig {
  enterRatio: number;
  exitRatio: number;
  /** Pinch must be held this long before it counts (filters accidental touches). */
  dwellMs: number;
  /** Open hand must stay open this long before it counts as a drop. */
  releaseMs: number;
  /** Hand out of view this long while holding = cancel. */
  lostMs: number;
  /** A newly seen hand must be steady this long before it can grab (no grabbing mid-entry). */
  settleMs: number;
  /** Ignore hands smaller than this (someone in the background, hand too far). */
  minScale: number;
  /** Ignore hands the tracker isn't sure about. */
  minScore: number;
  /** Ignore pinches while the hand moves faster than this (screen widths per second) — waving. */
  maxSpeed: number;
  /** Fingers that must be extended for the hand to count as open (drop). */
  openFingers: number;
}

/**
 * Pinch thresholds from the 0..100 "Pinch sensitivity" setting.
 * 0 = relaxed (fingers needn't fully touch), 100 = strict.
 */
export function grabConfigFor(sensitivity: number): GrabConfig {
  const s = Math.min(100, Math.max(0, sensitivity)) / 100;
  // v2.0.1: a little more forgiving (real-use feedback): fingertips needn't fully touch, the
  // hand may be farther away, and a slightly unsure tracker reading still counts.
  const enterRatio = 0.44 - 0.18 * s; // 0.44 … 0.26
  return {
    enterRatio,
    exitRatio: enterRatio + 0.15,
    dwellMs: 140,
    releaseMs: 180,
    lostMs: 1600,
    settleMs: 300,
    minScale: 0.05,
    minScore: 0.6,
    maxSpeed: 2.5,
    openFingers: 3,
  };
}

export type GrabPhase = 'IDLE' | 'READY' | 'PINCHING' | 'GRABBED' | 'RELEASING';

export class GrabMachine {
  private phase: GrabPhase = 'IDLE';
  private since = 0;
  private seenSince = 0;
  private lastSeen = -Infinity;
  private lastT = 0;
  private lastX = 0.5;
  private lastY = 0.5;
  /** Why the last reading was ignored, for on-screen hints. */
  ignored: IgnoreReason = null;

  constructor(private config: GrabConfig) {}

  get state(): GrabPhase {
    return this.phase;
  }

  get holding(): boolean {
    return this.phase === 'GRABBED' || this.phase === 'RELEASING';
  }

  setConfig(config: GrabConfig): void {
    this.config = config;
  }

  /** Back to waiting for a hand (e.g. the grab was refused because nothing is selected). */
  reset(): void {
    this.phase = this.phase === 'IDLE' ? 'IDLE' : 'READY';
  }

  private lost(t: number): GrabEvent | null {
    const c = this.config;
    if (this.holding) {
      if (t - this.lastSeen >= c.lostMs) {
        this.phase = 'IDLE';
        return { type: 'cancel' };
      }
      return null;
    }
    this.phase = 'IDLE';
    return null;
  }

  /** Feed one frame. `hand` is null when no hand is visible. Returns at most one event. */
  step(t: number, hand: HandReading | null): GrabEvent | null {
    const c = this.config;
    this.ignored = null;

    // Hands that don't qualify are treated exactly like no hand at all.
    if (hand && hand.score < c.minScore) {
      this.ignored = 'unsure';
      hand = null;
    } else if (hand && hand.scale < c.minScale) {
      this.ignored = 'far';
      hand = null;
    }
    if (!hand) return this.lost(t);

    const dt = Math.max(1, t - this.lastT) / 1000;
    const speed = this.phase === 'IDLE' ? 0 : Math.hypot(hand.x - this.lastX, hand.y - this.lastY) / dt;
    if (this.phase === 'IDLE' || t - this.lastSeen > c.lostMs) {
      this.seenSince = t;
      if (!this.holding) this.phase = 'READY';
    }
    this.lastSeen = t;
    this.lastT = t;
    this.lastX = hand.x;
    this.lastY = hand.y;

    const closed = hand.pinchRatio <= c.enterRatio;
    const fist = closed && hand.extended === 0; // thumb resting on a curled fist is not a pinch
    const open = hand.pinchRatio >= c.exitRatio && hand.extended >= c.openFingers;

    switch (this.phase) {
      case 'IDLE':
      case 'READY':
        if (t - this.seenSince < c.settleMs) {
          if (closed) this.ignored = 'settling';
          return null;
        }
        if (closed && fist) {
          this.ignored = 'fist';
          return null;
        }
        if (closed && speed > c.maxSpeed) {
          this.ignored = 'fast';
          return null;
        }
        if (closed) {
          this.phase = 'PINCHING';
          this.since = t;
        }
        return null;
      case 'PINCHING':
        if (!closed || fist) {
          this.phase = 'READY';
          return null;
        }
        if (t - this.since >= c.dwellMs) {
          this.phase = 'GRABBED';
          return { type: 'grab', x: hand.x, y: hand.y };
        }
        return null;
      case 'GRABBED':
        if (open) {
          this.phase = 'RELEASING';
          this.since = t;
        }
        return { type: 'move', x: hand.x, y: hand.y };
      case 'RELEASING':
        if (!open) {
          // Not clearly open any more (half-open, wobble): still holding.
          this.phase = 'GRABBED';
          return { type: 'move', x: hand.x, y: hand.y };
        }
        if (t - this.since >= c.releaseMs) {
          this.phase = 'READY';
          return { type: 'release', x: hand.x, y: hand.y };
        }
        return { type: 'move', x: hand.x, y: hand.y };
    }
  }
}

/**
 * Maps a camera-space point (0..1, not mirrored) to screen space (0..1): mirrors it so
 * moving your hand right moves the ring right, and stretches the central part of the
 * camera view over the whole screen so the edges are reachable without leaving the frame.
 */
export function cameraToScreen(x: number, y: number, margin = 0.12): { x: number; y: number } {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const span = 1 - 2 * margin;
  return { x: clamp((1 - x - margin) / span), y: clamp((y - margin) / span) };
}

/** Counts extended fingers (index, middle, ring, pinky): tip further from the wrist than its middle joint. */
export function extendedFingers(lm: { x: number; y: number; z: number }[]): number {
  if (lm.length < 21) return 0;
  const d = (a: number, b: number) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y, lm[a].z - lm[b].z);
  return [
    [8, 6],
    [12, 10],
    [16, 14],
    [20, 18],
  ].filter(([tip, pip]) => d(0, tip) > d(0, pip) * 1.05).length;
}

/** Hand size in the image: wrist → middle-finger knuckle (2D). */
export function handScale(lm: { x: number; y: number }[]): number {
  if (lm.length < 21) return 0;
  return Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y);
}
