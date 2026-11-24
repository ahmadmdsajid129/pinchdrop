import { describe, it, expect } from 'vitest';
import { getGestureConfig, GESTURE_CONFIG } from '../src/index';

describe('Gesture Core Smoke Test', () => {
  it('returns valid canonical configuration', () => {
    const config = getGestureConfig();
    expect(config.APP_NAME).toBe('PinchDrop');
    expect(config.PINCH_ENTER_THRESHOLD).toBe(0.30);
    expect(config.PINCH_EXIT_THRESHOLD).toBe(0.45);
    expect(config.TIMING.ARMED_TIMEOUT_MS).toBe(30000);
    expect(config.TARGETS.MIN_INTERACTIVE_PX).toBe(96);
  });

  it('maintains strict hysteresis boundaries for pinch detection', () => {
    expect(GESTURE_CONFIG.PINCH_ENTER_THRESHOLD).toBeLessThan(GESTURE_CONFIG.PINCH_EXIT_THRESHOLD);
  });
});
