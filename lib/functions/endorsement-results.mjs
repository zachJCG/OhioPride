/* =============================================================================
 * Route: endorsement-results
 * -----------------------------------------------------------------------------
 * GET /api/endorsement-results?cycle=2026
 *   -> { ok, cycle, counts: { total, won, lost, pending },
 *        results: [ { slug, name, office, level, result, incumbent, badge,
 *                     result_note, portrait_url, profile_url } ],
 *        fetched_at }
 *
 * The home page is static HTML, so this is how it reads the results (work
 * order 7.3). App Router pages read public_endorsements directly through the
 * same lib/endorsements.mjs, so the two can never count differently.
 *
 * Reads the public view with the anon key (lib/supabase-public.mjs has a
 * literal fallback), not the service role: every field here is already
 * public, and no unset environment variable can take the home page hero down.
 *
 * Cached five minutes at the CDN. A failure is never cached, so a Supabase
 * blip cannot pin the home page to its fallback hero for five minutes.
 * ========================================================================== */

import { getEndorsementResults } from '../endorsements.mjs';
import { resultBadge, seatLabel } from '../endorsement-results.mjs';

const CACHED = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600';

const json = (status, body, cache = 'no-store') =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache },
  });

export default async function handler(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json(405, { ok: false, error: 'method_not_allowed' });
  }

  const raw = (new URL(req.url).searchParams.get('cycle') || '').trim();
  if (!/^\d{4}$/.test(raw)) return json(400, { ok: false, error: 'cycle_required' });

  // revalidate: 0 keeps Next's data cache out of it; the CDN is the one cache.
  const { ok, cycle, all, counts } = await getEndorsementResults(Number(raw), { revalidate: 0 });
  if (!ok) return json(502, { ok: false, error: 'endorsements_unavailable' });

  const results = all.map((c) => ({
    slug: c.slug,
    name: c.name,
    office: seatLabel(c),
    level: c.level,
    result: c.result,
    incumbent: c.incumbent,
    badge: resultBadge(c),
    result_note: c.resultNote,
    portrait_url: c.portrait,
    profile_url: `/endorsements/${c.slug}`,
  }));

  return json(200, { ok: true, cycle, counts, results, fetched_at: new Date().toISOString() }, CACHED);
}
