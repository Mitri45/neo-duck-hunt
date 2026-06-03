import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(new URL("..", import.meta.url).pathname);
const publicDir = resolve(root, "public");
const chrome = process.env.CHROME_BIN ?? "/usr/bin/google-chrome";
const rangeBackgroundUrl = pathToFileURL(resolve(publicDir, "assets/images/range-background.png")).href;
const duckNormalUrl = pathToFileURL(resolve(publicDir, "assets/images/duck-normal.png")).href;
const duckEvasiveUrl = pathToFileURL(resolve(publicDir, "assets/images/duck-evasive.png")).href;
const rangeBackgroundPublic = "./assets/images/range-background.png";
const duckNormalPublic = "./assets/images/duck-normal.png";
const duckEvasivePublic = "./assets/images/duck-evasive.png";

const ogSvgPath = resolve(publicDir, "og-image.svg");
const ogPngPath = resolve(publicDir, "og-image.png");
const iconSvgPath = resolve(publicDir, "apple-touch-icon.svg");
const appleTouchPath = resolve(publicDir, "apple-touch-icon.png");
const icon512Path = resolve(publicDir, "icon-512.png");

mkdirSync(publicDir, { recursive: true });

writeFileSync(ogSvgPath, socialCardSvg());
writeFileSync(iconSvgPath, iconSvg());

if (!existsSync(chrome)) {
  console.warn(`Chrome not found at ${chrome}; wrote SVG sources but skipped PNG rendering.`);
  process.exit(0);
}

renderPage(socialCardHtml(), ogPngPath, 1200, 630);
renderPage(iconHtml(180), appleTouchPath, 180, 180);
renderPage(iconHtml(512), icon512Path, 512, 512);

function renderPage(html, outputPath, width, height) {
  mkdirSync(dirname(outputPath), { recursive: true });
  const renderPagePath = resolve(root, `tmp/meta-render-${width}x${height}.html`);
  mkdirSync(dirname(renderPagePath), { recursive: true });
  writeFileSync(renderPagePath, html);
  const result = spawnSync(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-sandbox",
      `--screenshot=${outputPath}`,
      `--window-size=${width},${height}`,
      pathToFileURL(renderPagePath).href,
    ],
    { stdio: "inherit" },
  );

  if (result.status !== 0) {
    throw new Error(`Failed to render ${outputPath}.`);
  }
}

