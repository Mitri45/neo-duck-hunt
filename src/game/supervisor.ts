import type { RoundMetrics, SupervisorDecision } from "../domain/types";

export class GameSupervisor {
  private active: SupervisorDecision = noneDecision();
  private remainingMs = 0;

  update(metrics: RoundMetrics, dtMs: number): SupervisorDecision {
    if (this.remainingMs > 0) {
      this.remainingMs = Math.max(0, this.remainingMs - dtMs);
      return this.active;
    }

    if (metrics.bestStreak >= 5 && metrics.streak >= 3) {
      return this.setDecision({
        type: "streak-heat",
        reason: "Player is holding a strong streak.",
        durationMs: 3500,
        debugLabel: "supervisor: streak heat - tighter evasions",
      });
    }

    if (metrics.shots >= 6 && metrics.accuracy < 0.28) {
      return this.setDecision({
        type: "focus-window",
        reason: "Accuracy dipped below 28%.",
        durationMs: 4200,
        debugLabel: "supervisor: focus window - slower spawns",
      });
    }

    if (metrics.streak >= 3) {
      return this.setDecision({
        type: "pressure-spawn",
        reason: "Three-hit streak earned a pressure duck.",
        durationMs: 2500,
        debugLabel: "supervisor: pressure spawn",
      });
    }

    this.active = noneDecision();
    return this.active;
  }

  private setDecision(decision: SupervisorDecision): SupervisorDecision {
    this.active = decision;
    this.remainingMs = decision.durationMs;
    return decision;
  }
}

export function noneDecision(): SupervisorDecision {
  return {
    type: "none",
    reason: "No intervention.",
    durationMs: 0,
    debugLabel: "supervisor: idle",
  };
}

