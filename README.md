# Neo Duck Hunt

Webcam-controlled pixel arcade demo: aim with your index finger, open your mouth to shoot, and hunt reactive ducks that dodge your aim.

Live target: https://ndh.madeby.dev/

## Features

- MediaPipe hand tracking for index-finger aiming.
- MediaPipe face blendshape trigger for mouth-open shooting.
- Manual shooting setup with closed-mouth and open-mouth calibration.
- PixiJS arcade rendering with reactive duck movement, scoring, high score, and selectable 15/30/60 second rounds.
- Camera overlay, debug telemetry, and mouse fallback mode.
- VLM-ready commentary contract with deterministic stub responses for public demo reliability.

## Requirements

- Node.js 24
- pnpm 11.2.2 via Corepack
- Desktop Chrome for camera mode
- HTTPS when hosted, because browsers require a secure context for camera access

## Local Development

```bash
corepack enable
corepack prepare pnpm@11.2.2 --activate
pnpm install
pnpm dev
```

Open the Vite URL in Chrome. Use mouse mode if camera access is unavailable.

## Validation

```bash
pnpm test
pnpm build
```

Generate social/meta images after changing visual identity or source art:

```bash
pnpm meta:images
```

The generator writes `public/og-image.png`, `public/apple-touch-icon.png`, and `public/icon-512.png` from existing game art.

## Hosting

The app is a static Vite build:

```bash
pnpm build
```

Deploy `dist/` to any static host. The repo includes public metadata, a web manifest, sitemap, robots file, and Cloudflare Pages-style `_headers`.

The app fetches MediaPipe hand and face model files from `https://storage.googleapis.com`; MediaPipe WASM runtime files are self-hosted in `public/vendor/`.
