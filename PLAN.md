# Neo Duck Hunt Implementation Plan

## Summary
- Local-first Chrome desktop demo for recording, with deployment explicitly post-MVP.
- Vite + TypeScript + PixiJS game using MediaPipe hand tracking, smoothed index-finger aim, mouth-open firing, reactive ducks, wave scoring, debug overlay, and mouse debug fallback.
- Gameplay should feel as close to classic Duck Hunt as possible without copying Nintendo assets, names, sounds, sprites, UI, or exact art.
- VLM support is stubbed from day one behind stable async interfaces, deterministic local outputs, debug state, and implementation docs for a future real local VLM provider.
- Visual assets are generated through headless Codex using the `codex exec --json` pattern, not the API-key imagegen CLI. Iterate visually, capped at 5 variants per asset.
- Anything missing locally during implementation should be installed or fetched when required. If installation is blocked by permissions, network, license gates, or hardware limits, record the exact blocker and keep a wired fallback.

## Implementation
- Initialize git and scaffold the app in this directory.
- Install required project dependencies locally with pnpm.
- Use `public/assets/images/` and `public/assets/audio/` for production assets.
- Implement:
  - `input`: MediaPipe HandLandmarker, FaceLandmarker mouth trigger, fingertip aim, smoothing, prediction, fire hysteresis, cooldown, manual calibration, connected camera overlay, and mouse debug fallback.
  - `game`: waves, scoring, hit detection, round state, retry flow, local high score.
  - `ducks`: original duck entities that evade predicted aim.
  - `supervisor`: deterministic streak, shakiness, spawn pressure, and focus-window decisions.
  - `commentary`: VLM-ready async provider, stub provider, timeout/error/fallback states, and non-blocking UI.
  - `debug`: overlay separating MediaPipe, prediction, supervisor, input mode, and VLM stub state.

## Assets And Sound
- Use `codex exec --json` to ask headless Codex to generate each asset with the built-in image generation tool.
- Store draft outputs in `output/codex-imagegen/`; copy selected finals into `public/assets/images/`.
- Generate up to 5 variants per visual asset: duck normal, duck evasive, duck hit/falling, range background, shotgun barrel overlay, muzzle-flash animation frames, optional title/UI accent.
- Use chroma-key generation plus local background removal for sprite transparency. Do not use `--background transparent` with `gpt-image-2`.
- Required SFX: 8-bit shot, hit, miss, duck flap, duck quack, duck escape, round start/end, UI select, and lightweight 8-bit background music.
- First-choice local AI sound path: Stable Audio 3 `small-sfx` or `medium`. Backup: Meta AudioCraft AudioGen. If setup is blocked, use generated WebAudio/WAV placeholders through the same asset interface and document the blocker.

## Docs
- `docs/VLM_IMPLEMENTATION.md`: stub rationale, future Worker provider, trigger points, data contract, prompt templates, timeout/cancellation/fallback rules, debug fields.
- `docs/DEPLOYMENT_NOTES.md`: static build, HTTPS camera requirement, and future VPS/Cloudflare notes.
- `docs/ASSET_GENERATION.md`: imagegen CLI prompts, 5-variant cap, selected assets, Stable Audio 3/AudioGen notes, install policy, and blockers.

## Acceptance
- Chrome local demo can run with camera or mouse fallback.
- Game remains playable without real VLM.
- Generated or fallback assets and audio load locally.
- Unit tests cover smoothing, mouth-trigger fire hysteresis, mouse fallback mapping, duck threat/evasion, hit detection, supervisor decisions, and commentary stub behavior.
- Build and tests pass.
