/**
 * PinchDrop Gesture Core
 * Single Source of Truth for Gesture Constants and Types
 */

export * from './filter.js';
export * from './classifier.js';
export * from './fsm.js';
export * from './replay.js';
export * from './throw.js';
export * from './grab.js';

export const GESTURE_CONFIG = {
  VERSION: '0.1.0',
  APP_NAME: 'PinchDrop',
  PINCH_ENTER_THRESHOLD: 0.30,
  PINCH_EXIT_THRESHOLD: 0.45,
  ONE_EURO: {
    minCutoff: 1.0,
    beta: 0.007,
    dCutoff: 1.0,
  },
  TIMING: {
    HOVER_DWELL_MS: 120,
    RENAME_HOLD_MS: 600,
    LOCK_HOLD_MS: 800,
    TRASH_HOLD_MS: 600,
    ACTION_COOLDOWN_MS: 400,
    ARMED_TIMEOUT_MS: 30000,
  },
  TARGETS: {
    MIN_INTERACTIVE_PX: 96,
    MAGNETIC_SNAP_RADIUS_PX: 48,
  }
} as const;

export type GestureState =
  | 'LOCKED'
  | 'IDLE'
  | 'HOVER'
  | 'GRABBING'
  | 'ARMED'
  | 'ARM_DELETE'
  | 'RENAME_ARMED'
  | 'RENAMING';

export function getGestureConfig() {
  return GESTURE_CONFIG;
}

/**
 * Calculates scale-invariant pinch ratio
 * ratio = dist(ThumbTip_4, IndexTip_8) / dist(Wrist_0, MiddleMCP_9)
 */
export function calculatePinchRatio(landmarks: { x: number; y: number; z: number }[]): number {
  if (landmarks.length < 21) return 1.0;

  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  const wrist = landmarks[0];
  const middleMcp = landmarks[9];

  const pinchDist = Math.hypot(
    thumbTip.x - indexTip.x,
    thumbTip.y - indexTip.y,
    thumbTip.z - indexTip.z
  );

  const palmScale = Math.hypot(
    wrist.x - middleMcp.x,
    wrist.y - middleMcp.y,
    wrist.z - middleMcp.z
  );

  if (palmScale === 0) return 1.0;
  return pinchDist / palmScale;
}
