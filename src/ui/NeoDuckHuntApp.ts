import "pixi.js/unsafe-eval";
import { Application, Assets, Container, Graphics, Rectangle, Sprite, Text, Texture } from "pixi.js";
import type { AimState, Duck, GestureState, InputMode, Point, Rect, SupervisorDecision } from "../domain/types";
import { CameraHandTracker } from "../input/cameraHandTracker";
import { MouseInput } from "../input/mouseInput";
import { createDuck, hitDuck, isShotHit, updateDuck } from "../game/ducks";
import { GameSupervisor, noneDecision } from "../game/supervisor";
import { idleCommentaryState, pendingCommentaryState, readyCommentaryState, StubVisionCommentaryProvider } from "../game/commentary";
import type { CommentaryState } from "../domain/types";
import { MetricsTracker } from "../game/metrics";
import { GameAudio } from "../game/audio";
import type { JawFireDebugState, JawFireSignal } from "../input/jawFireDetector";

type RenderDuck = {
  duck: Duck;
  display: Container;
};

type GamePhase = "idle" | "calibrating" | "running" | "ended";
type CalibrationRun = {
  relaxedJaw: number | null;
  openJaw: number | null;
  recentJawSamples: number[];
  testShots: number;
  shotFeedbackMs: number;
};
type RoboRetrieveAnimation = {
  elapsedMs: number;
  durationMs: number;
  hits: number;
  summaryText: string;
};

const ROUND_DURATION_OPTIONS_SECONDS = [15, 30, 60] as const;
const DEFAULT_ROUND_DURATION_SECONDS = 30;
const ROUND_DURATION_STORAGE_KEY = "neo-duck-hunt:round-duration-seconds";
const MAX_DUCKS = 4;
const MUZZLE_FLASH_MS = 420;
const CAMERA_AIM_HOLD_MS = 260;
const ROBO_RETRIEVE_MS = 4200;
const ROBO_RETRIEVE_FRAME_COUNT = 4;
const JAW_CALIBRATION_STORAGE_KEY = "neo-duck-hunt:jaw-calibration";
const START_PROMPT = "Aim with your finger. Open your mouth to shoot. Set up shooting first if the trigger feels off.";
const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
];
const THUMB_CONNECTIONS = new Set(["1-2", "2-3", "3-4"]);
const INDEX_CONNECTIONS = new Set(["5-6", "6-7", "7-8"]);
const FACE_MOUTH_POINTS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185, 61];

