/* =============================================================================
 * Vercel Cron Function: actblue-sync (v3)
 * -----------------------------------------------------------------------------
 * v2 only kept contributions whose refcode started with "founding_" — but the
 * live refcodes are website_founding_member, website_donate_100, and friends,
 * so with default env the sync dropped every real donation, and it never
 * mapped employer/occupation/address. v3:
 *
 *   1. Ingests ALL contributions in the window, from every form:
 *      - founding refcodes (refcode contains "founding", overridable via
 *        ACTBLUE_FOUNDING_REFCODE_MATCH) upsert into founding_members exactly
 *        as before; the live trg_zz_fm_to_donor trigger fans each row out to
 *        donors, and trg_link_contact links/creates the canonical contact
 *      - everything else inserts into donors with source='actblue'
 *        (trg_link_contact links the contact there too)
 *   2. Maps the CSV Employer / Occupation / phone / address columns onto both
 *      inserts (donors carries the full set; founding_members carries the
 *      columns it has: city, state, employer, occupation).
 *   3. Dedupes donors on the email + receipt-ID PAIR. Receipt IDs repeat
 *      across a recurring series, so neither half is unique alone.
 *
 * Environment variables:
 *   ACTBLUE_USERNAME, ACTBLUE_PASSWORD    - ActBlue CDS API credentials
 *                                           (the cron no-ops loudly without)
 *   ACTBLUE_FOUNDING_REFCODE_MATCH        - Default "founding": any refcode
 *                                           containing it is a founding-
 *                                           member contribution
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * ============================================================================= */

import { createClient } from '@supabase/supabase-js';
import { parseCsvObjects } from '../csv.mjs';

const LOOKBACK_HOURS = 48;
const ACTBLUE_CSV_ENDPOINT = 'https://secure.actblue.com/api/v1/contributions';

function basicAuthHeader(u, p) {
  // btoa (not Node's Buffer) so this runs on the Vercel Edge runtime.
  return 'Basic ' + btoa(`${u}:${p}`);
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
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
    row['Recurring Period'], row['Recurrence'], row['Is Recurring'],
    row['Monthly'], row['Recurring Total Months'],
  ].map(v => String(v || '').trim().toLowerCase());
  for (const v of candidates) {
    if (v && !['no', 'false', '0', 'one_time', 'one-time', ''].includes(v)) return 'monthly';
  }
  return 'one_time';
}

const pick = (row, ...names) => {
  for (const n of names) {
    const v = String(row[n] ?? '').trim();
    if (v) return v;
  }
  return '';
};

export const config = { runtime: "edge" };

