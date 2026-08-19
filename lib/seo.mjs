/* =============================================================================
 * lib/seo.mjs — the one description of how every public URL presents itself.
 *
 * Why a registry instead of hand written <head> blocks:
 *
 *   The site is mid migration. Most pages are still hand written HTML under
 *   public/, a handful are App Router routes, and the two used to drift. Titles
 *   were duplicated, half the pages had no og:image, the canonical host was
 *   sometimes www and sometimes not, and every bill detail page shipped with
 *   `<title>Loading... | Ohio Pride</title>` because the real title was written
 *   by JavaScript after the crawler had already read the document.
 *
 *   So the metadata lives here, once, and three consumers read it:
 *
 *     scripts/build-seo.mjs   writes the <head> block into each static page
 *     app/sitemap.js          emits /sitemap.xml
 *     app/robots.js           emits /robots.txt
 *     scripts/check-seo.mjs   fails the build when a page drifts or is missing
 *
 *   Bill pages are not listed by hand: they are derived from the same
 *   public/js/bill-data.js the pages render from, so a bill that changes status
 *   gets a new title and description on the next `npm run seo:build`.
 *
 * Adding a page: add an entry to PAGES (or mark it noindex), then run
 * `npm run seo:build`. `npm run check:seo` fails if you forget.
 * ========================================================================== */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = join(ROOT, 'public');

/* The canonical origin. Every absolute URL the site emits is built from this,
 * which is what stops the half-www/half-apex mix that was splitting link
 * equity between two spellings of the same page. */
export const SITE_URL = 'https://www.ohiopride.org';
export const SITE_NAME = 'Ohio Pride PAC';
export const SITE_SHORT_NAME = 'Ohio Pride';
export const DEFAULT_OG_IMAGE = '/assets/social/og-image.png';
export const DEFAULT_OG_IMAGE_ALT =
  "Ohio Pride PAC — Ohio's only statewide LGBTQ+ political action committee";
export const THEME_COLOR = '#152233';
export const ORG_EMAIL = 'info@ohiopride.org';
export const ORG_LOGO = '/assets/logo/lockup-primary-on-navy.png';

export const absolute = (path) => new URL(path, SITE_URL).href;

/* What robots.txt blocks from being crawled at all.
 *
 * Deliberately short. Blocking a crawl and asking for noindex are opposite
 * instructions: a crawler that is not allowed to fetch a page never sees the
 * noindex on it, and Google will happily list a blocked URL with no snippet.
 * So the internal pages that must stay out of the index — /board-retreat,
 * /PRTraining, the run-of-show pages — are crawlable and carry `noindex`
 * instead (meta tag from lib/seo.mjs, X-Robots-Tag from next.config.mjs).
 *
 * These two are different: /admin is behind the session middleware and there
 * is nothing there for a crawler, and /api answers JSON, which cannot carry a
 * meta tag at all. */
export const DISALLOWED_PATHS = ['/admin/', '/api/'];

/* ---------------------------------------------------------------------------
 * Static pages under public/.
 *
 * `url` is the clean URL, which is also the key used to find the file:
 * next.config.mjs rewrites /about to /about.html and /signup to
 * /signup/index.html, and scripts/build-seo.mjs resolves the same way.
 *
 * Only `url`, `title` and `description` are required. Everything else has a
 * sensible default: og title falls back to title, og description to
 * description, image to the site card, type to "website".
 * ------------------------------------------------------------------------- */
