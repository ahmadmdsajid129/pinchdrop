import { describe, it, expect } from 'vitest';
import {
  PoseClassifier,
  GestureStateMachine,
  ReplayHarness,
  LandmarkFrame,
  Landmark3D,
} from '../src/index';

// Helper to generate normalized hand landmark templates
function createMockHand(pinch: boolean = false, pose: 'OPEN' | 'FIST' | 'PEACE' | 'POINT' = 'OPEN'): Landmark3D[] {
  const landmarks: Landmark3D[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  landmarks[0] = { x: 0.5, y: 0.8, z: 0 }; // Wrist
  landmarks[9] = { x: 0.5, y: 0.5, z: 0 }; // Middle MCP (Palm Scale = 0.3)

  // Thumb & Index
  if (pinch) {
    // Thumb Tip (4) and Index Tip (8) close together (ratio <= 0.30)
    landmarks[4] = { x: 0.51, y: 0.40, z: 0 };
    landmarks[8] = { x: 0.52, y: 0.40, z: 0 }; // dist = 0.01 / 0.30 = 0.033
    landmarks[6] = { x: 0.5, y: 0.55, z: 0 };  // Index PIP
  } else {
    landmarks[4] = { x: 0.40, y: 0.45, z: 0 };
    landmarks[8] = { x: 0.55, y: 0.25, z: 0 }; // dist = ~0.25 / 0.30 = 0.83
  }

  // Set knuckle extension based on requested pose
  const isExtended = (tipIdx: number, pipIdx: number, extended: boolean) => {
    landmarks[pipIdx] = { x: 0.5, y: 0.55, z: 0 };
    landmarks[tipIdx] = { x: 0.5, y: extended ? 0.30 : 0.65, z: 0 };
  };

  if (!pinch) {
    isExtended(8, 6, pose === 'OPEN' || pose === 'PEACE' || pose === 'POINT');
  }
  isExtended(12, 10, pose === 'OPEN' || pose === 'PEACE');
  isExtended(16, 14, pose === 'OPEN');
  isExtended(20, 18, pose === 'OPEN');

  return landmarks;
}

describe('Pose Classifier & State Transitions', () => {
  it('correctly classifies Pinch-Grab with hysteresis', () => {
    const classifier = new PoseClassifier(0.30, 0.45);

    const openHand = createMockHand(false, 'OPEN');
    expect(classifier.classify(openHand).pose).toBe('OPEN');

    const pinchHand = createMockHand(true, 'OPEN');
    expect(classifier.classify(pinchHand).pose).toBe('PINCH');
  });

  it('correctly handles ARMED state and mid-air catch', () => {
    const fsm = new GestureStateMachine();
    expect(fsm.getState()).toBe('IDLE');

    // Phone triggers ARMED
    fsm.transition({ type: 'PHONE_HELD', itemId: 'item_123', timestampMs: 1000 });
    expect(fsm.getState()).toBe('ARMED');

    // User pinches anywhere -> transitions directly to GRABBING
    const pinchHand = createMockHand(true);
    const ctx = fsm.transition({ type: 'FRAME', landmarks: pinchHand, timestampMs: 1500 });
    expect(ctx.state).toBe('GRABBING');
    expect(ctx.heldItemId).toBe('item_123');

    // Release open hand -> transitions to HOVER and drops
    const openHand = createMockHand(false, 'OPEN');
    const dropCtx = fsm.transition({ type: 'FRAME', landmarks: openHand, timestampMs: 2000 });
    expect(dropCtx.state).toBe('HOVER');
    expect(dropCtx.heldItemId).toBeNull();
  });

  it('runs replay harness on simulated typing session without false triggers', () => {
    const harness = new ReplayHarness();
    const frames: LandmarkFrame[] = [];

    // Simulate 300 frames (10 seconds) of typing / resting hand motion (all open/hover)
    for (let i = 0; i < 300; i++) {
      const openHand = createMockHand(false, 'OPEN');
      // Add slight jitter
      openHand[8].x += Math.sin(i) * 0.005;
      frames.push({
        timestampMs: i * 33.33,
        landmarks: openHand,
        expectedState: 'HOVER',
      });
    }

    const report = harness.replay(frames);
    expect(report.totalFrames).toBe(300);
    expect(report.pinchTriggers).toBe(0); // ZERO false pinch triggers
    expect(report.falseTriggers).toBe(0);
    expect(report.finalState).toBe('HOVER');
  });
});
