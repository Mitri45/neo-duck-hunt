import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(new URL("..", import.meta.url).pathname);
const promptFile = join(root, "prompts/image-assets.jsonl");
const outputDir = join(root, "output/codex-imagegen/duck-hunt");
const publicDir = join(root, "public/assets/images");
const codexHome = process.env.CODEX_HOME ?? `${process.env.HOME}/.codex`;
const codexGeneratedDirs = [
  join(codexHome, "generated_images"),
  join(root, ".codex/generated_images"),
].filter(existsSync);

const dryRun = process.argv.includes("--dry-run");
const firstVariantsOnly = process.argv.includes("--first-variants-only");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;
const codexBin = process.env.CODEX_BIN ?? "codex";
const maxVariants = 5;

mkdirSync(outputDir, { recursive: true });
mkdirSync(publicDir, { recursive: true });

const jobs = readJobs()
  .flatMap(expandJob)
  .filter((job) => !firstVariantsOnly || job.variant === 1)
  .slice(0, limit);

if (dryRun) {
  for (const job of jobs) {
    console.log(JSON.stringify({ out: job.out, prompt: buildPrompt(job) }, null, 2));
  }
  process.exit(0);
}

for (const job of jobs) {
  const target = join(outputDir, job.out);
  if (existsSync(target) && !process.argv.includes("--force")) {
    console.log(`Skipping existing ${target}`);
    continue;
  }
  const before = Date.now() / 1000;
  const prompt = buildPrompt(job);

  console.log(`Generating ${job.out} with headless Codex...`);
  const result = spawnSync(
    codexBin,
    [
      "exec",
      "--skip-git-repo-check",
      "--sandbox",
      "workspace-write",
      "--json",
      prompt,
    ],
    {
      cwd: root,
      env: withCodexOnPath(process.env, codexBin),
      encoding: "utf8",
      timeout: 15 * 60 * 1000,
      maxBuffer: 20 * 1024 * 1024,
    },
  );

  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").slice(-3000);
    throw new Error(`codex exec failed for ${job.out} with exit ${result.status}:\n${detail}`);
  }

  const parsed = parseSavedPath(result.stdout);
  const source = parsed && existsSync(parsed) ? parsed : newestGeneratedImage(before);
  if (!source) {
    throw new Error(`Codex completed for ${job.out}, but no generated image path was found.`);
  }

  copyFileSync(source, target);
  console.log(`Wrote ${target} from ${source}`);
}

function readJobs() {
  return readFileSync(promptFile, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function expandJob(job) {
  const count = Math.min(maxVariants, Math.max(1, Number(job.n ?? 1)));
  const base = String(job.out ?? `${slug(job.prompt)}.png`).replace(/\.png$/i, "");
  return Array.from({ length: count }, (_, index) => ({
    ...job,
    variant: index + 1,
    out: `${base}-${index + 1}.png`,
  }));
}

function buildPrompt(job) {
  const target = join(outputDir, job.out);
  return [
    "Goal: generate exactly one original game asset image using the built-in image generation tool.",
    "",
    "Destination:",
    `- Save or copy the final image to: ${target}`,
    "- Return JSON only with keys: saved_path, asset, variant, notes.",
    "",
    "Asset spec:",
    `- Asset: ${job.out}`,
    `- Variant: ${job.variant}`,
    `- Primary request: ${job.prompt}`,
    job.use_case ? `- Use case: ${job.use_case}` : "",
    job.style ? `- Style/medium: ${job.style}` : "",
    job.composition ? `- Composition/framing: ${job.composition}` : "",
    job.palette ? `- Color palette: ${job.palette}` : "",
    job.constraints ? `- Constraints: ${job.constraints}` : "",
    job.negative ? `- Avoid: ${job.negative}` : "",
    "",
    "Project constraints:",
    "- This is for Neo Duck Hunt, a browser game close in spirit to classic Duck Hunt.",
    "- Do not copy Nintendo sprites, UI, exact background, logos, or character likenesses.",
    "- No readable text unless explicitly requested.",
    "- Keep the image usable as a game asset in Chrome.",
  ]
    .filter(Boolean)
    .join("\n");
}

function parseSavedPath(stdout) {
  for (const line of stdout.split(/\r?\n/)) {
    try {
      const event = JSON.parse(line);
      const item = event.item;
      if (!item || item.type !== "agent_message" || typeof item.text !== "string") {
        continue;
      }
      const match = item.text.match(/\{[\s\S]*\}/);
      if (!match) {
        continue;
      }
      const payload = JSON.parse(match[0]);
      if (typeof payload.saved_path === "string") {
        return resolve(payload.saved_path.replace(/^~(?=$|\/)/, process.env.HOME ?? ""));
      }
    } catch {
      continue;
    }
  }
  return null;
}

function newestGeneratedImage(sinceEpochSeconds) {
  const candidates = [];
  for (const dir of codexGeneratedDirs) {
    collectImages(dir, sinceEpochSeconds, candidates);
  }
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0]?.path ?? null;
}

function collectImages(dir, sinceEpochSeconds, candidates) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectImages(path, sinceEpochSeconds, candidates);
      continue;
    }
    if (!/\.(png|jpe?g|webp)$/i.test(entry.name)) {
      continue;
    }
    const stat = statSafe(path);
    if (stat && stat.mtimeMs / 1000 >= sinceEpochSeconds) {
      candidates.push({ path, mtime: stat.mtimeMs });
    }
  }
}

function statSafe(path) {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}

function withCodexOnPath(env, command) {
  const next = { ...env };
  if (command.includes("/")) {
    next.PATH = `${dirname(resolve(command))}:${next.PATH ?? ""}`;
  }
  return next;
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "asset";
}
