import { Landmark3D, LandmarkSmoother } from './filter.js';
import { PoseClassifier, PoseType } from './classifier.js';
import { GESTURE_CONFIG, GestureState } from './index.js';

export type GestureEvent =
  | { type: 'FRAME'; landmarks: Landmark3D[]; timestampMs: number }
  | { type: 'HAND_LOST'; timestampMs: number }
  | { type: 'PHONE_HELD'; itemId: string; timestampMs: number }
  | { type: 'ARMED_TIMEOUT'; timestampMs: number }
  | { type: 'TARGET_ENTER'; targetId: string; isTrash: boolean }
  | { type: 'TARGET_LEAVE' }
  | { type: 'VIRTUAL_KEYBOARD_DISMISS' };

export interface GestureMachineContext {
  state: GestureState;
  landmarks: Landmark3D[] | null;
  pose: PoseType;
  pinchRatio: number;
  smoothedTip: { x: number; y: number } | null;
  activeTargetId: string | null;
  heldItemId: string | null;
  holdProgress: number; // 0.0 to 1.0 (for peace-hold, lock-hold, trash-hold)
  armedRemainingMs: number;
}

export class GestureStateMachine {
  private state: GestureState = 'IDLE';
  private smoother: LandmarkSmoother;
  private classifier: PoseClassifier;

  private holdStartTime: number | null = null;
  private armedStartTime: number | null = null;
  private activeTargetId: string | null = null;
  private isOverTrash: boolean = false;
  private heldItemId: string | null = null;

  constructor() {
    this.smoother = new LandmarkSmoother(GESTURE_CONFIG.ONE_EURO);
    this.classifier = new PoseClassifier(
      GESTURE_CONFIG.PINCH_ENTER_THRESHOLD,
      GESTURE_CONFIG.PINCH_EXIT_THRESHOLD
    );
  }

