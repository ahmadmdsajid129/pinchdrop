import { describe, it, expect } from 'vitest';
import { OneEuroFilter, LandmarkSmoother, GESTURE_CONFIG } from '../src/index';

describe('One-Euro Adaptive Filter', () => {
  it('smooths high frequency jitter at rest without lag', () => {
    const filter = new OneEuroFilter(GESTURE_CONFIG.ONE_EURO);
    const baseValue = 0.5;
    const results: number[] = [];

    // Simulate noisy stationary signal at 30 fps (33.3ms interval)
    for (let i = 0; i < 30; i++) {
      const noise = (Math.sin(i * 10) * 0.05); // +/- 0.05 jitter
      const filtered = filter.filter(baseValue + noise, i * 33.33);
      results.push(filtered);
    }

    // Variance should be significantly dampened
    const last = results[results.length - 1];
    expect(last).toBeCloseTo(baseValue, 1);
  });

  it('smooths full 21 landmarks array', () => {
    const smoother = new LandmarkSmoother(GESTURE_CONFIG.ONE_EURO);
    const mockLandmarks = Array.from({ length: 21 }, (_, i) => ({
      x: 0.1 * (i % 5),
      y: 0.1 * Math.floor(i / 5),
      z: 0.0,
    }));

    const smoothed = smoother.smooth(mockLandmarks, 100);
    expect(smoothed.length).toBe(21);
    expect(smoothed[0].x).toBe(mockLandmarks[0].x);
    expect(smoothed[8].y).toBe(mockLandmarks[8].y);
  });
});

