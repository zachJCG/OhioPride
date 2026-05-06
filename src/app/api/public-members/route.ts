import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

/**
 * GET /api/public-members
 * Mirrors netlify/functions/public-members.mjs. Returns vetted, public-listing
 * founding members grouped by tier.
 */
export async function GET() {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: 'missing_supabase_env' }, { status: 500 });
  }

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
    return NextResponse.json(
      { ok: false, error: 'members_query_failed', message: publicMembersResult.error.message },
      { status: 500 },
    );
  }
  if (tiersResult.error) {
    return NextResponse.json(
      { ok: false, error: 'tiers_query_failed', message: tiersResult.error.message },
      { status: 500 },
    );
  }

  const members   = publicMembersResult.data || [];
  const tierOrder = new Map<string, number>(
    (tiersResult.data || []).map(t => [t.name, t.display_order]),
  );

  const byTier = new Map<string, Array<{ display_name: string; contributed_at: string }>>();
  for (const m of members) {
    if (!byTier.has(m.tier)) byTier.set(m.tier, []);
    byTier.get(m.tier)!.push({
      display_name: m.display_name,
      contributed_at: m.contributed_at,
    });
  }

  const groups = Array.from(byTier.entries())
    .map(([tier, members]) => ({
      tier,
      members,
      _order: tierOrder.get(tier) ?? 9999,
    }))
    .sort((a, b) => a._order - b._order)
    .map(({ tier, members }) => ({ tier, members }));

  return NextResponse.json(
    {
      ok: true,
      groups,
      total_public: members.length,
      fetched_at: new Date().toISOString(),
    },
    {
      headers: {
        'cache-control': 'public, max-age=60, s-maxage=120, stale-while-revalidate=600',
      },
    },
  );
}
