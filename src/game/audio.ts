type SfxName = "shot" | "hit" | "miss" | "flap" | "escape" | "roundStart" | "roundEnd" | "ui" | "quack";

const AUDIO_FILES: Record<SfxName, string> = {
  shot: "/assets/audio/shot.wav",
  hit: "/assets/audio/hit.wav",
  miss: "/assets/audio/miss.wav",
  flap: "/assets/audio/flap.wav",
  escape: "/assets/audio/escape.wav",
  roundStart: "/assets/audio/round-start.wav",
  roundEnd: "/assets/audio/round-end.wav",
  ui: "/assets/audio/ui.wav",
  quack: "/assets/audio/quack.wav",
};

export class GameAudio {
  private readonly elements = new Map<SfxName, HTMLAudioElement>();
  private context: AudioContext | null = null;
  private musicAudio: HTMLAudioElement | null = null;
  private musicTimer: number | null = null;
  private musicStep = 0;

  preload(): void {
    for (const [name, src] of Object.entries(AUDIO_FILES) as Array<[SfxName, string]>) {
      const audio = new Audio();
      audio.preload = "auto";
      audio.src = src;
      this.elements.set(name, audio);
    }
    this.musicAudio = new Audio();
    this.musicAudio.loop = true;
    this.musicAudio.volume = 0.65;
    this.musicAudio.preload = "none";
    this.musicAudio.src = "/assets/audio/music.wav";
  }

  unlock(): void {
    this.context ??= new AudioContext();
    if (this.context.state === "suspended") {
      void this.context.resume();
    }
  }

  play(name: SfxName): void {
    const element = this.elements.get(name);
    if (element) {
      const instance = element.cloneNode(true) as HTMLAudioElement;
      instance.volume = volumeFor(name);
      instance.play().catch(() => this.playSynth(name));
      return;
    }

    this.playSynth(name);
  }

  startMusic(): void {
    this.unlock();
    if (this.musicAudio) {
      this.musicAudio.currentTime = 0;
      void this.musicAudio.play().catch(() => {
        this.startMusicSynthFallback();
      });
      return;
    }
    this.startMusicSynthFallback();
  }

  stopMusic(): void {
    if (this.musicAudio) {
      this.musicAudio.pause();
      this.musicAudio.currentTime = 0;
    }
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private startMusicSynthFallback(): void {
    if (this.musicTimer !== null) {
      return;
    }
    this.musicStep = 0;
    this.musicTimer = window.setInterval(() => this.playMusicStep(), 185);
  }

  private playSynth(name: SfxName): void {
    if (name === "quack") {
      this.playQuackSynth();
      return;
    }

    this.context ??= new AudioContext();
    const now = this.context.currentTime;
    const gain = this.context.createGain();
    const osc = this.context.createOscillator();
    osc.type = name === "shot" ? "square" : "triangle";
    osc.frequency.setValueAtTime(frequencyFor(name), now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(80, frequencyFor(name) * 0.42), now + 0.12);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volumeFor(name) * 0.38, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationFor(name));
    osc.connect(gain).connect(this.context.destination);
    osc.start(now);
    osc.stop(now + durationFor(name) + 0.02);
  }

  private playMusicStep(): void {
    if (!this.context) {
      return;
    }

    const melody = [523.25, 0, 659.25, 783.99, 0, 659.25, 587.33, 493.88, 523.25, 0, 783.99, 659.25, 587.33, 0, 493.88, 392];
    const bass = [130.81, 0, 196, 0, 146.83, 0, 196, 0, 164.81, 0, 220, 0, 146.83, 0, 196, 0];
    const index = this.musicStep % melody.length;
    if (melody[index] > 0) {
      this.playNote(melody[index], 0.13, 0.12, "square");
    }
    if (bass[index] > 0) {
      this.playNote(bass[index], 0.17, 0.08, "triangle");
    }
    this.musicStep += 1;
  }

  private playNote(frequency: number, duration: number, volume: number, type: OscillatorType): void {
    if (!this.context) {
      return;
    }

    const now = this.context.currentTime;
    const gain = this.context.createGain();
    const osc = this.context.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(this.context.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private playQuackSynth(): void {
    this.context ??= new AudioContext();
    const now = this.context.currentTime;
    const output = this.context.createGain();
    const main = this.context.createOscillator();
    const nasal = this.context.createOscillator();

    main.type = "square";
    nasal.type = "square";
    main.frequency.setValueAtTime(360, now);
    main.frequency.exponentialRampToValueAtTime(175, now + 0.24);
    nasal.frequency.setValueAtTime(540, now);
    nasal.frequency.exponentialRampToValueAtTime(260, now + 0.2);
    output.gain.setValueAtTime(0.0001, now);
    output.gain.exponentialRampToValueAtTime(0.42, now + 0.018);
    output.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    main.connect(output);
    nasal.connect(output);
    output.connect(this.context.destination);
    main.start(now);
    nasal.start(now + 0.025);
    main.stop(now + 0.34);
    nasal.stop(now + 0.28);
  }
}

function frequencyFor(name: SfxName): number {
  switch (name) {
    case "shot":
      return 880;
    case "hit":
      return 620;
    case "miss":
      return 220;
    case "flap":
      return 330;
    case "escape":
      return 180;
    case "roundStart":
      return 540;
    case "roundEnd":
      return 260;
    case "ui":
      return 720;
    case "quack":
      return 380;
  }
}

function durationFor(name: SfxName): number {
  return name === "shot" ? 0.11 : name === "flap" ? 0.08 : name === "quack" ? 0.18 : 0.24;
}

function volumeFor(name: SfxName): number {
  switch (name) {
    case "shot":
      return 1;
    case "quack":
      return 0.95;
    case "hit":
      return 0.82;
    case "miss":
      return 0.74;
    case "flap":
      return 0.38;
    case "escape":
      return 0.7;
    case "roundStart":
    case "roundEnd":
      return 0.78;
    case "ui":
      return 0.68;
  }
}
