/**
 * One-Euro Filter Implementation
 * Casiez et al., CHI 2012: "1€ Filter: A Simple Speed-based Low-pass Filter for Noisy Input in Interactive Systems"
 *
 * Provides jitter reduction at rest and lag elimination during high velocity movement.
 */

export interface OneEuroConfig {
  minCutoff: number; // Minimum cutoff frequency in Hz (typically ~1.0)
  beta: number;      // Speed coefficient (typically ~0.007)
  dCutoff: number;   // Cutoff frequency for derivative (typically ~1.0)
}

export class LowPassFilter {
  private alpha: number = 1.0;
  private s: number | null = null;

  constructor(alpha: number = 1.0) {
    this.setAlpha(alpha);
  }

  public setAlpha(alpha: number): void {
    if (alpha <= 0.0 || alpha > 1.0) {
      throw new Error(`Alpha must be in (0.0, 1.0], received: ${alpha}`);
    }
    this.alpha = alpha;
  }

  public filter(val: number): number {
    if (this.s === null) {
      this.s = val;
    } else {
      this.s = this.alpha * val + (1.0 - this.alpha) * this.s;
    }
    return this.s;
  }

  public last(): number | null {
    return this.s;
  }

  public reset(): void {
    this.s = null;
  }
}

export class OneEuroFilter {
  private config: OneEuroConfig;
  private xFilter: LowPassFilter;
  private dxFilter: LowPassFilter;
  private lastTime: number | null = null;

  constructor(config: OneEuroConfig) {
    this.config = { ...config };
    this.xFilter = new LowPassFilter();
    this.dxFilter = new LowPassFilter();
  }

  private alpha(rate: number, cutoff: number): number {
    const tau = 1.0 / (2.0 * Math.PI * cutoff);
    const te = 1.0 / rate;
    return 1.0 / (1.0 + tau / te);
  }

  public filter(val: number, timestampMs: number): number {
    if (this.lastTime === null) {
      this.lastTime = timestampMs;
      return this.xFilter.filter(val);
    }

    const dt = (timestampMs - this.lastTime) / 1000.0;
    this.lastTime = timestampMs;

    // Guard against identical timestamps or backward jumps
    if (dt <= 0.0) {
      return this.xFilter.last() ?? val;
    }

    const rate = 1.0 / dt;

    // Estimate derivative
    const prev = this.xFilter.last() ?? val;
    const dx = (val - prev) * rate;
    const edx = this.dxFilter.filter(dx);
    this.dxFilter.setAlpha(this.alpha(rate, this.config.dCutoff));

    // Adaptive cutoff frequency
    const cutoff = this.config.minCutoff + this.config.beta * Math.abs(edx);
    this.xFilter.setAlpha(this.alpha(rate, cutoff));

    return this.xFilter.filter(val);
  }

  public reset(): void {
    this.lastTime = null;
    this.xFilter.reset();
    this.dxFilter.reset();
  }
}

export interface Landmark3D {
  x: number;
  y: number;
  z: number;
}

export class LandmarkSmoother {
  private filters: Map<number, { x: OneEuroFilter; y: OneEuroFilter; z: OneEuroFilter }> = new Map();
  private config: OneEuroConfig;

  constructor(config: OneEuroConfig) {
    this.config = config;
  }

  public smooth(landmarks: Landmark3D[], timestampMs: number): Landmark3D[] {
    return landmarks.map((lm, idx) => {
      let f = this.filters.get(idx);
      if (!f) {
        f = {
          x: new OneEuroFilter(this.config),
          y: new OneEuroFilter(this.config),
          z: new OneEuroFilter(this.config),
        };
        this.filters.set(idx, f);
      }

      return {
        x: f.x.filter(lm.x, timestampMs),
        y: f.y.filter(lm.y, timestampMs),
        z: f.z.filter(lm.z, timestampMs),
      };
    });
  }

  public reset(): void {
    for (const f of this.filters.values()) {
      f.x.reset();
      f.y.reset();
      f.z.reset();
    }
  }
}

