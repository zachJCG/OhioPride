import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

const normaliseZip = (raw: string | null): string | null => {
  const digits = String(raw || '').replace(/[^0-9]/g, '');
  if (!digits) return null;
  return digits.slice(0, 5).padStart(5, '0');
};

/**
 * GET /api/zip-county-lookup?zip=45420
 * Mirrors netlify/functions/zip-county-lookup.mjs.
 */
export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'missing_supabase_env' }, { status: 500 });
  }

  const zip = normaliseZip(req.nextUrl.searchParams.get('zip'));
  if (!zip) {
    return NextResponse.json({ error: 'missing zip' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('ohio_zip_primary_county')
    .select('zip, county_fips, county_name, usps_city, usps_state')
    .eq('zip', zip)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { zip, county_name: null },
      {
        status: 404,
        headers: { 'cache-control': 'public, max-age=300' },
      },
    );
  }

  return NextResponse.json(data, {
    headers: { 'cache-control': 'public, max-age=86400, s-maxage=86400' },
  });
}
