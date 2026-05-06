import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

/**
 * GET /api/board-members
 * Mirrors netlify/functions/board-members.mjs. Returns active board members
 * shaped for the /board grid.
 */
export async function GET() {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: 'missing_supabase_env' }, { status: 500 });
  }

  const { data, error } = await supabase
    .from('board_members')
    .select('name, role, chip, img_path, bio, display_order')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('name',          { ascending: true });

  if (error) {
    return NextResponse.json(
      { ok: false, error: 'supabase_query_failed', message: error.message },
      { status: 500 },
    );
  }

  const members = (data || []).map(row => ({
    name:     row.name,
    role:     row.role,
    chip:     row.chip,
    img_path: row.img_path,
    bio:      row.bio || [],
  }));

  return NextResponse.json(
    { ok: true, members, fetched_at: new Date().toISOString() },
    {
      headers: {
        'cache-control': 'public, max-age=120, s-maxage=300, stale-while-revalidate=600',
      },
    },
  );
}
