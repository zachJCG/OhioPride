/* =============================================================================
 * Netlify Function: founding-member-tiers
 * -----------------------------------------------------------------------------
 * Returns the active founding-member tiers for the public /founding-members
 * page. This replaces the five hardcoded tier cards currently inline in that
 * page's HTML.
 *
 * The response shape is intentionally verbose, including both the raw cents
 * value and a human-formatted display string for each tier, so the front-end
 * can render the same data in different layouts (the tier legend cards, the
 * ActBlue button labels, the tier-group headers in the member list) without
 * repeating the formatting logic on the client.
 *
 * Endpoint (after deploy):
 *   GET /.netlify/functions/founding-member-tiers
 *   -> { ok: true, tiers: [ { name, slug, amount_cents, amount_display,
 *                              recurrence, description, display_order }, ... ] }
 * ============================================================================= */

import { createClient } from '@supabase/supabase-js';

function formatAmount(cents, recurrence) {
  // Cents to dollars. We show two decimals only when the fractional part is
  // non-zero (so $19.69 shows two decimals, but $50 shows none). This matches
  // the formatting convention on the current /founding-members page.
  const dollars = cents / 100;
  const hasCents = cents % 100 !== 0;
  const formatted = hasCents
    ? dollars.toFixed(2)
    : dollars.toLocaleString('en-US');

  if (recurrence === 'monthly') {
    return `$${formatted}/month`;
  }
  return `$${formatted} one-time`;
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

  const { data, error } = await supabase
    .from('founding_member_tiers')
    .select('name, slug, amount_cents, recurrence, description, display_order, actblue_refcode_prefix')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    return new Response(
      JSON.stringify({ ok: false, error: 'supabase_query_failed', message: error.message }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }

  const tiers = (data || []).map(row => ({
    name:           row.name,
    slug:           row.slug,
    amount_cents:   row.amount_cents,
    amount_display: formatAmount(row.amount_cents, row.recurrence),
    recurrence:     row.recurrence,
    description:    row.description,
    display_order:  row.display_order,
    // Helpful for building tier-specific ActBlue URLs on the client:
    actblue_refcode_prefix: row.actblue_refcode_prefix,
  }));

  return new Response(
    JSON.stringify({ ok: true, tiers, fetched_at: new Date().toISOString() }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        // Tiers change rarely. 10 minutes at edge, 5 minutes in browser.
        'cache-control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=1800',
      },
    }
  );
};
