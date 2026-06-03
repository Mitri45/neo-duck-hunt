import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(new URL("..", import.meta.url).pathname);
const outputDir = join(root, "output/codex-imagegen/duck-hunt");
const imageDir = join(root, "public/assets/images");
const python = process.env.PYTHON ?? (existsSync("/usr/bin/python3.12") ? "/usr/bin/python3.12" : "python3");
const chromaHelper = join(process.env.CODEX_HOME ?? `${process.env.HOME}/.codex`, "skills/.system/imagegen/scripts/remove_chroma_key.py");

mkdirSync(imageDir, { recursive: true });

const assets = [
  { source: "duck-normal-1.png", target: "duck-normal.png", chroma: true },
  { source: "duck-evasive-1.png", target: "duck-evasive.png", chroma: true },
  { source: "duck-hit-1.png", target: "duck-hit.png", chroma: true },
  { source: "range-background-1.png", target: "range-background.png", chroma: false },
];

for (const asset of assets) {
  const source = join(outputDir, asset.source);
  const target = join(imageDir, asset.target);

  if (!existsSync(source)) {
    console.warn(`Missing generated asset ${basename(source)}; leaving runtime fallback in place.`);
    continue;
  }

  if (asset.chroma && existsSync(chromaHelper)) {
    const result = spawnSync(
      python,
      [
        chromaHelper,
        "--input",
        source,
        "--out",
        target,
        "--key-color",
        "#ff00ff",
        "--soft-matte",
        "--transparent-threshold",
        "12",
        "--opaque-threshold",
        "220",
        "--despill",
        "--force",
      ],
      { stdio: "inherit" },
    );

    if (result.status === 0) {
      continue;
    }

    console.warn(`Chroma removal failed for ${asset.source}; copying raw image instead.`);
  }

  copyFileSync(source, target);
  console.log(`Wrote ${target}`);
}
