import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const outDir = join(root, "public/assets/audio");
const sampleRate = 44100;

mkdirSync(outDir, { recursive: true });

const jobs = [
  ["shot.wav", 0.18, shot],
  ["hit.wav", 0.36, hit],
  ["miss.wav", 0.3, miss],
  ["flap.wav", 0.16, flap],
  ["escape.wav", 0.5, escape],
  ["round-start.wav", 0.55, roundStart],
  ["round-end.wav", 0.7, roundEnd],
  ["ui.wav", 0.12, ui],
  ["quack.wav", 0.22, quack],
];

for (const [filename, seconds, synth] of jobs) {
  const samples = makeSamples(seconds, synth);
  writeFileSync(join(outDir, filename), encodeWav(samples));
  console.log(`Wrote public/assets/audio/${filename}`);
}

function makeSamples(seconds, synth) {
  const count = Math.floor(seconds * sampleRate);
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const t = i / sampleRate;
    const attack = Math.min(1, i / (sampleRate * 0.004));
    const release = Math.min(1, (count - i) / (sampleRate * 0.012));
    samples[i] = clamp(synth(t, i) * attack * release * 0.98, -1, 1);
  }
  return samples;
}

function shot(t, i) {
  const quant = Math.floor(t * 60) / 60;
  const sweep = 1680 * Math.exp(-quant * 18) + 120;
  const pulse = square(sweep, quant) * Math.exp(-t * 21);
  const crack = hash(Math.floor(i / 5)) * Math.exp(-t * 34);
  const tail = square(120, t) * Math.exp(-t * 12);
  return bitcrush(pulse * 1.05 + crack * 0.72 + tail * 0.3, 5);
}

function hit(t) {
  return (tri(520, t) * Math.exp(-t * 8) + tri(780, t + 0.03) * Math.exp(-t * 10)) * 0.7;
}

function miss(t) {
  return sine(260 - t * 360, t) * Math.exp(-t * 6) * 0.7;
}

function flap(t, i) {
  return (hash(i) * 0.35 + tri(190 + Math.sin(t * 90) * 60, t) * 0.65) * Math.exp(-t * 9);
}

function escape(t) {
  return sine(240, t) * Math.exp(-t * 2.2) + sine(180, t + 0.06) * Math.exp(-t * 2.8);
}

function roundStart(t) {
  const step = t < 0.16 ? 440 : t < 0.32 ? 660 : 880;
  return tri(step, t) * Math.exp(-Math.max(0, t - 0.42) * 8);
}

function roundEnd(t) {
  return (tri(420 - t * 260, t) + sine(210 - t * 80, t) * 0.4) * Math.exp(-t * 2.6);
}

function ui(t) {
  return square(900, t) * Math.exp(-t * 28);
}

function quack(t) {
  const wobble = 1 + Math.sin(t * 120) * 0.09;
  const tone = square(360 * wobble, t) * 0.76 + square(230 * wobble, t) * 0.42;
  const nasal = tri(680 * wobble, t) * 0.18;
  return bitcrush((tone + nasal) * Math.exp(-t * 5.8), 4);
}

function sine(freq, t) {
  return Math.sin(Math.PI * 2 * Math.max(40, freq) * t);
}

function square(freq, t) {
  return sine(freq, t) > 0 ? 1 : -1;
}

function tri(freq, t) {
  return (2 / Math.PI) * Math.asin(sine(freq, t));
}

function hash(i) {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function bitcrush(value, steps) {
  return Math.round(value * steps) / steps;
}

function encodeWav(samples) {
  const dataBytes = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < samples.length; i += 1) {
    buffer.writeInt16LE(Math.round(clamp(samples[i], -1, 1) * 32767), 44 + i * 2);
  }

  return buffer;
}
