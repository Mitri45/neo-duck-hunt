import type { GestureState } from "../domain/types";
import { clamp } from "../utils/math";

type JawFireDetectorOptions = {
  cooldownMs?: number;
  relaxedStableMs?: number;
  openStableMs?: number;
  rearmDelayMs?: number;
  minConfidence?: number;
  readyThreshold?: number;
  fireThreshold?: number;
};

export type JawFireCalibration = {
  relaxedJaw: number;
  openJaw: number;
};

export type JawFireSignal = {
  jawOpen: number;
  confidence: number;
};

export type JawFireDebugState = {
  calibrated: boolean;
  armed: boolean;
  readyThreshold: number;
  fireThreshold: number;
  range: number;
};

export class JawFireDetector {
  private readonly cooldownMs: number;
  private readonly relaxedStableMs: number;
  private readonly openStableMs: number;
  private readonly rearmDelayMs: number;
  private readonly minConfidence: number;
  private readyThreshold: number;
  private fireThreshold: number;
  private calibrated = false;
  private armed = false;
  private relaxedSinceMs: number | null = null;
  private openSinceMs: number | null = null;
  private lastShotAtMs = -Infinity;
  private rearmBlockedUntilMs = -Infinity;

  constructor(options: JawFireDetectorOptions = {}) {
    this.cooldownMs = options.cooldownMs ?? 420;
    this.relaxedStableMs = options.relaxedStableMs ?? 80;
    this.openStableMs = options.openStableMs ?? 35;
    this.rearmDelayMs = options.rearmDelayMs ?? 260;
    this.minConfidence = options.minConfidence ?? 0.5;
    this.readyThreshold = options.readyThreshold ?? 0.24;
    this.fireThreshold = options.fireThreshold ?? 0.52;
  }

  reset(): void {
    this.armed = false;
    this.relaxedSinceMs = null;
    this.openSinceMs = null;
    this.lastShotAtMs = -Infinity;
    this.rearmBlockedUntilMs = -Infinity;
  }

  configure(calibration: JawFireCalibration): boolean {
    const range = calibration.openJaw - calibration.relaxedJaw;
    if (!Number.isFinite(range) || range < 0.1) {
      return false;
    }

    this.readyThreshold = clamp(calibration.relaxedJaw + range * 0.34, 0.05, 0.75);
    this.fireThreshold = clamp(calibration.relaxedJaw + range * 0.66, this.readyThreshold + 0.05, 0.95);
    this.calibrated = true;
    this.reset();
    return true;
  }

  debugState(): JawFireDebugState {
    return {
      calibrated: this.calibrated,
      armed: this.armed,
      readyThreshold: this.readyThreshold,
      fireThreshold: this.fireThreshold,
      range: this.fireThreshold - this.readyThreshold,
    };
  }

  updateSignal(signal: JawFireSignal, nowMs: number): GestureState {
    return this.update(signal.jawOpen, signal.confidence, nowMs);
  }

  update(jawOpen: number, confidence: number, nowMs: number): GestureState {
    const cooldownRemainingMs = Math.max(0, this.cooldownMs - (nowMs - this.lastShotAtMs));
    const usableFace = confidence >= this.minConfidence && nowMs >= this.rearmBlockedUntilMs;
    let fireStarted = false;

    if (!usableFace) {
      this.armed = false;
      this.relaxedSinceMs = null;
      this.openSinceMs = null;
    } else {
      const mouthRelaxed = jawOpen <= this.readyThreshold;
      const mouthOpen = jawOpen >= this.fireThreshold;

      if (mouthRelaxed) {
        this.relaxedSinceMs ??= nowMs;
        this.openSinceMs = null;
        if (nowMs - this.relaxedSinceMs >= this.relaxedStableMs && cooldownRemainingMs <= 0) {
          this.armed = true;
        }
      } else {
        this.relaxedSinceMs = null;
      }

      if (this.armed && mouthOpen) {
        this.openSinceMs ??= nowMs;
        if (nowMs - this.openSinceMs >= this.openStableMs && cooldownRemainingMs <= 0) {
          fireStarted = true;
          this.armed = false;
          this.relaxedSinceMs = null;
          this.openSinceMs = null;
          this.lastShotAtMs = nowMs;
          this.rearmBlockedUntilMs = nowMs + this.rearmDelayMs;
        }
      } else if (!mouthOpen) {
        this.openSinceMs = null;
      }
    }

    return {
      fireActive: this.armed || this.openSinceMs !== null,
      fireStarted,
      cooldownRemainingMs: Math.max(0, this.cooldownMs - (nowMs - this.lastShotAtMs)),
      handConfidence: clamp(confidence, 0, 1),
    };
  }
}
