import type { AimState, InputMode, Point, Rect } from "../domain/types";
import { clamp, pointInBounds, pointLerp } from "../utils/math";

type AimFilterOptions = {
  smoothingAlpha?: number;
  predictionMs?: number;
};

export class AimFilter {
  private last: AimState | null = null;
  private readonly smoothingAlpha: number;
  private readonly predictionMs: number;

  constructor(options: AimFilterOptions = {}) {
    this.smoothingAlpha = options.smoothingAlpha ?? 0.34;
    this.predictionMs = options.predictionMs ?? 90;
  }

  reset(): void {
    this.last = null;
  }

  update(raw: Point, confidence: number, nowMs: number, bounds: Rect, source: InputMode): AimState {
    const boundedRaw = pointInBounds(raw, bounds.width, bounds.height);

    if (!this.last) {
      const first: AimState = {
        raw: boundedRaw,
        smoothed: boundedRaw,
        predicted: boundedRaw,
        velocity: { x: 0, y: 0 },
        confidence: clamp(confidence, 0, 1),
        source,
        updatedAt: nowMs,
      };
      this.last = first;
      return first;
    }

    const dtMs = Math.max(1, nowMs - this.last.updatedAt);
    const alpha = clamp(this.smoothingAlpha + (1 - confidence) * 0.18, 0.18, 0.68);
    const smoothed = pointLerp(this.last.smoothed, boundedRaw, alpha);
    const velocity = {
      x: (smoothed.x - this.last.smoothed.x) / dtMs,
      y: (smoothed.y - this.last.smoothed.y) / dtMs,
    };
    const predicted = pointInBounds(
      {
        x: smoothed.x + velocity.x * this.predictionMs,
        y: smoothed.y + velocity.y * this.predictionMs,
      },
      bounds.width,
      bounds.height,
    );

    const next: AimState = {
      raw: boundedRaw,
      smoothed,
      predicted,
      velocity,
      confidence: clamp(confidence, 0, 1),
      source,
      updatedAt: nowMs,
    };
    this.last = next;
    return next;
  }
}

