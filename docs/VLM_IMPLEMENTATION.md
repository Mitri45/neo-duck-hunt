# VLM Implementation Notes

## V1 Contract
V1 ships with `StubVisionCommentaryProvider`, not a real VLM. The stub is intentional: the game loop, camera tracking, rendering, hit detection, and duck behavior must never depend on model load or inference latency.

The real provider should implement the same `CommentaryProvider` contract:

- `onShot(event)`: called after a shot resolves.
- `summarizeRound(metrics)`: called when the round ends.
- Both return `VisionCommentaryResult` asynchronously.
- Both may fail, time out, or return fallback copy without interrupting gameplay.

## Future Local VLM Provider
The intended post-MVP provider is a browser Worker that loads a small local vision-language model. It should be event-triggered only:

- successful shot
- strong input pose, if added later
- round end

It must not run per frame.

The request shape should include:

- event type
- current gameplay metrics
- duck threat state and shot result
- optional hand crop or canvas snapshot reference
- requested tone: duck or coach
- max output length

The result shape should include:

- text
- provider id
- latency
- fallback flag
- debug metadata

## Prompt Templates
Shot commentary:

```text
You are a terse arcade coach for a browser hand-tracking duck game.
Use the metrics only. One sentence, maximum 84 characters.
Mention aim stability, timing, streak, or duck evasion. No markdown.
```

Duck-perspective shot commentary:

```text
You are the duck in a retro arcade game.
React to the shot in one playful sentence, maximum 84 characters.
Do not mention Nintendo, Duck Hunt, cameras, or model internals.
```

Round summary:

```text
You are a concise coach for a real-time hand-tracking arcade demo.
Summarize accuracy, best streak, aim stability, and one next adjustment.
Maximum 180 characters. No markdown.
```

## Runtime Rules
- Load the model lazily in a Worker.
- Cache the loaded model for the session.
- Set a strict timeout per request.
- Cancel stale requests when a round restarts.
- Fall back to deterministic local copy on unavailable model, timeout, low confidence, or bad output.
- Surface provider id, status, latency, fallback reason, and a short context summary in the debug overlay.
