import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

interface LegislatorRow {
  legislator_id: string;
  chamber: string;
  district: number | string;
  full_name: string;
  party: string;
  counties: string[] | null;
  headshot_url: string | null;
  floor_subscore: number | null;
  committee_subscore: number | null;
  sponsorship_subscore: number | null;
  composite_score: number | null;
  grade: string | null;
  notes: string | null;
}

interface SponsorshipRow {
  legislator_id: string;
  bill_slug: string;
  role: string;
}

/**
 * GET /api/scorecard
 * Mirrors netlify/functions/scorecard.mjs.
 */
export async function GET() {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: 'missing_supabase_env' }, { status: 500 });
  }

  const [legRes, sponsRes, rollRes, excRes] = await Promise.all([
    supabase.from('legislator_scorecard').select('*'),
    supabase.from('legislator_sponsorships').select('legislator_id, bill_slug, role'),
    supabase.from('roll_calls').select('*'),
    supabase.from('legislator_vote_exceptions').select('*'),
  ]);

  if (legRes.error)   return NextResponse.json({ ok: false, error: legRes.error.message   }, { status: 500 });
  if (sponsRes.error) return NextResponse.json({ ok: false, error: sponsRes.error.message }, { status: 500 });
  if (rollRes.error)  return NextResponse.json({ ok: false, error: rollRes.error.message  }, { status: 500 });
  if (excRes.error)   return NextResponse.json({ ok: false, error: excRes.error.message   }, { status: 500 });

  const sponsByLegislator = new Map<string, Array<{ slug: string; role: string }>>();
  for (const s of (sponsRes.data || []) as SponsorshipRow[]) {
    if (!sponsByLegislator.has(s.legislator_id)) sponsByLegislator.set(s.legislator_id, []);
    sponsByLegislator.get(s.legislator_id)!.push({ slug: s.bill_slug, role: s.role });
  }

  const legislators = ((legRes.data || []) as LegislatorRow[]).map(l => ({
    id:                   l.legislator_id,
    chamber:              l.chamber,
    district:             l.district,
    full_name:            l.full_name,
    party:                l.party,
    counties:             l.counties || [],
    headshot_url:         l.headshot_url,
    floor_subscore:       l.floor_subscore,
    committee_subscore:   l.committee_subscore,
    sponsorship_subscore: l.sponsorship_subscore,
    composite_score:      l.composite_score,
    grade:                l.grade,
    sponsorships:         sponsByLegislator.get(l.legislator_id) || [],
    notes:                l.notes,
  }));

  const allTimes = [
    ...((rollRes.data || []) as Array<{ updated_at: string | null }>).map(r => r.updated_at),
    ...((excRes.data  || []) as Array<{ updated_at: string | null }>).map(e => e.updated_at),
  ].filter((t): t is string => Boolean(t)).sort();
  const newest = allTimes[allTimes.length - 1] || new Date().toISOString();

  return NextResponse.json(
    {
      ok: true,
      last_updated: newest,
      legislators,
      roll_calls: rollRes.data || [],
      exceptions: excRes.data  || [],
      fetched_at: new Date().toISOString(),
    },
    {
      headers: {
        'cache-control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=1800',
      },
    },
  );
}
