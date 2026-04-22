/* =============================================================================
 * Netlify Function: scorecard
 * -----------------------------------------------------------------------------
 * Returns the full legislator roster with the latest score snapshot, the four
 * hero stats shown on the /scorecard page header, and the grade-scale legend
 * used by the "How Scores Are Calculated" section.
 *
 * Endpoint (after deploy):
 *   GET /.netlify/functions/scorecard
 *   -> {
 *        ok: true,
 *        last_updated: { date: "04/22/26", time: "05:35 PM EDT", iso: "..." },
 *        stats: { legislators_scored, champions_a_plus, hostile_f, bills_tracked },
 *        grade_scale: [ { grade, label, min, color }, ... ],
 *        house:  [ { d, name, party, v, s, n, score, grade: { grade, label, color }, notes }, ... ],
 *        senate: [ { ...same shape... } ]
 *      }
 *
 * Shape matches calcScore/calcGrade output on the existing scorecard.html so
 * the renderCards() path needs no changes.
 * ============================================================================= */

import { createClient } from '@supabase/supabase-js';

function formatLastUpdated(d) {
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const yy = String(d.getUTCFullYear()).slice(2);
  const timeStr = d.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const zone = d.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'short',
  }).split(' ').pop();
  return {
    date: `${mm}/${dd}/${yy}`,
    time: `${timeStr} ${zone}`,
    iso: d.toISOString(),
  };
}

export default async (_req, _context) => {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ ok: false, error: 'missing_supabase_env' }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Active legislators with latest snapshot joined in. Scale of data is small
  // (132 rows) so we pull snapshots via a second query and merge by hand — it
  // is simpler than nesting and avoids pulling every historical snapshot.
  const [{ data: legs, error: legsErr },
         { data: snaps, error: snapsErr },
         { data: statsRows, error: statsErr },
         { data: scale, error: scaleErr }] = await Promise.all([
    supabase
      .from('legislators')
      .select('id, full_name, chamber, party, district, term_start_year, leadership_role')
      .eq('is_active', true)
      .order('chamber',  { ascending: true })
      .order('district', { ascending: true }),
    supabase
      .from('score_snapshots')
      .select('legislator_id, total_score, grade, floor_score, sponsorship_score, public_score, snapshot_at, notes')
      .order('snapshot_at', { ascending: false }),
    supabase.rpc('scorecard_stats'),
    supabase
      .from('grade_scale')
      .select('grade, label, min_score, color_hex, display_order, methodology_id, scoring_methodologies:methodology_id(is_current)')
      .order('display_order', { ascending: true }),
  ]);

  if (legsErr || snapsErr || statsErr || scaleErr) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'supabase_query_failed',
        message: (legsErr || snapsErr || statsErr || scaleErr)?.message,
      }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }

  // Build legislator_id -> latest snapshot map.
  const latestByLeg = new Map();
  (snaps || []).forEach(s => {
    if (!latestByLeg.has(s.legislator_id)) {
      latestByLeg.set(s.legislator_id, s);
    }
  });

  // Grade scale: only rows from the current methodology.
  const currentScale = (scale || [])
    .filter(g => g.scoring_methodologies?.is_current)
    .map(g => ({
      grade: g.grade,
      label: g.label,
      min:   Number(g.min_score),
      color: g.color_hex,
    }));

  // Reverse weight math so we can surface v/s/n the scorecard UI shows
  // next to each card. floor_score = v * 0.50 etc, so v = floor_score / 0.50.
  function denormalize(val, weight) {
    if (val == null) return 0;
    const raw = Number(val) / weight;
    // round to nearest integer because the scorecard card displays whole nums
    return Math.round(raw);
  }

  function gradeMeta(gradeLetter) {
    const hit = currentScale.find(g => g.grade === gradeLetter);
    return hit || { grade: gradeLetter || 'F', label: '', color: '#64748b', min: 0 };
  }

  const house = [];
  const senate = [];

  (legs || []).forEach(l => {
    const snap = latestByLeg.get(l.id);
    const v = denormalize(snap?.floor_score,        0.50);
    const s = denormalize(snap?.sponsorship_score,  0.30);
    const n = denormalize(snap?.public_score,       0.20);
    const score = snap?.total_score != null
      ? Math.round(Number(snap.total_score))
      : 50;
    const grade = gradeMeta(snap?.grade || 'F');

    // Notes: use the per-member notes from the seed snapshot if present.
    // These come from js/scorecard-data.js originally.
    const notes = snap?.notes || '';

    const row = {
      d: l.district,
      name: l.full_name,
      party: l.party,
      v, s, n,
      score,
      grade,
      notes,
      leadership_role: l.leadership_role || null,
    };

    if (l.chamber === 'house') {
      house.push(row);
    } else {
      senate.push(row);
    }
  });

  const stats = Array.isArray(statsRows) ? statsRows[0] : statsRows;

  // Newest snapshot timestamp drives the "Last updated at ..." badge.
  const newest = (snaps && snaps.length)
    ? Math.max(...snaps.map(s => new Date(s.snapshot_at).getTime()))
    : Date.now();
  const lastUpdated = formatLastUpdated(new Date(newest));

  return new Response(
    JSON.stringify({
      ok: true,
      last_updated: lastUpdated,
      stats: {
        legislators_scored: stats?.legislators_scored ?? (house.length + senate.length),
        champions_a_plus:   stats?.champions_a_plus   ?? 0,
        hostile_f:          stats?.hostile_f          ?? 0,
        bills_tracked:      stats?.bills_tracked      ?? 0,
      },
      grade_scale: currentScale,
      house,
      senate,
      fetched_at: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        // Scores change when snapshots are recomputed, which is a deliberate
        // operation. 60s is a safe cache; edge can hold 5 min.
        'cache-control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
      },
    }
  );
};
