# Security Policy

Neo Duck Hunt is a static browser game. It does not have server-side accounts, payments, database writes, or privileged admin surfaces.

## Reporting Issues

Please report security issues through GitHub issues on this repository.

Do not include secrets, private user data, or exploit payloads beyond what is needed to reproduce the issue safely.

## Public Surface

- Browser camera access is requested only for local gameplay input.
- Camera frames are processed in-browser by MediaPipe and are not uploaded by this app.
- The app fetches MediaPipe model files from `https://storage.googleapis.com`.
- Local high score, shooting setup, and round duration preferences are stored in `localStorage`.