export const PAGES = [
  {
    url: '/',
    title: "Ohio Pride | Ohio's Only Statewide LGBTQ+ Political Action Committee",
    description:
      "Ohio Pride is Ohio's only statewide LGBTQ+ PAC. We endorse pro-equality candidates, score all 132 state legislators, and mobilize voters in all 88 counties.",
    ogTitle: "Ohio Pride | Ohio's Only Statewide LGBTQ+ PAC",
    ogDescription:
      'We endorse pro-equality candidates, score all 132 Ohio legislators, and mobilize voters in all 88 counties.',
    priority: 1.0,
    changefreq: 'weekly',
    jsonLd: ['organization', 'website'],
  },
  {
    url: '/about',
    title: 'About Ohio Pride PAC | Statewide LGBTQ+ Political Power',
    description:
      'Ohio Pride is a nonpartisan, state-level political action committee dedicated to building political power for LGBTQ+ equality across every corner of Ohio.',
    ogTitle: 'About | Ohio Pride',
    ogDescription:
      'Nonpartisan, state-level PAC endorsing pro-equality candidates across Ohio.',
    priority: 0.7,
    changefreq: 'monthly',
  },
  {
    url: '/board',
    title: 'Meet the Board | Ohio Pride',
    description:
      'Ten fierce Ohioans building political power for LGBTQ+ equality. Meet the founding board of Ohio Pride.',
    ogDescription: 'Ten fierce Ohioans building political power for LGBTQ+ equality.',
    priority: 0.6,
    changefreq: 'monthly',
    breadcrumb: [{ name: 'About', url: '/about' }],
  },
  {
    url: '/scorecard',
    title: 'Ohio Legislative Scorecard | LGBTQ+ Equality Ratings',
    description:
      'Every Ohio legislator graded on their LGBTQ+ equality record, built from official floor votes, committee votes, and bill sponsorships.',
    ogTitle: 'Ohio Legislative Scorecard | Ohio Pride PAC',
    ogDescription:
      'Every Ohio legislator scored on their LGBTQ+ equality record: floor votes, committee votes, and bill sponsorship.',
    priority: 0.9,
    changefreq: 'weekly',
  },
  {
    url: '/methodology',
    title: 'Scoring Methodology | Ohio Pride PAC',
    description:
      'How Ohio Pride PAC scores Ohio legislators on LGBTQ+ equality, source-cited and built from Ohio General Assembly floor votes, committee votes, and sponsorships.',
    ogDescription:
      'A complete, source-cited explanation of how Ohio Pride PAC scores Ohio legislators on LGBTQ+ equality.',
    type: 'article',
    priority: 0.5,
    changefreq: 'yearly',
    breadcrumb: [{ name: 'Scorecard', url: '/scorecard' }],
  },
  {
    url: '/issues',
    title: 'Ohio LGBTQ+ Legislation Tracker | Ohio Pride',
    description:
      'Track every LGBTQ+-related bill moving through the Ohio General Assembly: status, sponsors, votes, and what each bill would do.',
    ogTitle: 'Legislative Issue Tracker | Ohio Pride',
    ogDescription:
      'Track LGBTQ+ legislation in Ohio. Monitor bills affecting equality, healthcare, and civil rights for LGBTQ+ Ohioans.',
    priority: 0.9,
    changefreq: 'daily',
  },
  {
    url: '/issues/archive',
    title: 'Enacted Legislation Archive | Ohio Pride',
    description:
      'Archive of LGBTQ+-relevant Ohio legislation that has been signed into law. Track enacted bills from the 136th General Assembly.',
    ogDescription:
      'Archive of LGBTQ+-relevant Ohio legislation that has been signed into law.',
    priority: 0.6,
    changefreq: 'monthly',
    breadcrumb: [{ name: 'Issues', url: '/issues' }],
  },
  {
    url: '/governor-guide',
    title: 'The 2026 Governor Guide: Acton & Ramaswamy, Side by Side',
    description:
      'A fact-checked side-by-side guide to Amy Acton and Vivek Ramaswamy, the major-party candidates for Ohio governor in 2026. Every claim dated and sourced.',
    ogTitle: 'The 2026 Governor Guide | Ohio Pride PAC',
    ogDescription:
      'Amy Acton and Vivek Ramaswamy, side by side. Every claim dated, sourced, and linked. No scores, no spin. You decide.',
    image: '/assets/social/og-governor-guide.png',
    imageAlt:
      "Two roads to the Governor's Mansion. Amy Acton and Vivek Ramaswamy side by side, from Ohio Pride PAC.",
    type: 'article',
    priority: 0.9,
    changefreq: 'weekly',
  },
  {
    url: '/governor-guide/other-candidates',
    title: 'Other Candidates for Governor | Ohio Pride PAC',
    description:
      'The rest of the field for Ohio governor, November 3, 2026, with ballot status and every claim sourced.',
    ogTitle: 'The Other Candidates for Governor | Ohio Pride PAC',
    ogDescription:
      'Don Kissick and Tim Grady: ballot status and record, held to the same sourcing standard as the main guide.',
    image: '/assets/social/og-governor-guide-others.png',
    imageAlt: 'The other candidates for governor: Don Kissick and Tim Grady, from Ohio Pride PAC.',
    type: 'article',
    priority: 0.5,
    changefreq: 'monthly',
    breadcrumb: [{ name: 'Governor Guide', url: '/governor-guide' }],
  },
  {
    url: '/endorsement/screening',
    title: 'Candidate Endorsement Application | Ohio Pride PAC',
    description:
      'Apply for an Ohio Pride PAC endorsement. Open to candidates running for statewide, federal, local, and judicial office in Ohio who support LGBTQ+ equality.',
    priority: 0.6,
    changefreq: 'monthly',
    breadcrumb: [{ name: 'Endorsements', url: '/endorsements' }],
  },
  {
    url: '/donate',
    title: 'Donate to Ohio Pride PAC | Fund LGBTQ+ Political Power',
    description:
      'Support Ohio Pride with a contribution. Become a founding member or make a one-time donation to elect pro-equality candidates in Ohio.',
    ogTitle: 'Donate | Ohio Pride',
    ogDescription:
      'Support Ohio Pride with a contribution. Become a founding member or make a one-time donation.',
    priority: 0.8,
    changefreq: 'monthly',
  },
  {
    url: '/donate/founding-member',
    title: 'Become a Founding Member | Ohio Pride',
    description:
      'Become one of the first 1,969 founding members of Ohio Pride. Choose your tier and join the movement for LGBTQ+ equality in Ohio.',
    priority: 0.7,
    changefreq: 'monthly',
    breadcrumb: [{ name: 'Donate', url: '/donate' }],
  },
  {
    url: '/founding-members',
    title: 'Founding Members | Ohio Pride PAC',
    description:
      'Meet the first 1,969 Ohioans building LGBTQ+ political power. Search by county, tier, city, or elected office. Live county leaderboard.',
    ogDescription: 'Meet the first 1,969 Ohioans building LGBTQ+ political power.',
    priority: 0.8,
    changefreq: 'weekly',
  },
  {
    url: '/events',
    title: 'Events | Ohio Pride PAC',
    description:
      'Ohio Pride PAC is taking Pride Hour city by city. Find the next happy hour near you in Cincinnati and Cleveland, and RSVP.',
    image: '/assets/img/events/cincinnati-pride-hour.jpg',
    imageAlt: 'Ohio Pride PAC Pride Hour in Cincinnati.',
    priority: 0.8,
    changefreq: 'weekly',
  },
  {
    url: '/pride-hour',
    title: "Cincinnati's Pride Hour | Ohio Pride PAC",
    description:
      'Join Ohio Pride PAC for a happy hour in support of our work. Wednesday, August 26, 2026, 6:30–8 PM at Cobblestone OTR in Cincinnati. RSVP today.',
    ogDescription:
      'A happy hour in support of the work of Ohio Pride PAC. Wed, Aug 26, 2026 · 6:30–8 PM · Cobblestone OTR, Cincinnati. RSVP today.',
    image: '/assets/img/events/cincinnati-pride-hour.jpg',
    imageAlt:
      "Cincinnati's Pride Hour — a happy hour in support of Ohio Pride PAC, August 26, 2026, 6:30 to 8 PM at Cobblestone OTR.",
    priority: 0.7,
    changefreq: 'weekly',
    breadcrumb: [{ name: 'Events', url: '/events' }],
    jsonLd: ['event'],
    // Street address deliberately absent: the page gives the venue and city
    // only, and structured data must not assert more than the page does.
    event: {
      name: "Cincinnati's Pride Hour",
      startDate: '2026-08-26T18:30:00-04:00',
      endDate: '2026-08-26T20:00:00-04:00',
      venue: 'Cobblestone OTR',
      city: 'Cincinnati',
      region: 'OH',
    },
  },
  {
    url: '/sunday-funday',
    title: "Cleveland's Pride Hour | Ohio Pride PAC",
    description:
      'A happy hour in support of Ohio Pride PAC. Sunday, September 20, 2026, 4:00 to 6:00 PM at the Leather Stallion Saloon in Cleveland. RSVP today.',
    image: '/assets/img/events/cleveland-pride-hour-og.jpg',
    imageAlt:
      "Cleveland's Pride Hour, Sunday September 20, 2026, 4:00 to 6:00 PM at the Leather Stallion Saloon, 2205 St. Clair Ave NE, Cleveland.",
    priority: 0.7,
    changefreq: 'weekly',
    breadcrumb: [{ name: 'Events', url: '/events' }],
    jsonLd: ['event'],
    event: {
      name: "Cleveland's Pride Hour",
      startDate: '2026-09-20T16:00:00-04:00',
      endDate: '2026-09-20T18:00:00-04:00',
      venue: 'Leather Stallion Saloon',
      street: '2205 St. Clair Ave NE',
      city: 'Cleveland',
      region: 'OH',
    },
  },
  {
    url: '/pride',
    title: 'Ohio Pride Road Tour 2026 | Ohio Pride',
    description:
      'Find every Pride event Ohio Pride is showing up to this summer, and sign up to march, table, or volunteer.',
    priority: 0.9,
    changefreq: 'weekly',
  },
  {
    url: '/pride/signup',
    title: 'Sign Up to Work Pride | Ohio Pride Road Tour 2026',
    description:
      'Volunteer to help Ohio Pride show up at Pride events across Ohio. Tell us where in the state you can help.',
    priority: 0.8,
    changefreq: 'monthly',
    breadcrumb: [{ name: 'Pride Road Tour', url: '/pride' }],
  },
  {
    url: '/signup',
    title: 'Join Ohio Pride | Newsletter, Volunteer & Founding Membership',
    description:
      'One place to join Ohio Pride: sign up for the newsletter, raise your hand to volunteer, and become a founding member of the movement for LGBTQ+ equality.',
    ogDescription:
      'One place to join Ohio Pride: sign up for our newsletter, volunteer, and become a founding member.',
    priority: 0.8,
    changefreq: 'monthly',
  },
  {
    url: '/volunteer',
    title: 'Volunteer or Intern | Ohio Pride',
    description:
      'Volunteer or apply for a Summer/Fall 2026 internship with Ohio Pride. Endorsements, voter mobilization, and statewide advocacy take people in every county.',
    ogDescription: 'Volunteer or apply for a Summer/Fall 2026 internship with Ohio Pride.',
    priority: 0.7,
    changefreq: 'monthly',
  },
  {
    url: '/volunteer/events',
    title: 'Volunteer Events | Ohio Pride',
    description:
      'Upcoming volunteer events with Ohio Pride. Find your event, see the run of show, and know exactly where to be, when to be there, and what to do.',
    ogDescription:
      'Upcoming volunteer events with Ohio Pride. Pick your event for the full run of show.',
    priority: 0.7,
    changefreq: 'monthly',
    breadcrumb: [{ name: 'Volunteer', url: '/volunteer' }],
  },
  {
    url: '/elected-resources',
    title: 'LGBTQ+ Equality Toolkit for Ohio Local Officials | Ohio Pride',
    description:
      'A toolkit for Ohio local officials: model non-discrimination ordinances, conversion-therapy bans, safe-haven resolutions, and Ohio home-rule authority.',
    ogDescription:
      'Model non-discrimination ordinances, conversion-therapy bans, safe-haven resolutions, home-rule authority, and drafting help for Ohio local officials.',
    type: 'article',
    priority: 0.7,
    changefreq: 'monthly',
  },
  {
    url: '/connect',
    title: 'Connect | Ohio Pride',
    description:
      'Schedule a 30, 60, or 90 minute conversation with Ohio Pride, or send us a note about endorsing, partnering, volunteering, or anything else.',
    priority: 0.7,
    changefreq: 'monthly',
  },
  {
    url: '/contact',
    title: 'Contact | Ohio Pride',
    description:
      "Get in touch with Ohio Pride. Press, endorsements, volunteering, or scorecard corrections — here is who to email and how fast we answer.",
    ogDescription:
      "Get in touch with Ohio Pride. Have questions? Want to volunteer? We'd love to hear from you.",
    priority: 0.7,
    changefreq: 'yearly',
  },
  {
    url: '/brand',
    title: 'Brand Reference | Ohio Pride PAC',
    description:
      'Logo, color, typography, voice, and digital specs for Ohio Pride PAC. The public-facing companion to the Ohio Pride PAC Brand Guide v2.0 (May 2026).',
    ogDescription: 'Logo, color, typography, voice, and digital specs for Ohio Pride PAC.',
    type: 'article',
    priority: 0.4,
    changefreq: 'yearly',
  },
  {
    url: '/privacy',
    title: 'Privacy Policy | Ohio Pride',
    description:
      'Privacy Policy for Ohio Pride. Learn how we collect, use, and protect your personal information.',
    priority: 0.3,
    changefreq: 'yearly',
  },
  {
    url: '/terms',
    title: 'Terms of Use | Ohio Pride',
    description:
      'Terms of Use for Ohio Pride. Review the terms and conditions governing your use of our website.',
    priority: 0.3,
    changefreq: 'yearly',
  },

  /* ----- Not for the index -------------------------------------------------
   * These still get a generated head block: a noindex page that is shared in a
   * group chat should still preview correctly, and the robots tag has to be on
   * the page rather than only in the header rules. They are excluded from
   * sitemap.xml by `noindex`. */
  {
    url: '/404',
    title: 'Page Not Found | Ohio Pride',
    description: 'That page does not exist. Find bills, scores, endorsements, and events instead.',
    noindex: true,
  },
  {
    url: '/PRTraining',
    title: 'Media Prep | Ohio Pride',
    description: 'Internal media preparation material for Ohio Pride PAC spokespeople.',
    noindex: true,
  },
  {
    url: '/board-retreat',
    title: 'Board Retreat: August Availability | Ohio Pride',
    description: 'Internal availability poll for the Ohio Pride PAC board retreat.',
    noindex: true,
  },
  {
    url: '/volunteer/events/cincinnati2026',
    title: 'Cincinnati Pride 2026 Run of Show | Ohio Pride',
    description:
      'Ohio Pride run of show for Cincinnati Pride 2026. Who is marching, where and when to meet, the parade timeline, and the tabling schedule and instructions.',
    ogDescription:
      'Who is marching, where to meet, when to meet, and the tabling schedule for Cincinnati Pride 2026.',
    noindex: true,
  },
  {
    url: '/volunteer/events/columbus2026',
    title: 'Columbus Pride 2026 Run of Show | Ohio Pride',
    description:
      'Ohio Pride run of show for Columbus Pride 2026. Who is marching, where and when to meet, the parade timeline, and the tabling schedule and instructions.',
    ogDescription:
      'Who is marching, where to meet, when to meet, and the tabling schedule for Columbus Pride 2026.',
    noindex: true,
  },
];

