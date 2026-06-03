import type {
  CommentaryProvider,
  CommentaryState,
  RoundMetrics,
  ShotEvent,
  VisionCommentaryRequest,
  VisionCommentaryResult,
} from "../domain/types";

export class StubVisionCommentaryProvider implements CommentaryProvider {
  readonly id = "stub-vlm-v1";

  async onShot(event: ShotEvent): Promise<VisionCommentaryResult> {
    const request: VisionCommentaryRequest = {
      eventType: "shot",
      context: {
        hit: event.hit,
        accuracy: Number(event.accuracy.toFixed(2)),
        streak: event.streak,
        source: event.aim.source,
        confidence: Number(event.aim.confidence.toFixed(2)),
      },
      handCropRef: null,
      requestedTone: event.hit ? "duck" : "coach",
      maxLength: 84,
    };

    return this.respond(request, () => {
      if (event.hit && event.streak >= 4) {
        return "That duck saw the finger lock-on and still flew into trouble.";
      }
      if (event.hit) {
        return "Clean trigger shot. The lead was just ahead of the beak.";
      }
      if (event.aim.confidence < 0.48) {
        return "Tracking is soft. Hold the finger pose a little steadier.";
      }
      return "Good aim line, late trigger. Fire before the juke starts.";
    });
  }

  async summarizeRound(metrics: RoundMetrics): Promise<VisionCommentaryResult> {
    const request: VisionCommentaryRequest = {
      eventType: "round-summary",
      context: {
        shots: metrics.shots,
        hits: metrics.hits,
        accuracy: Number(metrics.accuracy.toFixed(2)),
        bestStreak: metrics.bestStreak,
        shakiness: Number(metrics.shakiness.toFixed(2)),
      },
      handCropRef: null,
      requestedTone: "coach",
      maxLength: 180,
    };

    return this.respond(request, () => {
      const accuracy = Math.round(metrics.accuracy * 100);
      const stability = metrics.shakiness < 0.55 ? "stable" : "jumpy";
      return `Round readout: ${accuracy}% accuracy, best streak ${metrics.bestStreak}. Aim looked ${stability}; fire just before evasive ducks cross the reticle.`;
    });
  }

  private async respond(request: VisionCommentaryRequest, createText: () => string): Promise<VisionCommentaryResult> {
    const started = performance.now();
    await delay(120 + Math.random() * 220);
    const text = clampText(createText(), request.maxLength);
    const latencyMs = Math.round(performance.now() - started);

    return {
      text,
      providerId: this.id,
      latencyMs,
      fallback: true,
      debug: {
        eventType: request.eventType,
        tone: request.requestedTone,
        maxLength: request.maxLength,
        note: "Deterministic v1 stub; real VLM provider plugs into same contract.",
      },
    };
  }
}

export function idleCommentaryState(): CommentaryState {
  return {
    status: "idle",
    providerId: "stub-vlm-v1",
    lastText: "",
    latencyMs: 0,
    fallbackReason: null,
  };
}

export function pendingCommentaryState(providerId: string): CommentaryState {
  return {
    status: "pending",
    providerId,
    lastText: "",
    latencyMs: 0,
    fallbackReason: null,
  };
}

export function readyCommentaryState(result: VisionCommentaryResult): CommentaryState {
  return {
    status: result.fallback ? "fallback" : "ready",
    providerId: result.providerId,
    lastText: result.text,
    latencyMs: result.latencyMs,
    fallbackReason: result.fallback ? "stub-provider" : null,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}