  public transition(event: GestureEvent): GestureMachineContext {
    const timestamp = 'timestampMs' in event ? event.timestampMs : performance.now();

    switch (event.type) {
      case 'PHONE_HELD':
        this.heldItemId = event.itemId;
        this.armedStartTime = timestamp;
        if (this.state === 'IDLE' || this.state === 'HOVER') {
          this.state = 'ARMED';
        }
        break;

      case 'ARMED_TIMEOUT':
        if (this.state === 'ARMED') {
          this.state = 'IDLE';
          this.heldItemId = null;
          this.armedStartTime = null;
        }
        break;

      case 'TARGET_ENTER':
        this.activeTargetId = event.targetId;
        this.isOverTrash = event.isTrash;
        break;

      case 'TARGET_LEAVE':
        this.activeTargetId = null;
        this.isOverTrash = false;
        break;

      case 'VIRTUAL_KEYBOARD_DISMISS':
        if (this.state === 'RENAMING') {
          this.state = 'HOVER';
        }
        break;

      case 'HAND_LOST':
        this.smoother.reset();
        this.classifier.reset();
        this.holdStartTime = null;
        if (this.state !== 'LOCKED' && this.state !== 'ARMED') {
          this.state = 'IDLE';
        }
        break;

      case 'FRAME': {
        const smoothed = this.smoother.smooth(event.landmarks, timestamp);
        const classification = this.classifier.classify(smoothed);

        const tip = smoothed[8];
        const smoothedTip = { x: tip.x, y: tip.y };

        // Handle State Transitions
        switch (this.state) {
          case 'LOCKED':
            if (classification.pose === 'FIST') {
              if (this.holdStartTime === null) this.holdStartTime = timestamp;
              if (timestamp - this.holdStartTime >= GESTURE_CONFIG.TIMING.LOCK_HOLD_MS) {
                this.state = 'IDLE';
                this.holdStartTime = null;
              }
            } else {
              this.holdStartTime = null;
            }
            break;

          case 'IDLE':
            if (classification.pose === 'FIST') {
              if (this.holdStartTime === null) this.holdStartTime = timestamp;
              if (timestamp - this.holdStartTime >= GESTURE_CONFIG.TIMING.LOCK_HOLD_MS) {
                this.state = 'LOCKED';
                this.holdStartTime = null;
              }
            } else {
              this.holdStartTime = null;
              this.state = 'HOVER';
            }
            break;

          case 'HOVER':
            if (classification.pose === 'FIST') {
              if (this.holdStartTime === null) this.holdStartTime = timestamp;
              if (timestamp - this.holdStartTime >= GESTURE_CONFIG.TIMING.LOCK_HOLD_MS) {
                this.state = 'LOCKED';
                this.holdStartTime = null;
              }
            } else if (classification.pose === 'PEACE') {
              if (this.holdStartTime === null) this.holdStartTime = timestamp;
              if (timestamp - this.holdStartTime >= GESTURE_CONFIG.TIMING.RENAME_HOLD_MS) {
                this.state = 'RENAME_ARMED';
                this.holdStartTime = null;
              }
            } else if (classification.pose === 'PINCH') {
              this.state = 'GRABBING';
              this.holdStartTime = null;
            } else {
              this.holdStartTime = null;
            }
            break;

          case 'ARMED':
            if (this.armedStartTime && timestamp - this.armedStartTime >= GESTURE_CONFIG.TIMING.ARMED_TIMEOUT_MS) {
              this.state = 'IDLE';
              this.heldItemId = null;
              this.armedStartTime = null;
            } else if (classification.pose === 'PINCH') {
              // Pinch anywhere catches held item
              this.state = 'GRABBING';
            }
            break;

          case 'GRABBING':
            if (this.isOverTrash) {
              if (this.holdStartTime === null) this.holdStartTime = timestamp;
              if (timestamp - this.holdStartTime >= GESTURE_CONFIG.TIMING.TRASH_HOLD_MS) {
                this.state = 'ARM_DELETE';
              }
            } else {
              this.holdStartTime = null;
            }

            if (classification.pose === 'OPEN') {
              this.state = 'HOVER';
              this.heldItemId = null;
              this.holdStartTime = null;
            }
            break;

          case 'ARM_DELETE':
            if (classification.pose === 'OPEN') {
              this.state = 'HOVER';
              this.holdStartTime = null;
            }
            break;

          case 'RENAME_ARMED':
            this.state = 'RENAMING';
            break;

          case 'RENAMING':
            // Waits for virtual keyboard dismiss
            break;
        }

        // Calculate progress for hold visual rings
        let holdProgress = 0;
        if (this.holdStartTime !== null) {
          const duration =
            this.state === 'HOVER' && classification.pose === 'PEACE'
              ? GESTURE_CONFIG.TIMING.RENAME_HOLD_MS
              : this.isOverTrash
              ? GESTURE_CONFIG.TIMING.TRASH_HOLD_MS
              : GESTURE_CONFIG.TIMING.LOCK_HOLD_MS;

          holdProgress = Math.min(1.0, (timestamp - this.holdStartTime) / duration);
        }

        let armedRemainingMs = 0;
        if (this.state === 'ARMED' && this.armedStartTime) {
          armedRemainingMs = Math.max(
            0,
            GESTURE_CONFIG.TIMING.ARMED_TIMEOUT_MS - (timestamp - this.armedStartTime)
          );
        }

        return {
          state: this.state,
          landmarks: smoothed,
          pose: classification.pose,
          pinchRatio: classification.pinchRatio,
          smoothedTip,
          activeTargetId: this.activeTargetId,
          heldItemId: this.heldItemId,
          holdProgress,
          armedRemainingMs,
        };
      }
    }

    return {
      state: this.state,
      landmarks: null,
      pose: 'NONE',
      pinchRatio: 1.0,
      smoothedTip: null,
      activeTargetId: this.activeTargetId,
      heldItemId: this.heldItemId,
      holdProgress: 0,
      armedRemainingMs: 0,
    };
  }

  public getState(): GestureState {
    return this.state;
  }

  public reset(): void {
    this.state = 'IDLE';
    this.holdStartTime = null;
    this.armedStartTime = null;
    this.activeTargetId = null;
    this.isOverTrash = false;
    this.heldItemId = null;
    this.smoother.reset();
    this.classifier.reset();
  }
}