/* ---------------------------------------------------------------------------
 * Routes served by the App Router. They carry their own `metadata` export, so
 * nothing here writes their <head>; they are listed only so the sitemap knows
 * about them. /endorsements/<slug> is appended at build time from the live
 * endorsement list instead of being hard coded.
 * ------------------------------------------------------------------------- */
export const APP_ROUTES = [
  { url: '/endorsements', priority: 0.8, changefreq: 'weekly' },
  { url: '/credits', priority: 0.3, changefreq: 'yearly' },
];

/* ---------------------------------------------------------------------------
 * Bill detail pages, derived from the data the pages themselves render.
 *
 * public/js/bill-data.js is a browser script, not a module: it declares
 * `const BILLS` and touches no browser globals. Evaluating it in a function
 * scope is enough to read it, and it means the titles here can never disagree
 * with what the page shows.
 * ------------------------------------------------------------------------- */
export function loadBills() {
  const src = readFileSync(join(ROOT, 'public/js/bill-data.js'), 'utf8');
  // eslint-disable-next-line no-new-func
  return new Function(`${src}\nreturn { BILLS, LAST_UPDATED };`)();
}

/** Trim to `max` characters on a word boundary, without a dangling ellipsis. */
export function clamp(text, max = 155) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,.;:—-]$/, '')}…`;
}

/** The registry entry for one bill, built from its row in BILLS. */
export function billPage(bill) {
  const heading = `${bill.bill}: ${bill.title}`;
  return {
    url: `/issues/${bill.id}`,
    title: `${heading} | Ohio Pride PAC`,
    description: clamp(`${bill.bill} (${bill.statusLabel}) — ${bill.description}`),
    ogTitle: clamp(heading, 88),
    ogDescription: clamp(`${bill.statusLabel}. ${bill.description}`),
    type: 'article',
    priority: 0.6,
    changefreq: 'weekly',
    breadcrumb: [{ name: 'Issues', url: '/issues' }],
    jsonLd: ['legislation'],
    bill,
  };
}

/** Every page the site owns: static pages plus one entry per tracked bill. */
export function allStaticPages() {
  const { BILLS } = loadBills();
  return [...PAGES, ...BILLS.map(billPage)];
}

/**
 * The file under public/ that answers a clean URL, or null.
 *
 * Mirrors the rewrites next.config.mjs generates: /about is about.html and
 * /signup is signup/index.html, and a page could have been written either way.
 */
export function fileFor(url) {
  const rel = url === '/' ? 'index.html' : url.replace(/^\//, '');
  for (const candidate of [`${rel}.html`, `${rel}/index.html`, rel]) {
    const full = join(PUBLIC_DIR, candidate);
    if (existsSync(full)) return full;
  }
  return null;
}

/** Every .html file under public/, as the clean URL it answers on. */
export function publicPageUrls() {
  const walk = (dir, found = []) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, found);
      else if (entry.endsWith('.html')) found.push(full);
    }
    return found;
  };
  return walk(PUBLIC_DIR)
    .map((file) => {
      const path = `/${relative(PUBLIC_DIR, file).split(sep).join('/')}`;
      return path.endsWith('/index.html')
        ? path.slice(0, -'/index.html'.length) || '/'
        : path.slice(0, -'.html'.length);
    })
    .sort();
}

/* ---------------------------------------------------------------------------
 * Structured data. Kept as plain objects so both the static page generator and
 * any future App Router port can serialize the same graph.
 * ------------------------------------------------------------------------- */

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    // Organization, not PoliticalParty: a PAC is not a party, and structured
    // data that says otherwise is a claim about a regulated entity.
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: SITE_NAME,
    alternateName: SITE_SHORT_NAME,
    url: `${SITE_URL}/`,
    logo: absolute(ORG_LOGO),
    image: absolute(DEFAULT_OG_IMAGE),
    description:
      "Ohio's only statewide political action committee for LGBTQ+ equality. Ohio Pride PAC endorses pro-equality candidates and scores all 132 state legislators.",
    email: ORG_EMAIL,
    areaServed: { '@type': 'State', name: 'Ohio' },
    contactPoint: {
      '@type': 'ContactPoint',
      email: ORG_EMAIL,
      contactType: 'general',
      areaServed: 'US-OH',
      availableLanguage: 'English',
    },
  };
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    url: `${SITE_URL}/`,
    name: SITE_SHORT_NAME,
    publisher: { '@id': `${SITE_URL}/#organization` },
    inLanguage: 'en-US',
  };
}