export default async (_req, _context) => {
  const started = Date.now();

  const {
    ACTBLUE_USERNAME, ACTBLUE_PASSWORD,
    ACTBLUE_FOUNDING_REFCODE_MATCH = 'founding',
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
  } = process.env;

  const missing = [
    ['ACTBLUE_USERNAME', ACTBLUE_USERNAME],
    ['ACTBLUE_PASSWORD', ACTBLUE_PASSWORD],
    ['SUPABASE_URL', SUPABASE_URL],
    ['SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    return json(500, { ok: false, error: `missing env vars: ${missing.join(', ')}` });
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
      return json(502, { ok: false, error: 'actblue_fetch_failed', status: resp.status, body: text.slice(0, 500) });
    }
    csvBody = await resp.text();
  } catch (err) {
    return json(502, { ok: false, error: 'actblue_fetch_exception', message: err.message });
  }

  const rows = parseCsvObjects(csvBody);
  const foundingMatch = ACTBLUE_FOUNDING_REFCODE_MATCH.toLowerCase();

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const foundingRows = [];
  const donorRows = [];
  let skippedNoKey = 0;

  for (const r of rows) {
    const firstName = pick(r, 'Donor First Name', 'First Name');
    const lastName = pick(r, 'Donor Last Name', 'Last Name');
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Unknown';
    const email = pick(r, 'Donor Email', 'Email').toLowerCase() || null;
    const amountCents = dollarsToCents(pick(r, 'Amount'));
    const receiptId = pick(r, 'Receipt ID');
    const contribId = receiptId || pick(r, 'Lineitem ID', 'Contribution ID');
    const refcode = pick(r, 'Reference Code', 'Refcode', 'refcode');
    const recurrence = detectRecurrence(r);
    const contributedAt = pick(r, 'Date', 'Paid At') || new Date().toISOString();

    if (!amountCents || !contribId) { skippedNoKey++; continue; }

    const shared = {
      phone: pick(r, 'Donor Phone', 'Phone') || null,
      address1: pick(r, 'Donor Addr1', 'Address', 'Addr1') || null,
      city: pick(r, 'Donor City', 'City') || null,
      state: pick(r, 'Donor State', 'State') || null,
      zip: pick(r, 'Donor ZIP', 'Zip', 'Donor Zip') || null,
      employer: pick(r, 'Donor Employer', 'Employer') || null,
      occupation: pick(r, 'Donor Occupation', 'Occupation') || null,
    };

    if (refcode.toLowerCase().includes(foundingMatch)) {
      const publicNameAnswer = pick(r, 'Public Display Name', 'Display Name');
      const fallbackDisplay = firstName && lastName
        ? `${firstName} ${lastName.charAt(0)}.`
        : (firstName || 'Anonymous');
      const consentAnswer = pick(r, 'Public List Opt-In', 'Opt-In to Public List', 'Share my name publicly').toLowerCase();
      foundingRows.push({
        row: {
          full_name: fullName,
          email,
          display_name: publicNameAnswer || fallbackDisplay,
          amount_cents: amountCents,
          recurrence,
          actblue_contribution_id: contribId,
          actblue_receipt_id: receiptId || null,
          contributed_at: contributedAt,
          is_public: ['yes', 'true', '1', 'y'].includes(consentAnswer),
          is_vetted: false,
          // founding_members carries a subset of the donor columns.
          city: shared.city,
          state: shared.state,
          employer: shared.employer,
          occupation: shared.occupation,
        },
        refcode,
      });
    } else {
      donorRows.push({
        full_name: fullName,
        email,
        ...shared,
        amount_cents: amountCents,
        recurrence,
        actblue_contribution_id: contribId,
        actblue_receipt_id: receiptId || null,
        refcode: refcode || null,
        contributed_at: contributedAt,
        source: 'actblue',
      });
    }
  }

  // ---- founding members: tier note via the SQL classifier, then upsert ----
  let foundingWritten = 0;
  if (foundingRows.length) {
    for (const f of foundingRows) {
      const { data: tierData } = await supabase.rpc('founding_member_tier', {
        cents: f.row.amount_cents, recurrence: f.row.recurrence, refcode: f.refcode || null,
      });
      f.row.notes = `refcode=${f.refcode}; tier=${tierData || 'Supporter'}`;
    }
    const { data, error } = await supabase
      .from('founding_members')
      .upsert(foundingRows.map(f => f.row), { onConflict: 'actblue_contribution_id', ignoreDuplicates: false })
      .select('id');
    if (error) {
      return json(500, { ok: false, error: 'founding_upsert_failed', message: error.message });
    }
    foundingWritten = data?.length ?? 0;
  }

  // ---- other donations: dedupe on the email + receipt pair, then insert ----
  let donorsInserted = 0, donorsSkipped = 0;
  if (donorRows.length) {
    const receipts = [...new Set(donorRows.map(d => d.actblue_receipt_id || d.actblue_contribution_id))];
    const seen = new Set();
    for (let i = 0; i < receipts.length; i += 200) {
      const { data, error } = await supabase.from('donors')
        .select('email, actblue_receipt_id, actblue_contribution_id')
        .in('actblue_receipt_id', receipts.slice(i, i + 200));
      if (error) return json(500, { ok: false, error: 'donors_read_failed', message: error.message });
      for (const d of data || []) {
        seen.add(`${String(d.email || '').toLowerCase()}|${d.actblue_receipt_id}`);
      }
    }
    const fresh = [];
    for (const d of donorRows) {
      const key = `${String(d.email || '').toLowerCase()}|${d.actblue_receipt_id || d.actblue_contribution_id}`;
      if (seen.has(key)) { donorsSkipped++; continue; }
      seen.add(key);
      fresh.push(d);
    }
    for (let i = 0; i < fresh.length; i += 200) {
      const chunk = fresh.slice(i, i + 200);
      const { error } = await supabase.from('donors').insert(chunk);
      if (error) {
        return json(500, { ok: false, error: 'donors_insert_failed', message: error.message, inserted_so_far: donorsInserted });
      }
      donorsInserted += chunk.length;
    }
  }

  return json(200, {
    ok: true,
    rows_seen: rows.length,
    founding_written: foundingWritten,
    donors_inserted: donorsInserted,
    donors_skipped_existing: donorsSkipped,
    rows_skipped_no_key: skippedNoKey,
    ms: Date.now() - started,
  });
};
