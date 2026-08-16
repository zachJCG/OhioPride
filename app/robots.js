/* /robots.txt — generated, replacing the hand-written public/robots.txt.
 *
 * That file pointed at the sitemap and blocked /admin. This adds /api, which
 * was crawlable outright, and declares the canonical host so a crawler that
 * finds the apex domain knows which spelling to keep.
 *
 * The disallow list lives in lib/seo.mjs next to the note explaining why the
 * internal noindex pages are deliberately NOT in it.
 */

import { DISALLOWED_PATHS, SITE_URL } from '../lib/seo.mjs';

export default function robots() {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: DISALLOWED_PATHS }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
