import { Landmark3D } from './filter.js';
import { GestureStateMachine } from './fsm.js';

export interface LandmarkFrame {
  timestampMs: number;
  landmarks: Landmark3D[];
  expectedPose?: string;
  expectedState?: string;
}

export interface ReplayReport {
  totalFrames: number;
  durationMs: number;
  stateTransitions: number;
  pinchTriggers: number;
  dropTriggers: number;
  falseTriggers: number;
  finalState: string;
}

export class ReplayHarness {
  private fsm: GestureStateMachine;

  constructor() {
    this.fsm = new GestureStateMachine();
  }

  public replay(frames: LandmarkFrame[]): ReplayReport {
    this.fsm.reset();

    let stateTransitions = 0;
    let pinchTriggers = 0;
    let dropTriggers = 0;
    let falseTriggers = 0;
    let lastState = this.fsm.getState();

    const startTime = frames.length > 0 ? frames[0].timestampMs : 0;
    let endTime = startTime;

    for (const frame of frames) {
      endTime = frame.timestampMs;
      const ctx = this.fsm.transition({
        type: 'FRAME',
        landmarks: frame.landmarks,
        timestampMs: frame.timestampMs,
      });

      if (ctx.state !== lastState) {
        stateTransitions++;
        if (ctx.state === 'GRABBING') pinchTriggers++;
        if (ctx.state === 'HOVER' && lastState === 'GRABBING') dropTriggers++;
        lastState = ctx.state;
      }

      if (frame.expectedState && ctx.state !== frame.expectedState) {
        falseTriggers++;
      }
    }

    return {
      totalFrames: frames.length,
      durationMs: endTime - startTime,
      stateTransitions,
      pinchTriggers,
      dropTriggers,
      falseTriggers,
      finalState: lastState,
    };
  }
}

