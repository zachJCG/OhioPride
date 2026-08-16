/* /sitemap.xml — generated, not hand maintained.
 *
 * This replaces public/sitemap.xml, which had drifted: it was missing /about,
 * /board, /volunteer, /brand and five bill pages, and it listed each endorsed
 * candidate by hand with a comment asking whoever adds one to remember to come
 * back here. Nobody remembers.
 *
 * Three sources, all of which are already the truth for something else:
 *
 *   lib/seo.mjs        every static page and every tracked bill
 *   APP_ROUTES         the pages ported to the App Router
 *   public_endorsements  one URL per endorsed candidate, live
 *
 * A page marked `noindex` in the registry is excluded here as well, so the two
 * signals cannot contradict each other.
 */

import {
  APP_ROUTES,
  SITE_URL,
  absolute,
  allStaticPages,
} from '../lib/seo.mjs';
import { ENDORSEMENT_CONTENT } from '../lib/endorsement-content.mjs';
import { getEndorsements } from '../lib/endorsements.mjs';

/* Endorsements come from Supabase, so the sitemap follows the same cadence as
 * /endorsements rather than freezing at deploy time. */
export const revalidate = 600;

export default async function sitemap() {
  const entries = [
    ...allStaticPages()
      .filter((page) => !page.noindex)
      .map((page) => ({
        url: absolute(page.url),
        changeFrequency: page.changefreq || 'monthly',
        priority: page.priority ?? 0.5,
      })),
    ...APP_ROUTES.map((route) => ({
      url: absolute(route.url),
      changeFrequency: route.changefreq,
      priority: route.priority,
    })),
  ];

  /* Live list first; the hand-written profiles in endorsement-content.mjs are
   * the floor. If Supabase is unreachable during a build, the candidates who
   * already have a written profile still make the sitemap instead of silently
   * dropping out of the index. */
  const { candidates } = await getEndorsements();
  const slugs = new Set([
    ...candidates.map((c) => c.slug),
    ...ENDORSEMENT_CONTENT.map((c) => c.slug),
  ]);
  for (const slug of slugs) {
    entries.push({
      url: `${SITE_URL}/endorsements/${slug}`,
      changeFrequency: 'monthly',
      priority: 0.7,
    });
  }

  return entries;
}
