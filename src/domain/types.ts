export type InputMode = "camera" | "mouse";

export type Point = {
  x: number;
  y: number;
};

export type Rect = {
  width: number;
  height: number;
};

export type AimState = {
  raw: Point;
  smoothed: Point;
  predicted: Point;
  velocity: Point;
  confidence: number;
  source: InputMode;
  updatedAt: number;
};

export type GestureState = {
  fireActive: boolean;
  fireStarted: boolean;
  cooldownRemainingMs: number;
  handConfidence: number;
};

export type DuckState = "flying" | "hit" | "escaped";

export type DuckThreatState = {
  threatScore: number;
  evasionMode: "none" | "juke" | "dive" | "climb";
  lastPredictedIntercept: Point | null;
};

export type Duck = {
  id: number;
  position: Point;
  velocity: Point;
  radius: number;
  facing: 1 | -1;
  state: DuckState;
  ageMs: number;
  hitAtMs: number | null;
  threat: DuckThreatState;
};

export type ShotEvent = {
  aim: AimState;
  hit: boolean;
  duckId: number | null;
  accuracy: number;
  streak: number;
  roundMsRemaining: number;
};

export type RoundMetrics = {
  shots: number;
  hits: number;
  misses: number;
  accuracy: number;
  streak: number;
  bestStreak: number;
  averageAimConfidence: number;
  shakiness: number;
};

export type CommentaryStatus = "idle" | "pending" | "ready" | "timeout" | "error" | "fallback";

export type VisionCommentaryRequest = {
  eventType: "shot" | "round-summary";
  context: Record<string, string | number | boolean | null>;
  handCropRef: string | null;
  requestedTone: "duck" | "coach";
  maxLength: number;
};

export type VisionCommentaryResult = {
  text: string;
  providerId: string;
  latencyMs: number;
  fallback: boolean;
  debug: Record<string, string | number | boolean | null>;
};

export type CommentaryState = {
  status: CommentaryStatus;
  providerId: string;
  lastText: string;
  latencyMs: number;
  fallbackReason: string | null;
};

export type CommentaryProvider = {
  readonly id: string;
  onShot(event: ShotEvent): Promise<VisionCommentaryResult>;
  summarizeRound(metrics: RoundMetrics): Promise<VisionCommentaryResult>;
};

export type SupervisorDecision = {
  type: "none" | "pressure-spawn" | "focus-window" | "streak-heat";
  reason: string;
  durationMs: number;
  debugLabel: string;
};
