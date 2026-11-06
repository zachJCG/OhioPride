#!/usr/bin/env node
/**
 * scripts/build-og-cards.mjs
 * --------------------------
 * Builds the 1200 x 630 share cards for App Router pages that need their own,
 * from a small HTML template rendered in headless Chromium.
 *
 *   npm run og:build
 *
 * Why a script rather than hand-made PNGs: the card says exactly what the
 * registry says (lib/seo.mjs APP_ROUTES title), it uses the official
 * wordmark file rather than type set to look like it, and a rebuild after a
 * copy change is one command. Vercel's build has no browser, so the outputs
 * are committed, like the brand kit's.
 *
 * Cards carry no names, faces or counts. Results are data, and a share card
 * is cached by every platform that ever fetched it: a recount must never be
 * able to make one wrong.
 *
 * Fonts come from Google Fonts at render time (Montserrat 800, Roboto Slab),
 * the same families the site loads. The pride gradient is an accent bar only.
 */

import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { APP_ROUTES } from '../lib/seo.mjs';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = join(ROOT, 'public');
const WORDMARK = join(PUBLIC_DIR, 'assets/logo/wordmark-primary-transparent.svg');

/* One card per APP_ROUTES entry that names an image under /assets/social/.
 * `kicker` is the small line above the title; the URL line is the route. */
const KICKERS = {
  '/endorsements/2026': 'Endorsements',
};

async function findChrome() {
  for (const c of [
    process.env.CHROME_BIN,
    '/opt/pw-browsers/chromium',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter(Boolean)) {
    try {
      await access(c);
      return c;
    } catch {}
  }
  return null;
}

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function cardHtml({ title, kicker, url }) {
  // Sentence-case title from the registry, shown as a headline: first letter up.
  const headline = title.charAt(0).toUpperCase() + title.slice(1);
  return `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800&family=Roboto+Slab:wght@400;500&display=block" rel="stylesheet">
<style>
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
  body {
    position: relative;
    background: #152233;
    font-family: 'Roboto Slab', Georgia, serif;
    color: #fff;
  }
  /* Quiet diagonal texture, the site's own stripe. */
  body::before {
    content: '';
    position: absolute; inset: 0;
    background: repeating-linear-gradient(135deg, rgba(255,255,255,0.025) 0 2px, transparent 2px 22px);
  }
  .card { position: absolute; inset: 0; padding: 72px 80px 0; box-sizing: border-box; }
  .wordmark { display: block; width: 300px; height: auto; }
  .kicker {
    margin: 92px 0 18px;
    font: 700 22px/1 'Montserrat', sans-serif;
    letter-spacing: 0.22em; text-transform: uppercase;
    color: #70D6EC;
  }
  h1 {
    margin: 0; max-width: 980px;
    font: 800 84px/1.02 'Montserrat', sans-serif;
    letter-spacing: -0.015em;
  }
  .url {
    position: absolute; left: 80px; bottom: 58px;
    font: 500 26px/1 'Roboto Slab', serif;
    color: rgba(255,255,255,0.78);
  }
  .bar {
    position: absolute; left: 0; right: 0; bottom: 0; height: 12px;
    /* The site's Progress Pride accent, same stops as the home page bands. */
    background: linear-gradient(90deg, #E40303, #FFBC00, #FFED00, #008026, #004DFF, #750787);
  }
</style></head>
<body>
  <div class="card">
    <img class="wordmark" src="file://${WORDMARK}" alt="Ohio Pride PAC">
    <p class="kicker">${esc(kicker)}</p>
    <h1>${esc(headline)}</h1>
  </div>
  <p class="url">${esc(url)}</p>
  <div class="bar"></div>
</body></html>`;
}

async function main() {
  const cards = APP_ROUTES.filter((r) => r.image && r.image.startsWith('/assets/social/') && r.title);
  if (!cards.length) {
    console.log('No APP_ROUTES entries declare a share card; nothing to build.');
    return;
  }
  const chrome = await findChrome();
  if (!chrome) {
    console.error('No Chromium found. Set CHROME_BIN to a Chrome or Chromium binary.');
    process.exit(1);
  }
  const tmp = await mkdtemp(join(tmpdir(), 'ohp-og-'));
  try {
    for (const route of cards) {
      const html = join(tmp, 'card.html');
      const shot = join(tmp, 'card.png');
      await writeFile(
        html,
        cardHtml({
          title: route.title,
          kicker: KICKERS[route.url] || 'Ohio Pride PAC',
          url: `ohiopride.org${route.url}`,
        }),
      );
      await run(chrome, [
        '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
        '--force-device-scale-factor=1', '--window-size=1200,630',
        '--virtual-time-budget=10000', '--allow-file-access-from-files',
        `--screenshot=${shot}`, `file://${html}`,
      ], { maxBuffer: 1 << 24 });
      const png = await readFile(shot);
      const w = png.readUInt32BE(16);
      const h = png.readUInt32BE(20);
      if (w !== 1200 || h !== 630) throw new Error(`${route.image} rendered at ${w}x${h}, want 1200x630`);
      await writeFile(join(PUBLIC_DIR, route.image), png);
      console.log(`✓ ${route.image} (${route.url})`);
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
