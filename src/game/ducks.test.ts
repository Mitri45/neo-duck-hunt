import { describe, expect, it } from "vitest";
import type { AimState, Duck } from "../domain/types";
import { calculateThreat, hitDuck, isShotHit, updateDuck } from "./ducks";

const duck: Duck = {
  id: 1,
  position: { x: 400, y: 220 },
  velocity: { x: 0.1, y: 0 },
  radius: 40,
  facing: 1,
  state: "flying",
  ageMs: 0,
  hitAtMs: null,
  threat: { threatScore: 0, evasionMode: "none", lastPredictedIntercept: null },
};

const aim: AimState = {
  raw: { x: 400, y: 220 },
  smoothed: { x: 400, y: 220 },
  predicted: { x: 405, y: 218 },
  velocity: { x: 0, y: 0 },
  confidence: 0.95,
  source: "mouse",
  updatedAt: 0,
};

describe("duck behavior", () => {
  it("scores threat when predicted aim is close", () => {
    const threat = calculateThreat(duck, aim);

    expect(threat.threatScore).toBeGreaterThan(0.8);
    expect(threat.evasionMode).not.toBe("none");
  });

  it("detects shot hits by radius", () => {
    expect(isShotHit(duck, { x: 420, y: 220 })).toBe(true);
    expect(isShotHit(duck, { x: 520, y: 220 })).toBe(false);
  });

  it("makes hit ducks fall", () => {
    const falling = updateDuck(hitDuck(duck, 0), aim, 100, { width: 900, height: 600 });

    expect(falling.state).toBe("hit");
    expect(falling.position.y).toBeGreaterThan(duck.position.y);
  });

  it("keeps aged ducks alive until they leave the screen", () => {
    const agedDuck = { ...duck, ageMs: 12_000, position: { x: 420, y: 260 } };
    const updated = updateDuck(agedDuck, null, 16, { width: 900, height: 600 });

    expect(updated.state).toBe("flying");
  });

  it("removes flying ducks once they are offscreen", () => {
    const offscreenDuck = { ...duck, position: { x: -140, y: 260 }, velocity: { x: -0.2, y: 0 } };
    const updated = updateDuck(offscreenDuck, null, 16, { width: 900, height: 600 });

    expect(updated.state).toBe("escaped");
  });
});
