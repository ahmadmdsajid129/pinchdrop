import { Landmark3D } from './filter.js';

export type PoseType =
  | 'NONE'
  | 'POINT'         // G1: Index leading, others curled or open
  | 'PINCH'         // G2: Thumb tip (4) to Index tip (8) close
  | 'OPEN'          // G3: All fingers extended
  | 'PEACE'         // G4: Index (8) & Middle (12) extended, others curled
  | 'FIST'          // G5: All fingers curled
  | 'WAVE';         // G6: Lateral oscillation

export interface PoseClassificationResult {
  pose: PoseType;
  pinchRatio: number;
  confidence: number;
  fingerExtended: {
    thumb: boolean;
    index: boolean;
    middle: boolean;
    ring: boolean;
    pinky: boolean;
  };
}

/**
 * Calculates Euclidean distance between two 3D landmarks
 */
export function dist3D(a: Landmark3D, b: Landmark3D): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * Classifies 21 MediaPipe hand landmarks into canonical poses
 */
export class PoseClassifier {
  private pinchEnterThreshold: number;
  private pinchExitThreshold: number;
  private isPinching: boolean = false;

  constructor(pinchEnterThreshold = 0.30, pinchExitThreshold = 0.45) {
    this.pinchEnterThreshold = pinchEnterThreshold;
    this.pinchExitThreshold = pinchExitThreshold;
  }

  public classify(landmarks: Landmark3D[]): PoseClassificationResult {
    if (!landmarks || landmarks.length < 21) {
      return {
        pose: 'NONE',
        pinchRatio: 1.0,
        confidence: 0,
        fingerExtended: { thumb: false, index: false, middle: false, ring: false, pinky: false },
      };
    }

    const wrist = landmarks[0];
    const palmScale = dist3D(wrist, landmarks[9]); // Wrist to Middle MCP

    // Pinch calculation
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const pinchDist = dist3D(thumbTip, indexTip);
    const pinchRatio = palmScale > 0 ? pinchDist / palmScale : 1.0;

    // Hysteresis for pinch state
    if (this.isPinching) {
      if (pinchRatio >= this.pinchExitThreshold) {
        this.isPinching = false;
      }
    } else {
      if (pinchRatio <= this.pinchEnterThreshold) {
        this.isPinching = true;
      }
    }

    // Finger extension checks (tip further from wrist than PIP knuckle)
    const indexExtended = dist3D(wrist, landmarks[8]) > dist3D(wrist, landmarks[6]);
    const middleExtended = dist3D(wrist, landmarks[12]) > dist3D(wrist, landmarks[10]);
    const ringExtended = dist3D(wrist, landmarks[16]) > dist3D(wrist, landmarks[14]);
    const pinkyExtended = dist3D(wrist, landmarks[20]) > dist3D(wrist, landmarks[18]);
    const thumbExtended = dist3D(wrist, landmarks[4]) > dist3D(wrist, landmarks[2]);

    const fingerExtended = {
      thumb: thumbExtended,
      index: indexExtended,
      middle: middleExtended,
      ring: ringExtended,
      pinky: pinkyExtended,
    };

    let pose: PoseType = 'NONE';

    if (this.isPinching) {
      pose = 'PINCH'; // G2
    } else if (!indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
      pose = 'FIST'; // G5
    } else if (indexExtended && middleExtended && !ringExtended && !pinkyExtended) {
      pose = 'PEACE'; // G4
    } else if (indexExtended && middleExtended && ringExtended && pinkyExtended) {
      pose = 'OPEN'; // G3
    } else if (indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
      pose = 'POINT'; // G1
    }

    return {
      pose,
      pinchRatio,
      confidence: 0.95,
      fingerExtended,
    };
  }

  public reset(): void {
    this.isPinching = false;
  }
}
