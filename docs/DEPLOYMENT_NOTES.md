# Deployment Notes

The public deployment target is `https://ndh.madeby.dev/`.

## Static Build
The app is a Vite static build:

```bash
pnpm build
```

The output is `dist/` and can be served by a VPS, Cloudflare Pages, or any static host. Public metadata, social images, web manifest, robots, sitemap, and Cloudflare Pages-style `_headers` are stored under `public/` and copied into `dist/` during the Vite build.

## Camera Requirement
Chrome requires camera access from a secure context:

- `localhost` is allowed for local development.
- Hosted deployments need HTTPS.
- If deployed behind a reverse proxy, keep HTTPS terminated correctly and avoid mixed-content model or asset URLs.

## Hosting Checklist
- Keep generated assets in `public/assets/`.
- Verify MediaPipe WASM files load from the deployed origin under `/vendor/mediapipe/tasks-vision/wasm/`.
- Verify MediaPipe model URLs load from `https://storage.googleapis.com`.
- Keep cache headers moderate for fixed-name public assets; avoid immutable caching for `public/assets/*` unless filenames become content-hashed.
- Keep `Permissions-Policy` camera access enabled for self.
- Consider self-hosting the MediaPipe model files if the Google Storage dependency becomes a demo risk.
- Real VLM support should stay optional and feature-detected.
