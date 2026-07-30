#!/usr/bin/env node
/**
 * scripts/check-routes.mjs
 * ------------------------
 * Route parity suite for the Next.js migration.
 *
 * Every URL the old static deployment answered has to keep answering the same
 * way while pages are ported one at a time. This asserts that: clean URLs,
 * folder index pages, canonical .html redirects (and the absence of redirect
 * loops), the configured redirects and rewrites, static assets, security and
 * cache headers, /api reachability, and 404s.
 *
 * Run against a local production server:
 *   npm run build && npm start &
 *   node scripts/check-routes.mjs
 *
 * Or against a Vercel preview, which is the check that matters before merging:
 *   BASE=https://ohiopride-git-my-branch.vercel.app node scripts/check-routes.mjs
 *
 * API routes are only checked for reachability, never for a 200: without
 * Supabase credentials they answer 5xx, and that still proves routing works.
 */

const BASE = (process.env.BASE || 'http://localhost:3000').replace(/\/$/, '');

let passed = 0;
const failures = [];

async function check(kind, path, assert) {
  let res;
  try {
    res = await fetch(BASE + path, { redirect: 'manual' });
  } catch (err) {
    failures.push(`${kind}  ${path} -> request failed: ${err.message}`);
    return;
  }
  const body = res.headers.get('content-type')?.includes('text/html') ? await res.text() : '';
  const problem = assert(res, body);
  if (problem) failures.push(`${kind}  ${path} -> ${problem}`);
  else passed++;
}

const serves = (needle) => (res, body) => {
  if (res.status !== 200) return `status ${res.status}, want 200`;
  if (needle && !body.includes(needle)) return `body missing ${JSON.stringify(needle)}`;
  return null;
};

const redirectsTo = (location, status) => (res) => {
  if (res.status !== status) return `status ${res.status}, want ${status}`;
  const got = res.headers.get('location');
  if (got !== location) return `location ${got}, want ${location}`;
  return null;
};

const header = (name, needle) => (res) => {
  const got = res.headers.get(name) || '';
  return got.includes(needle) ? null : `${name} is ${JSON.stringify(got)}, want it to contain ${JSON.stringify(needle)}`;
};

// One page per routing shape rather than all hundred: root, top level, nested
// file, folder index, deep folder index, and the two gated pages.
const PAGES = [
  ['/', '<!doctype html'],
  ['/about', 'html'],
  ['/scorecard', 'html'],
  ['/issues', 'html'],
  ['/issues/hb96', 'html'],
  ['/donate/founding-member', 'html'],
  ['/methodology', 'html'],
  ['/credits', 'html'],
  ['/brand', 'html'],
  ['/pride/signup', 'html'],
  ['/signup', 'html'],
  ['/board-retreat', 'html'],
  ['/admin/login', 'html'],
  ['/admin/finance/budget', 'html'],
  ['/endorsement/screening/thank-you', 'html'],
  ['/volunteer/events/columbus2026', 'html'],
  ['/governor-guide', 'Unlock'],
  ['/PRTraining', 'Unlock'],
];

const ASSETS = [
  '/css/style.css',
  '/js/main.js',
  '/js/site-template.js',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
  '/assets/candidates/acton-cutout.webp',
  '/assets/social/og-governor-guide.png',
];

const API = [
  '/api/board-members',
  '/api/scorecard',
  '/api/bills',
  '/api/founding-members-progress',
  '/api/site-leadership?entity=pac',
  '/api/zip-county-lookup?zip=45420',
];

for (const [path, needle] of PAGES) await check('page     ', path, serves(needle));

// The file path must send you to the canonical clean URL, and that URL must
// then serve the page rather than bouncing back.
await check('canonical', '/about.html', redirectsTo('/about', 308));
await check('canonical', '/admin/login/index.html', redirectsTo('/admin/login', 308));
await check('no-loop  ', '/about', serves('html'));

await check('redirect ', '/governorguide', redirectsTo('/governor-guide', 308));
await check('redirect ', '/govenorguide', redirectsTo('/governor-guide', 308));
await check('redirect ', '/scorecard/methodology', redirectsTo('/methodology', 308));
await check('redirect ', '/gala', redirectsTo('/', 308));
await check('redirect ', '/sponsorship', redirectsTo('/', 308));
await check('redirect ', '/priorities', redirectsTo('/', 308));
await check('redirect ', '/admin', redirectsTo('/admin/login', 307));
await check('redirect ', '/admin/finance', redirectsTo('/admin/finance/budget', 307));

// Next matches sources case-insensitively, so /prtraining is served directly.
// A redirect here would match its own destination and loop.
await check('alias    ', '/prtraining', serves('Unlock'));

await check('rewrite  ', '/rsvp', serves('html'));
await check('rewrite  ', '/internships', serves('html'));
await check('rewrite  ', '/apply/legislative_internship', serves('html'));
await check('rewrite  ', '/admin/finance/budget/revenue', serves('html'));

for (const path of ASSETS)
  await check('asset    ', path, (res) => (res.status === 200 ? null : `status ${res.status}, want 200`));

await check('header   ', '/about', header('x-frame-options', 'DENY'));
await check('header   ', '/about', header('strict-transport-security', 'max-age='));
await check('noindex  ', '/governor-guide', header('x-robots-tag', 'noindex'));
await check('noindex  ', '/admin/login', header('x-robots-tag', 'noindex'));
await check('cache    ', '/css/style.css', header('cache-control', 'max-age=600'));

for (const path of API)
  await check('api      ', path, (res) => (res.status === 404 ? 'route not found' : null));
await check('api-compat', '/.netlify/functions/board-members', (res) =>
  res.status === 404 ? 'compatibility rewrite lost' : null);

await check('not-found', '/definitely-not-a-page', (res) =>
  res.status === 404 ? null : `status ${res.status}, want 404`);

if (failures.length) {
  console.log(`\n${passed} passed, ${failures.length} FAILED against ${BASE}\n`);
  for (const f of failures) console.log('  ' + f);
  process.exit(1);
}
console.log(`\nAll ${passed} route checks passed against ${BASE}`);
