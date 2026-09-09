/* =============================================================================
 * Vercel Function: admin-contacts-import
 * -----------------------------------------------------------------------------
 * Imports an ActBlue CSV (donor rollup or contribution-level export) into the
 * contacts spine, mirroring the 2026-08-06 rollup reconciliation:
 *
 *   - match contacts by email (citext unique key)
 *   - fill-never-overwrite: blanks are filled, existing values are kept, and
 *     disagreements are reported back as conflicts instead of applied
 *   - create a contact for any email we have never seen (roles include donor)
 *   - contribution-level files go through the SAME reconciliation the hourly
 *     ActBlue sync uses (lib/actblue.mjs): founding refcodes create or match
 *     founding members (one per person), every payment lands in donors keyed
 *     on the ActBlue lineitem id, installments never mint a second seat.
 *
 * AUTH: Authorization: Bearer <supabase access token>; the caller must pass
 * has_permission('contacts','write'), and a contribution-level file additionally
 * requires has_permission('donors','write') because it creates founding members
 * and giving history. Writes then use the service role.
 *
 *   POST /api/admin-contacts-import   body: { csv: "<file text>", filename?, dry_run? }
 * ============================================================================= */

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../supabase-public.mjs';
import {
  parseContributionCsv, mapContribution, reconcileContributions,
  DEFAULT_FOUNDING_MATCH, norm, normEmail, isEmail,
} from '../actblue.mjs';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/* Fields that participate in fill-never-overwrite on contacts. */
const FILL_FIELDS = ['first_name', 'last_name', 'phone', 'address1', 'city', 'state', 'zip', 'employer', 'occupation'];

/* Normalizing only the incoming side turned "Kentucky" into "KE" and reported
 * a stored "45202-1234" as conflicting with its own file value. Both sides go
 * through this, and a value that is not already a US state code or ZIP is left
 * exactly as written. */
