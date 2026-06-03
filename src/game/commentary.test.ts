import { describe, expect, it } from "vitest";
import type { AimState } from "../domain/types";
import { StubVisionCommentaryProvider } from "./commentary";

const aim: AimState = {
  raw: { x: 100, y: 100 },
  smoothed: { x: 100, y: 100 },
  predicted: { x: 100, y: 100 },
  velocity: { x: 0, y: 0 },
  confidence: 0.9,
  source: "mouse",
  updatedAt: 0,
};

describe("StubVisionCommentaryProvider", () => {
  it("returns async shot commentary through the VLM contract", async () => {
    const provider = new StubVisionCommentaryProvider();
    const result = await provider.onShot({
      aim,
      hit: true,
      duckId: 1,
      accuracy: 1,
      streak: 2,
      roundMsRemaining: 10_000,
    });

    expect(result.providerId).toBe("stub-vlm-v1");
    expect(result.fallback).toBe(true);
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

