/* =============================================================================
 * Netlify Function: public-members
 * -----------------------------------------------------------------------------
 * Returns the list of founding members who have both consented to public
 * listing AND been vetted by an organizer. Grouped by tier so the front-end
 * can render the same "tier-group" layout currently hardcoded in
 * /founding-members.html (Stonewall Sustainer / Founding Member / etc.).
 *
 * This endpoint reads from the `founding_members_public` view, which is the
 * safe projection created in migration 1. That view exposes only display_name,
 * tier, and contributed_at - no email, no full_name, no internal notes.
 *
 * Response shape:
 *   {
 *     ok: true,
 *     groups: [
 *       { tier: "Stonewall Sustainer", members: [ { display_name, contributed_at }, ... ] },
 *       { tier: "Founding Member",     members: [ ... ] },
 *       ...
 *     ],
 *     total_public: 14,
 *     fetched_at: "..."
 *   }
 *
 * Groups come back in the display_order defined on founding_member_tiers, and
 * tiers with zero members are omitted entirely so the page does not render
 * empty tier headers.
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

  // Pull the safe view and the tier ordering table in parallel. We need the
  // tier table only to get the canonical display_order so groups render in
  // the same sequence as the tier legend cards above them.
  const [publicMembersResult, tiersResult] = await Promise.all([
    supabase
      .from('founding_members_public')
      .select('display_name, tier, contributed_at')
      .order('contributed_at', { ascending: true }),
    supabase
      .from('founding_member_tiers')
      .select('name, display_order')
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
  ]);

  if (publicMembersResult.error) {
    return new Response(
      JSON.stringify({ ok: false, error: 'members_query_failed', message: publicMembersResult.error.message }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
  if (tiersResult.error) {
    return new Response(
      JSON.stringify({ ok: false, error: 'tiers_query_failed', message: tiersResult.error.message }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }

  const members = publicMembersResult.data || [];
  const tierOrder = new Map(
    (tiersResult.data || []).map(t => [t.name, t.display_order])
  );

  // Group members by tier. We use a Map here rather than a plain object so
  // insertion order is preserved reliably across JS engines.
  const byTier = new Map();
  for (const m of members) {
    if (!byTier.has(m.tier)) byTier.set(m.tier, []);
    byTier.get(m.tier).push({
      display_name: m.display_name,
      contributed_at: m.contributed_at,
    });
  }

  // Build groups array sorted by tier display_order. Tiers not defined in the
  // tier table (unusual — happens if someone donated under a legacy tier name)
  // are sent to the end rather than dropped.
  const groups = Array.from(byTier.entries())
    .map(([tier, members]) => ({
      tier,
      members,
      _order: tierOrder.get(tier) ?? 9999,
    }))
    .sort((a, b) => a._order - b._order)
    .map(({ tier, members }) => ({ tier, members }));

  return new Response(
    JSON.stringify({
      ok: true,
      groups,
      total_public: members.length,
      fetched_at: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        // Member list can change whenever vetting happens. Shorter cache than
        // the tier list, but still cached at the edge to protect Supabase
        // under launch-day traffic.
        'cache-control': 'public, max-age=60, s-maxage=120, stale-while-revalidate=600',
      },
    }
  );
};
