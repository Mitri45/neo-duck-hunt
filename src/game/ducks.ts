import type { AimState, Duck, DuckThreatState, Point, Rect } from "../domain/types";
import { clamp, distance, normalize } from "../utils/math";

let nextDuckId = 1;

export function createDuck(bounds: Rect, wave: number): Duck {
  const fromLeft = Math.random() > 0.5;
  const lane = flightLane(bounds);
  const y = lane.minY + Math.random() * (lane.maxY - lane.minY);
  const speed = 0.11 + wave * 0.009 + Math.random() * 0.035;

  return {
    id: nextDuckId++,
    position: {
      x: fromLeft ? -64 : bounds.width + 64,
      y,
    },
    velocity: {
      x: (fromLeft ? 1 : -1) * speed,
      y: (Math.random() - 0.5) * 0.035,
    },
    radius: 42,
    facing: fromLeft ? 1 : -1,
    state: "flying",
    ageMs: 0,
    hitAtMs: null,
    threat: emptyThreat(),
  };
}

export function updateDuck(duck: Duck, aim: AimState | null, dtMs: number, bounds: Rect): Duck {
  const next: Duck = {
    ...duck,
    position: { ...duck.position },
    velocity: { ...duck.velocity },
    threat: { ...duck.threat },
    ageMs: duck.ageMs + dtMs,
  };

  if (next.state === "hit") {
    next.velocity.y += 0.0012 * dtMs;
    next.position.x += next.velocity.x * dtMs * 0.32;
    next.position.y += next.velocity.y * dtMs;
    if (next.position.y > bounds.height + 80) {
      next.state = "escaped";
    }
    return next;
  }

  if (next.state === "escaped") {
    return next;
  }

  next.threat = aim ? calculateThreat(next, aim) : emptyThreat();

  if (next.threat.threatScore > 0.38) {
    const away = aim ? normalize({ x: next.position.x - aim.predicted.x, y: next.position.y - aim.predicted.y }) : { x: 0, y: 0 };
    const juke = Math.sin(next.ageMs / 140 + next.id) * 0.018;
    next.velocity.x += away.x * next.threat.threatScore * 0.006 + juke;
    next.velocity.y += away.y * next.threat.threatScore * 0.008 + (next.threat.evasionMode === "dive" ? 0.009 : -0.004);
  }

  next.velocity.y += Math.sin(next.ageMs / 760 + next.id) * 0.00075 * dtMs;
  next.velocity.x = clamp(next.velocity.x, -0.25, 0.25);
  next.velocity.y = clamp(next.velocity.y, -0.12, 0.12);
  next.position.x += next.velocity.x * dtMs;
  next.position.y += next.velocity.y * dtMs;
  constrainFlightLane(next, bounds);
  next.facing = next.velocity.x >= 0 ? 1 : -1;

  if (next.position.x < -duck.radius * 2.8 || next.position.x > bounds.width + duck.radius * 2.8) {
    next.state = "escaped";
  }

  return next;
}

export function hitDuck(duck: Duck, nowMs: number): Duck {
  return {
    ...duck,
    state: "hit",
    hitAtMs: nowMs,
    velocity: {
      x: duck.velocity.x * 0.12,
      y: 0.12,
    },
  };
}

export function isShotHit(duck: Duck, point: Point): boolean {
  if (duck.state !== "flying") {
    return false;
  }

  return distance(duck.position, point) <= duck.radius;
}

export function calculateThreat(duck: Duck, aim: AimState): DuckThreatState {
  const dist = distance(duck.position, aim.predicted);
  const threatRadius = duck.radius * 2.15;
  const rawThreat = clamp(1 - dist / threatRadius, 0, 1) * aim.confidence;

  let evasionMode: DuckThreatState["evasionMode"] = "none";
  if (rawThreat > 0.78) {
    evasionMode = duck.position.y < 170 ? "dive" : "climb";
  } else if (rawThreat > 0.42) {
    evasionMode = "juke";
  }

  return {
    threatScore: rawThreat,
    evasionMode,
    lastPredictedIntercept: rawThreat > 0.08 ? { ...aim.predicted } : null,
  };
}

function flightLane(bounds: Rect): { minY: number; maxY: number } {
  const minY = Math.max(100, bounds.height * 0.16);
  const maxY = Math.max(minY + 110, bounds.height * 0.58);
  return { minY, maxY };
}

function constrainFlightLane(duck: Duck, bounds: Rect): void {
  const lane = flightLane(bounds);
  if (duck.position.y < lane.minY) {
    duck.position.y = lane.minY;
    duck.velocity.y = Math.abs(duck.velocity.y) * 0.72 + 0.018;
  }
  if (duck.position.y > lane.maxY) {
    duck.position.y = lane.maxY;
    duck.velocity.y = -Math.abs(duck.velocity.y) * 0.72 - 0.012;
  }
}

function emptyThreat(): DuckThreatState {
  return {
    threatScore: 0,
    evasionMode: "none",
    lastPredictedIntercept: null,
  };
}
