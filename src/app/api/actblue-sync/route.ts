import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

/**
 * Vercel Cron handler — replaces netlify/functions/actblue-sync.mjs.
 *
 * Schedule is declared in vercel.json (`crons: [{ path: '/api/actblue-sync',
 * schedule: '0 * * * *' }]`). Vercel hits this endpoint hourly with a
 * verifiable Authorization header so we can reject random callers.
 *
 * Auth: when CRON_SECRET is set in env, require Authorization: Bearer <secret>.
 *       Vercel automatically attaches this header to scheduled invocations.
 */

const LOOKBACK_HOURS = 48;
const ACTBLUE_CSV_ENDPOINT = 'https://secure.actblue.com/api/v1/contributions';

function basicAuthHeader(u: string, p: string): string {
  return 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64');
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { cur += ch; }
    } else {
      if (ch === ',') { out.push(cur); cur = ''; }
      else if (ch === '"') { inQuotes = true; }
      else { cur += ch; }
    }
  }
  out.push(cur);
  return out;
}

function parseCsv(body: string): Record<string, string>[] {
  const lines = body.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return row;
  });
}

function dollarsToCents(s: string | null | undefined): number | null {
  if (s == null) return null;
  const cleaned = String(s).replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

function isoHoursAgo(h: number): string {
  return new Date(Date.now() - h * 3600 * 1000).toISOString();
}

function detectRecurrence(row: Record<string, string>): 'monthly' | 'one_time' {
  const candidates = [
    row['Recurring Period'],
    row['Recurrence'],
    row['Is Recurring'],
    row['Monthly'],
  ].map(v => String(v || '').trim().toLowerCase());

  for (const v of candidates) {
    if (v && !['no', 'false', '0', 'one_time', 'one-time', ''].includes(v)) {
      return 'monthly';
    }
  }
  return 'one_time';
}

async function runSync() {
  const started = Date.now();
  const {
    ACTBLUE_USERNAME, ACTBLUE_PASSWORD,
    ACTBLUE_FORM_SLUG = 'ohio-pride-pac',
    ACTBLUE_FOUNDING_REFCODE_PREFIX = 'founding_',
  } = process.env;

  const supabase = getSupabase();
  if (!supabase || !ACTBLUE_USERNAME || !ACTBLUE_PASSWORD) {
    return NextResponse.json(
      { ok: false, error: 'missing required env vars (ACTBLUE_USERNAME, ACTBLUE_PASSWORD, SUPABASE_*)' },
      { status: 500 },
    );
  }

  const params = new URLSearchParams({
    start_date: isoHoursAgo(LOOKBACK_HOURS),
    end_date: new Date().toISOString(),
    format: 'csv',
  });

  let csvBody: string;
  try {
    const resp = await fetch(`${ACTBLUE_CSV_ENDPOINT}?${params}`, {
      headers: {
        Authorization: basicAuthHeader(ACTBLUE_USERNAME, ACTBLUE_PASSWORD),
        Accept: 'text/csv',
      },
    });
    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json(
        { ok: false, error: 'actblue_fetch_failed', status: resp.status, body: text.slice(0, 500) },
        { status: 502 },
      );
    }
    csvBody = await resp.text();
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: 'actblue_fetch_exception', message: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  const rows = parseCsv(csvBody);

  const matching = rows.filter(r => {
    const formSlug = (r['Form Name'] || r['Fundraising Page'] || '').trim();
    const refcode  = (r['Refcode'] || r['refcode'] || '').trim();
    return (
      formSlug === ACTBLUE_FORM_SLUG &&
      refcode.startsWith(ACTBLUE_FOUNDING_REFCODE_PREFIX)
    );
  });

  if (matching.length === 0) {
    return NextResponse.json({
      ok: true, inserted: 0, rows_seen: rows.length, ms: Date.now() - started,
    });
  }

  const enriched: Array<Record<string, unknown>> = [];
  for (const r of matching) {
    const firstName = (r['Donor First Name'] || '').trim();
    const lastName  = (r['Donor Last Name']  || '').trim();
    const fullName  = [firstName, lastName].filter(Boolean).join(' ') || 'Unknown';
    const amountCents = dollarsToCents(r['Amount']);
    const contribId = r['Receipt ID'] || r['Contribution ID'] || '';
    const refcode = (r['Refcode'] || r['refcode'] || '').trim();
    const recurrence = detectRecurrence(r);

    if (!amountCents || !contribId) continue;

    const publicNameAnswer = (r['Public Display Name'] || r['Display Name'] || '').trim();
    const fallbackDisplay = firstName && lastName
      ? `${firstName} ${lastName.charAt(0)}.`
      : (firstName || 'Anonymous');
    const displayName = publicNameAnswer || fallbackDisplay;

    const consentAnswer = (
      r['Public List Opt-In'] ||
      r['Opt-In to Public List'] ||
      r['Share my name publicly'] ||
      ''
    ).trim().toLowerCase();
    const isPublic = ['yes', 'true', '1', 'y'].includes(consentAnswer);

    const { data: tierData } = await supabase.rpc('founding_member_tier', {
      cents: amountCents,
      recurrence,
      refcode: refcode || null,
    });

    enriched.push({
      full_name: fullName,
      email: (r['Donor Email'] || '').trim().toLowerCase() || null,
      display_name: displayName,
      amount_cents: amountCents,
      recurrence,
      actblue_contribution_id: contribId,
      actblue_receipt_id: r['Receipt ID'] || null,
      contributed_at: r['Date'] || new Date().toISOString(),
      is_public: isPublic,
      is_vetted: false,
      notes: `refcode=${refcode}; tier=${tierData || 'Supporter'}`,
    });
  }

  if (enriched.length === 0) {
    return NextResponse.json({
      ok: true, inserted: 0, rows_seen: rows.length, matching: matching.length, ms: Date.now() - started,
    });
  }

  const { data, error } = await supabase
    .from('founding_members')
    .upsert(enriched, { onConflict: 'actblue_contribution_id', ignoreDuplicates: false })
    .select('id');

  if (error) {
    return NextResponse.json(
      { ok: false, error: 'supabase_upsert_failed', message: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    rows_seen: rows.length,
    rows_matched_refcode: matching.length,
    rows_written: data?.length ?? 0,
    ms: Date.now() - started,
  });
}

function authorizedCron(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return true; // no secret configured — open by default
  const auth = req.headers.get('authorization') || '';
  return auth === `Bearer ${expected}`;
}

export async function GET(req: NextRequest) {
  if (!authorizedCron(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  return runSync();
}

// Vercel Cron sends GET, but allow POST too in case of manual trigger via curl.
export async function POST(req: NextRequest) {
  if (!authorizedCron(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  return runSync();
}
