import { readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/* ===========================================================================
 * Ohio Pride PAC: Next.js configuration.
 *
 * The site is mid migration. Every page still ships as static HTML under
 * public/, and Next serves it; routes are ported to the App Router one at a
 * time. Two consequences shape this file:
 *
 * 1. Clean URLs used to come from "cleanUrls": true in vercel.json, which is
 *    a platform feature for static deployments. Under a framework preset the
 *    framework owns routing, so the equivalent rules are generated here by
 *    walking public/ for .html files. Generating beats hand maintaining a
 *    hundred rules that drift the moment somebody adds a bill page.
 *
 * 2. The rewrites are afterFiles, which runs only when nothing else matched.
 *    So the day /scorecard becomes a real app/scorecard/page.js, the real
 *    route wins and its generated rewrite silently stops firing. That is what
 *    makes the migration incremental: porting a page needs no change here.
 * ======================================================================== */

// Anchored to this file, not to the working directory: Next evaluates the
// config from its own build directory, where a bare 'public' does not resolve.
const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), 'public');

/** Absolute paths of every .html file under public/. */
function htmlFiles(dir = PUBLIC_DIR, found = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) htmlFiles(full, found);
    else if (entry.endsWith('.html')) found.push(full);
  }
  return found;
}

/**
 * Map a file to the URL it must answer on.
 *   public/index.html                  -> /
 *   public/about.html                  -> /about
 *   public/admin/dashboard/index.html  -> /admin/dashboard
 */
function urlPathFor(file) {
  return '/' + relative(PUBLIC_DIR, file).split(sep).join('/');
}

function cleanUrlFor(file) {
  const path = urlPathFor(file);
  if (path.endsWith('/index.html')) return path.slice(0, -'/index.html'.length) || '/';
  return path.slice(0, -'.html'.length);
}

/* Pages already ported to real App Router routes. Their public/*.html file is
 * deleted, so the generated rules below no longer cover them, but the old
 * .html URL should still land on the page rather than 404 for anyone holding
 * an old link. Add a clean URL here when you delete its static file. */
const PORTED = ['/credits'];

// 404.html is served by Next's not-found handling, not by a rewrite, so it
// must not claim the /404 URL.
const pages = htmlFiles()
  .map((file) => ({ file: urlPathFor(file), url: cleanUrlFor(file) }))
  .filter((p) => p.url !== '/404');

const nextConfig = {
  trailingSlash: false,
  // The static pages are hand written HTML; Next's bundler never sees them.
  reactStrictMode: true,

  async redirects() {
    return [
      // Requesting the file directly lands on the canonical clean URL, which
      // is what cleanUrls did. Without this the same page answers on two URLs.
      ...pages.map((p) => ({ source: p.file, destination: p.url, permanent: true })),
      ...PORTED.map((url) => ({ source: `${url}.html`, destination: url, permanent: true })),

      // Section landing pages.
      { source: '/admin', destination: '/admin/login', permanent: false },
      { source: '/admin/finance', destination: '/admin/finance/budget', permanent: false },
      { source: '/admin/compliance', destination: '/admin/compliance/contributions', permanent: false },
      { source: '/admin/endorsements/login', destination: '/admin/login', permanent: true },

      // Spelling variants and legacy URLs.
      { source: '/governorguide', destination: '/governor-guide', permanent: true },
      { source: '/govenorguide', destination: '/governor-guide', permanent: true },
      // No /prtraining rule here on purpose. Next matches sources
      // case-insensitively, so a lowercase-to-capitalised redirect matches its
      // own destination and loops forever. The generated rewrite below answers
      // both spellings without a redirect.
      { source: '/scorecard/methodology', destination: '/methodology', permanent: true },
      { source: '/gala', destination: '/', permanent: true },
      { source: '/sponsorship', destination: '/', permanent: true },
      { source: '/priorities', destination: '/', permanent: true },
    ];
  },

  async rewrites() {
    return {
      // afterFiles: real routes and real files win first. Everything below is
      // the fallback that keeps the not-yet-ported pages reachable.
      afterFiles: [
        ...pages.map((p) => ({ source: p.url, destination: p.file })),

        // Aliases that serve another page's HTML without changing the URL.
        { source: '/rsvp', destination: '/launch-day.html' },
        { source: '/internships', destination: '/volunteer.html?path=internship' },
        { source: '/apply/:position', destination: '/volunteer.html?path=internship&position=:position' },
        { source: '/admin/finance/budget/revenue', destination: '/admin/finance/budget/index.html' },
        { source: '/admin/finance/budget/expense', destination: '/admin/finance/budget/index.html' },

        // Compatibility net for pages cached before the Netlify layer was
        // retired. Safe to delete once the logs stop showing hits.
        { source: '/.netlify/functions/:name', destination: '/api/:name' },
      ],
    };
  },

  async headers() {
    const noindex = { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' };
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
        ],
      },
      {
        source: '/assets/img/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/assets/:dir(logo|favicon|board|endorsements|social)/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' }],
      },
      {
        source: '/:dir(css|js)/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=600, stale-while-revalidate=86400' }],
      },

      // Internal surfaces stay out of the index. /governor-guide also carries
      // a robots meta tag; the header is what covers non-rendering crawlers.
      { source: '/admin/:path*', headers: [noindex] },
      { source: '/board-retreat/:path*', headers: [noindex] },
      { source: '/PRTraining', headers: [noindex] },
      { source: '/governor-guide', headers: [noindex] },
    ];
  },
};

export default nextConfig;
