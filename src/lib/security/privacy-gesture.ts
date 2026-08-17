export type PrivacyGesture = "flip" | "shake";

export type AccelerometerSample = {
  x: number;
  y: number;
  z: number;
};

type PrivacyGestureDetectorOptions = {
  /** Multiplier that makes a face-down z value positive on this platform. */
  faceDownSign: 1 | -1;
  onGesture: (gesture: PrivacyGesture) => void;
};

const FACE_DOWN_THRESHOLD = 0.52;
const FACE_DOWN_EXIT_THRESHOLD = 0.18;
const GESTURE_COOLDOWN_MS = 400;

const SHAKE_THRESHOLD = 0.9;
const SHAKE_RELEASE_THRESHOLD = 0.35;
const SHAKE_WINDOW_MS = 550;

/**
 * Turns noisy accelerometer samples into one intentional privacy gesture.
 *
 * A flip uses two different thresholds: crossing into a clearly face-down
 * angle fires once, and leaving that angle re-arms it. This hysteresis rejects
 * noise without timing windows that can swallow fast gestures. A shake needs
 * two distinct acceleration impulses. Both paths share a short cooldown so a
 * vigorous flip cannot double-toggle as a shake.
 */
export class PrivacyGestureDetector {
  private readonly faceDownSign: 1 | -1;
  private readonly onGesture: (gesture: PrivacyGesture) => void;

  private flipArmed = true;

  private shakeAboveThreshold = false;
  private lastShakeImpulseAt = Number.NEGATIVE_INFINITY;
  private lastGestureAt = Number.NEGATIVE_INFINITY;

  constructor({ faceDownSign, onGesture }: PrivacyGestureDetectorOptions) {
    this.faceDownSign = faceDownSign;
    this.onGesture = onGesture;
  }

  process(sample: AccelerometerSample, now = Date.now()) {
    const faceDownZ = sample.z * this.faceDownSign;

    this.processFlip(faceDownZ, now);
    this.processShake(sample, now);
  }

  private processFlip(faceDownZ: number, now: number) {
    if (!this.flipArmed && faceDownZ <= FACE_DOWN_EXIT_THRESHOLD) {
      this.flipArmed = true;
      return;
    }

    if (!this.flipArmed || faceDownZ < FACE_DOWN_THRESHOLD) return;

    this.flipArmed = false;
    this.trigger("flip", now);
  }

  private processShake({ x, y, z }: AccelerometerSample, now: number) {
    const magnitude = Math.sqrt(x * x + y * y + z * z);
    const accelerationWithoutGravity = Math.abs(magnitude - 1);

    if (accelerationWithoutGravity <= SHAKE_RELEASE_THRESHOLD) {
      this.shakeAboveThreshold = false;
      return;
    }

    if (
      accelerationWithoutGravity < SHAKE_THRESHOLD ||
      this.shakeAboveThreshold
    ) {
      return;
    }

    this.shakeAboveThreshold = true;

    if (now - this.lastShakeImpulseAt <= SHAKE_WINDOW_MS) {
      this.lastShakeImpulseAt = Number.NEGATIVE_INFINITY;
      this.trigger("shake", now);
      return;
    }

    this.lastShakeImpulseAt = now;
  }

  private trigger(gesture: PrivacyGesture, now: number) {
    if (now - this.lastGestureAt < GESTURE_COOLDOWN_MS) return;

    this.lastGestureAt = now;
    this.onGesture(gesture);
  }
}
