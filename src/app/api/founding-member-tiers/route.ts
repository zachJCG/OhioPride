import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

function formatAmount(cents: number, recurrence: string | null): string {
  const dollars  = cents / 100;
  const hasCents = cents % 100 !== 0;
  const formatted = hasCents
    ? dollars.toFixed(2)
    : dollars.toLocaleString('en-US');
  return recurrence === 'monthly' ? `$${formatted}/month` : `$${formatted} one-time`;
}

/**
 * GET /api/founding-member-tiers
 * Mirrors netlify/functions/founding-member-tiers.mjs.
 */
export async function GET() {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: 'missing_supabase_env' }, { status: 500 });
  }

  const { data, error } = await supabase
    .from('founding_member_tiers')
    .select('name, slug, amount_cents, recurrence, match_mode, description, display_order, actblue_refcode_prefix, actblue_url')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    return NextResponse.json(
      { ok: false, error: 'supabase_query_failed', message: error.message },
      { status: 500 },
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

  return NextResponse.json(
    { ok: true, tiers, fetched_at: new Date().toISOString() },
    {
      headers: {
        'cache-control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=1800',
      },
    },
  );
}
