**Updated PRD: Duck Hunt Finger Gun – AI Vision Demo (LinkedIn Showcase)**

**Overview**  
Browser-based Duck Hunt-inspired arcade demo controlled by webcam tracking. Core uses MediaPipe for responsive index-finger aiming and face-triggered shooting. Added AI flavor through predictive/reactive duck behavior and selective small vision-language model usage for commentary, session analysis, and light agentic event injection. Built as a polished, technically transparent demo.

**Primary Goal**  
Ship a responsive, visually engaging playable demo that demonstrates real-time computer vision + meaningful on-device AI layers. Strong enough for LinkedIn video + technical thread.

**Target Audience**  
LinkedIn engineers, AI practitioners, game devs. People who want to see practical hybrid classical CV + small models rather than another basic hand-tracking clone.

**Core Technical Foundation (non-negotiable)**  
- MediaPipe HandLandmarker for landmarks (every frame).  
- Smoothed index fingertip → crosshair with proper filtering (1€ or EMA + light prediction).  
- Mouth-open firing: arm from a relaxed closed-mouth state and shoot on a deliberate open-mouth trigger, with calibration, hysteresis, and cooldown.  
- PixiJS rendering, solid game feel, debug overlay showing aim + gesture state, and a connected hand-node overlay on the camera preview.

**AI-Flavored Additions (included in this version)**

1. **Reactive & Predictive Ducks** (highest priority AI mechanic)  
   Ducks react to player aim. Use smoothed hand position + short-term velocity prediction to detect when a duck is being tracked. Threatened ducks accelerate, change direction, or perform small evasive maneuvers. This creates visible "awareness" without heavy models.

2. **Selective Small VLM Layer** (stubbed in MVP, off critical path)  
   - V1 ships a deterministic async stub provider with the same interface as a future quantized small VLM provider.  
   - Future implementation: on successful shot or strong input pose, optionally run a local VLM on hand crop + context for short commentary.  
   - End of round: eventually generate concise session summary and 2-3 personalized observations (aim stability, timing, gesture quality).  
   - Runs in Web Worker or on key events only. Not per-frame.

3. **Lightweight Game Supervisor / Agent**  
   Simple state machine + optional VLM input that tracks high-level metrics (accuracy trend, streak, shakiness). Injects interesting events: spawns aggressive ducks on good streaks, offers a brief "focus window" after poor tracking, or adjusts spawn patterns dynamically. Decisions visible in debug view.

**MVP Scope (what actually ships)**  
- Full hand tracking + index-finger aim and mouth-open firing with smoothing, prediction, calibration, and short aim-hold tolerance for brief tracking misses.  
- Reactive ducks driven by aim prediction (core AI flavor).  
- Basic wave progression and scoring.  
- Debug overlay (smoothed aim, gesture state, supervisor decisions) plus connected landmark nodes on the camera preview.  
- On-shot / end-of-round VLM-ready stub commentary + post-round coach summary placeholder.  
- Clean instructions, start/retry, local high score.  
- Retro visuals, generated shotgun-pipe screen feedback near the crosshair, muzzle-flash firing sprites, visible camera preview, 8-bit shot SFX, louder background chiptune loop, and audible duck quacks.  
- Works reliably in desktop Chrome with decent lighting.

**Nice-to-Have (add only after core is solid)**  
- More classic Duck Hunt elements (dog animations, limited shots per round, authentic sounds).  
- Stronger VLM duck personality variations.  
- Mobile testing / fallback mouse mode for recording.

**Technical Requirements**  
- On-device only. MediaPipe for real-time control. Small VLM (quantized) for selective higher-level tasks.  
- Stack: TypeScript, Vite, PixiJS, MediaPipe Tasks, Web Workers for VLM calls.  
- Performance: Core tracking + game loop ≥30 FPS. VLM calls are async and infrequent.  
- Transparency: Debug view must clearly separate classical CV pipeline from AI layers.

**User Flow**  
1. Camera permission + instructions ("Aim with your finger. Open your mouth to shoot. Ducks will react to your aim.").  
2. Game starts. Crosshair follows finger. Ducks fly and actively evade when targeted.  
3. Mouth-open trigger registers shots with visual/audio feedback + occasional contextual comment.  
4. Round ends → AI coach summary appears with observations.  
5. Retry or view debug breakdown.

**Success Criteria**  
- Core gameplay feels responsive and better than existing public clones.  
- Reactive ducks are visibly "smart" in recordings.  
- VLM commentary and coach report add clear personality without breaking flow.  
- Debug view makes the hybrid pipeline (MediaPipe + prediction + selective VLM + supervisor) easy to understand.  
- Demo records cleanly and supports a strong technical post.

**Risks & Mitigations**  
- VLM latency or quality: Keep calls infrequent and non-blocking. Have fallback static/fun responses. Test prompts heavily for short, reliable output.  
- Overcomplicating the demo: Reactive ducks + prediction is the main AI win. VLM is seasoning, not the control system.  
- Browser constraints on heavier models: Document "selective small on-device VLM" clearly. Core experience works without it.

**Positioning for LinkedIn**  
"Real-time hand tracking with MediaPipe + predictive duck evasion and selective small VLM for reactive behavior and post-round coaching. Fully on-device. No cloud."

This version has enough genuine AI flavor to stand out while staying buildable and focused. Core loop stays fast. Intelligence layers are visible and purposeful.

Ready to move to implementation sketch, specific gesture logic, or VLM prompt examples?