function socialCardHtml() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      * { box-sizing: border-box; }
      html, body { width: 1200px; height: 630px; margin: 0; overflow: hidden; }
      body {
        position: relative;
        background: #65b8f6;
        font-family: "Courier New", monospace;
      }
      .bg {
        position: absolute;
        inset: -36px 0 0 0;
        width: 1200px;
        height: 675px;
        object-fit: cover;
      }
      .shade {
        position: absolute;
        inset: 0;
        background: linear-gradient(135deg, rgba(6, 21, 31, 0.82), rgba(7, 25, 34, 0.24) 52%, rgba(7, 16, 11, 0.72));
      }
      .panel {
        position: absolute;
        left: 54px;
        top: 62px;
        width: 606px;
        height: 316px;
        border: 6px solid #fff0a8;
        background: rgba(11, 27, 34, 0.78);
        box-shadow: 10px 12px 0 rgba(17, 17, 17, 0.38);
      }
      .panel::after {
        position: absolute;
        inset: 12px;
        content: "";
        border: 3px solid rgba(45, 127, 76, 0.82);
      }
      h1 {
        position: relative;
        z-index: 1;
        margin: 35px 0 0 34px;
        color: #ffe65e;
        font-size: 72px;
        font-weight: 900;
        line-height: 0.98;
        text-shadow: 4px 4px 0 #151812;
      }
      .tagline {
        position: relative;
        z-index: 1;
        margin: 37px 0 0 36px;
        color: #bdf8ff;
        font-size: 28px;
        font-weight: 900;
        text-shadow: 2px 2px 0 #111111;
      }
      .domain {
        position: relative;
        z-index: 1;
        margin: 18px 0 0 36px;
        color: #fff4bd;
        font-size: 22px;
        font-weight: 900;
        text-shadow: 2px 2px 0 #111111;
      }
      .duck {
        position: absolute;
        left: 690px;
        top: 72px;
        width: 360px;
        height: 360px;
        object-fit: contain;
        filter: drop-shadow(10px 12px 0 rgba(17, 17, 17, 0.38));
      }
      .crosshair {
        position: absolute;
        left: 884px;
        top: 332px;
        width: 164px;
        height: 164px;
        transform: translate(-50%, -50%);
      }
      .ring {
        position: absolute;
        inset: 36px;
        border: 8px solid #ffffff;
        border-radius: 999px;
      }
      .vline {
        position: absolute;
        left: 76px;
        top: 0;
        width: 8px;
        height: 164px;
        background: #ffffff;
      }
      .hline {
        position: absolute;
        left: 0;
        top: 78px;
        width: 164px;
        height: 8px;
        background: #ffffff;
      }
      .dot {
        position: absolute;
        left: 74px;
        top: 74px;
        z-index: 1;
        width: 16px;
        height: 16px;
        border-radius: 999px;
        background: #ffe65e;
      }
      .footer {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 20px;
        height: 26px;
        padding-left: 54px;
        background: rgba(17, 21, 16, 0.66);
        color: #fff0a8;
        font-size: 18px;
        font-weight: 900;
        line-height: 26px;
        text-shadow: 2px 2px 0 #111111;
      }
    </style>
  </head>
  <body>
    <img class="bg" src="${rangeBackgroundUrl}" alt="">
    <div class="shade"></div>
    <section class="panel">
      <h1>NEO DUCK<br>HUNT</h1>
      <div class="tagline">FINGER AIM. MOUTH TRIGGER.</div>
      <div class="domain">ndh.madeby.dev</div>
    </section>
    <img class="duck" src="${duckEvasiveUrl}" alt="">
    <div class="crosshair"><div class="hline"></div><div class="vline"></div><div class="ring"></div><div class="dot"></div></div>
    <div class="footer">WEBCAM TRACKING • REACTIVE DUCKS • PIXEL ARCADE</div>
  </body>
</html>`;
}

function iconHtml(size) {
  const duckSize = Math.round(size * 0.66);
  const duckOffset = Math.round(size * 0.16);
  const crosshairSize = Math.round(size * 0.32);
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      * { box-sizing: border-box; }
      html, body { width: ${size}px; height: ${size}px; margin: 0; overflow: hidden; }
      body {
        position: relative;
        border-radius: ${Math.round(size * 0.14)}px;
        background: #65b8f6;
      }
      .bg {
        position: absolute;
        inset: 0;
        width: ${size}px;
        height: ${size}px;
        object-fit: cover;
      }
      .shade {
        position: absolute;
        inset: 0;
        background: rgba(7, 25, 34, 0.22);
      }
      .duck {
        position: absolute;
        left: ${duckOffset}px;
        top: ${duckOffset}px;
        width: ${duckSize}px;
        height: ${duckSize}px;
        object-fit: contain;
      }
      .crosshair {
        position: absolute;
        left: 66%;
        top: 48%;
        width: ${crosshairSize}px;
        height: ${crosshairSize}px;
        transform: translate(-50%, -50%);
      }
      .ring {
        position: absolute;
        inset: ${Math.round(crosshairSize * 0.22)}px;
        border: ${Math.max(4, Math.round(size * 0.023))}px solid #ffffff;
        border-radius: 999px;
      }
      .vline {
        position: absolute;
        left: 48%;
        top: 0;
        width: ${Math.max(4, Math.round(size * 0.023))}px;
        height: ${crosshairSize}px;
        background: #ffffff;
      }
      .hline {
        position: absolute;
        left: 0;
        top: 48%;
        width: ${crosshairSize}px;
        height: ${Math.max(4, Math.round(size * 0.023))}px;
        background: #ffffff;
      }
      .dot {
        position: absolute;
        left: 45%;
        top: 45%;
        z-index: 1;
        width: ${Math.max(7, Math.round(size * 0.041))}px;
        height: ${Math.max(7, Math.round(size * 0.041))}px;
        border-radius: 999px;
        background: #ffe65e;
      }
    </style>
  </head>
  <body>
    <img class="bg" src="${rangeBackgroundUrl}" alt="">
    <div class="shade"></div>
    <img class="duck" src="${duckNormalUrl}" alt="">
    <div class="crosshair"><div class="hline"></div><div class="vline"></div><div class="ring"></div><div class="dot"></div></div>
  </body>
</html>`;
}

function socialCardSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="shade" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#06151f" stop-opacity="0.82"/>
      <stop offset="0.52" stop-color="#071922" stop-opacity="0.24"/>
      <stop offset="1" stop-color="#07100b" stop-opacity="0.72"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="10" dy="12" stdDeviation="0" flood-color="#111111" flood-opacity="0.38"/>
    </filter>
  </defs>
  <rect width="1200" height="630" fill="#65b8f6"/>
  <image href="${rangeBackgroundPublic}" x="0" y="-36" width="1200" height="675" preserveAspectRatio="xMidYMid slice"/>
  <rect width="1200" height="630" fill="url(#shade)"/>
  <rect x="54" y="62" width="606" height="316" fill="#0b1b22" opacity="0.78" stroke="#fff0a8" stroke-width="6"/>
  <rect x="70" y="78" width="574" height="284" fill="none" stroke="#2d7f4c" stroke-width="3" opacity="0.82"/>
  <text x="88" y="162" font-family="Courier New, monospace" font-size="72" font-weight="900" fill="#ffe65e" stroke="#151812" stroke-width="4" paint-order="stroke">NEO DUCK</text>
  <text x="88" y="240" font-family="Courier New, monospace" font-size="72" font-weight="900" fill="#ffe65e" stroke="#151812" stroke-width="4" paint-order="stroke">HUNT</text>
  <text x="92" y="304" font-family="Courier New, monospace" font-size="28" font-weight="900" fill="#bdf8ff" stroke="#111111" stroke-width="2" paint-order="stroke">FINGER AIM. MOUTH TRIGGER.</text>
  <text x="92" y="344" font-family="Courier New, monospace" font-size="22" font-weight="800" fill="#fff4bd">ndh.madeby.dev</text>
  <image href="${duckEvasivePublic}" x="690" y="72" width="360" height="360" preserveAspectRatio="xMidYMid meet" filter="url(#shadow)"/>
  <g transform="translate(884 332)" opacity="0.96">
    <circle r="46" fill="none" stroke="#ffffff" stroke-width="8"/>
    <path d="M-82 0H82M0-82V82" stroke="#ffffff" stroke-width="8" stroke-linecap="square"/>
    <circle r="8" fill="#ffe65e"/>
  </g>
  <rect x="0" y="584" width="1200" height="26" fill="#111510" opacity="0.66"/>
  <text x="54" y="610" font-family="Courier New, monospace" font-size="18" font-weight="900" fill="#fff0a8">WEBCAM TRACKING • REACTIVE DUCKS • PIXEL ARCADE</text>
</svg>
`;
}

function iconSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="72" fill="#65b8f6"/>
  <image href="${rangeBackgroundPublic}" x="-156" y="0" width="824" height="512" preserveAspectRatio="xMidYMid slice"/>
  <rect width="512" height="512" rx="72" fill="#071922" opacity="0.22"/>
  <image href="${duckNormalPublic}" x="86" y="78" width="340" height="340" preserveAspectRatio="xMidYMid meet"/>
  <circle cx="338" cy="250" r="58" fill="none" stroke="#ffffff" stroke-width="12"/>
  <path d="M236 250h204M338 148v204" stroke="#ffffff" stroke-width="12" stroke-linecap="square"/>
  <circle cx="338" cy="250" r="11" fill="#ffe65e"/>
</svg>
`;
}
