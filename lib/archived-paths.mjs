/* ===========================================================================
 * lib/archived-paths.mjs
 * ---------------------------------------------------------------------------
 * The one list of pages archived in place after the 2026 cycle.
 *
 * An archived page keeps its URL and its body copy, and gains three things,
 * all driven from this list so they cannot drift apart:
 *
 *   - the archive banner, rendered by both templates (public/js/site-template.js
 *     reads the <meta name="ohp-archived"> marker that scripts/build-seo.mjs
 *     writes from lib/seo.mjs; app/(site)/components/ArchiveBanner.js imports
 *     this file directly)
 *   - `X-Robots-Tag: noindex, follow` from headers() in next.config.mjs, plus
 *     the matching robots meta and sitemap exclusion, which lib/seo.mjs derives
 *     for every URL here
 *   - removal from the nav, which is a hand edit the check in
 *     scripts/check-seo.mjs does not cover
 *
 * This module deliberately imports nothing. next.config.mjs, lib/seo.mjs (which
 * needs node:fs) and a client component all read it, and a dependency here
 * would reach whichever of those cannot carry it.
 * ======================================================================== */

export const ARCHIVED_PATHS = [
  '/governor-guide',
  '/governor-guide/other-candidates',
  '/vote',
  '/dragoutthevote',
  '/pride',
  '/pride/signup',
  '/volunteer/events',
  // The two run-of-show pages linked from the archived /volunteer/events.
  // Not in the work order's list, but they are 2026 Pride pages under it and
  // would otherwise be the only ones in that tree without the banner.
  '/volunteer/events/cincinnati2026',
  '/volunteer/events/columbus2026',
];

export const ARCHIVED_SET = new Set(ARCHIVED_PATHS);

/** Normalise a pathname and answer whether it is archived. */
export function isArchived(pathname) {
  if (typeof pathname !== 'string') return false;
  const path = pathname.replace(/\/+$/, '') || '/';
  return ARCHIVED_SET.has(path);
}

/* The archive banner, word for word from the copy deck. Both templates render
 * this string, so it lives here rather than in either of them. */
export const ARCHIVE_BANNER_TEXT = 'This page is archived. It covers 2026 and is no longer updated.';
export const ARCHIVE_BANNER_LINK_TEXT = 'Visit the archive';
export const ARCHIVE_URL = '/archive';
