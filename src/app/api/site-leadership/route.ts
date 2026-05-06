import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

const ENTITY_LEGAL_NAMES: Record<string, string> = {
  pac: 'Ohio Pride PAC',
  c4:  'Ohio Pride Action',
  c3:  'Ohio Pride Foundation',
};

interface OfficerRow {
  title: string;
  full_name: string;
  required_on_disclaimer: boolean;
}

function buildDisclaimer(entity: string, officers: OfficerRow[]): string {
  const entityName = ENTITY_LEGAL_NAMES[entity] || 'Ohio Pride PAC';
  const required = officers.filter(o => o.required_on_disclaimer);
  if (required.length === 0) return `Paid for by ${entityName}.`;
  const officerParts = required.map(o => `${o.full_name}, ${o.title}.`).join(' ');
  return `Paid for by ${entityName}. ${officerParts}`;
}

/**
 * GET /api/site-leadership?entity=pac|c4|c3
 * Mirrors netlify/functions/site-leadership.mjs.
 */
export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: 'missing_supabase_env' }, { status: 500 });
  }

  const requested = (req.nextUrl.searchParams.get('entity') || '').trim().toLowerCase();
  const entity = ['pac', 'c4', 'c3'].includes(requested) ? requested : 'pac';

  const { data, error } = await supabase
    .from('site_leadership')
    .select('title, full_name, is_required_on_disclaimer, display_order')
    .eq('entity', entity)
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    return NextResponse.json(
      { ok: false, error: 'supabase_query_failed', message: error.message },
      { status: 500 },
    );
  }

  const officers: OfficerRow[] = (data || []).map(row => ({
    title: row.title,
    full_name: row.full_name,
    required_on_disclaimer: row.is_required_on_disclaimer,
  }));

  return NextResponse.json(
    {
      ok: true,
      entity,
      entity_legal_name: ENTITY_LEGAL_NAMES[entity],
      officers,
      disclaimer: buildDisclaimer(entity, officers),
      fetched_at: new Date().toISOString(),
    },
    {
      headers: {
        'cache-control': 'public, max-age=300, s-maxage=900, stale-while-revalidate=3600',
      },
    },
  );
}
