import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

/**
 * GET /api/founding-members-progress
 * -> { ok, member_count, goal, total_cents, percent_to_goal, fetched_at }
 *
 * Mirrors netlify/functions/founding-members-progress.mjs.
 */
export async function GET() {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: 'missing_supabase_env' }, { status: 500 });
  }

  const { data, error } = await supabase.rpc('founding_members_progress');
  if (error) {
    return NextResponse.json(
      { ok: false, error: 'supabase_rpc_failed', message: error.message },
      { status: 500 },
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json(
    {
      ok: true,
      member_count:    Number(row?.member_count    ?? 0),
      goal:            Number(row?.goal            ?? 1969),
      total_cents:     Number(row?.total_cents     ?? 0),
      percent_to_goal: Number(row?.percent_to_goal ?? 0),
      fetched_at:      new Date().toISOString(),
    },
    {
      headers: {
        'cache-control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
      },
    },
  );
}
