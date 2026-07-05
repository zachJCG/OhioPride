/* =============================================================================
 * Vercel Function: founding-member-tiers
 * -----------------------------------------------------------------------------
 * Returns the active founding-member tiers, including an ActBlue URL for each
 * tier so any surface that lists tiers can wrap them in real anchor tags
 * (the /founding-members tier-legend cards, the /donate/founding-member tier
 * buttons, future email blasts, etc.) without re-hardcoding the URLs.
 *
 *   GET /api/founding-member-tiers
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

export default async function handler(_req, res) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ ok: false, error: 'missing_supabase_env' });
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
    return res.status(500).json({ ok: false, error: 'supabase_query_failed', message: error.message });
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

  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=1800');
  return res.status(200).json({ ok: true, tiers, fetched_at: new Date().toISOString() });
}
