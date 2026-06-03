# Asset Generation

## Visual Assets
Use headless Codex image generation:

```bash
pnpm assets:images:dry-run
pnpm assets:images
pnpm assets:select-defaults
```

Prompt source: `prompts/image-assets.jsonl`.

Rules:

- Generate original assets only.
- Stay close to the feel of classic Duck Hunt without copying sprites, backgrounds, names, UI, or sounds.
- Maximum 5 variants per asset.
- Current prompt file uses 3 variants per asset.
- `pnpm assets:images` runs `codex exec --json` once per asset variant and asks Codex to use its built-in image generation tool.
- Save generated drafts in `output/codex-imagegen/duck-hunt/`.
- Copy selected finals into `public/assets/images/`.
- Duck sprites use a flat `#ff00ff` chroma-key background and local background removal.
- The first-person shotgun barrel overlay is generated as a raster PNG asset, not Pixi vector geometry.
- `pnpm assets:key-png <input.png> <output.png>` removes a green chroma-key background and crops generated PNG assets. `pngjs` is installed locally for this post-processing path.
- Muzzle flash uses a generated 3-frame sprite sheet split into `muzzle-flash-1.png`, `muzzle-flash-2.png`, and `muzzle-flash-3.png` with `pnpm assets:split-muzzle <sheet.png> public/assets/images`.
- This path does not require `OPENAI_API_KEY` in the shell; it relies on the authenticated Codex CLI session.

If chroma-key removal fails, the selector script copies the raw asset and logs the issue. The runtime still has procedural fallbacks.

## Local Sound Generation
The preferred AI SFX path is Stable Audio 3:

- Official repo: https://github.com/Stability-AI/stable-audio-3
- Preferred model: `small-sfx`
- Backup: AudioCraft AudioGen, https://audiocraft.metademolab.com/audiogen.html

Implementation policy:

- If the required local repo, model, CLI, package, or binary is missing, install or fetch it during implementation.
- Prefer `.local-tools/`, `/tmp`, or tool-managed environments over system-wide installs.
- If installation is blocked by network, permissions, license gates, model access, or hardware limits, document the exact blocker.

The MVP includes generated WAV placeholders from:

```bash
pnpm generate:sfx
```

Those files live in `public/assets/audio/` and are wired through the same game audio interface that generated SFX should use later.

Current local status:

- Stable Audio 3 was cloned to `.local-tools/stable-audio-3`.
- `uv sync` completed and installed the local `stable-audio` CLI with CUDA torch/torchaudio.
- `stable-audio --model small-sfx ...` reached model loading but Hugging Face returned `403 GatedRepoError` for `stabilityai/stable-audio-3-small-sfx`.
- Next step for real AI SFX is to authorize that Hugging Face model or provide an already-downloaded checkpoint.
