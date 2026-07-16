/* =============================================================================
 * Netlify Function: scorecard
 * -----------------------------------------------------------------------------
 * Replaces /js/scorecard-data.js + /js/voting-records.js as the live data
 * source for /scorecard.html.
 *
 *   GET /.netlify/functions/scorecard
 *   -> {
 *        ok: true,
 *        last_updated,
 *        legislators: [
 *          { id, chamber, district, full_name, party, counties,
 *            floor_subscore, committee_subscore, sponsorship_subscore,
 *            composite_score, grade, sponsorships: [{ slug, role }],
 *            notes }
 *        ],
 *        roll_calls: [...],
 *        exceptions: [...]
 *      }
 *
 * The /scorecard front-end can drop this in by replacing the static
 * HOUSE_MEMBERS/SENATE_MEMBERS arrays with filters of `legislators` by chamber.
 * ============================================================================= */

import { createClient } from '@supabase/supabase-js';

const json = (status, body, cacheSeconds = 300) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds * 2}, stale-while-revalidate=1800`,
    },
  });

export default async (_req) => {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { ok: false, error: 'missing_supabase_env' }, 0);
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const [legRes, sponsRes, rollRes, excRes] = await Promise.all([
    supabase.from('legislator_scorecard').select('*'),
    supabase.from('legislator_sponsorships').select('legislator_id, bill_slug, role'),
    supabase.from('roll_calls').select('*'),
    supabase.from('legislator_vote_exceptions').select('*'),
  ]);

  if (legRes.error)   return json(500, { ok: false, error: legRes.error.message  }, 0);
  if (sponsRes.error) return json(500, { ok: false, error: sponsRes.error.message }, 0);
  if (rollRes.error)  return json(500, { ok: false, error: rollRes.error.message }, 0);
  if (excRes.error)   return json(500, { ok: false, error: excRes.error.message  }, 0);

  // Fold sponsorships into each legislator
  const sponsByLegislator = new Map();
  for (const s of sponsRes.data || []) {
    if (!sponsByLegislator.has(s.legislator_id)) sponsByLegislator.set(s.legislator_id, []);
    sponsByLegislator.get(s.legislator_id).push({ slug: s.bill_slug, role: s.role });
  }

  const legislators = (legRes.data || []).map(l => ({
    id:                   l.legislator_id,
    chamber:              l.chamber,
    district:             l.district,
    full_name:            l.full_name,
    party:                l.party,
    counties:             l.counties || [],
    headshot_url:         l.headshot_url,
    floor_subscore:       l.floor_subscore,
    committee_subscore:   l.committee_subscore,
    sponsorship_subscore: l.sponsorship_subscore,
    composite_score:      l.composite_score,
    grade:                l.grade,
    sponsorships:         sponsByLegislator.get(l.legislator_id) || [],
    notes:                l.notes,
  }));

  // last_updated is the newest updated_at across scored tables
  const allTimes = [
    ...(rollRes.data || []).map(r => r.updated_at),
    ...(excRes.data  || []).map(e => e.updated_at),
  ].filter(Boolean).sort();
  const newest = allTimes[allTimes.length - 1] || new Date().toISOString();

  return json(200, {
    ok: true,
    last_updated: newest,
    legislators,
    roll_calls: rollRes.data || [],
    exceptions: excRes.data  || [],
    fetched_at: new Date().toISOString(),
  });
};
