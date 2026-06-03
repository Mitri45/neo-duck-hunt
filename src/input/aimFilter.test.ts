import { describe, expect, it } from "vitest";
import { AimFilter } from "./aimFilter";

describe("AimFilter", () => {
  it("smooths and predicts aim inside bounds", () => {
    const filter = new AimFilter({ smoothingAlpha: 0.5, predictionMs: 100 });
    const bounds = { width: 1000, height: 700 };
    filter.update({ x: 100, y: 100 }, 1, 0, bounds, "mouse");
    const next = filter.update({ x: 300, y: 200 }, 1, 100, bounds, "mouse");

    expect(next.smoothed.x).toBe(200);
    expect(next.smoothed.y).toBe(150);
    expect(next.predicted.x).toBeGreaterThan(next.smoothed.x);
    expect(next.predicted.y).toBeGreaterThan(next.smoothed.y);
  });

  it("clamps raw and predicted points to the viewport", () => {
    const filter = new AimFilter();
    const bounds = { width: 100, height: 80 };
    const next = filter.update({ x: 1000, y: -100 }, 1, 0, bounds, "mouse");

    expect(next.raw).toEqual({ x: 100, y: 0 });
    expect(next.predicted).toEqual({ x: 100, y: 0 });
  });
});

