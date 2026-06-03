import type { Point } from "../domain/types";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha;
}

export function distance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function normalize(point: Point): Point {
  const length = Math.hypot(point.x, point.y);
  if (length <= 0.0001) {
    return { x: 0, y: 0 };
  }

  return { x: point.x / length, y: point.y / length };
}

export function pointLerp(from: Point, to: Point, alpha: number): Point {
  return {
    x: lerp(from.x, to.x, alpha),
    y: lerp(from.y, to.y, alpha),
  };
}

export function pointInBounds(point: Point, width: number, height: number): Point {
  return {
    x: clamp(point.x, 0, width),
    y: clamp(point.y, 0, height),
  };
}

