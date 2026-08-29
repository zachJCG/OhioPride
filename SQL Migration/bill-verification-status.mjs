/* =============================================================================
 * Netlify Function: bill-verification-status
 * -----------------------------------------------------------------------------
 * Returns the daily bill-verification checklist, grouped by priority:
 *
 *   needs_verification: active bills that have not been verified in 7+
 *                       days (or ever). These are the bills where staff
 *                       needs to confirm nothing has changed.
 *
 *   recently_active:    bills whose last verification recorded new
 *                       activity (a new vote, a stage change) that may
 *                       need follow-up database updates.
 *
 *   stable:             bills confirmed within the last 7 days with no
 *                       pending activity. Listed for completeness so
 *                       the checklist shows the whole universe, but
 *                       typically the checker will skip past them.
 *
 *   inactive:           dead, signed, withdrawn, or vetoed bills.
 *                       Shown as a summary count, not listed
 *                       individually, because they do not need daily
 *                       checking.
 *
 * Response shape:
 *   {
 *     ok: true,
 *     summary: {
 *       total_active_bills: 22,
 *       needs_verification: 3,
 *       recently_active: 1,
 *       stable: 18,
 *       inactive: 0
 *     },
 *     groups: {
 *       needs_verification: [ { slug, bill_number, ... } ],
 *       recently_active:    [ ... ],
 *       stable:             [ ... ],
 *       inactive_count:     0
 *     },
 *     generated_at: "..."
 *   }
 *
 * This endpoint is meant to be consulted at the start of a daily
 * check-in session. Claude reads it, works through needs_verification
 * and recently_active in order, and records the outcome of each check
 * via the record_bill_verification() SQL function.
 * ============================================================================= */

import { createClient } from '@supabase/supabase-js';

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

  // Pull every bill with its last-verification row from the view. The
  // view already filters to active bills, so we get 22-ish rows total
  // and can bucket them in memory rather than running three separate
  // queries. At this scale the in-memory bucketing is both simpler and
  // faster than parameterized queries.
  const { data, error } = await supabase
    .from('bills_last_verified')
    .select('*')
    .order('last_verified_at', { ascending: true, nullsFirst: true })
    .order('bill_number', { ascending: true });

  if (error) {
    return new Response(
      JSON.stringify({ ok: false, error: 'supabase_query_failed', message: error.message }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }

  const rows = data || [];

  // Bucket bills into the three priority groups. The view does most
  // of the decision work already via the needs_verification flag and
  // the last_verification_outcome field, so this loop is mostly
  // routing rather than deciding.
  const needsVerification = [];
  const recentlyActive = [];
  const stable = [];

  for (const r of rows) {
    // "recently active" takes precedence: if the last check recorded
    // new activity, the bill belongs in that bucket regardless of how
    // long ago the check was. The daily workflow should resolve new
    // activity before re-verifying stable bills.
    if (r.last_verification_outcome === 'new_activity' ||
        r.last_verification_outcome === 'drift_detected') {
      recentlyActive.push(shape(r));
      continue;
    }

    if (r.needs_verification) {
      needsVerification.push(shape(r));
      continue;
    }

    stable.push(shape(r));
  }

  return new Response(
    JSON.stringify({
      ok: true,
      summary: {
        total_active_bills: rows.length,
        needs_verification: needsVerification.length,
        recently_active: recentlyActive.length,
        stable: stable.length,
      },
      groups: {
        needs_verification: needsVerification,
        recently_active: recentlyActive,
        stable: stable,
      },
      generated_at: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        // Do not cache aggressively. The checker wants the freshest
        // possible view each time they run through the daily routine.
        // A 30-second edge cache is plenty to protect against rapid
        // refreshes during a check session.
        'cache-control': 'public, max-age=10, s-maxage=30',
      },
    }
  );
};

// Turn a view row into the shape the checker wants to see. Keeps only
// the fields useful for decision-making at the daily-check level. The
// full bill record is still available via the /bills endpoint if the
// checker needs detail.
function shape(r) {
  return {
    slug: r.slug,
    bill_number: r.bill_number,
    stance: r.stance,
    status_label: r.status_label,
    status_slug: r.status_slug,
    last_action: r.last_action,
    legislature_url: r.legislature_url,

    last_verified_at: r.last_verified_at,
    last_verified_by: r.last_verified_by,
    last_verification_outcome: r.last_verification_outcome,
    last_verification_notes: r.last_verification_notes,

    // Round to 1 decimal so the checker sees "3.2 days" rather than
    // "3.184571 days". Null if never verified.
    days_since_verified: r.days_since_verified !== null
      ? Math.round(r.days_since_verified * 10) / 10
      : null,
  };
}