/**
 * A BreadcrumbList ending at the page itself. `trail` is the ancestors, in
 * order; Home is prepended here so no entry has to repeat it.
 */
export function breadcrumbJsonLd(page) {
  const trail = [{ name: 'Home', url: '/' }, ...(page.breadcrumb || [])];
  const items = [...trail, { name: crumbName(page), url: page.url }];
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absolute(item.url),
    })),
  };
}

/** The page's own name in a breadcrumb: its title without the brand suffix. */
function crumbName(page) {
  return page.crumb || page.title.split('|')[0].trim();
}

export function legislationJsonLd(page) {
  const bill = page.bill;
  return {
    '@context': 'https://schema.org',
    '@type': 'Legislation',
    name: `${bill.bill}: ${bill.title}`,
    alternateName: bill.nickname || undefined,
    legislationIdentifier: bill.bill,
    legislationType: bill.bill.startsWith('HJR') || bill.bill.startsWith('SJR')
      ? 'Joint Resolution'
      : 'Bill',
    legislationJurisdiction: 'Ohio, United States',
    // Only assert legal force for a bill that actually became law. A bill in
    // committee is not "not in force", it is not yet legislation at all, and
    // saying otherwise in structured data is a claim we cannot back.
    legislationLegalForce: bill.status === 'law' ? 'InForce' : undefined,
    description: clamp(bill.description || bill.officialTitle, 300),
    url: absolute(page.url),
    sameAs: bill.legislatureUrl || undefined,
    creator: { '@type': 'Organization', name: 'Ohio General Assembly' },
    associatedMedia: bill.textUrl
      ? { '@type': 'MediaObject', contentUrl: bill.textUrl, encodingFormat: 'application/pdf' }
      : undefined,
  };
}

export function eventJsonLd(page) {
  const e = page.event;
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: e.name,
    startDate: e.startDate,
    endDate: e.endDate,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    description: page.description,
    url: absolute(page.url),
    image: absolute(page.image || DEFAULT_OG_IMAGE),
    location: {
      '@type': 'Place',
      name: e.venue,
      address: {
        '@type': 'PostalAddress',
        streetAddress: e.street,
        addressLocality: e.city,
        addressRegion: e.region,
        postalCode: e.postalCode,
        addressCountry: 'US',
      },
    },
    organizer: { '@type': 'Organization', name: SITE_NAME, url: `${SITE_URL}/` },
  };
}

/** Every JSON-LD graph a page should carry, in document order. */
export function jsonLdFor(page) {
  const builders = {
    organization: organizationJsonLd,
    website: websiteJsonLd,
    legislation: legislationJsonLd,
    event: eventJsonLd,
  };
  const graphs = (page.jsonLd || []).map((kind) => builders[kind](page));
  // Every page below the root gets a breadcrumb, which is what lets Google
  // show the section path instead of a bare URL under the title.
  if (page.url !== '/' && !page.noindex) graphs.push(breadcrumbJsonLd(page));
  return graphs;
}
