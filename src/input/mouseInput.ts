import type { AimState, GestureState, Point, Rect } from "../domain/types";
import { AimFilter } from "./aimFilter";

export class MouseInput {
  private point: Point | null = null;
  private fireQueued = false;
  private readonly aimFilter = new AimFilter({ smoothingAlpha: 0.42, predictionMs: 70 });

  attach(target: HTMLElement): () => void {
    const onMove = (event: PointerEvent) => {
      const rect = target.getBoundingClientRect();
      this.point = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    };
    const onDown = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) {
        return;
      }

      onMove(event);
      this.fireQueued = true;
    };

    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerdown", onDown);

    return () => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerdown", onDown);
    };
  }

  sample(nowMs: number, bounds: Rect): { aim: AimState; gesture: GestureState } {
    const point = this.point ?? { x: bounds.width / 2, y: bounds.height / 2 };
    const aim = this.aimFilter.update(point, 1, nowMs, bounds, "mouse");
    const fireStarted = this.fireQueued;
    this.fireQueued = false;

    return {
      aim,
      gesture: {
        fireActive: false,
        fireStarted,
        cooldownRemainingMs: 0,
        handConfidence: 1,
      },
    };
  }
}
