export interface ThrowSample {
  x: number; // Normalized 0.0 to 1.0
  y: number; // Normalized 0.0 to 1.0
  timestampMs: number;
}

export type ThrowDirection = 'LEFT_PHONE' | 'RIGHT_INBOX' | 'TOP' | 'NONE';

export interface ThrowResult {
  isThrow: boolean;
  velocity: number; // Screen-widths per second
  direction: ThrowDirection;
}

export class ThrowDetector {
  private history: ThrowSample[] = [];
  private velocityThreshold: number; // Canonical threshold: >= 0.6 screen-widths/s
  private windowMs: number = 250;     // 250ms trailing window for flick detection

  constructor(velocityThreshold = 0.60) {
    this.velocityThreshold = velocityThreshold;
  }

  public addSample(x: number, y: number, timestampMs: number): void {
    this.history.push({ x, y, timestampMs });
    // Keep only samples within the trailing window
    this.history = this.history.filter((s) => timestampMs - s.timestampMs <= this.windowMs);
  }

  public evaluateRelease(timestampMs: number): ThrowResult {
    if (this.history.length < 3) {
      return { isThrow: false, velocity: 0, direction: 'NONE' };
    }

    const first = this.history[0];
    const last = this.history[this.history.length - 1];

    const dt = (last.timestampMs - first.timestampMs) / 1000.0;
    if (dt <= 0.05) {
      return { isThrow: false, velocity: 0, direction: 'NONE' };
    }

    const dx = last.x - first.x;
    const dy = last.y - first.y;

    // Velocity in screen-widths per second
    const vx = dx / dt;
    const vy = dy / dt;
    const speed = Math.hypot(vx, vy);

    let direction: ThrowDirection = 'NONE';
    if (speed >= this.velocityThreshold) {
      if (Math.abs(vx) > Math.abs(vy)) {
        direction = vx < 0 ? 'LEFT_PHONE' : 'RIGHT_INBOX';
      } else if (vy < 0) {
        direction = 'TOP';
      }
    }

    const isThrow = speed >= this.velocityThreshold && direction !== 'NONE';

    // Clear history after release evaluation
    this.history = [];

    return {
      isThrow,
      velocity: Number(speed.toFixed(2)),
      direction,
    };
  }

  public reset(): void {
    this.history = [];
  }
}
