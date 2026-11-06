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

/* A protected Vercel preview answers only with its auth cookie. Pass it as
 * COOKIE="_vercel_jwt=..." (open the preview's share link once to get it). */
const COOKIE = process.env.COOKIE || '';

async function check(kind, path, assert, init = {}) {
  let res;
  try {
    const headers = { ...(init.headers || {}), ...(COOKIE ? { cookie: COOKIE } : {}) };
    res = await fetch(BASE + path, { redirect: 'manual', ...init, headers });
  } catch (err) {
    failures.push(`${kind}  ${path} -> request failed: ${err.message}`);
    return;
  }
  // Any text response, not just HTML: /robots.txt is text/plain and its body
  // is the whole point of the check.
  const type = res.headers.get('content-type') || '';
  const body = type.startsWith('text/') || type.includes('json') ? await res.text() : '';
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

// Admin pages sit behind the session middleware. Without a session cookie
// (always true in this suite) they answer 307 -> /admin/login when the
// Supabase env is configured, or serve normally when it is not (local runs
// without env, where the middleware fails open). Accept either.
const gated = (assert) => (res, body) => {
  const loc = res.headers.get('location') || '';
  if (res.status === 307 && loc.startsWith('/admin/login')) return null;
  return assert(res, body);
};

const header = (name, needle) => (res) => {
  const got = res.headers.get(name) || '';
  return got.includes(needle) ? null : `${name} is ${JSON.stringify(got)}, want it to contain ${JSON.stringify(needle)}`;
};

// One page per routing shape rather than all hundred: root, top level, nested
// file, folder index, deep folder index, the remaining gated page, and the
// governor guide, which is public and asserts on its own copy.
const PAGES = [
  ['/', '<!doctype html'],
  ['/about', 'html'],
  ['/scorecard', 'html'],
  ['/issues', 'html'],
  ['/issues/hb96', 'html'],
  ['/donate/founding-member', 'html'],
  ['/methodology', 'html'],
  ['/credits', 'Photo Credits'],   // ported to app/credits/page.js
  ['/brand', 'html'],
  ['/pride/signup', 'html'],
  ['/signup', 'html'],
  ['/board-retreat', 'html'],
  ['/admin/login', 'html'],
  // Ported to app/(site)/endorsements. Server rendered now, so the assertion
  // is on real page copy: if the Supabase read broke, the old page still
  // served its shell and only the cards went missing.
  ['/endorsements', 'Pro-equality leadership for Ohio'],
  ['/endorsements/2026', '2026 endorsements and results.'],
  ['/archive', 'href="/endorsements/2026"'],
  ['/llms.txt', '[2026 endorsements and results](https://ohiopride.org/endorsements/2026)'],
  ['/endorsements/jeff-givan', 'Why we endorsed Jeff'],
  ['/endorsement/screening/thank-you', 'Where your application goes next'],
  ['/endorsement/screening', 'Apply for an Ohio Pride PAC endorsement'],
  ['/volunteer/events/columbus2026', 'html'],
  // Public since launch: assert on real page copy, not the unlock form.
  ['/governor-guide', 'Two roads to the Governor'],
  ['/governor-guide/other-candidates', 'Other candidates'],
];

const ASSETS = [
  '/css/style.css',
  '/js/main.js',
  '/js/site-template.js',
  '/favicon.ico',
  '/assets/candidates/acton-cutout.webp',
  '/assets/social/og-governor-guide.png',
  '/assets/social/og-governor-guide-others.png',
  '/assets/social/og-endorsements-2026.png',
];

const API = [
  '/api/board-members',
  '/api/scorecard',
  '/api/bills',
  '/api/founding-members-progress',
  '/api/site-leadership?entity=pac',
  '/api/zip-county-lookup?zip=45420',
  '/api/endorsement-results?cycle=2026',
];

for (const [path, needle] of PAGES) {
  await check('page     ', path, path.startsWith('/admin') && path !== '/admin/login'
    ? gated(serves(needle)) : serves(needle));
}

// The candidate short link is a real 301 to the form (2026-11-05). The
// volunteer alias /apply/:position is a rewrite and must keep serving.
await check('redirect ', '/apply', redirectsTo('/endorsement/screening', 301));
await check('rewrite  ', '/apply/communications', serves('html'));

// The file path must send you to the canonical clean URL, and that URL must
// then serve the page rather than bouncing back.
await check('canonical', '/about.html', redirectsTo('/about', 308));
// A ported page keeps answering its old .html URL even though the file is gone.
await check('ported   ', '/credits.html', redirectsTo('/credits', 308));
// The folder-index spelling matters for /endorsements specifically: without
// this redirect, /endorsements/index.html falls through to the new
// /endorsements/[slug] route and 404s as an unknown candidate.
await check('ported   ', '/endorsements/index.html', redirectsTo('/endorsements', 308));
await check('ported   ', '/endorsement/screening/thank-you/index.html',
  redirectsTo('/endorsement/screening/thank-you', 308));
// An unknown candidate is a 404, not a soft landing on the list.
await check('404      ', '/endorsements/nobody-by-that-name',
  (res) => (res.status === 404 ? null : `status ${res.status}, want 404`));
await check('no-loop  ', '/about', serves('html'));

/* Post-election phase 2: pages archived in place. Each keeps its URL, answers
 * 200, sends the noindex header from lib/archived-paths.mjs, and carries the
 * marker the banner keys off (the banner itself is injected by script). */
const { ARCHIVED_PATHS } = await import('../lib/archived-paths.mjs');
const all = (...asserts) => (res, body) => {
  for (const a of asserts) {
    const problem = a(res, body);
    if (problem) return problem;
  }
  return null;
};
for (const path of ARCHIVED_PATHS) {
  await check('archived ', path, all(
    serves('name="ohp-archived" content="true"'),
    header('x-robots-tag', 'noindex'),
  ));
}
await check('archive  ', '/archive', all(serves('Archive.'), serves('2026 election'), serves('2026 Pride and events')));
await check('archive  ', '/events', all(serves('Nothing on the calendar right now.'), serves('href="/archive"')));
await check('archive  ', '/pride/signup', (res, body) => {
  if (res.status !== 200) return `status ${res.status}, want 200`;
  if (/<form\b/i.test(body)) return 'still renders a <form>';
  return body.includes('Pride 2026 signups are closed.') ? null : 'closed note missing';
});
// The archived form's endpoint refuses new rows; its table stays.
await check('archive  ', '/api/pride-volunteer-submit', (res) => (
  res.status === 410 ? null : `status ${res.status}, want 410`
), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
// Live pages are not archived.
await check('live     ', '/about', (res, body) => (
  body.includes('ohp-archived') ? 'carries the archived marker' : null
));
await check('live     ', '/donate', serves('id="goalFill"'));

await check('redirect ', '/governorguide', redirectsTo('/governor-guide', 308));
await check('redirect ', '/govenorguide', redirectsTo('/governor-guide', 308));
await check('redirect ', '/scorecard/methodology', redirectsTo('/methodology', 308));
await check('redirect ', '/gala', redirectsTo('/', 308));
await check('redirect ', '/sponsorship', redirectsTo('/', 308));
await check('redirect ', '/priorities', redirectsTo('/', 308));
// The Cincinnati Pride Hour, retired after the 2026 cycle: a real 301.
await check('redirect ', '/pride-hour', redirectsTo('/events', 301));
await check('redirect ', '/pride-hour.html', redirectsTo('/events', 301));
await check('redirect ', '/launch-day', redirectsTo('/', 308));
await check('redirect ', '/rsvp', redirectsTo('/', 308));
// With the middleware active the Location gains ?next=..., so match by prefix.
await check('redirect ', '/admin', (res) => {
  if (res.status !== 307) return `status ${res.status}, want 307`;
  const loc = res.headers.get('location') || '';
  return loc.startsWith('/admin/login') ? null : `location ${loc}, want /admin/login`;
});
await check('redirect ', '/admin/finance', gated(redirectsTo('/admin/finance/budget', 307)));
await check('redirect ', '/admin/donors', gated(redirectsTo('/admin/contacts?seg=founding', 307)));

// Deleted in November 2026 at Zach's request; nothing should answer on them.
for (const gone of ['/sunday-funday', '/Sunday-Funday', '/PRTraining', '/prtraining']) {
  await check('deleted  ', gone, (res) => (res.status === 404 ? null : `status ${res.status}, want 404`));
}

await check('rewrite  ', '/internships', serves('html'));
await check('rewrite  ', '/apply/legislative_internship', serves('html'));

// Ported App Router admin pages.
await check('app-route', '/admin/dashboard', gated(serves('html')));
await check('app-route', '/admin/contacts', gated(serves('html')));
await check('app-route', '/admin/texting', gated(serves('html')));
await check('app-route', '/admin/endorsements', gated(serves('html')));
await check('redirect ', '/admin/endorsements/detail', gated(redirectsTo('/admin/endorsements', 307)));
await check('app-route', '/admin/users', gated(serves('html')));
for (const p of [
  '/admin/members', '/admin/prospects', '/admin/volunteers', '/admin/networking',
  '/admin/tasks', '/admin/bills', '/admin/legislators', '/admin/pride', '/admin/events',
  '/admin/fundraising', '/admin/finance/budget', '/admin/compliance', '/admin/internships',
  '/admin/board-retreat', '/admin/settings', '/admin/board',
]) await check('app-route', p, gated(serves('html')));

for (const path of ASSETS)
  await check('asset    ', path, (res) => (res.status === 200 ? null : `status ${res.status}, want 200`));

/* robots.txt and sitemap.xml used to be files under public/ and are now
 * generated by app/robots.js and app/sitemap.js. Asserting on their contents
 * rather than a 200 is what catches the failure mode of that move: a route
 * that answers but returns an empty document. */
await check('seo      ', '/robots.txt', (res, body) => {
  if (res.status !== 200) return `status ${res.status}, want 200`;
  return body.includes('Sitemap: https://www.ohiopride.org/sitemap.xml')
    ? null
    : 'robots.txt does not point at the sitemap';
});
await check('seo      ', '/sitemap.xml', (res) => {
  if (res.status !== 200) return `status ${res.status}, want 200`;
  const type = res.headers.get('content-type') || '';
  return type.includes('xml') ? null : `content-type ${JSON.stringify(type)}, want XML`;
});

await check('header   ', '/about', header('x-frame-options', 'DENY'));
await check('header   ', '/about', header('strict-transport-security', 'max-age='));
await check('noindex  ', '/admin/login', header('x-robots-tag', 'noindex'));
await check('cache    ', '/css/style.css', header('cache-control', 'max-age=600'));

for (const path of API)
  await check('api      ', path, (res) => (res.status === 404 ? 'route not found' : null));
await check('api-compat', '/.netlify/functions/board-members', (res) =>
  res.status === 404 ? 'compatibility rewrite lost' : null);

await check('not-found', '/definitely-not-a-page', (res) =>
  res.status === 404 ? null : `status ${res.status}, want 404`);

/* ---------------------------------------------------------------------------
 * Post-election phase 3: results. Every count, badge and line is checked
 * against the API's own data, never against names or numbers written here:
 * results are data, and a recount must not need a change to this file.
 * ------------------------------------------------------------------------ */
const BADGE = (r) =>
  r.result === 'won' ? (r.incumbent ? 'Re-elected' : 'Elected')
    : r.result === 'lost' ? 'Not elected' : 'Result pending';
const LINE = {
  'Re-elected': 'Re-elected November 3, 2026.',
  Elected: 'Elected November 3, 2026.',
  'Not elected': 'Endorsed in 2026. Not elected.',
  'Result pending': '2026 result pending.',
};
// React separates interpolated text with <!-- --> in server HTML.
const flat = (body) => body.replace(/<!-- -->/g, '');

let results = null;
await check('results  ', '/api/endorsement-results?cycle=2026', (res, body) => {
  if (res.status !== 200) return `status ${res.status}, want 200`;
  /* Locally the handler's own header is visible. Behind Vercel the CDN keeps
   * s-maxage for itself and hands the browser only max-age, so there the
   * proof of edge caching is the x-vercel-cache header. */
  const cc = res.headers.get('cache-control') || '';
  const edge = res.headers.has('x-vercel-cache');
  if (!(cc.includes('s-maxage=300') || (edge && cc.includes('max-age=')))) return 'not cached at the CDN';
  let d;
  try { d = JSON.parse(body); } catch { return 'not JSON'; }
  if (!d.ok || !Array.isArray(d.results)) return 'no results array';
  const won = d.results.filter((r) => r.result === 'won').length;
  if (d.counts?.total !== d.results.length || d.counts?.won !== won) return 'counts disagree with rows';
  const keys = ['slug', 'name', 'office', 'level', 'result', 'incumbent', 'badge', 'portrait_url', 'profile_url'];
  const gap = d.results.find((r) => keys.some((k) => !(k in r)));
  if (gap) return `${gap.slug} is missing a field`;
  const bad = d.results.find((r) => r.badge !== BADGE(r));
  if (bad) return `${bad.slug} badge ${bad.badge}, want ${BADGE(bad)}`;
  if (d.results.some((r) => 'email' in r || 'phone' in r)) return 'leaks contact fields';
  results = d;
  return null;
});
await check('results  ', '/api/endorsement-results?cycle=nope',
  (res) => (res.status === 400 ? null : `status ${res.status}, want 400`));

for (const r of results?.results || []) {
  await check('result   ', `/endorsements/${r.slug}`, (res, body) => {
    if (res.status !== 200) return `status ${res.status}`;
    const want = LINE[r.badge];
    return flat(body).includes(want) ? null : `missing "${want}"`;
  });
}
if (results) {
  const { total, won } = results.counts;
  await check('results  ', '/endorsements/2026', (res, body) => {
    const text = flat(body);
    if (won > 0 && !text.includes(`We endorsed ${total} candidates in 2026, and ${won} won their races.`)) {
      return 'intro count does not match the API';
    }
    for (const r of results.results) {
      if (!text.includes(`Portrait of ${r.name}.`)) return `no portrait alt for ${r.slug}`;
    }
    return null;
  });
  await check('results  ', '/endorsements', (res, body) => {
    const text = flat(body);
    if (won > 0 && !text.includes(`${won} candidates we endorsed won on November 3, 2026.`)) {
      return 'winners intro count does not match the API';
    }
    return null;
  });
}
await check('404      ', '/endorsements/2027', (res) =>
  res.status === 404 ? null : `status ${res.status}, want 404`);
await check('home     ', '/', (res, body) => {
  if (res.status !== 200) return `status ${res.status}`;
  if ((body.match(/<h1\b/g) || []).length !== 1) return 'want exactly one <h1> in the served page';
  if (!body.includes('/api/endorsement-results?cycle=2026')) return 'home no longer asks for the 2026 results';
  if (!body.includes('id="hpWinnersTpl"')) return 'winners template missing';
  if (!body.includes('refcode=website_home_winners')) return 'winners Donate lost its refcode';
  if (body.includes('hp-slate-grid')) return 'the 2026 slate grid is still on the home page';
  return null;
});
// The sitemap is XML, which check() does not read; fetch it directly.
{
  const xml = await (await fetch(BASE + '/sitemap.xml', COOKIE ? { headers: { cookie: COOKIE } } : {})).text();
  for (const p of ['/endorsements/2026', '/archive']) {
    if (xml.includes(`https://www.ohiopride.org${p}</loc>`)) passed++;
    else failures.push(`sitemap    missing ${p}`);
  }
  for (const p of ARCHIVED_PATHS) {
    if (xml.includes(`https://www.ohiopride.org${p}</loc>`)) failures.push(`sitemap    lists archived ${p}`);
    else passed++;
  }
  if (xml.includes('https://www.ohiopride.org/endorsements/2026</loc>') &&
      (xml.match(/endorsements\/2026<\/loc>/g) || []).length !== 1) {
    failures.push('sitemap    lists /endorsements/2026 more than once');
  }
}

if (failures.length) {
  console.log(`\n${passed} passed, ${failures.length} FAILED against ${BASE}\n`);
  for (const f of failures) console.log('  ' + f);
  process.exit(1);
}
console.log(`\nAll ${passed} route checks passed against ${BASE}`);