function normField(field, value) {
  const s = norm(value);
  if (!s) return '';
  if (field === 'state') return /^[A-Za-z]{2}$/.test(s) ? s.toUpperCase() : s;
  if (field === 'zip') return /^\d{5}(-?\d{4})?$/.test(s) ? s.replace(/[^0-9]/g, '').slice(0, 5) : s;
  return s;
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

  const auth = (req.headers.get('authorization') || '').match(/^Bearer (.+)$/i);
  if (!auth) return json(401, { ok: false, error: 'missing_bearer' });

  const { SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { ok: false, error: 'service_role_unconfigured' });
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${auth[1]}` } },
  });
  const { data: allowed, error: permErr } = await userClient.rpc('has_permission', {
    p_module: 'contacts', p_action: 'write',
  });
  if (permErr || !allowed) return json(403, { ok: false, error: 'not_authorized' });

  let body;
  try { body = await req.json(); } catch { return json(400, { ok: false, error: 'bad_json' }); }
  const csv = String(body?.csv || '');
  if (!csv.trim()) return json(400, { ok: false, error: 'empty_csv' });
  if (csv.length > 8 * 1024 * 1024) return json(413, { ok: false, error: 'file_too_large' });
  const dryRun = body?.dry_run === true || body?.dry_run === 'true';

  const { headers, index, records } = parseContributionCsv(csv);
  if (!records.length) return json(400, { ok: false, error: 'no_data_rows' });
  if (index.email == null) return json(400, { ok: false, error: 'no_email_column', headers });

  const isContributions = index.receipt_id != null && index.amount != null && index.date != null;
  // A contribution file no longer touches contacts alone: it creates founding
  // members and giving history through the same reconciliation the cron uses,
  // and a founding row counts toward the public 1,969 immediately. That is a
  // donors write, so ask for the donors permission rather than letting
  // contacts:write reach further than it used to.
  if (isContributions) {
    const { data: donorsWrite, error: dwErr } = await userClient.rpc('has_permission', {
      p_module: 'donors', p_action: 'write',
    });
    if (dwErr || !donorsWrite) {
      return json(403, {
        ok: false,
        error: 'donors_write_required',
        file_kind: 'contributions',
        detail: 'This file records contributions, which creates members and gifts. Ask the Director for donors write access, or import a donor rollup instead.',
      });
    }
  }
  const foundingMatch = process.env.ACTBLUE_FOUNDING_REFCODE_MATCH || DEFAULT_FOUNDING_MATCH;
  const autoPublish = ['1', 'true', 'yes', 'on'].includes(String(process.env.ACTBLUE_SYNC_AUTO_PUBLISH || '').toLowerCase());

  // Collapse the file to one record per email (first non-blank value wins for
  // identity fields); contribution rows are mapped separately.
  const byEmail = new Map();
  const contributions = [];
  const conflictsEarly = [];
  let rowsNoEmail = 0, rowsBadMoney = 0;

  for (const rec of records) {
    const email = normEmail(rec.email);
    if (!isEmail(email)) { rowsNoEmail++; continue; }
    const cur = byEmail.get(email) || { email };
    for (const f of FILL_FIELDS) {
      const v = normField(f, rec[f]);
      if (v && !cur[f]) cur[f] = v;
    }
    byEmail.set(email, cur);

    if (isContributions) {
      const m = mapContribution(rec, { foundingMatch });
      if (!m.ok) {
        if (m.reason === 'bad_date') conflictsEarly.push({ email, field: 'date', existing: '', incoming: norm(rec.date) || '(missing)' });
        else rowsBadMoney++;
        continue;
      }
      contributions.push(m);
    }
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const emails = [...byEmail.keys()];

  // Existing contacts for every email in the file, in chunks of 100.
  // Chunk small and paginate inside each chunk: PostgREST caps one response
  // (1000 rows by default on Supabase) and would truncate silently.
  const existing = new Map();
  for (let i = 0; i < emails.length; i += 100) {
    const chunk = emails.slice(i, i + 100);
    for (let from = 0; ; from += 500) {
      const { data, error } = await admin.from('contacts')
        .select('id, email, first_name, last_name, full_name, phone, address1, city, state, zip, employer, occupation, roles, sources')
        .in('email', chunk).range(from, from + 499);
      if (error) return json(500, { ok: false, error: 'contacts_read_failed', detail: error.message });
      for (const c of data || []) existing.set(String(c.email).toLowerCase(), c);
      if (!data || data.length < 500) break;
    }
  }

  let contactsCreated = 0, contactsUpdated = 0, fieldsFilled = 0;
  const conflicts = [...conflictsEarly];

  for (const [email, rec] of byEmail) {
    const cur = existing.get(email);
    if (!cur) {
      const fullName = [rec.first_name, rec.last_name].filter(Boolean).join(' ') || null;
      const insert = {
        email,
        first_name: rec.first_name || null,
        last_name: rec.last_name || null,
        full_name: fullName,
        phone: rec.phone || null,
        address1: rec.address1 || null,
        city: rec.city || null,
        state: rec.state || null,
        zip: rec.zip || null,
        employer: rec.employer || null,
        occupation: rec.occupation || null,
        roles: ['donor'],
        sources: ['actblue'],
        source: 'actblue_import',
      };
      if (dryRun) { contactsCreated++; continue; }
      const { data: created, error } = await admin.from('contacts').insert(insert).select('id').single();
      if (error) { conflicts.push({ email, field: 'insert', existing: '', incoming: error.message }); continue; }
      existing.set(email, { id: created.id, email, ...insert });
      contactsCreated++;
      continue;
    }

    const patch = {};
    for (const f of FILL_FIELDS) {
      const incoming = rec[f];
      if (!incoming) continue;
      const has = norm(cur[f]);
      if (!has) { patch[f] = incoming; fieldsFilled++; }
      else if (normField(f, has).toLowerCase() !== incoming.toLowerCase()) {
        conflicts.push({ email, field: f, existing: has, incoming });
      }
    }
    if (!(cur.roles || []).includes('donor')) patch.roles = [...new Set([...(cur.roles || []), 'donor'])];
    if (!(cur.sources || []).includes('actblue')) patch.sources = [...new Set([...(cur.sources || []), 'actblue'])];
    if ((patch.first_name || patch.last_name) && !norm(cur.full_name)) {
      patch.full_name = [patch.first_name || cur.first_name, patch.last_name || cur.last_name].filter(Boolean).join(' ') || null;
    }
    if (Object.keys(patch).length) {
      if (dryRun) { contactsUpdated++; continue; }
      const { error } = await admin.from('contacts').update(patch).eq('id', cur.id);
      if (error) conflicts.push({ email, field: 'update', existing: '', incoming: error.message });
      else contactsUpdated++;
    }
  }

  let sync = null;
  if (isContributions && contributions.length) {
    try {
      sync = await reconcileContributions(admin, contributions, { dryRun, autoPublish });
    } catch (err) {
      return json(500, { ok: false, error: 'reconcile_failed', detail: err.message });
    }
    for (const p of sync.problems) {
      conflicts.push({
        email: p.kind === 'lineitem_clash' ? 'ActBlue lineitem already recorded' : 'Contribution row',
        field: p.kind,
        existing: p.lineitem || p.receipt || '',
        incoming: p.message || (p.donor_id ? `already on gift ${p.donor_id}` : 'see the sync run log'),
      });
    }
  }

  return json(200, {
    ok: true,
    dry_run: dryRun,
    file_kind: isContributions ? 'contributions' : 'rollup',
    rows_total: records.length,
    rows_no_email: rowsNoEmail,
    rows_skipped_bad_money: rowsBadMoney,
    contacts_created: contactsCreated,
    contacts_updated: contactsUpdated,
    fields_filled: fieldsFilled,
    founding_inserted: sync?.counts.founding_inserted ?? 0,
    founding_updated: (sync?.counts.founding_updated ?? 0) + (sync?.counts.founding_adopted ?? 0),
    donors_inserted: sync?.counts.donors_inserted ?? 0,
    donors_skipped: sync?.counts.donors_skipped ?? 0,
    conflicts: conflicts.slice(0, 200),
  });
};
