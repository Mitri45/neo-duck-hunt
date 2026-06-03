import { describe, expect, it } from "vitest";
import { GameSupervisor } from "./supervisor";

describe("GameSupervisor", () => {
  it("opens a focus window after poor accuracy", () => {
    const supervisor = new GameSupervisor();
    const decision = supervisor.update(
      {
        shots: 8,
        hits: 1,
        misses: 7,
        accuracy: 0.125,
        streak: 0,
        bestStreak: 1,
        averageAimConfidence: 0.8,
        shakiness: 0.5,
      },
      16,
    );

    expect(decision.type).toBe("focus-window");
  });

  it("adds pressure after a streak", () => {
    const supervisor = new GameSupervisor();
    const decision = supervisor.update(
      {
        shots: 3,
        hits: 3,
        misses: 0,
        accuracy: 1,
        streak: 3,
        bestStreak: 3,
        averageAimConfidence: 0.9,
        shakiness: 0.1,
      },
      16,
    );

    expect(decision.type).toBe("pressure-spawn");
  });
});

