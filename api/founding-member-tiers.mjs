/* =============================================================================
 * Netlify Function: founding-member-tiers (round 3)
 * -----------------------------------------------------------------------------
 * Returns the active founding-member tiers, including an ActBlue URL for each
 * tier so any surface that lists tiers can wrap them in real anchor tags
 * (the /founding-members tier-legend cards, the /donate/founding-member tier
 * buttons, future email blasts, etc.) without re-hardcoding the URLs.
 *
 *   GET /.netlify/functions/founding-member-tiers
 *   -> { ok: true, tiers: [
 *        { name, slug, amount_cents, amount_display, recurrence,
 *          match_mode, description, display_order,
 *          actblue_refcode_prefix, actblue_url }, ... ] }
 * ============================================================================= */

import { createClient } from '@supabase/supabase-js';

function formatAmount(cents, recurrence) {
  const dollars  = cents / 100;
  const hasCents = cents % 100 !== 0;
  const formatted = hasCents
    ? dollars.toFixed(2)
    : dollars.toLocaleString('en-US');
  return recurrence === 'monthly' ? `$${formatted}/month` : `$${formatted} one-time`;
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
    .select('name, slug, amount_cents, recurrence, match_mode, description, display_order, actblue_refcode_prefix, actblue_url')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    return new Response(
      JSON.stringify({ ok: false, error: 'supabase_query_failed', message: error.message }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }

  const tiers = (data || []).map(row => ({
    name:                   row.name,
    slug:                   row.slug,
    amount_cents:           row.amount_cents,
    amount_display:         formatAmount(row.amount_cents, row.recurrence),
    recurrence:             row.recurrence,
    match_mode:             row.match_mode,
    description:            row.description,
    display_order:          row.display_order,
    actblue_refcode_prefix: row.actblue_refcode_prefix,
    actblue_url:            row.actblue_url || null,
  }));

  return new Response(
    JSON.stringify({ ok: true, tiers, fetched_at: new Date().toISOString() }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=1800',
      },
    }
  );
};
