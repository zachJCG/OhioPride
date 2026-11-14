#!/usr/bin/env node
/**
 * scripts/build-bill-stamp.mjs
 * ----------------------------
 * Keeps the "Last Updated" card on /issues honest without anyone typing a
 * date.
 *
 *   npm run bills:stamp    refresh the generated bill pages (seo:build), then,
 *                          if any tracker content changed since the last stamp,
 *                          set LAST_UPDATED in public/js/bill-data.js to now
 *                          (America/New_York) and prefill the card in the HTML
 *   npm run check:bills    fail if tracker content changed without a new stamp,
 *                          or if the HTML card disagrees with LAST_UPDATED
 *                          (runs in `npm test`)
 *   --deploy               used by `prebuild` on Vercel: same as bills:stamp,
 *                          but stamps with the HEAD commit time (when git is
 *                          available) so a forgotten stamp still ships a true
 *                          date, and never fails the build
 *
 * "Tracker content" is the BILLS array plus every page under public/issues/
 * and public/issues.html, with the generated SEO blocks and the stamp itself
 * left out. The fingerprint of that content is stored next to the date as
 * LAST_UPDATED.hash, so the stamp moves exactly when the tracker does.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'public/js/bill-data.js');
const CARD_PAGES = ['public/issues.html', 'public/issues/archive.html'].map((p) => join(ROOT, p));
const TZ = 'America/New_York';

const STAMP_LINE = /^const LAST_UPDATED = \{.*\};$/m;
const CARD_DATE = /(<div class="stat-updated-date" id="lastUpdatedDate">)[^<]*(<\/div>)/;
const CARD_TIME = /(<div class="stat-updated-time" id="lastUpdatedTime">)[^<]*(<\/div>)/;

function trackerFiles() {
  const dir = join(ROOT, 'public/issues');
  const pages = readdirSync(dir)
    .filter((f) => f.endsWith('.html'))
    .sort()
    .map((f) => join(dir, f));
  return [join(ROOT, 'public/issues.html'), ...pages];
}

function loadData(src) {
  // bill-data.js is a browser script that declares consts; read it in a function scope.
  // eslint-disable-next-line no-new-func
  return new Function(`${src}\nreturn { BILLS, LAST_UPDATED };`)();
}

/** Fingerprint of everything a tracker update touches, minus generated parts. */
export function fingerprint() {
  const h = createHash('sha256');
  h.update(JSON.stringify(loadData(readFileSync(DATA, 'utf8')).BILLS));
  for (const file of trackerFiles()) {
    const html = readFileSync(file, 'utf8')
      .replace(/<!-- seo:start -->[\s\S]*?<!-- seo:end -->/g, '')
      .replace(CARD_DATE, '$1$2')
      .replace(CARD_TIME, '$1$2');
    h.update(file.slice(ROOT.length));
    h.update(html);
  }
  return h.digest('hex').slice(0, 16);
}

/** { date: "11/13/26", time: "6:30 PM EST" } in Eastern time. */
export function formatStamp(when) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    })
      .formatToParts(when)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.month}/${parts.day}/${parts.year}`,
    time: `${parts.hour}:${parts.minute} ${parts.dayPeriod.toUpperCase()} ${parts.timeZoneName}`,
  };
}

function commitTime() {
  try {
    const iso = execFileSync('git', ['log', '-1', '--format=%cI'], { cwd: ROOT, encoding: 'utf8' }).trim();
    return iso ? new Date(iso) : null;
  } catch {
    return null;
  }
}

function prefillCards(stamp, write) {
  const stale = [];
  for (const file of CARD_PAGES) {
    const html = readFileSync(file, 'utf8');
    if (!CARD_DATE.test(html) || !CARD_TIME.test(html)) {
      throw new Error(`${file.slice(ROOT.length + 1)}: Last Updated card markup not found`);
    }
    const next = html.replace(CARD_DATE, `$1${stamp.date}$2`).replace(CARD_TIME, `$1${stamp.time}$2`);
    if (next !== html) {
      stale.push(file.slice(ROOT.length + 1));
      if (write) writeFileSync(file, next);
    }
  }
  return stale;
}

function main() {
  const mode = process.argv.includes('--check') ? 'check' : process.argv.includes('--deploy') ? 'deploy' : 'stamp';

  if (mode !== 'check') {
    execFileSync(process.execPath, [join(ROOT, 'scripts/build-seo.mjs')], { cwd: ROOT, stdio: 'ignore' });
  }

  const src = readFileSync(DATA, 'utf8');
  if (!STAMP_LINE.test(src)) throw new Error('public/js/bill-data.js: LAST_UPDATED line not found');
  const current = loadData(src).LAST_UPDATED;
  const hash = fingerprint();
  const changed = current.hash !== hash;

  if (mode === 'check') {
    const problems = [];
    if (changed) problems.push('bill tracker content changed but LAST_UPDATED was not restamped');
    const stale = prefillCards(current, false);
    if (stale.length) problems.push(`Last Updated card out of date in: ${stale.join(', ')}`);
    if (problems.length) {
      console.error(`✗ ${problems.join('\n✗ ')}\n  Run: npm run bills:stamp`);
      process.exit(1);
    }
    console.log(`✓ Last Updated ${current.date} ${current.time} matches the tracker`);
    return;
  }

  let stamp = current;
  if (changed) {
    const when = (mode === 'deploy' && commitTime()) || new Date();
    stamp = { ...formatStamp(when), hash };
    const line = `const LAST_UPDATED = { date: "${stamp.date}", time: "${stamp.time}", hash: "${hash}" };`;
    writeFileSync(DATA, src.replace(STAMP_LINE, line));
  }
  const stale = prefillCards(stamp, true);
  console.log(
    changed
      ? `✓ Last Updated stamped ${stamp.date} ${stamp.time}`
      : `✓ Tracker unchanged; Last Updated stays ${stamp.date} ${stamp.time}${stale.length ? ' (card prefilled)' : ''}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    if (process.argv.includes('--deploy')) {
      console.warn(`⚠ bills:stamp skipped: ${err.message}`);
    } else {
      throw err;
    }
  }
}
