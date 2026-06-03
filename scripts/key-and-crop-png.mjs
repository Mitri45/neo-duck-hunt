import { createReadStream, createWriteStream, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { PNG } from "pngjs";

const [inputArg, outputArg] = process.argv.slice(2);

if (!inputArg || !outputArg) {
  console.error("Usage: node scripts/key-and-crop-png.mjs <input.png> <output.png>");
  process.exit(1);
}

const input = resolve(inputArg);
const output = resolve(outputArg);
const transparentDistance = 120;
const opaqueDistance = 220;
const padding = 8;

createReadStream(input)
  .pipe(new PNG())
  .on("parsed", function onParsed() {
    const key = sampleCornerKey(this);
    let minX = this.width;
    let minY = this.height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const idx = (this.width * y + x) << 2;
        const r = this.data[idx];
        const g = this.data[idx + 1];
        const b = this.data[idx + 2];
        const dist = Math.hypot(r - key.r, g - key.g, b - key.b);
        const alpha = isGreenKeyPixel(r, g, b) ? 0 : alphaForDistance(dist);
        this.data[idx + 3] = alpha;

        if (alpha > 4) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    if (maxX < minX || maxY < minY) {
      throw new Error("No opaque pixels remain after chroma-key removal.");
    }

    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(this.width - 1, maxX + padding);
    maxY = Math.min(this.height - 1, maxY + padding);

    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const cropped = new PNG({ width, height });

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const sourceIdx = (this.width * (minY + y) + minX + x) << 2;
        const targetIdx = (width * y + x) << 2;
        cropped.data[targetIdx] = this.data[sourceIdx];
        cropped.data[targetIdx + 1] = this.data[sourceIdx + 1];
        cropped.data[targetIdx + 2] = this.data[sourceIdx + 2];
        cropped.data[targetIdx + 3] = this.data[sourceIdx + 3];
      }
    }

    mkdirSync(dirname(output), { recursive: true });
    cropped.pack().pipe(createWriteStream(output));
  });

function sampleCornerKey(png) {
  const corners = [
    [0, 0],
    [png.width - 1, 0],
    [0, png.height - 1],
    [png.width - 1, png.height - 1],
  ];

  const sum = { r: 0, g: 0, b: 0 };
  for (const [x, y] of corners) {
    const idx = (png.width * y + x) << 2;
    sum.r += png.data[idx];
    sum.g += png.data[idx + 1];
    sum.b += png.data[idx + 2];
  }

  return {
    r: Math.round(sum.r / corners.length),
    g: Math.round(sum.g / corners.length),
    b: Math.round(sum.b / corners.length),
  };
}

function alphaForDistance(distance) {
  if (distance <= transparentDistance) {
    return 0;
  }
  if (distance >= opaqueDistance) {
    return 255;
  }

  return Math.round(((distance - transparentDistance) / (opaqueDistance - transparentDistance)) * 255);
}

function isGreenKeyPixel(r, g, b) {
  return g > 105 && g > r * 1.45 && g > b * 1.45;
}
