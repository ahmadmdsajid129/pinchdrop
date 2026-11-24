/**
 * PinchDrop Gesture Core
 * Single Source of Truth for Gesture Constants and Types
 */

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
