import { FaceLandmarker, FilesetResolver, HandLandmarker, type Category, type Classifications, type HandLandmarkerResult, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { AimState, GestureState, Point, Rect } from "../domain/types";
import { AimFilter } from "./aimFilter";
import { JawFireDetector, type JawFireCalibration, type JawFireDebugState, type JawFireSignal } from "./jawFireDetector";

const INDEX_TIP = 8;
const ZERO_JAW_SIGNAL: JawFireSignal = { jawOpen: 0, confidence: 0 };
const FACE_SAMPLE_INTERVAL_MS = 50;

type CameraSample = { aim: AimState; gesture: GestureState; landmarks: Point[]; videoLandmarks: Point[]; faceVideoLandmarks: Point[]; fireSignal: JawFireSignal };
type FireSample = { gesture: GestureState; faceVideoLandmarks: Point[]; fireSignal: JawFireSignal };
export type CameraTrackerDebugState = { handMs: number; faceMs: number; faceSkippedFrames: number };

export class CameraHandTracker {
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private handLandmarker: HandLandmarker | null = null;
  private faceLandmarker: FaceLandmarker | null = null;
  private readonly aimFilter = new AimFilter({ smoothingAlpha: 0.76, predictionMs: 45 });
  private readonly jawFireDetector = new JawFireDetector();
  private readonly handModelUrl = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task";
  private readonly faceModelUrl = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
  private readonly wasmUrl = "/vendor/mediapipe/tasks-vision/wasm";
  private lastHandVideoTime = -1;
  private lastFaceVideoTime = -1;
  private lastFaceSampleAtMs = -Infinity;
  private lastSample: CameraSample | null = null;
  private lastFireSignal: JawFireSignal | null = null;
  private lastFaceVideoLandmarks: Point[] = [];
  private lastHandInferenceMs = 0;
  private lastFaceInferenceMs = 0;
  private faceSkippedFrames = 0;

  async start(): Promise<HTMLVideoElement> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera APIs are unavailable in this browser.");
    }

    const video = document.createElement("video");
    video.playsInline = true;
    video.muted = true;
    video.className = "camera-feed";

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 480 },
        height: { ideal: 270 },
        frameRate: { ideal: 30, max: 30 },
      },
      audio: false,
    });
    video.srcObject = this.stream;
    await video.play();

    const vision = await FilesetResolver.forVisionTasks(this.wasmUrl);
    this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: this.handModelUrl,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: this.faceModelUrl,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numFaces: 1,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputFaceBlendshapes: true,
    });

    this.video = video;
    return video;
  }

  stop(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video?.remove();
    this.video = null;
    this.handLandmarker?.close();
    this.handLandmarker = null;
    this.faceLandmarker?.close();
    this.faceLandmarker = null;
    this.aimFilter.reset();
    this.jawFireDetector.reset();
    this.lastHandVideoTime = -1;
    this.lastFaceVideoTime = -1;
    this.lastFaceSampleAtMs = -Infinity;
    this.lastSample = null;
    this.lastFireSignal = null;
    this.lastFaceVideoLandmarks = [];
    this.lastHandInferenceMs = 0;
    this.lastFaceInferenceMs = 0;
    this.faceSkippedFrames = 0;
  }

  applyJawCalibration(calibration: JawFireCalibration): boolean {
    return this.jawFireDetector.configure(calibration);
  }

  jawFireDebugState(): JawFireDebugState {
    return this.jawFireDetector.debugState();
  }

  performanceDebugState(): CameraTrackerDebugState {
    return {
      handMs: this.lastHandInferenceMs,
      faceMs: this.lastFaceInferenceMs,
      faceSkippedFrames: this.faceSkippedFrames,
    };
  }

  sampleFire(nowMs: number, forceFaceSample = true): FireSample | null {
    if (!this.video || !this.faceLandmarker || this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return null;
    }

    const fireSignal = this.measureJawSignal(nowMs, forceFaceSample);
    const gesture = this.jawFireDetector.updateSignal(fireSignal, nowMs);
    return { gesture, faceVideoLandmarks: this.lastFaceVideoLandmarks, fireSignal };
  }

  sample(nowMs: number, bounds: Rect): CameraSample | null {
    if (!this.video || !this.handLandmarker || !this.faceLandmarker || this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return null;
    }

    if (this.video.currentTime === this.lastHandVideoTime && this.lastSample) {
      return {
        ...this.lastSample,
        gesture: {
          ...this.lastSample.gesture,
          fireStarted: false,
        },
      };
    }
    this.lastHandVideoTime = this.video.currentTime;

    const handStarted = performance.now();
    const result = this.handLandmarker.detectForVideo(this.video, nowMs);
    this.lastHandInferenceMs = performance.now() - handStarted;
    const hand = pickBestHand(result);
    if (!hand) {
      return null;
    }

    const points = hand.map(toScreenPoint(bounds));
    const indexTip = points[INDEX_TIP];
    const confidence = result.handednesses[0]?.[0]?.score ?? 0.65;

    const aim = this.aimFilter.update(indexTip, confidence, nowMs, bounds, "camera");
    const fireSignal = this.measureJawSignal(nowMs, false);
    const gesture = this.jawFireDetector.updateSignal(fireSignal, nowMs);

    this.lastSample = { aim, gesture, landmarks: points, videoLandmarks: hand.map(toMirroredVideoPoint), faceVideoLandmarks: this.lastFaceVideoLandmarks, fireSignal };
    return this.lastSample;
  }

  private measureJawSignal(nowMs: number, forceSample: boolean): JawFireSignal {
    if (!this.video || !this.faceLandmarker) {
      return ZERO_JAW_SIGNAL;
    }

    if (!forceSample && this.lastFireSignal && nowMs - this.lastFaceSampleAtMs < FACE_SAMPLE_INTERVAL_MS) {
      this.faceSkippedFrames += 1;
      return this.lastFireSignal;
    }

    if (this.video.currentTime === this.lastFaceVideoTime && this.lastFireSignal) {
      return this.lastFireSignal;
    }

    this.lastFaceVideoTime = this.video.currentTime;
    this.lastFaceSampleAtMs = nowMs;
    const faceStarted = performance.now();
    const result = this.faceLandmarker.detectForVideo(this.video, nowMs);
    this.lastFaceInferenceMs = performance.now() - faceStarted;
    this.lastFaceVideoLandmarks = result.faceLandmarks[0]?.map(toMirroredVideoPoint) ?? [];
    const categories = result.faceBlendshapes[0]?.categories;
    if (!categories) {
      this.lastFireSignal = ZERO_JAW_SIGNAL;
      return this.lastFireSignal;
    }

    this.lastFireSignal = {
      jawOpen: scoreFor(categories, "jawOpen"),
      confidence: result.faceLandmarks[0] ? 1 : 0,
    };
    return this.lastFireSignal;
  }
}

function pickBestHand(result: HandLandmarkerResult): NormalizedLandmark[] | null {
  return result.landmarks[0] ?? null;
}

function toScreenPoint(bounds: Rect): (landmark: NormalizedLandmark) => Point {
  return (landmark) => ({
    x: (1 - landmark.x) * bounds.width,
    y: landmark.y * bounds.height,
  });
}

function toMirroredVideoPoint(landmark: NormalizedLandmark): Point {
  return {
    x: 1 - landmark.x,
    y: landmark.y,
  };
}

function scoreFor(categories: Category[] | Classifications["categories"], name: string): number {
  return categories.find((category) => category.categoryName === name)?.score ?? 0;
}