export class NeoDuckHuntApp {
  private readonly root: HTMLDivElement;
  private pixi: Application | null = null;
  private stage = new Container();
  private duckLayer = new Container();
  private foregroundLayer = new Container();
  private overlayLayer = new Container();
  private mouseInput = new MouseInput();
  private cameraTracker: CameraHandTracker | null = null;
  private detachMouse: (() => void) | null = null;
  private inputMode: InputMode = "mouse";
  private phase: GamePhase = "idle";
  private aim: AimState | null = null;
  private gesture: GestureState | null = null;
  private fireSignal: JawFireSignal | null = null;
  private landmarks: Point[] = [];
  private videoLandmarks: Point[] = [];
  private faceVideoLandmarks: Point[] = [];
  private calibration: CalibrationRun | null = null;
  private calibrationRequestId = 0;
  private lastCameraAimAtMs = -Infinity;
  private shotAnimationMs = 0;
  private roboRetrieve: RoboRetrieveAnimation | null = null;
  private renderDucks: RenderDuck[] = [];
  private spawnTimerMs = 0;
  private quackTimerMs = 2600;
  private roundDurationSeconds = readRoundDurationSeconds();
  private roundRemainingMs = this.roundDurationSeconds * 1000;
  private wave = 1;
  private score = 0;
  private highScore = Number(localStorage.getItem("neo-duck-hunt:high-score") ?? 0);
  private debugEnabled = false;
  private supervisorDecision: SupervisorDecision = noneDecision();
  private readonly supervisor = new GameSupervisor();
  private readonly metrics = new MetricsTracker();
  private readonly commentaryProvider = new StubVisionCommentaryProvider();
  private commentaryState: CommentaryState = idleCommentaryState();
  private readonly audio = new GameAudio();
  private textures: Record<string, Texture | null> = {};
  private roboRetrieverFrames: Texture[] = [];
  private lastHudMarkup = "";
  private ui = {
    chrome: document.createElement("div"),
    hud: document.createElement("div"),
    message: document.createElement("div"),
    debug: document.createElement("pre"),
    menu: document.createElement("div"),
    menuTitle: document.createElement("h1"),
    menuStatus: document.createElement("div"),
    menuActions: document.createElement("div"),
    startCamera: document.createElement("button"),
    startMouse: document.createElement("button"),
    calibrate: document.createElement("button"),
    durationSetting: document.createElement("div"),
    durationLabel: document.createElement("div"),
    durationOptions: document.createElement("div"),
    durationButtons: [] as HTMLButtonElement[],
    calibrationActions: document.createElement("div"),
    calibrationRelaxed: document.createElement("button"),
    calibrationFirePose: document.createElement("button"),
    calibrationDone: document.createElement("button"),
    calibrationCancel: document.createElement("button"),
    debugToggle: document.createElement("button"),
    endHunt: document.createElement("button"),
    cameraOverlay: document.createElement("canvas"),
  };
  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") {
      return;
    }

    if (this.phase === "running") {
      event.preventDefault();
      void this.endRound("manual");
      return;
    }

    if (this.phase === "calibrating") {
      event.preventDefault();
      this.calibrationRequestId += 1;
      this.showStartScreen("Calibration cancelled.");
    }
  };

  constructor(root: HTMLDivElement) {
    this.root = root;
  }

  async boot(): Promise<void> {
    this.root.innerHTML = "";
    this.root.className = "game-shell";
    this.createDom();
    window.removeEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keydown", this.handleKeyDown);
    const pixi = new Application();
    await pixi.init({
      resizeTo: this.root,
      backgroundAlpha: 0,
      antialias: false,
      resolution: Math.min(2, window.devicePixelRatio || 1),
    });

    pixi.canvas.className = "game-canvas";
    this.root.appendChild(pixi.canvas);
    this.pixi = pixi;
    pixi.stage.addChild(this.stage);
    this.stage.addChild(this.duckLayer, this.foregroundLayer, this.overlayLayer);
    this.detachMouse = this.mouseInput.attach(pixi.canvas);

    this.drawScene();
    this.showStartScreen(START_PROMPT);
    pixi.ticker.add((ticker) => this.tick(ticker.deltaMS));
    void this.loadTextures();
  }

  private createDom(): void {
    this.ui.chrome.className = "chrome";
    this.ui.chrome.hidden = true;

    this.ui.hud.className = "hud";
    this.ui.message.className = "message";
    this.ui.debug.className = "debug-panel";
    this.ui.cameraOverlay.className = "camera-overlay";
    this.ui.cameraOverlay.hidden = true;
    this.ui.menu.className = "start-screen";
    this.ui.menuTitle.className = "start-title";
    this.ui.menuTitle.textContent = "NEO DUCK HUNT";
    this.ui.menuStatus.className = "start-status";
    this.ui.menuStatus.textContent = START_PROMPT;
    this.ui.menuActions.className = "start-actions";
    this.ui.durationSetting.className = "duration-setting";
    this.ui.durationLabel.className = "duration-label";
    this.ui.durationLabel.textContent = "HUNT TIME";
    this.ui.durationOptions.className = "duration-options";
    this.ui.durationButtons = ROUND_DURATION_OPTIONS_SECONDS.map((seconds) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "duration-option";
      button.dataset.seconds = String(seconds);
      button.textContent = `${seconds}s`;
      button.addEventListener("click", () => this.setRoundDuration(seconds));
      return button;
    });
    this.ui.durationOptions.append(...this.ui.durationButtons);
    this.ui.durationSetting.append(this.ui.durationLabel, this.ui.durationOptions);
    this.syncRoundDurationButtons();
    this.ui.calibrationActions.className = "start-actions calibration-actions";
    this.ui.calibrationActions.hidden = true;

    this.ui.startCamera.type = "button";
    this.ui.startCamera.className = "start-action primary";
    this.ui.startCamera.textContent = "1 PLAYER CAMERA";
    this.ui.startCamera.addEventListener("click", () => {
      void this.startCameraMode();
    });

    this.ui.startMouse.type = "button";
    this.ui.startMouse.className = "start-action";
    this.ui.startMouse.textContent = "MOUSE MODE";
    this.ui.startMouse.addEventListener("click", () => this.startMouseMode());

    this.ui.calibrate.type = "button";
    this.ui.calibrate.className = "start-action";
    this.ui.calibrate.textContent = "SET UP SHOOTING";
    this.ui.calibrate.addEventListener("click", () => {
      void this.startCalibrationFlow();
    });

    this.ui.calibrationRelaxed.type = "button";
    this.ui.calibrationRelaxed.className = "start-action";
    this.ui.calibrationRelaxed.textContent = "SAVE CLOSED MOUTH";
    this.ui.calibrationRelaxed.addEventListener("click", () => this.captureRelaxedJaw());

    this.ui.calibrationFirePose.type = "button";
    this.ui.calibrationFirePose.className = "start-action";
    this.ui.calibrationFirePose.textContent = "SAVE OPEN MOUTH";
    this.ui.calibrationFirePose.addEventListener("click", () => this.captureOpenJaw());

    this.ui.calibrationDone.type = "button";
    this.ui.calibrationDone.className = "start-action primary";
    this.ui.calibrationDone.textContent = "DONE";
    this.ui.calibrationDone.addEventListener("click", () => this.finishCalibration());

    this.ui.calibrationCancel.type = "button";
    this.ui.calibrationCancel.className = "start-action compact";
    this.ui.calibrationCancel.textContent = "CANCEL";
    this.ui.calibrationCancel.addEventListener("click", () => this.showStartScreen("Calibration cancelled."));

    this.ui.debugToggle.type = "button";
    this.ui.debugToggle.className = "start-action compact";
    this.ui.debugToggle.textContent = "DEBUG OFF";
    this.ui.debugToggle.addEventListener("click", () => {
      this.debugEnabled = !this.debugEnabled;
      this.ui.debugToggle.textContent = this.debugEnabled ? "DEBUG ON" : "DEBUG OFF";
      this.ui.debug.hidden = !this.debugEnabled || this.phase === "idle";
    });

    this.ui.endHunt.type = "button";
    this.ui.endHunt.className = "end-hunt";
    this.ui.endHunt.textContent = "END HUNT";
    this.ui.endHunt.title = "End hunt (Esc)";
    this.ui.endHunt.hidden = true;
    this.ui.endHunt.addEventListener("click", () => {
      void this.endRound("manual");
    });

    this.ui.menuActions.append(this.ui.startCamera, this.ui.startMouse, this.ui.durationSetting, this.ui.calibrate, this.ui.debugToggle);
    this.ui.calibrationActions.append(this.ui.calibrationRelaxed, this.ui.calibrationFirePose, this.ui.calibrationDone, this.ui.calibrationCancel);
    this.ui.menu.append(this.ui.menuTitle, this.ui.menuStatus, this.ui.menuActions, this.ui.calibrationActions);
    this.ui.chrome.append(this.ui.hud, this.ui.endHunt, this.ui.message);
    this.root.append(this.ui.chrome, this.ui.debug, this.ui.cameraOverlay, this.ui.menu);
  }

  private async loadTextures(): Promise<void> {
    await this.loadTexture("background", "/assets/images/range-background.webp");
    this.audio.preload();

    const entries = {
      duckNormal: "/assets/images/duck-normal.png",
      duckEvasive: "/assets/images/duck-evasive.png",
      duckHit: "/assets/images/duck-hit.png",
      shotgunBarrels: "/assets/images/shotgun-barrels.png",
      muzzleFlash1: "/assets/images/muzzle-flash-1.png",
      muzzleFlash2: "/assets/images/muzzle-flash-2.png",
      muzzleFlash3: "/assets/images/muzzle-flash-3.png",
      roboDogRetrieveSheet: "/assets/images/robo-dog-retrieve-sheet.png",
    };

    await Promise.all(Object.entries(entries).map(([key, src]) => this.loadTexture(key, src)));

    this.roboRetrieverFrames = this.createTextureFrames(this.textures.roboDogRetrieveSheet, ROBO_RETRIEVE_FRAME_COUNT);
  }

  private async loadTexture(key: string, src: string): Promise<void> {
    try {
      this.textures[key] = await Assets.load(src);
    } catch {
      this.textures[key] = null;
    }
  }

  private async startCameraMode(): Promise<void> {
    this.audio.unlock();
    this.inputMode = "camera";
    this.setMenuStatus("Loading MediaPipe hand and face tracking...");

    try {
      this.cameraTracker?.stop();
      this.cameraTracker = new CameraHandTracker();
      const video = await this.cameraTracker.start();
      this.applySavedCalibration();
      this.root.appendChild(video);
      this.ui.cameraOverlay.hidden = false;
      this.startRound();
      this.setMessage("Point your index finger. Open your mouth to shoot.");
    } catch (error) {
      console.error(error);
      this.cameraTracker?.stop();
      this.cameraTracker = null;
      this.ui.cameraOverlay.hidden = true;
      this.clearCameraOverlay();
      this.setMessage(`Camera unavailable: ${String(error)}. Mouse Hunt is ready.`);
      this.inputMode = "mouse";
    }
  }

  private startMouseMode(): void {
    this.audio.unlock();
    this.inputMode = "mouse";
    this.cameraTracker?.stop();
    this.cameraTracker = null;
    this.videoLandmarks = [];
    this.faceVideoLandmarks = [];
    this.fireSignal = null;
    this.calibration = null;
    this.lastCameraAimAtMs = -Infinity;
    this.ui.cameraOverlay.hidden = true;
    this.clearCameraOverlay();
    this.startRound();
    this.setMessage("Mouse Debug active. Move to aim, click to shoot.");
  }

  private startRound(): void {
    this.phase = "running";
    this.root.classList.remove("is-calibrating");
    this.roboRetrieve = null;
    this.ui.menu.hidden = true;
    this.ui.menuActions.hidden = false;
    this.ui.calibrationActions.hidden = true;
    this.ui.chrome.hidden = false;
    this.ui.endHunt.hidden = false;
    this.roundRemainingMs = this.roundDurationSeconds * 1000;
    this.wave = 1;
    this.score = 0;
    this.lastCameraAimAtMs = -Infinity;
    this.spawnTimerMs = 0;
    this.metrics.reset();
    this.commentaryState = idleCommentaryState();
    this.renderDucks.forEach(({ display }) => display.destroy({ children: true }));
    this.renderDucks = [];
    this.duckLayer.removeChildren();
    this.quackTimerMs = 900 + Math.random() * 1400;
    this.audio.play("roundStart");
    this.audio.startMusic();
  }

  private tick(dtMs: number): void {
    const bounds = this.bounds();
    if (this.phase === "running" || this.phase === "calibrating") {
      this.sampleInput(bounds);
    } else {
      this.gesture = null;
      this.fireSignal = null;
    }
    if (this.phase === "running") {
      this.metrics.sampleAim(this.aim);
    }
    this.shotAnimationMs = Math.max(0, this.shotAnimationMs - dtMs);
    const calibrating = this.updateCalibration(dtMs);
    this.updateRoboRetrieve(dtMs);

    if (this.phase === "running") {
      this.roundRemainingMs = Math.max(0, this.roundRemainingMs - dtMs);
      this.supervisorDecision = this.supervisor.update(this.metrics.snapshot(), dtMs);
      this.spawnTimerMs -= dtMs;
      if (this.spawnTimerMs <= 0 && this.renderDucks.length < MAX_DUCKS) {
        this.spawnDuck(bounds);
        this.spawnTimerMs = this.nextSpawnDelayMs();
      }

      this.updateDucks(dtMs, bounds);
      this.updateAmbientQuacks(dtMs);

      if (!calibrating && this.gesture?.fireStarted) {
        void this.fireShot();
      }

      if (this.roundRemainingMs <= 0) {
        void this.endRound();
      }
    }

    this.drawScene();
    this.updateHud();
    this.updateDebug();
  }

  private sampleInput(bounds: Rect): void {
    const now = performance.now();
    if (this.inputMode === "camera" && this.cameraTracker) {
      if (this.phase === "calibrating") {
        const sample = this.cameraTracker.sampleFire(now);
        if (sample) {
          this.gesture = sample.gesture;
          this.fireSignal = sample.fireSignal;
          this.faceVideoLandmarks = sample.faceVideoLandmarks;
        } else {
          this.gesture = null;
          this.fireSignal = null;
          this.faceVideoLandmarks = [];
        }
        return;
      }

      const sample = this.cameraTracker.sample(now, bounds);
      if (sample) {
        this.aim = sample.aim;
        this.lastCameraAimAtMs = now;
        this.gesture = sample.gesture;
        this.fireSignal = sample.fireSignal;
        this.landmarks = sample.landmarks;
        this.videoLandmarks = sample.videoLandmarks;
        this.faceVideoLandmarks = sample.faceVideoLandmarks;
      } else {
        const fireSample = this.cameraTracker.sampleFire(now, false);
        const aimRecentlyTracked = now - this.lastCameraAimAtMs <= CAMERA_AIM_HOLD_MS;
        if (!aimRecentlyTracked) {
          this.aim = null;
          this.landmarks = [];
          this.videoLandmarks = [];
        }
        this.gesture = fireSample?.gesture ?? null;
        if (fireSample) {
          this.fireSignal = fireSample.fireSignal;
          this.faceVideoLandmarks = fireSample.faceVideoLandmarks;
        } else {
          this.fireSignal = null;
          this.faceVideoLandmarks = [];
        }
      }
      return;
    }

    const sample = this.mouseInput.sample(now, bounds);
    this.aim = sample.aim;
    this.gesture = sample.gesture;
    this.fireSignal = null;
    this.landmarks = [];
    this.videoLandmarks = [];
    this.faceVideoLandmarks = [];
  }

  private spawnDuck(bounds: Rect): void {
    const duck = createDuck(bounds, this.wave);
    const display = this.createDuckDisplay(duck);
    this.duckLayer.addChild(display);
    this.renderDucks.push({ duck, display });
    this.quackTimerMs = Math.min(this.quackTimerMs, 250 + Math.random() * 350);
  }

  private updateDucks(dtMs: number, bounds: Rect): void {
    const updated: RenderDuck[] = [];
    for (const entry of this.renderDucks) {
      const duck = updateDuck(entry.duck, this.aim, dtMs, bounds);
      entry.duck = duck;
      this.syncDuckDisplay(entry);
      if (duck.state !== "escaped") {
        updated.push(entry);
      } else {
        entry.display.destroy({ children: true });
      }
    }
    this.renderDucks = updated;
  }

  private async fireShot(): Promise<void> {
    if (!this.aim) {
      return;
    }

    this.shotAnimationMs = MUZZLE_FLASH_MS;
    this.audio.play("shot");
    const hitIndex = this.renderDucks.findIndex(({ duck }) => isShotHit(duck, this.aim!.smoothed));
    const hit = hitIndex >= 0;
    let hitDuckId: number | null = null;

    if (hit) {
      const entry = this.renderDucks[hitIndex];
      entry.duck = hitDuck(entry.duck, performance.now());
      hitDuckId = entry.duck.id;
      this.score += 100 + this.metrics.streak * 25;
      this.audio.play("hit");
      this.audio.play("quack");
    } else {
      this.audio.play("miss");
    }

    this.metrics.recordShot(hit);
    this.wave = 1 + Math.floor(this.metrics.hits / 5);

    this.commentaryState = pendingCommentaryState(this.commentaryProvider.id);
    try {
      const result = await this.commentaryProvider.onShot({
        aim: this.aim,
        hit,
        duckId: hitDuckId,
        accuracy: this.metrics.snapshot().accuracy,
        streak: this.metrics.streak,
        roundMsRemaining: this.roundRemainingMs,
      });
      this.commentaryState = readyCommentaryState(result);
      this.setMessage(result.text);
    } catch (error) {
      this.commentaryState = {
        status: "error",
        providerId: this.commentaryProvider.id,
        lastText: "Commentary unavailable; gameplay continues.",
        latencyMs: 0,
        fallbackReason: String(error),
      };
    }
  }

  private async endRound(reason: "timer" | "manual" = "timer"): Promise<void> {
    if (this.phase === "ended") {
      return;
    }

    this.phase = "ended";
    this.ui.endHunt.hidden = true;
    this.clearCameraOverlay();
    this.ui.cameraOverlay.hidden = true;
    this.cameraTracker?.stop();
    this.cameraTracker = null;
    this.audio.stopMusic();
    this.audio.play("roundEnd");
    this.highScore = Math.max(this.highScore, this.score);
    localStorage.setItem("neo-duck-hunt:high-score", String(this.highScore));
    this.commentaryState = pendingCommentaryState(this.commentaryProvider.id);
    const metrics = this.metrics.snapshot();
    const result = await this.commentaryProvider.summarizeRound(metrics);
    this.commentaryState = readyCommentaryState(result);
    const summaryText = reason === "manual" ? `Hunt ended early. ${result.text}` : result.text;
    if (metrics.hits > 0) {
      this.startRoboRetrieve(metrics.hits, summaryText);
      return;
    }

    this.showStartScreen(summaryText);
  }

  private drawScene(): void {
    const bounds = this.bounds();
    this.overlayLayer.removeChildren();
    this.foregroundLayer.removeChildren();
    this.drawForegroundGrass(bounds);
    this.drawRoboRetriever(bounds);
    this.drawCrosshair();
    this.drawCalibrationShot(bounds);
    this.drawCameraOverlay();
  }

  private drawCrosshair(): void {
    if (this.phase !== "running" || !this.aim) {
      return;
    }

    const g = new Graphics();
    const aim = this.aim.smoothed;
    this.drawShotgunPipes(aim);
    this.drawMuzzleFlash(aim);
    g.circle(aim.x, aim.y, 17).stroke({ width: 3, color: 0xffffff });
    g.moveTo(aim.x - 28, aim.y).lineTo(aim.x + 28, aim.y).stroke({ width: 3, color: 0xffffff });
    g.moveTo(aim.x, aim.y - 28).lineTo(aim.x, aim.y + 28).stroke({ width: 3, color: 0xffffff });
    g.circle(aim.x, aim.y, 3).fill(0xffee66);
    this.overlayLayer.addChild(g);
  }

  private drawCalibrationShot(bounds: Rect): void {
    if (this.phase !== "calibrating") {
      return;
    }

    const aim = {
      x: bounds.width * 0.5,
      y: bounds.height * 0.58,
    };
    this.drawShotgunPipes(aim);
    this.drawMuzzleFlash(aim);
  }

  private drawShotgunPipes(aim: Point): void {
    const bounds = this.bounds();
    const texture = this.textures.shotgunBarrels;
    if (!texture) {
      return;
    }

    const sprite = new Sprite(texture);
    const height = 92;
    sprite.anchor.set(0.5, 0);
    sprite.height = height;
    sprite.width = (texture.width / texture.height) * height;
    sprite.alpha = 0.7;
    sprite.x = aim.x;
    sprite.y = this.shotgunBarrelY(aim, height, bounds) + this.recoilOffset();
    this.overlayLayer.addChild(sprite);
  }

  private drawMuzzleFlash(aim: Point): void {
    if (this.shotAnimationMs <= 0) {
      return;
    }

    const frames = [this.textures.muzzleFlash1, this.textures.muzzleFlash2, this.textures.muzzleFlash3];
    const frameIndex = this.shotAnimationMs > 300 ? 0 : this.shotAnimationMs > 150 ? 1 : 2;
    const texture = frames[frameIndex];
    if (!texture) {
      return;
    }

    const bounds = this.bounds();
    const barrelY = this.shotgunBarrelY(aim, 92, bounds);
    const sprite = new Sprite(texture);
    const height = frameIndex === 1 ? 92 : frameIndex === 2 ? 66 : 48;
    sprite.anchor.set(0.5, 0.82);
    sprite.height = height;
    sprite.width = (texture.width / texture.height) * height;
    sprite.alpha = Math.min(1, this.shotAnimationMs / 70);
    sprite.x = aim.x;
    sprite.y = barrelY + 8;
    this.overlayLayer.addChild(sprite);
  }

  private drawRoboRetriever(bounds: Rect): void {
    if (!this.roboRetrieve) {
      return;
    }

    const texture = this.roboRetrieverFrames[this.roboRetrieveFrameIndex()];
    if (texture) {
      const sprite = new Sprite(texture);
      const progress = clamp01(this.roboRetrieve.elapsedMs / this.roboRetrieve.durationMs);
      const holdStart = 0.58;
      const holdEnd = 0.78;
      const targetHeight = Math.min(190, Math.max(120, bounds.height * 0.24));
      const startX = -targetHeight * 1.7;
      const centerX = bounds.width * 0.52;
      const endX = bounds.width + targetHeight * 1.7;
      const x = progress < holdStart
        ? lerp(startX, centerX, easeOutCubic(progress / holdStart))
        : progress < holdEnd
          ? centerX + Math.sin((progress - holdStart) * 32) * 5
          : lerp(centerX, endX, easeInCubic((progress - holdEnd) / (1 - holdEnd)));
      const bob = Math.sin(this.roboRetrieve.elapsedMs / 110) * 3;

      sprite.anchor.set(0.5, 1);
      sprite.height = targetHeight;
      sprite.width = (texture.width / texture.height) * targetHeight;
      sprite.x = x;
      sprite.y = Math.min(bounds.height - 54, bounds.height * 0.76) + bob;
      this.overlayLayer.addChild(sprite);
    } else {
      this.drawFallbackRoboRetriever(bounds);
    }

    this.drawRetrieveBadge(bounds);
  }

  private drawFallbackRoboRetriever(bounds: Rect): void {
    if (!this.roboRetrieve) {
      return;
    }

    const progress = clamp01(this.roboRetrieve.elapsedMs / this.roboRetrieve.durationMs);
    const x = lerp(-150, bounds.width + 150, easeInOut(progress));
    const y = Math.min(bounds.height - 56, bounds.height * 0.76);
    const g = new Graphics();
    g.rect(x - 58, y - 56, 92, 34).fill(0xbcc5ce).stroke({ width: 3, color: 0x323941 });
    g.rect(x - 92, y - 62, 36, 42).fill(0x9faab6).stroke({ width: 3, color: 0x323941 });
    g.circle(x - 82, y - 48, 4).fill(0x45f4ff);
    g.ellipse(x - 112, y - 34, 24, 14).fill(0x8d5d2a).stroke({ width: 2, color: 0x382416 });
    for (const legX of [-42, -8, 22, 52]) {
      g.moveTo(x + legX, y - 24).lineTo(x + legX - 12, y - 2).stroke({ width: 6, color: 0x9099a5 });
      g.circle(x + legX - 12, y - 1, 5).fill(0x22262a);
    }
    this.overlayLayer.addChild(g);
  }

  private drawRetrieveBadge(bounds: Rect): void {
    if (!this.roboRetrieve) {
      return;
    }

    const progress = clamp01(this.roboRetrieve.elapsedMs / this.roboRetrieve.durationMs);
    if (progress < 0.42 || progress > 0.86) {
      return;
    }

    const g = new Graphics();
    const width = Math.min(390, bounds.width - 32);
    const x = bounds.width / 2 - width / 2;
    const y = bounds.height * 0.58;
    g.rect(x + 6, y + 6, width, 46).fill({ color: 0x000000, alpha: 0.34 });
    g.rect(x, y, width, 46).fill(0x101a1d).stroke({ width: 4, color: 0xffef8b });
    g.rect(x + 8, y + 8, width - 16, 30).stroke({ width: 2, color: 0x315f42 });
    const label = new Text({
      text: `ROBO RETRIEVER  +${this.roboRetrieve.hits}`,
      style: {
        fill: 0xfff1a8,
        fontFamily: "Courier New, Lucida Console, monospace",
        fontSize: 18,
        fontWeight: "900",
        stroke: { color: 0x111111, width: 3 },
      },
    });
    label.anchor.set(0.5);
    label.x = bounds.width / 2;
    label.y = y + 24;
    this.overlayLayer.addChild(g, label);
  }

  private shotgunBarrelY(aim: Point, height: number, bounds: Rect): number {
    return Math.min(bounds.height - height - 14, aim.y + 32);
  }

  private recoilOffset(): number {
    if (this.shotAnimationMs <= 0) {
      return 0;
    }

    const progress = 1 - this.shotAnimationMs / MUZZLE_FLASH_MS;
    return Math.sin(Math.min(1, progress * 1.8) * Math.PI) * 12;
  }

  private drawForegroundGrass(bounds: Rect): void {
    const texture = this.textures.background;
    if (!texture) {
      return;
    }

    const foregroundTop = bounds.height * 0.58;
    const sprite = new Sprite(texture);
    sprite.width = bounds.width;
    sprite.height = bounds.height;
    const mask = new Graphics();
    mask.rect(0, foregroundTop, bounds.width, bounds.height - foregroundTop).fill(0xffffff);
    sprite.mask = mask;
    this.foregroundLayer.addChild(sprite, mask);
  }

  private drawCameraOverlay(): void {
    const hasHand = this.videoLandmarks.length > 0;
    const hasFace = this.faceVideoLandmarks.length > 0;
    if (this.inputMode !== "camera" || this.ui.cameraOverlay.hidden || (!hasHand && !hasFace)) {
      this.clearCameraOverlay();
      return;
    }

    const canvas = this.ui.cameraOverlay;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width * window.devicePixelRatio));
    const height = Math.max(1, Math.round(rect.height * window.devicePixelRatio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.scale(width, height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (hasHand) {
      for (const [from, to] of HAND_CONNECTIONS) {
        const a = this.videoLandmarks[from];
        const b = this.videoLandmarks[to];
        if (!a || !b) {
          continue;
        }
        const key = `${from}-${to}`;
        ctx.strokeStyle = INDEX_CONNECTIONS.has(key) ? "rgba(65, 235, 255, 0.95)" : THUMB_CONNECTIONS.has(key) ? "rgba(255, 65, 190, 0.98)" : "rgba(255, 226, 110, 0.9)";
        ctx.lineWidth = INDEX_CONNECTIONS.has(key) || THUMB_CONNECTIONS.has(key) ? 0.018 : 0.011;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      const nodeColor = this.gesture?.fireActive ? "rgba(255, 47, 155, 0.98)" : "rgba(255, 244, 160, 0.95)";
      for (const [index, point] of this.videoLandmarks.entries()) {
        ctx.fillStyle = index === 4 || index === 8 ? nodeColor : "rgba(255, 246, 210, 0.85)";
        ctx.beginPath();
        ctx.arc(point.x, point.y, index === 4 || index === 8 ? 0.024 : 0.014, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    this.drawJawOverlay(ctx);
    ctx.restore();
  }

  private drawJawOverlay(ctx: CanvasRenderingContext2D): void {
    if (this.faceVideoLandmarks.length === 0) {
      return;
    }

    const jawDebug = this.cameraTracker?.jawFireDebugState();
    const jawOpen = this.fireSignal?.jawOpen ?? 0;
    this.drawFacePath(ctx, FACE_MOUTH_POINTS, this.jawOverlayColor(jawOpen, jawDebug), jawOpen >= (jawDebug?.fireThreshold ?? 0.52) ? 0.016 : 0.011);
    this.drawJawMeter(ctx, jawDebug, jawOpen);
  }

  private drawFacePath(ctx: CanvasRenderingContext2D, indices: number[], color: string, lineWidth: number): void {
    const first = this.faceVideoLandmarks[indices[0]];
    if (!first) {
      return;
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (const index of indices.slice(1)) {
      const point = this.faceVideoLandmarks[index];
      if (point) {
        ctx.lineTo(point.x, point.y);
      }
    }
    ctx.stroke();

    for (const index of indices.slice(0, -1)) {
      const point = this.faceVideoLandmarks[index];
      if (!point) {
        continue;
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 0.009, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private jawOverlayColor(jawOpen: number, jawDebug: JawFireDebugState | undefined): string {
    if (jawOpen >= (jawDebug?.fireThreshold ?? 0.52)) {
      return "rgba(255, 53, 180, 0.98)";
    }

    if (jawOpen <= (jawDebug?.readyThreshold ?? 0.24)) {
      return "rgba(65, 235, 255, 0.98)";
    }

    return "rgba(255, 226, 110, 0.92)";
  }

  private drawJawMeter(ctx: CanvasRenderingContext2D, jawDebug: JawFireDebugState | undefined, jawOpen: number): void {
    const x = 0.055;
    const y = 0.07;
    const panelWidth = 0.34;
    const barWidth = 0.24;

    ctx.fillStyle = "rgba(5, 12, 18, 0.72)";
    ctx.strokeStyle = "rgba(255, 241, 166, 0.78)";
    ctx.lineWidth = 0.006;
    ctx.fillRect(x - 0.018, y - 0.033, panelWidth + 0.036, 0.082);
    ctx.strokeRect(x - 0.018, y - 0.033, panelWidth + 0.036, 0.082);
    ctx.font = "700 0.045px Courier New, monospace";
    ctx.textBaseline = "middle";
    ctx.fillStyle = jawOpen >= (jawDebug?.fireThreshold ?? 0.52) ? "rgba(255, 53, 180, 0.98)" : "rgba(255, 226, 110, 0.92)";
    ctx.fillText("MOUTH", x, y);
    ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
    ctx.fillRect(x + 0.055, y - 0.012, barWidth, 0.024);
    ctx.fillStyle = jawOpen >= (jawDebug?.fireThreshold ?? 0.52) ? "rgba(255, 53, 180, 0.98)" : "rgba(65, 235, 255, 0.95)";
    ctx.fillRect(x + 0.055, y - 0.012, barWidth * clamp01(jawOpen), 0.024);

    if (jawDebug) {
      const readyX = x + 0.055 + barWidth * clamp01(jawDebug.readyThreshold);
      const fireX = x + 0.055 + barWidth * clamp01(jawDebug.fireThreshold);
      ctx.fillStyle = "rgba(65, 235, 255, 0.96)";
      ctx.fillRect(readyX, y - 0.02, 0.005, 0.04);
      ctx.fillStyle = "rgba(255, 53, 180, 0.98)";
      ctx.fillRect(fireX, y - 0.02, 0.005, 0.04);
    }
  }

  private clearCameraOverlay(): void {
    const ctx = this.ui.cameraOverlay.getContext("2d");
    ctx?.clearRect(0, 0, this.ui.cameraOverlay.width, this.ui.cameraOverlay.height);
  }

  private createDuckDisplay(duck: Duck): Container {
    const texture = this.textures.duckNormal;
    if (texture) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.width = 86;
      sprite.height = 58;
      sprite.x = duck.position.x;
      sprite.y = duck.position.y;
      return sprite;
    }

    const container = new Container();
    const body = new Graphics();
    body.ellipse(0, 0, 34, 20).fill(0x5f3f21);
    body.circle(28, -8, 15).fill(0x2c7f3f);
    body.poly([-8, -18, -34, -34, -20, -4]).fill(0x2f7fb8);
    body.poly([-10, 16, -38, 28, -22, 4]).fill(0x2f7fb8);
    body.poly([41, -9, 60, -3, 41, 2]).fill(0xe6a339);
    body.circle(32, -12, 3).fill(0xffffff);
    body.circle(33, -12, 1.5).fill(0x111111);
    container.addChild(body);
    container.x = duck.position.x;
    container.y = duck.position.y;
    return container;
  }

  private syncDuckDisplay(entry: RenderDuck): void {
    const { duck, display } = entry;
    display.x = duck.position.x;
    display.y = duck.position.y;
    const flapFrame = Math.floor(duck.ageMs / 130) % 3;
    const flapLift = flapFrame === 1 ? 1.11 : flapFrame === 2 ? 0.93 : 1;
    display.rotation = duck.state === "hit" ? 1.45 : Math.sin(duck.ageMs / 145) * 0.045;
    display.alpha = duck.state === "hit" ? 0.82 : 1;

    if (display instanceof Sprite) {
      const texture = this.duckTextureFor(duck, flapFrame);
      if (texture) {
        display.texture = texture;
      }
      display.scale.set((duck.facing * 86) / display.texture.width, (58 * flapLift) / display.texture.height);
    } else {
      display.scale.x = duck.facing;
      display.scale.y = flapLift;
    }
  }

  private duckTextureFor(duck: Duck, flapFrame: number): Texture | null {
    if (duck.state === "hit") {
      return this.textures.duckHit;
    }
    if (duck.threat.threatScore > 0.34) {
      return this.textures.duckEvasive;
    }
    return flapFrame === 1 ? this.textures.duckEvasive ?? this.textures.duckNormal : this.textures.duckNormal;
  }

  private updateAmbientQuacks(dtMs: number): void {
    this.quackTimerMs -= dtMs;
    if (this.quackTimerMs > 0 || this.renderDucks.length === 0) {
      return;
    }

    this.audio.play("quack");
    this.quackTimerMs = 850 + Math.random() * 1550;
  }

  private nextSpawnDelayMs(): number {
    const base = this.supervisorDecision.type === "focus-window" ? 1700 : 1150;
    const pressure = this.supervisorDecision.type === "pressure-spawn" || this.supervisorDecision.type === "streak-heat" ? 360 : 0;
    return Math.max(420, base - pressure - this.wave * 90 + Math.random() * 420);
  }

  private updateHud(): void {
    const seconds = Math.ceil(this.roundRemainingMs / 1000);
    const metrics = this.metrics.snapshot();
    this.ui.hud.classList.toggle("time-warning", this.phase === "running" && seconds <= 10);
    const mode = this.inputMode === "camera" ? "CAM" : "MOUSE";
    const markup = [
      hudStat("score", "Score", String(this.score)),
      hudStat("high", "High", String(this.highScore)),
      hudStat("time", "Time", `${seconds}s`),
      hudStat("hits", "Hits", `${metrics.hits}/${metrics.shots}`),
      hudStat("wave", "Wave", String(this.wave)),
      hudStat("mode", "Mode", mode),
    ].join("");
    if (markup !== this.lastHudMarkup) {
      this.ui.hud.innerHTML = markup;
      this.lastHudMarkup = markup;
    }
  }

  private updateDebug(): void {
    const showDebug = this.debugEnabled && this.phase !== "idle";
    this.ui.debug.hidden = !showDebug;
    if (!showDebug) {
      return;
    }

    const metrics = this.metrics.snapshot();
    const aim = this.aim;
    const jawDebug = this.cameraTracker?.jawFireDebugState();
    const cameraPerf = this.cameraTracker?.performanceDebugState();
    this.ui.debug.textContent = [
      `phase=${this.phase} input=${this.inputMode}`,
      `aim raw=${formatPoint(aim?.raw)} smooth=${formatPoint(aim?.smoothed)} predicted=${formatPoint(aim?.predicted)} confidence=${aim?.confidence.toFixed(2) ?? "n/a"}`,
      `gesture jaw=${this.gesture?.fireActive ?? false} shot=${this.gesture?.fireStarted ?? false} cooldown=${Math.round(this.gesture?.cooldownRemainingMs ?? 0)}ms`,
      `jaw signal open=${this.fireSignal?.jawOpen.toFixed(2) ?? "n/a"} confidence=${this.fireSignal?.confidence.toFixed(2) ?? "n/a"} calibration=${this.calibration ? "active" : "ready"}`,
      `jaw gate calibrated=${jawDebug?.calibrated ?? false} armed=${jawDebug?.armed ?? false} ready<${jawDebug?.readyThreshold.toFixed(2) ?? "n/a"} fire>${jawDebug?.fireThreshold.toFixed(2) ?? "n/a"} range=${jawDebug?.range.toFixed(2) ?? "n/a"}`,
      `camera perf hand=${cameraPerf?.handMs.toFixed(1) ?? "n/a"}ms face=${cameraPerf?.faceMs.toFixed(1) ?? "n/a"}ms faceSkips=${cameraPerf?.faceSkippedFrames ?? 0}`,
      `ducks=${this.renderDucks.length} topThreat=${this.topThreat().toFixed(2)} supervisor="${this.supervisorDecision.debugLabel}"`,
      `metrics accuracy=${Math.round(metrics.accuracy * 100)}% streak=${metrics.streak} best=${metrics.bestStreak} shakiness=${metrics.shakiness.toFixed(2)}`,
      `vlm status=${this.commentaryState.status} provider=${this.commentaryState.providerId} latency=${this.commentaryState.latencyMs}ms fallback=${this.commentaryState.fallbackReason ?? "none"}`,
    ].join("\n");
  }

  private topThreat(): number {
    return this.renderDucks.reduce((max, entry) => Math.max(max, entry.duck.threat.threatScore), 0);
  }

  private setMessage(message: string): void {
    this.ui.message.textContent = message;
    this.ui.menuStatus.textContent = message;
  }

  private setMenuStatus(message: string): void {
    this.ui.menuStatus.textContent = message;
  }

  private setRoundDuration(seconds: number): void {
    this.roundDurationSeconds = seconds;
    localStorage.setItem(ROUND_DURATION_STORAGE_KEY, String(seconds));
    this.syncRoundDurationButtons();
  }

  private syncRoundDurationButtons(): void {
    for (const button of this.ui.durationButtons) {
      const selected = Number(button.dataset.seconds) === this.roundDurationSeconds;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    }
  }

  private showStartScreen(message: string): void {
    this.calibrationRequestId += 1;
    this.audio.stopMusic();
    this.cameraTracker?.stop();
    this.cameraTracker = null;
    this.inputMode = "mouse";
    this.phase = "idle";
    this.calibration = null;
    this.lastCameraAimAtMs = -Infinity;
    this.aim = null;
    this.gesture = null;
    this.fireSignal = null;
    this.videoLandmarks = [];
    this.faceVideoLandmarks = [];
    this.landmarks = [];
    this.shotAnimationMs = 0;
    this.roboRetrieve = null;
    this.renderDucks.forEach(({ display }) => display.destroy({ children: true }));
    this.renderDucks = [];
    this.duckLayer.removeChildren();
    this.ui.cameraOverlay.hidden = true;
    this.clearCameraOverlay();
    this.ui.chrome.hidden = true;
    this.ui.endHunt.hidden = true;
    this.ui.debug.hidden = true;
    this.ui.menu.hidden = false;
    this.ui.menu.classList.remove("calibration-mode");
    this.ui.menuActions.hidden = false;
    this.ui.calibrationActions.hidden = true;
    this.root.classList.remove("is-calibrating");
    this.setMenuStatus(message);
  }

  private startRoboRetrieve(hits: number, summaryText: string): void {
    this.renderDucks.forEach(({ display }) => display.destroy({ children: true }));
    this.renderDucks = [];
    this.duckLayer.removeChildren();
    this.roboRetrieve = {
      elapsedMs: 0,
      durationMs: ROBO_RETRIEVE_MS,
      hits,
      summaryText,
    };
    this.ui.menu.hidden = true;
    this.ui.chrome.hidden = false;
    this.ui.endHunt.hidden = true;
    this.ui.cameraOverlay.hidden = true;
    this.clearCameraOverlay();
    this.setMessage(`Robo retriever recovered ${hits} ${hits === 1 ? "duck" : "ducks"}.`);
  }

  private updateRoboRetrieve(dtMs: number): void {
    if (!this.roboRetrieve) {
      return;
    }

    this.roboRetrieve.elapsedMs += dtMs;
    if (this.roboRetrieve.elapsedMs >= this.roboRetrieve.durationMs) {
      const summary = this.roboRetrieve.summaryText;
      this.roboRetrieve = null;
      this.showStartScreen(summary);
    }
  }

  private roboRetrieveFrameIndex(): number {
    if (!this.roboRetrieve || this.roboRetrieverFrames.length === 0) {
      return 0;
    }

    return Math.floor(this.roboRetrieve.elapsedMs / 150) % this.roboRetrieverFrames.length;
  }

  private createTextureFrames(texture: Texture | null, frameCount: number): Texture[] {
    if (!texture || frameCount <= 0) {
      return [];
    }

    const frameWidth = Math.floor(texture.width / frameCount);
    return Array.from({ length: frameCount }, (_, index) => new Texture({
      source: texture.source,
      frame: new Rectangle(index * frameWidth, 0, frameWidth, texture.height),
    }));
  }

  private async startCalibrationFlow(): Promise<void> {
    const requestId = ++this.calibrationRequestId;
    this.audio.stopMusic();
    this.audio.unlock();
    this.renderDucks.forEach(({ display }) => display.destroy({ children: true }));
    this.renderDucks = [];
    this.duckLayer.removeChildren();
    this.phase = "calibrating";
    this.inputMode = "camera";
    this.root.classList.add("is-calibrating");
    this.ui.chrome.hidden = true;
    this.ui.menu.hidden = false;
    this.ui.menu.classList.add("calibration-mode");
    this.ui.menuActions.hidden = true;
    this.ui.calibrationActions.hidden = false;
    this.setMenuStatus("Loading camera for calibration...");

    try {
      this.cameraTracker?.stop();
      const tracker = new CameraHandTracker();
      this.cameraTracker = tracker;
      const video = await tracker.start();
      if (requestId !== this.calibrationRequestId || this.phase !== "calibrating") {
        tracker.stop();
        return;
      }
      this.root.appendChild(video);
      this.ui.cameraOverlay.hidden = false;
      this.startCalibration();
    } catch (error) {
      if (requestId !== this.calibrationRequestId) {
        return;
      }
      console.error(error);
      this.cameraTracker?.stop();
      this.cameraTracker = null;
      this.showStartScreen(`Camera unavailable: ${String(error)}.`);
    }
  }

  private startCalibration(): void {
    if (this.inputMode !== "camera" || !this.cameraTracker) {
      this.showStartScreen("Start Camera first, then set up shooting.");
      return;
    }

    this.phase = "calibrating";
    this.calibration = {
      relaxedJaw: null,
      openJaw: null,
      recentJawSamples: [],
      testShots: 0,
      shotFeedbackMs: 0,
    };
    this.setCalibrationButtonStates();
    this.setMenuStatus("Close your mouth normally, then press SAVE CLOSED MOUTH.");
  }

  private updateCalibration(dtMs: number): boolean {
    if (!this.calibration) {
      return false;
    }

    if (this.inputMode !== "camera" || !this.cameraTracker) {
      this.calibration = null;
      return false;
    }

    if (this.fireSignal && this.fireSignal.confidence > 0.45) {
      this.calibration.recentJawSamples.push(this.fireSignal.jawOpen);
      if (this.calibration.recentJawSamples.length > 24) {
        this.calibration.recentJawSamples.shift();
      }
    }

    if (this.gesture?.fireStarted) {
      this.calibration.testShots += 1;
      this.calibration.shotFeedbackMs = 1100;
      this.shotAnimationMs = MUZZLE_FLASH_MS;
      this.audio.play("shot");
    } else {
      this.calibration.shotFeedbackMs = Math.max(0, this.calibration.shotFeedbackMs - dtMs);
    }

    this.setCalibrationButtonStates();
    this.setMenuStatus(this.calibrationStatusText());
    return true;
  }

  private captureRelaxedJaw(): void {
    if (!this.calibration) {
      return;
    }

    const value = this.currentJawSample();
    if (value === null) {
      this.setMenuStatus("No face signal yet. Keep your face in the camera, then press SAVE CLOSED MOUTH.");
      return;
    }

    this.calibration.relaxedJaw = value;
    this.applyCalibrationPreview();
    this.setCalibrationButtonStates();
    this.setMenuStatus("Closed mouth saved. Now open your mouth the way you want to shoot and press SAVE OPEN MOUTH.");
  }

  private captureOpenJaw(): void {
    if (!this.calibration) {
      return;
    }

    const value = this.currentJawSample();
    if (value === null) {
      this.setMenuStatus("No face signal yet. Keep your face in the camera, then press SAVE OPEN MOUTH.");
      return;
    }

    this.calibration.openJaw = value;
    const configured = this.applyCalibrationPreview();
    this.setCalibrationButtonStates();
    if (!configured) {
      this.setMenuStatus("Open-mouth pose is too close to closed mouth. Open wider or recapture closed mouth, then press SAVE OPEN MOUTH again.");
      return;
    }

    this.setMenuStatus("Open mouth saved. Test it live: close your mouth to re-arm, then open to shoot. Press DONE when it feels reliable.");
  }

  private finishCalibration(): void {
    if (!this.calibration || !this.cameraTracker) {
      return;
    }

    if (!this.canSaveCalibration()) {
      this.setMenuStatus("Calibration is not ready. Save closed mouth and open mouth with a clear difference first.");
      return;
    }

    const calibration = {
      relaxedJaw: this.calibration.relaxedJaw ?? 0,
      openJaw: this.calibration.openJaw ?? 0,
    };
    if (!this.cameraTracker.applyJawCalibration(calibration)) {
      this.setMenuStatus("Calibration failed: open mouth is too close to closed mouth. Save a wider open-mouth pose.");
      return;
    }

    localStorage.setItem(JAW_CALIBRATION_STORAGE_KEY, JSON.stringify(calibration));
    this.showStartScreen("Shooting setup saved. Close your mouth to re-arm, then open your mouth to shoot.");
  }

  private applySavedCalibration(): void {
    if (!this.cameraTracker) {
      return;
    }

    const raw = localStorage.getItem(JAW_CALIBRATION_STORAGE_KEY);
    if (!raw) {
      return;
    }

    try {
      const calibration = JSON.parse(raw) as { relaxedJaw: number; openJaw: number };
      this.cameraTracker.applyJawCalibration(calibration);
    } catch {
      localStorage.removeItem(JAW_CALIBRATION_STORAGE_KEY);
    }
  }

  private currentJawSample(): number | null {
    if (!this.calibration || !this.fireSignal || this.fireSignal.confidence <= 0.45) {
      return null;
    }

    const recent = this.calibration.recentJawSamples.slice(-8);
    if (recent.length < 3) {
      return this.fireSignal.jawOpen;
    }
    return median(recent);
  }

  private canSaveCalibration(): boolean {
    if (!this.calibration || this.calibration.relaxedJaw === null || this.calibration.openJaw === null) {
      return false;
    }

    return this.calibration.openJaw - this.calibration.relaxedJaw >= 0.1;
  }

  private applyCalibrationPreview(): boolean {
    if (!this.calibration || !this.cameraTracker || this.calibration.relaxedJaw === null || this.calibration.openJaw === null) {
      return false;
    }

    return this.cameraTracker.applyJawCalibration({
      relaxedJaw: this.calibration.relaxedJaw,
      openJaw: this.calibration.openJaw,
    });
  }

  private setCalibrationButtonStates(): void {
    const closedSaved = this.calibration !== null && this.calibration.relaxedJaw !== null;
    const openSaved = this.canSaveCalibration();
    this.ui.calibrationRelaxed.textContent = closedSaved ? "CLOSED MOUTH SAVED" : "SAVE CLOSED MOUTH";
    this.ui.calibrationFirePose.textContent = openSaved ? "OPEN MOUTH SAVED" : "SAVE OPEN MOUTH";
    this.ui.calibrationRelaxed.classList.toggle("saved", closedSaved);
    this.ui.calibrationFirePose.classList.toggle("saved", openSaved);
    this.ui.calibrationDone.disabled = !openSaved;
  }

  private calibrationStatusText(): string {
    if (!this.calibration) {
      return "";
    }

    if (!this.fireSignal || this.fireSignal.confidence <= 0.45) {
      return "Keep your face in the camera. Use the mouth outline and mouth meter to confirm tracking.";
    }

    if (this.calibration.relaxedJaw === null) {
      return "Close your mouth normally, then press SAVE CLOSED MOUTH.";
    }

    if (this.calibration.openJaw === null) {
      return "Closed mouth saved. Now open your mouth the way you want to shoot and press SAVE OPEN MOUTH.";
    }

    if (!this.canSaveCalibration()) {
      return "Open-mouth pose is too close to closed mouth. Open wider or save closed mouth again.";
    }

    if (this.calibration.shotFeedbackMs > 0) {
      return "Shot detected. Close your mouth to re-arm, then open again to test. Press DONE when reliable.";
    }

    return "Open mouth saved. Test it live: close your mouth to re-arm, then open to shoot. Press DONE when it feels reliable.";
  }

  private bounds(): Rect {
    return {
      width: this.pixi?.screen.width ?? this.root.clientWidth,
      height: this.pixi?.screen.height ?? this.root.clientHeight,
    };
  }
}

function formatPoint(point: Point | undefined): string {
  if (!point) {
    return "n/a";
  }

  return `${Math.round(point.x)},${Math.round(point.y)}`;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function readRoundDurationSeconds(): number {
  const stored = Number(localStorage.getItem(ROUND_DURATION_STORAGE_KEY));
  return ROUND_DURATION_OPTIONS_SECONDS.includes(stored as typeof ROUND_DURATION_OPTIONS_SECONDS[number]) ? stored : DEFAULT_ROUND_DURATION_SECONDS;
}

function hudStat(className: string, label: string, value: string): string {
  return `<span class="hud-stat hud-${className}"><span class="hud-label">${label}</span><span class="hud-value">${value}</span></span>`;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * clamp01(amount);
}

function easeOutCubic(value: number): number {
  return 1 - (1 - clamp01(value)) ** 3;
}

function easeInCubic(value: number): number {
  return clamp01(value) ** 3;
}

function easeInOut(value: number): number {
  const t = clamp01(value);
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}
