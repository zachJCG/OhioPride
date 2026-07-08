/* =============================================================================
 * Vercel Cron Function: actblue-sync (v2)
 * -----------------------------------------------------------------------------
 * Scheduled hourly via the `crons` entry in vercel.json (Vercel Pro). Can also
 * be triggered manually from the Vercel dashboard ("Run now") or with a GET
 * carrying the CRON_SECRET bearer token.
 *
 * Replaces the v1 sync function from migration round 1. The key changes:
 *
 *   1. Filters contributions by `refcode` prefix rather than form name. This
 *      matches how the Ohio Pride website actually wires its ActBlue buttons:
 *      a single `ohio-pride-pac` form with different refcodes for different
 *      source pages (founding_stonewall_, founding_builder_, etc.).
 *
 *   2. Records a `recurrence` signal ('monthly' | 'one_time') by looking at
 *      whether the ActBlue row marks the contribution as recurring. This is
 *      what the new founding_member_tier() SQL function needs to classify
 *      the tier correctly.
 *
 *   3. Calls the SQL tier classifier once per row so the resulting tier name
 *      is always derived from the single source of truth in Postgres.
 *
 * Environment variables required:
 *
 *   ACTBLUE_USERNAME, ACTBLUE_PASSWORD  - ActBlue CDS API credentials
 *   ACTBLUE_FORM_SLUG                   - Default: "ohio-pride-pac"
 *   ACTBLUE_FOUNDING_REFCODE_PREFIX     - Default: "founding_". Any
 *                                         contribution whose refcode starts
 *                                         with this prefix is treated as a
 *                                         founding-member contribution.
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   CRON_SECRET (optional)              - When set, Vercel sends it as
 *                                         `Authorization: Bearer <secret>` on
 *                                         cron invocations and we reject any
 *                                         request without it.
 * ============================================================================= */

import { createClient } from '@supabase/supabase-js';

const LOOKBACK_HOURS = 48;
const ACTBLUE_CSV_ENDPOINT = 'https://secure.actblue.com/api/v1/contributions';

function basicAuthHeader(u, p) {
  return 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64');
}

function splitCsvLine(line) {
  const out = [];
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

function parseCsv(body) {
  const lines = body.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return row;
  });
}

function dollarsToCents(s) {
  if (s == null) return null;
  const cleaned = String(s).replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

function isoHoursAgo(h) {
  return new Date(Date.now() - h * 3600 * 1000).toISOString();
}

function detectRecurrence(row) {
  // ActBlue's CDS column naming varies. We check every known variant and
  // treat any non-empty, non-"no" value as a recurring contribution.
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

export default async function handler(req, res) {
  const started = Date.now();

  // When CRON_SECRET is configured, only Vercel Cron (or a caller who knows
  // the secret) may trigger the sync.
  if (process.env.CRON_SECRET) {
    const auth = req.headers['authorization'] || '';
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
  }

  const {
    ACTBLUE_USERNAME, ACTBLUE_PASSWORD,
    ACTBLUE_FORM_SLUG = 'ohio-pride-pac',
    ACTBLUE_FOUNDING_REFCODE_PREFIX = 'founding_',
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
  } = process.env;

  const missing = [
    ['ACTBLUE_USERNAME', ACTBLUE_USERNAME],
    ['ACTBLUE_PASSWORD', ACTBLUE_PASSWORD],
    ['SUPABASE_URL', SUPABASE_URL],
    ['SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY],
  ].filter(([, v]) => !v).map(([k]) => k);

  if (missing.length) {
    return res.status(500).json({ ok: false, error: `missing env vars: ${missing.join(', ')}` });
  }

  const params = new URLSearchParams({
    start_date: isoHoursAgo(LOOKBACK_HOURS),
    end_date: new Date().toISOString(),
    format: 'csv',
  });

  let csvBody;
  try {
    const resp = await fetch(`${ACTBLUE_CSV_ENDPOINT}?${params}`, {
      headers: {
        Authorization: basicAuthHeader(ACTBLUE_USERNAME, ACTBLUE_PASSWORD),
        Accept: 'text/csv',
      },
    });
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(502).json({ ok: false, error: 'actblue_fetch_failed', status: resp.status, body: text.slice(0, 500) });
    }
    csvBody = await resp.text();
  } catch (err) {
    return res.status(502).json({ ok: false, error: 'actblue_fetch_exception', message: err.message });
  }

  const rows = parseCsv(csvBody);

  // Two-part filter: must be the right form AND have a founding refcode.
  // That separates founding contributions from regular donations that happen
  // to hit the same ActBlue page.
  const matching = rows.filter(r => {
    const formSlug = (r['Form Name'] || r['Fundraising Page'] || '').trim();
    const refcode  = (r['Refcode'] || r['refcode'] || '').trim();
    return (
      formSlug === ACTBLUE_FORM_SLUG &&
      refcode.startsWith(ACTBLUE_FOUNDING_REFCODE_PREFIX)
    );
  });

  if (matching.length === 0) {
    return res.status(200).json({ ok: true, inserted: 0, rows_seen: rows.length, ms: Date.now() - started });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const enriched = [];
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

    // Classify via the SQL function so tier logic lives in one place.
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
    return res.status(200).json({ ok: true, inserted: 0, rows_seen: rows.length, matching: matching.length, ms: Date.now() - started });
  }

  const { data, error } = await supabase
    .from('founding_members')
    .upsert(enriched, { onConflict: 'actblue_contribution_id', ignoreDuplicates: false })
    .select('id');

  if (error) {
    return res.status(500).json({ ok: false, error: 'supabase_upsert_failed', message: error.message });
  }

  return res.status(200).json({
    ok: true,
    rows_seen: rows.length,
    rows_matched_refcode: matching.length,
    rows_written: data?.length ?? 0,
    ms: Date.now() - started,
  });
}
