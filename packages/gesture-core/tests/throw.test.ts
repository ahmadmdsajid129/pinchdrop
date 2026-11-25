import { describe, it, expect } from 'vitest';
import { ThrowDetector } from '../src/index';

describe('Ballistic Throw (G3b) Detector', () => {
  it('rejects slow leisurely movement (< 0.6 screen-widths/s)', () => {
    const detector = new ThrowDetector(0.60);

    // Moving 0.05 screen-width across 200ms -> velocity = 0.25 (well below 0.60)
    detector.addSample(0.50, 0.50, 1000);
    detector.addSample(0.52, 0.50, 1100);
    detector.addSample(0.55, 0.50, 1200);

    const result = detector.evaluateRelease(1200);
    expect(result.isThrow).toBe(false);
    expect(result.direction).toBe('NONE');
  });

  it('triggers Throw on rapid flick toward Left Phone edge (velocity >= 0.6)', () => {
    const detector = new ThrowDetector(0.60);

    // Rapid flick left: moving from 0.50 to 0.15 in 150ms -> velocity = 0.35 / 0.15 = 2.33 screen-widths/s
    detector.addSample(0.50, 0.50, 1000);
    detector.addSample(0.35, 0.50, 1080);
    detector.addSample(0.15, 0.50, 1150);

    const result = detector.evaluateRelease(1150);
    expect(result.isThrow).toBe(true);
    expect(result.direction).toBe('LEFT_PHONE');
    expect(result.velocity).toBeGreaterThanOrEqual(0.60);
  });

  it('triggers Throw on rapid flick toward Right Inbox edge', () => {
    const detector = new ThrowDetector(0.60);

    // Rapid flick right: moving from 0.50 to 0.85 in 150ms -> velocity = 2.33
    detector.addSample(0.50, 0.50, 1000);
    detector.addSample(0.65, 0.50, 1080);
    detector.addSample(0.85, 0.50, 1150);

    const result = detector.evaluateRelease(1150);
    expect(result.isThrow).toBe(true);
    expect(result.direction).toBe('RIGHT_INBOX');
  });
});
