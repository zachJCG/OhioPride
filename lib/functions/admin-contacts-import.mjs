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
 *   - contribution-level files also insert donors rows, deduped on the
 *     email + receipt-ID pair (receipt IDs repeat across recurring series,
 *     so neither half is unique alone)
 *
 * AUTH: Authorization: Bearer <supabase access token>; the caller must pass
 * has_permission('contacts','write'). Writes then use the service role.
 *
 *   POST /api/admin-contacts-import   body: { csv: "<file text>", filename? }
 * ============================================================================= */

import { createClient } from '@supabase/supabase-js';
import { parseCsv } from '../csv.mjs';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

const norm = (s) => String(s || '').trim();
const normKey = (s) => norm(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/* Column aliases across ActBlue export flavors and hand-built rollups. */
const COLUMNS = {
  email:      ['donor email', 'email', 'email address'],
  first_name: ['donor first name', 'first name', 'firstname', 'first'],
  last_name:  ['donor last name', 'last name', 'lastname', 'last'],
  phone:      ['donor phone', 'phone', 'phone number'],
  address1:   ['donor addr1', 'address', 'address 1', 'addr1', 'street address'],
  city:       ['donor city', 'city'],
  state:      ['donor state', 'state'],
  zip:        ['donor zip', 'zip', 'zip code', 'postal code'],
  employer:   ['donor employer', 'employer'],
  occupation: ['donor occupation', 'occupation'],
  amount:     ['amount', 'contribution amount', 'total amount', 'total'],
  date:       ['date', 'paid at', 'contribution date'],
  receipt_id: ['receipt id', 'receipt', 'receipt number'],
  lineitem_id:['lineitem id', 'line item id', 'contribution id'],
  refcode:    ['reference code', 'refcode', 'reference code 2 one time use', 'source code'],
  recurring:  ['recurring total months', 'recurrence', 'recurring period', 'is recurring', 'monthly'],
  kind:       ['kind', 'payment kind'],
};

function headerMap(headerRow) {
  const idx = {};
  const keys = headerRow.map(normKey);
  for (const [field, aliases] of Object.entries(COLUMNS)) {
    for (const alias of aliases) {
      const at = keys.indexOf(alias);
      if (at !== -1) { idx[field] = at; break; }
    }
  }
  return idx;
}

/* Fields that participate in fill-never-overwrite on contacts. */
const FILL_FIELDS = ['first_name', 'last_name', 'phone', 'address1', 'city', 'state', 'zip', 'employer', 'occupation'];

export default async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

  const auth = (req.headers.get('authorization') || '').match(/^Bearer (.+)$/i);
  if (!auth) return json(401, { ok: false, error: 'missing_bearer' });

  const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { ok: false, error: 'server_misconfigured' });
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

  const rows = parseCsv(csv);
  if (rows.length < 2) return json(400, { ok: false, error: 'no_data_rows' });
  const idx = headerMap(rows[0]);
  if (idx.email == null) return json(400, { ok: false, error: 'no_email_column', headers: rows[0] });

  const isContributions = idx.receipt_id != null && idx.amount != null && idx.date != null;

  const get = (row, field) => idx[field] != null ? norm(row[idx[field]]) : '';

  // Collapse the file to one record per email (last-write wins for identity
  // fields; contribution rows accumulate).
  const byEmail = new Map();
  const contributions = [];
  const conflictsEarly = [];
  let rowsNoEmail = 0, rowsBadMoney = 0;

  for (const row of rows.slice(1)) {
    const email = get(row, 'email').toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { rowsNoEmail++; continue; }
    const rec = byEmail.get(email) || { email };
    for (const f of FILL_FIELDS) {
      const v = get(row, f);
      if (v && !rec[f]) rec[f] = v;
    }
    byEmail.set(email, rec);

    if (isContributions) {
      const receipt = get(row, 'receipt_id');
      const dollars = parseFloat(get(row, 'amount').replace(/[$,]/g, ''));
      if (!receipt || !(dollars > 0)) { rowsBadMoney++; continue; }
      const recurringRaw = get(row, 'recurring').toLowerCase();
      const monthly = recurringRaw && !['', '0', 'no', 'false', 'one-time', 'one_time', 'once', 'n/a'].includes(recurringRaw);
      // donors.contributed_at is NOT NULL; a garbled date must not sink the
      // whole import, so flag the row and move on.
      const parsedDate = get(row, 'date') ? new Date(get(row, 'date')) : null;
      if (!parsedDate || isNaN(parsedDate.getTime())) {
        conflictsEarly.push({ email, field: 'date', existing: '', incoming: get(row, 'date') || '(missing)' });
        continue;
      }
      contributions.push({
        email,
        receipt_id: receipt,
        lineitem_id: get(row, 'lineitem_id') || null,
        amount_cents: Math.round(dollars * 100),
        contributed_at: parsedDate.toISOString(),
        refcode: get(row, 'refcode') || null,
        recurrence: monthly ? 'monthly' : 'one_time',
        full_name: [get(row, 'first_name'), get(row, 'last_name')].filter(Boolean).join(' ') || null,
        phone: get(row, 'phone') || null,
        address1: get(row, 'address1') || null,
        city: get(row, 'city') || null,
        state: get(row, 'state') || null,
        zip: get(row, 'zip') || null,
        employer: get(row, 'employer') || null,
        occupation: get(row, 'occupation') || null,
      });
    }
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const emails = [...byEmail.keys()];

  // Existing contacts for every email in the file, in chunks of 200.
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
      else if (has.toLowerCase() !== incoming.toLowerCase()) {
        conflicts.push({ email, field: f, existing: has, incoming });
      }
    }
    if (!(cur.roles || []).includes('donor')) patch.roles = [...new Set([...(cur.roles || []), 'donor'])];
    if (!(cur.sources || []).includes('actblue')) patch.sources = [...new Set([...(cur.sources || []), 'actblue'])];
    if ((patch.first_name || patch.last_name) && !norm(cur.full_name)) {
      patch.full_name = [patch.first_name || cur.first_name, patch.last_name || cur.last_name].filter(Boolean).join(' ') || null;
    }
    if (Object.keys(patch).length) {
      const { error } = await admin.from('contacts').update(patch).eq('id', cur.id);
      if (error) conflicts.push({ email, field: 'update', existing: '', incoming: error.message });
      else contactsUpdated++;
    }
  }

  let donorsInserted = 0, donorsSkipped = 0;
  if (isContributions && contributions.length) {
    // Existing (email, receipt) pairs for dedupe.
    const seen = new Set();
    for (let i = 0; i < emails.length; i += 200) {
      const chunk = emails.slice(i, i + 200);
      const { data, error } = await admin.from('donors')
        .select('email, actblue_receipt_id').in('email', chunk).not('actblue_receipt_id', 'is', null);
      if (error) return json(500, { ok: false, error: 'donors_read_failed', detail: error.message });
      for (const d of data || []) seen.add(`${String(d.email).toLowerCase()} ${d.actblue_receipt_id}`);
    }

    const inserts = [];
    for (const c of contributions) {
      const key = `${c.email} ${c.receipt_id}`;
      if (seen.has(key)) { donorsSkipped++; continue; }
      seen.add(key);
      const contact = existing.get(c.email);
      inserts.push({
        contact_id: contact?.id ?? null,
        full_name: c.full_name || contact?.full_name || c.email,
        email: c.email,
        phone: c.phone,
        address1: c.address1,
        city: c.city,
        state: c.state,
        zip: c.zip,
        employer: c.employer,
        occupation: c.occupation,
        amount_cents: c.amount_cents,
        recurrence: c.recurrence,
        actblue_receipt_id: c.receipt_id,
        actblue_contribution_id: c.lineitem_id,
        refcode: c.refcode,
        contributed_at: c.contributed_at,
        source: 'actblue',
      });
    }
    for (let i = 0; i < inserts.length; i += 200) {
      const chunk = inserts.slice(i, i + 200);
      const { error } = await admin.from('donors').insert(chunk);
      if (error) return json(500, { ok: false, error: 'donors_insert_failed', detail: error.message, inserted_so_far: donorsInserted });
      donorsInserted += chunk.length;
    }
  }

  return json(200, {
    ok: true,
    file_kind: isContributions ? 'contributions' : 'rollup',
    rows_total: rows.length - 1,
    rows_no_email: rowsNoEmail,
    rows_skipped_bad_money: rowsBadMoney,
    contacts_created: contactsCreated,
    contacts_updated: contactsUpdated,
    fields_filled: fieldsFilled,
    donors_inserted: donorsInserted,
    donors_skipped: donorsSkipped,
    conflicts: conflicts.slice(0, 200),
  });
};
