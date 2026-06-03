import { createReadStream, createWriteStream, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { PNG } from "pngjs";

const [inputArg, outputDirArg] = process.argv.slice(2);

if (!inputArg || !outputDirArg) {
  console.error("Usage: node scripts/split-muzzle-flash-sheet.mjs <sheet.png> <output-dir>");
  process.exit(1);
}

const input = resolve(inputArg);
const outputDir = resolve(outputDirArg);
const frameCount = 3;
const transparentDistance = 118;
const opaqueDistance = 220;
const padding = 6;

createReadStream(input)
  .pipe(new PNG())
  .on("parsed", function onParsed() {
    mkdirSync(outputDir, { recursive: true });
    const cellWidth = Math.floor(this.width / frameCount);

    for (let frame = 0; frame < frameCount; frame += 1) {
      const startX = frame * cellWidth + 12;
      const endX = frame === frameCount - 1 ? this.width - 13 : (frame + 1) * cellWidth - 13;
      const framePng = extractFrame(this, startX, endX);
      framePng.pack().pipe(createWriteStream(join(outputDir, `muzzle-flash-${frame + 1}.png`)));
    }
  });

function extractFrame(source, startX, endX) {
  let minX = endX;
  let minY = source.height;
  let maxX = startX;
  let maxY = 0;
  const alpha = new Uint8Array(source.width * source.height);
  const key = sampleKey(source);

  for (let y = 0; y < source.height; y += 1) {
    for (let x = startX; x <= endX; x += 1) {
      const idx = (source.width * y + x) << 2;
      const r = source.data[idx];
      const g = source.data[idx + 1];
      const b = source.data[idx + 2];
      const a = alphaForPixel(r, g, b, key);
      alpha[source.width * y + x] = a;

      if (a > 4) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  minX = Math.max(startX, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(endX, maxX + padding);
  maxY = Math.min(source.height - 1, maxY + padding);

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const output = new PNG({ width, height });

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceX = minX + x;
      const sourceY = minY + y;
      const sourceIdx = (source.width * sourceY + sourceX) << 2;
      const targetIdx = (width * y + x) << 2;
      const a = alpha[source.width * sourceY + sourceX];
      output.data[targetIdx] = source.data[sourceIdx];
      output.data[targetIdx + 1] = source.data[sourceIdx + 1];
      output.data[targetIdx + 2] = source.data[sourceIdx + 2];
      output.data[targetIdx + 3] = a;
    }
  }

  return output;
}

function sampleKey(png) {
  const idx = 0;
  return { r: png.data[idx], g: png.data[idx + 1], b: png.data[idx + 2] };
}

function alphaForPixel(r, g, b, key) {
  if (g > 105 && g > r * 1.45 && g > b * 1.45) {
    return 0;
  }

  const distance = Math.hypot(r - key.r, g - key.g, b - key.b);
  if (distance <= transparentDistance) {
    return 0;
  }
  if (distance >= opaqueDistance) {
    return 255;
  }

  return Math.round(((distance - transparentDistance) / (opaqueDistance - transparentDistance)) * 255);
}
