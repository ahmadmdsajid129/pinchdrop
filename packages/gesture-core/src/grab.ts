/**
 * Phase 5 grab machine: turns per-frame hand readings into grab / move / release
 * events for the PC overlay. Pure and deterministic, so it can be replay-tested.
 *
 *   IDLE ──pinch held ≥ dwell──▶ GRABBED ──hand opens──▶ (release) IDLE
 *                                   │
 *                                   └─hand lost ≥ lostMs──▶ (cancel) IDLE
 */

export interface HandReading {
  /** Pinch point on screen, 0..1 (already mirrored). */
  x: number;
  y: number;
  /** dist(thumb tip, index tip) / dist(wrist, middle MCP). */
  pinchRatio: number;
}

export type GrabEvent =
  | { type: 'grab'; x: number; y: number }
  | { type: 'move'; x: number; y: number }
  | { type: 'release'; x: number; y: number }
  | { type: 'cancel' };

export interface GrabConfig {
  enterRatio: number;
  exitRatio: number;
  /** Pinch must be held this long before it counts (filters accidental touches). */
  dwellMs: number;
  /** Open hand must stay open this long before it counts as a release. */
  releaseMs: number;
  /** Hand out of view this long while holding = cancel. */
  lostMs: number;
}

/**
 * Pinch thresholds from the 0..100 "Pinch sensitivity" setting.
 * 0 = relaxed (fingers needn't fully touch), 100 = strict.
 */
export function grabConfigFor(sensitivity: number): GrabConfig {
  const s = Math.min(100, Math.max(0, sensitivity)) / 100;
  const enterRatio = 0.4 - 0.18 * s; // 0.40 … 0.22
  return { enterRatio, exitRatio: enterRatio + 0.15, dwellMs: 120, releaseMs: 150, lostMs: 1500 };
}

export type GrabPhase = 'IDLE' | 'PINCHING' | 'GRABBED' | 'RELEASING';

export class GrabMachine {
  private phase: GrabPhase = 'IDLE';
  private since = 0;
  private lastSeen = 0;
  private lastX = 0.5;
  private lastY = 0.5;

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

  reset(): void {
    this.phase = 'IDLE';
  }

  /** Feed one frame. `hand` is null when no hand is visible. Returns at most one event. */
  step(t: number, hand: HandReading | null): GrabEvent | null {
    const c = this.config;
    if (!hand) {
      if (this.holding && t - this.lastSeen >= c.lostMs) {
        this.phase = 'IDLE';
        return { type: 'cancel' };
      }
      if (this.phase === 'PINCHING') this.phase = 'IDLE';
      return null;
    }
    this.lastSeen = t;
    this.lastX = hand.x;
    this.lastY = hand.y;
    const closed = hand.pinchRatio <= c.enterRatio;
    const open = hand.pinchRatio >= c.exitRatio;

    switch (this.phase) {
      case 'IDLE':
        if (closed) {
          this.phase = 'PINCHING';
          this.since = t;
        }
        return null;
      case 'PINCHING':
        if (!closed) {
          this.phase = 'IDLE';
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
          // Fingers came back together: still holding (hysteresis gap counts as holding).
          this.phase = 'GRABBED';
          return { type: 'move', x: hand.x, y: hand.y };
        }
        if (t - this.since >= c.releaseMs) {
          this.phase = 'IDLE';
          return { type: 'release', x: this.lastX, y: this.lastY };
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
