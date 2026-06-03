import { describe, expect, it } from "vitest";
import { JawFireDetector } from "./jawFireDetector";

describe("JawFireDetector", () => {
  it("fires on jaw open after a relaxed mouth arms the trigger", () => {
    const detector = new JawFireDetector({ cooldownMs: 260, relaxedStableMs: 50, openStableMs: 30, rearmDelayMs: 40 });

    expect(detector.configure({ relaxedJaw: 0.08, openJaw: 0.72 })).toBe(true);
    expect(detector.update(0.08, 1, 0).fireStarted).toBe(false);
    expect(detector.update(0.09, 1, 60).fireStarted).toBe(false);
    expect(detector.update(0.76, 1, 80).fireStarted).toBe(false);
    expect(detector.update(0.78, 1, 122).fireStarted).toBe(true);
  });

  it("does not fire if the mouth starts open before the relaxed arming pose", () => {
    const detector = new JawFireDetector({ relaxedStableMs: 20, openStableMs: 20 });

    detector.configure({ relaxedJaw: 0.08, openJaw: 0.7 });
    expect(detector.update(0.73, 1, 0).fireStarted).toBe(false);
    expect(detector.update(0.74, 1, 40).fireStarted).toBe(false);
  });

  it("rearams only after the mouth relaxes again and cooldown has elapsed", () => {
    const detector = new JawFireDetector({ cooldownMs: 120, relaxedStableMs: 20, openStableMs: 15, rearmDelayMs: 30 });

    detector.configure({ relaxedJaw: 0.05, openJaw: 0.65 });
    detector.update(0.05, 1, 0);
    detector.update(0.05, 1, 30);
    detector.update(0.68, 1, 50);
    expect(detector.update(0.69, 1, 70).fireStarted).toBe(true);
    expect(detector.update(0.68, 1, 100).fireStarted).toBe(false);
    detector.update(0.05, 1, 150);
    detector.update(0.05, 1, 200);
    detector.update(0.68, 1, 220);
    expect(detector.update(0.69, 1, 242).fireStarted).toBe(true);
  });

  it("rejects calibration when relaxed and fire pose are too similar", () => {
    const detector = new JawFireDetector();

    expect(detector.configure({ relaxedJaw: 0.2, openJaw: 0.27 })).toBe(false);
  });
});
