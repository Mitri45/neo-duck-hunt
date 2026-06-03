import type { AimState, RoundMetrics } from "../domain/types";

export class MetricsTracker {
  private confidenceTotal = 0;
  private confidenceSamples = 0;
  private velocityTotal = 0;
  private velocitySamples = 0;
  shots = 0;
  hits = 0;
  misses = 0;
  streak = 0;
  bestStreak = 0;

  reset(): void {
    this.confidenceTotal = 0;
    this.confidenceSamples = 0;
    this.velocityTotal = 0;
    this.velocitySamples = 0;
    this.shots = 0;
    this.hits = 0;
    this.misses = 0;
    this.streak = 0;
    this.bestStreak = 0;
  }

  sampleAim(aim: AimState | null): void {
    if (!aim) {
      return;
    }

    this.confidenceTotal += aim.confidence;
    this.confidenceSamples += 1;
    this.velocityTotal += Math.hypot(aim.velocity.x, aim.velocity.y) * 1000;
    this.velocitySamples += 1;
  }

  recordShot(hit: boolean): void {
    this.shots += 1;
    if (hit) {
      this.hits += 1;
      this.streak += 1;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
    } else {
      this.misses += 1;
      this.streak = 0;
    }
  }

  snapshot(): RoundMetrics {
    return {
      shots: this.shots,
      hits: this.hits,
      misses: this.misses,
      accuracy: this.shots === 0 ? 0 : this.hits / this.shots,
      streak: this.streak,
      bestStreak: this.bestStreak,
      averageAimConfidence: this.confidenceSamples === 0 ? 0 : this.confidenceTotal / this.confidenceSamples,
      shakiness: this.velocitySamples === 0 ? 0 : Math.min(1, this.velocityTotal / this.velocitySamples / 900),
    };
  }
}

