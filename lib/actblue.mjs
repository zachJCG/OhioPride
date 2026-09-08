/* =============================================================================
 * ActBlue: CSV API client + contribution mapping + database reconciliation
 * -----------------------------------------------------------------------------
 * One module owns everything ActBlue-shaped so the hourly cron
 * (lib/functions/actblue-sync.mjs) and the admin CSV import
 * (lib/functions/admin-contacts-import.mjs) cannot drift apart again.
 *
 * ActBlue CSV API (verified live 2026-09-08, https://secure.actblue.com/docs/csv_api):
 *
 *   POST https://secure.actblue.com/api/v1/csvs
 *        Basic auth = client UUID : client secret
 *        body { csv_type, date_range_start, date_range_end }   (ISO 8601)
 *        -> 202 { id }
 *   GET  https://secure.actblue.com/api/v1/csvs/{id}
 *        -> { id, status: 'in_progress' | 'complete', download_url }
 *        download_url is an S3 link that expires after a few minutes.
 *
 *   csv_type values used here:
 *     paid_contributions               one row per payment (installments included)
 *     refunded_contributions           same columns; Refund ID / Refund Date set
 *     cancelled_recurring_contributions one row per cancelled series (49 columns)
 *
 * Column names below are the live export headers. Column order is not
 * relied on anywhere; every read is by header name.
 *
 * Reconciliation rules (the part that keeps the roster honest):
 *
 *   - A founding member is a PERSON, not a payment. One founding_members row
 *     per person: the first installment (Recurrence Number 1) of a founding
 *     refcode contribution creates the row; later installments and any further
 *     founding-refcode gift from the same email are recorded in `donors` only.
 *   - Existing rows are matched by Lineitem ID, then by Receipt ID (older
 *     imports keyed rows on the receipt), then by email. Matching by receipt
 *     adopts the lineitem so the next run matches on the stable key.
 *   - Admin-curated fields on founding_members (display_name, is_public,
 *     is_vetted, notes, elected_office, jurisdiction, public_quote,
 *     founding_number) are never written by the sync after the row exists.
 *     ActBlue-owned fields fill blanks only.
 *   - Contacts are enriched fill-never-overwrite, the same rule the 2026-08-06
 *     rollup reconciliation used.
 *   - Refunds stamp `refunded_at`; cancellations set recurrence='cancelled'
 *     and stamp `recurring_cancelled_at`. Nothing is ever deleted.
 *
 * Dates: ActBlue exports wall-clock times in US Eastern with no offset. They
 * are converted to real instants here (America/New_York, DST-aware).
 * ============================================================================= */

import { parseCsv } from './csv.mjs';

export const ACTBLUE_API_BASE = 'https://secure.actblue.com/api/v1';
export const CSV_TYPES = ['paid_contributions', 'refunded_contributions', 'cancelled_recurring_contributions'];

/* ActBlue caps a single CSV request at six months; stay under it. */
export const MAX_RANGE_DAYS = 180;

const DAY_MS = 86400 * 1000;

/* ---------------------------------------------------------------------------
 * Small helpers
 * ------------------------------------------------------------------------- */

export const norm = (v) => String(v ?? '').trim();
export const normEmail = (v) => norm(v).toLowerCase();
export const isEmail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v || ''));

export function dollarsToCents(s) {
  if (s == null) return null;
  const cleaned = String(s).replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

const TRUTHY = new Set(['t', 'true', 'yes', 'y', '1', 'on']);
export const truthy = (v) => TRUTHY.has(norm(v).toLowerCase());

/**
 * Parse an ActBlue export timestamp ("2026-05-11 12:15:54", US Eastern wall
 * clock) into an ISO instant. Real ISO strings with an offset pass through.
 * Returns null for anything unparseable.
 */
export function parseActBlueDate(value, timeZone = 'America/New_York') {
  const s = norm(value);
  if (!s) return null;
  // Already an instant (has Z or an offset): trust it.
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const [y, mo, d, h = '0', mi = '0', se = '0'] = m.slice(1).map((x) => (x == null ? undefined : x));
  return wallClockToIso({ y: +y, mo: +mo, d: +d, h: +h, mi: +mi, s: +se }, timeZone);
}

function tzOffsetMinutes(utcMs, timeZone) {
  // Offset of `timeZone` at the instant utcMs, in minutes east of UTC.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = {};
  for (const part of fmt.formatToParts(new Date(utcMs))) p[part.type] = part.value;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - utcMs) / 60000);
}

function wallClockToIso({ y, mo, d, h, mi, s }, timeZone) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  if (isNaN(guess)) return null;
  // Two passes handle the DST transition hours correctly.
  let offset = tzOffsetMinutes(guess, timeZone);
  let utc = guess - offset * 60000;
  const offset2 = tzOffsetMinutes(utc, timeZone);
  if (offset2 !== offset) utc = guess - offset2 * 60000;
  return new Date(utc).toISOString();
}

/* ---------------------------------------------------------------------------
 * CSV API client
 * ------------------------------------------------------------------------- */

export function basicAuthHeader(clientUuid, clientSecret) {
  // btoa is available in Node 16+ and every edge runtime.
  return 'Basic ' + btoa(`${clientUuid}:${clientSecret}`);
}

export class ActBlueApiError extends Error {
  constructor(message, { status, body, stage } = {}) {
    super(message);
    this.name = 'ActBlueApiError';
    this.status = status;
    this.body = body;
    this.stage = stage;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Request one CSV export and return its text.
 *
 * opts: { clientUuid, clientSecret, csvType, start, end, fetchImpl, deadlineMs,
 *         pollMs, onProgress }
 *   start / end: Date or ISO string. The range must be <= MAX_RANGE_DAYS.
 *   deadlineMs: absolute Date.now() value after which polling gives up.
 */
export async function fetchActBlueCsv(opts) {
  const {
    clientUuid, clientSecret, csvType,
    fetchImpl = fetch,
    deadlineMs = Date.now() + 120_000,
    pollMs = 1500,
    onProgress = () => {},
  } = opts;
  const start = new Date(opts.start);
  const end = new Date(opts.end);
  if (isNaN(start) || isNaN(end) || end <= start) {
    throw new ActBlueApiError('invalid date range', { stage: 'request' });
  }
  if (end - start > MAX_RANGE_DAYS * DAY_MS + 60_000) {
    throw new ActBlueApiError(`date range exceeds ${MAX_RANGE_DAYS} days`, { stage: 'request' });
  }
  if (!CSV_TYPES.includes(csvType)) {
    throw new ActBlueApiError(`unknown csv_type ${csvType}`, { stage: 'request' });
  }

  const headers = {
    Authorization: basicAuthHeader(clientUuid, clientSecret),
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const created = await fetchImpl(`${ACTBLUE_API_BASE}/csvs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      csv_type: csvType,
      date_range_start: start.toISOString(),
      date_range_end: end.toISOString(),
    }),
  });
  const createdText = await created.text();
  if (!created.ok) {
    throw new ActBlueApiError(`actblue csv request failed (${created.status})`, {
      status: created.status, body: createdText.slice(0, 500), stage: 'request',
    });
  }
  let job;
  try { job = JSON.parse(createdText); } catch {
    throw new ActBlueApiError('actblue csv request returned non-JSON', { body: createdText.slice(0, 200), stage: 'request' });
  }
  if (!job?.id) {
    throw new ActBlueApiError('actblue csv request returned no id', { body: createdText.slice(0, 200), stage: 'request' });
  }
  onProgress({ stage: 'requested', csvType, id: job.id });

  let downloadUrl = null;
  let wait = pollMs;
  for (let attempt = 0; ; attempt++) {
    if (Date.now() > deadlineMs) {
      throw new ActBlueApiError(`actblue csv ${csvType} not ready before deadline`, { stage: 'poll' });
    }
    await sleep(Math.min(wait, Math.max(0, deadlineMs - Date.now())));
    wait = Math.min(wait * 1.5, 6000);
    const res = await fetchImpl(`${ACTBLUE_API_BASE}/csvs/${encodeURIComponent(job.id)}`, { headers });
    const text = await res.text();
    if (!res.ok) {
      // 5xx and 429 are worth retrying a few times; anything else is final.
      if ((res.status >= 500 || res.status === 429) && attempt < 8) continue;
      throw new ActBlueApiError(`actblue csv status failed (${res.status})`, {
        status: res.status, body: text.slice(0, 500), stage: 'poll',
      });
    }
    let st;
    try { st = JSON.parse(text); } catch { continue; }
    if (st.download_url) { downloadUrl = st.download_url; break; }
    if (st.status && st.status !== 'in_progress' && st.status !== 'pending' && st.status !== 'queued') {
      throw new ActBlueApiError(`actblue csv ${csvType} ended with status ${st.status}`, { stage: 'poll', body: text.slice(0, 200) });
    }
  }
  onProgress({ stage: 'ready', csvType, id: job.id });

  const dl = await fetchImpl(downloadUrl);
  if (!dl.ok) {
    throw new ActBlueApiError(`actblue csv download failed (${dl.status})`, { status: dl.status, stage: 'download' });
  }
  return dl.text();
}

/* ---------------------------------------------------------------------------
 * Row mapping
 * ------------------------------------------------------------------------- */

/* Header aliases: live ActBlue export names first, then the spellings the
 * hand-built rollups and older exports used. Matching is case-insensitive
 * and ignores punctuation. */
export const CONTRIBUTION_COLUMNS = {
  receipt_id:    ['receipt id', 'receipt', 'receipt number'],
  lineitem_id:   ['lineitem id', 'line item id', 'contribution id'],
  date:          ['date', 'paid at', 'contribution date'],
  amount:        ['amount', 'contribution amount', 'total amount', 'total'],
  fee:           ['fee'],
  recurring_total_months: ['recurring total months'],
  recurrence_number:      ['recurrence number'],
  recurring_type:         ['recurring type'],
  recurring_pledged:      ['recurring pledged'],
  recurring_period:       ['recurring period', 'recurrence', 'is recurring', 'monthly'],
  recur_weekly:           ['recur weekly'],
  refcode:       ['reference code', 'refcode', 'source code'],
  refcode2:      ['reference code 2', 'reference code 2 one time use'],
  kind:          ['kind', 'payment kind'],
  first_name:    ['donor first name', 'first name', 'firstname', 'first'],
  last_name:     ['donor last name', 'last name', 'lastname', 'last'],
  email:         ['donor email', 'email', 'email address'],
  phone:         ['donor phone', 'phone', 'phone number'],
  address1:      ['donor addr1', 'donor address', 'address', 'address 1', 'addr1', 'street address'],
  address2:      ['donor addr2', 'address 2', 'addr2'],
  city:          ['donor city', 'city'],
  state:         ['donor state', 'state'],
  zip:           ['donor zip', 'zip', 'zip code', 'postal code'],
  country:       ['donor country', 'country'],
  employer:      ['donor employer', 'employer'],
  occupation:    ['donor occupation', 'occupation'],
  donor_id:      ['donor id'],
  refund_id:     ['refund id'],
  refund_date:   ['refund date'],
  text_opt_in:   ['text message opt in', 'text message option'],
  custom_label:  ['custom field 1 label'],
  custom_value:  ['custom field 1 value'],
  // cancelled_recurring_contributions only
  cancelled_on:          ['cancelled on', 'canceled on'],
  recurrence_amount:     ['recurrence amount', 'recurring amount'],
  initial_contribution_date: ['initial contribution date'],
  cancelation_reason:    ['cancelation reason', 'cancellation reason'],
};

const headerKey = (s) => norm(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function buildHeaderIndex(headerRow, columns = CONTRIBUTION_COLUMNS) {
  const keys = headerRow.map(headerKey);
  const idx = {};
  for (const [field, aliases] of Object.entries(columns)) {
    for (const alias of aliases) {
      const at = keys.indexOf(alias);
      if (at !== -1) { idx[field] = at; break; }
    }
  }
  return idx;
}

/** Parse CSV text into header-keyed field objects using the alias table. */
export function parseContributionCsv(text, columns = CONTRIBUTION_COLUMNS) {
  const rows = parseCsv(String(text || ''));
  if (rows.length < 1) return { headers: [], index: {}, records: [] };
  const headers = rows[0];
  const index = buildHeaderIndex(headers, columns);
  const records = rows.slice(1).map((r) => {
    const o = {};
    for (const [field, at] of Object.entries(index)) o[field] = norm(r[at]);
    return o;
  });
  return { headers, index, records };
}

/**
 * Recurrence for a mapped record.
 *  'monthly'  when ActBlue marks the payment as part of a recurring series
 *  'weekly'   for the rare weekly plan (donors accepts it; founding maps to monthly)
 *  'one_time' otherwise
 */
export function detectRecurrence(rec) {
  if (truthy(rec.recur_weekly)) return 'weekly';
  const months = norm(rec.recurring_total_months).toLowerCase();
  const rtype = norm(rec.recurring_type).toLowerCase();
  const pledged = norm(rec.recurring_pledged).toLowerCase();
  const period = norm(rec.recurring_period).toLowerCase();
  const n = Number(rec.recurrence_number || 0);
  if (months && !['0', 'no', 'false', 'none'].includes(months)) return 'monthly';
  if (rtype && !['no', 'false', 'none', 'one_time', 'one-time', 'once'].includes(rtype)) return 'monthly';
  if (pledged && !['', '0', '1', 'no', 'false', 'none'].includes(pledged)) return 'monthly';
  if (period && !['', '0', 'no', 'false', 'one-time', 'one_time', 'once', 'n/a', 'none'].includes(period)) return 'monthly';
  if (n > 1) return 'monthly';
  return 'one_time';
}

export const DEFAULT_FOUNDING_MATCH = 'founding';

/** A refcode is "founding" when it contains the configured needle. */
export function isFoundingRefcode(refcode, needle = DEFAULT_FOUNDING_MATCH) {
  const r = norm(refcode).toLowerCase();
  const n = norm(needle).toLowerCase();
  return !!r && !!n && r.includes(n);
}

/**
 * Normalize one paid/refunded contribution record into the shape the
 * reconciliation writes. Returns { ok:false, reason } for rows that cannot
 * be keyed or have no money on them.
 */
export function mapContribution(rec, { foundingMatch = DEFAULT_FOUNDING_MATCH } = {}) {
  const lineitemId = norm(rec.lineitem_id);
  const receiptId = norm(rec.receipt_id);
  const amountCents = dollarsToCents(rec.amount);
  const contributedAt = parseActBlueDate(rec.date);
  if (!lineitemId && !receiptId) return { ok: false, reason: 'no_id' };
  if (!amountCents || amountCents <= 0) return { ok: false, reason: 'no_amount' };
  if (!contributedAt) return { ok: false, reason: 'bad_date' };

  const firstName = norm(rec.first_name);
  const lastName = norm(rec.last_name);
  const emailRaw = normEmail(rec.email);
  const email = isEmail(emailRaw) ? emailRaw : null;
  const recurrence = detectRecurrence(rec);
  const recurrenceNumber = Math.max(1, Number(rec.recurrence_number) || 1);
  const refcode = norm(rec.refcode) || null;
  const zipDigits = norm(rec.zip).replace(/[^0-9]/g, '');
  const state = norm(rec.state).toUpperCase().slice(0, 2) || null;

  return {
    ok: true,
    lineitem_id: lineitemId || null,
    receipt_id: receiptId || null,
    contributed_at: contributedAt,
    amount_cents: amountCents,
    fee_cents: dollarsToCents(rec.fee),
    recurrence,
    recurrence_number: recurrenceNumber,
    is_first_installment: recurrenceNumber <= 1,
    refcode,
    refcode2: norm(rec.refcode2) || null,
    kind: norm(rec.kind).toLowerCase() || null,
    is_founding: isFoundingRefcode(refcode, foundingMatch),
    first_name: firstName || null,
    last_name: lastName || null,
    full_name: [firstName, lastName].filter(Boolean).join(' ') || null,
    email,
    phone: norm(rec.phone) || null,
    address1: norm(rec.address1) || null,
    address2: norm(rec.address2) || null,
    city: norm(rec.city) || null,
    state,
    zip: zipDigits ? zipDigits.slice(0, 5) : null,
    country: norm(rec.country) || null,
    employer: norm(rec.employer) || null,
    occupation: norm(rec.occupation) || null,
    actblue_donor_id: norm(rec.donor_id) || null,
    refund_id: norm(rec.refund_id) || null,
    refunded_at: parseActBlueDate(rec.refund_date),
    sms_optin: truthy(rec.text_opt_in) ? true : null,
    custom_label: norm(rec.custom_label) || null,
    custom_value: norm(rec.custom_value) || null,
  };
}

/** Normalize a cancelled_recurring_contributions record. */
export function mapCancellation(rec) {
  const receiptId = norm(rec.receipt_id);
  const emailRaw = normEmail(rec.email);
  if (!receiptId && !isEmail(emailRaw)) return { ok: false, reason: 'no_id' };
  return {
    ok: true,
    receipt_id: receiptId || null,
    email: isEmail(emailRaw) ? emailRaw : null,
    refcode: norm(rec.refcode) || null,
    cancelled_at: parseActBlueDate(rec.cancelled_on) || null,
    recurrence_amount_cents: dollarsToCents(rec.recurrence_amount),
    initial_contribution_at: parseActBlueDate(rec.initial_contribution_date),
    reason: norm(rec.cancelation_reason) || null,
  };
}

/* ---------------------------------------------------------------------------
 * Database reconciliation
 * ------------------------------------------------------------------------- */

/* Fields the sync may fill on an existing founding_members row when blank. */
const FM_FILL_FIELDS = ['email', 'city', 'state', 'zip', 'phone', 'address1', 'employer', 'occupation', 'refcode', 'actblue_donor_id', 'actblue_receipt_id'];
/* Fields filled on an existing donors row when blank. */
const DONOR_FILL_FIELDS = ['email', 'phone', 'address1', 'address2', 'city', 'state', 'zip', 'employer', 'occupation', 'refcode', 'actblue_donor_id', 'actblue_receipt_id', 'fee_cents', 'recurrence_number', 'kind'];
/* Fields filled on contacts when blank. */
const CONTACT_FILL_FIELDS = ['first_name', 'last_name', 'phone', 'address1', 'address2', 'city', 'state', 'zip', 'employer', 'occupation'];

const isNumericId = (v) => /^\d+$/.test(String(v || ''));
const ADOPT_WINDOW_MS = 36 * 3600 * 1000;

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** Read every row of `table` whose `column` is in `values`, in chunks, paging past PostgREST's cap. */
async function readIn(admin, table, select, column, values) {
  const out = [];
  const uniq = [...new Set(values.filter(Boolean))];
  for (const part of chunk(uniq, 100)) {
    for (let from = 0; ; from += 500) {
      const { data, error } = await admin.from(table).select(select).in(column, part).range(from, from + 499);
      if (error) throw new Error(`${table} read failed: ${error.message}`);
      out.push(...(data || []));
      if (!data || data.length < 500) break;
    }
  }
  return out;
}

function fillPatch(existing, incoming, fields) {
  const patch = {};
  for (const f of fields) {
    const v = incoming[f];
    if (v == null || v === '') continue;
    const cur = existing[f];
    if (cur == null || cur === '') patch[f] = v;
  }
  return patch;
}

/**
 * Reconcile mapped paid contributions into founding_members, donors and
 * contacts. `admin` is a service-role Supabase client.
 *
 * opts: { dryRun, autoPublish, now, log }
 *
 * Returns counters plus a per-row `plan` (no PII: ids, refcode, action).
 */
export async function reconcileContributions(admin, contributions, opts = {}) {
  const { dryRun = false, autoPublish = false, log = () => {} } = opts;
  const counts = {
    rows: contributions.length,
    founding_inserted: 0, founding_updated: 0, founding_adopted: 0,
    donors_inserted: 0, donors_updated: 0, donors_adopted: 0, donors_skipped: 0,
    contacts_created: 0, contacts_enriched: 0,
    errors: 0,
  };
  const plan = [];
  const problems = [];

  // Chronological so founding numbers follow the order people actually joined.
  const rows = [...contributions].sort((a, b) => (a.contributed_at < b.contributed_at ? -1 : a.contributed_at > b.contributed_at ? 1 : 0));

  const lineitems = rows.map((r) => r.lineitem_id).filter(Boolean);
  const receipts = rows.map((r) => r.receipt_id).filter(Boolean);
  const allIds = [...new Set([...lineitems, ...receipts])];
  const emails = [...new Set(rows.map((r) => r.email).filter(Boolean))];

  /* ---- pre-read founding_members --------------------------------------- */
  const FM_SELECT = 'id, email, full_name, actblue_contribution_id, actblue_receipt_id, recurrence, amount_cents, contributed_at, city, state, zip, phone, address1, employer, occupation, refcode, actblue_donor_id, refunded_at';
  const fmRows = [
    ...await readIn(admin, 'founding_members', FM_SELECT, 'actblue_contribution_id', allIds),
    ...await readIn(admin, 'founding_members', FM_SELECT, 'actblue_receipt_id', allIds),
    ...await readIn(admin, 'founding_members', FM_SELECT, 'email', emails),
  ];
  const fmById = new Map();
  for (const r of fmRows) fmById.set(r.id, r);
  const fmByKey = new Map();   // lineitem or receipt -> row
  const fmByEmail = new Map(); // email -> row (earliest wins)
  for (const r of fmById.values()) {
    if (r.actblue_contribution_id) fmByKey.set(r.actblue_contribution_id, r);
    if (r.actblue_receipt_id) fmByKey.set(r.actblue_receipt_id, r);
    const e = normEmail(r.email);
    if (e) {
      const prev = fmByEmail.get(e);
      if (!prev || (r.contributed_at || '') < (prev.contributed_at || '')) fmByEmail.set(e, r);
    }
  }

  /* ---- founding pass ---------------------------------------------------- */
  const toDonorPass = [];
  const fmInserts = [];
  for (const c of rows) {
    if (!c.is_founding) { toDonorPass.push({ c, reason: null }); continue; }
    if (!c.is_first_installment) {
      toDonorPass.push({ c, reason: `Founding member installment #${c.recurrence_number}` });
      continue;
    }
    const byId = (c.lineitem_id && fmByKey.get(c.lineitem_id)) || (c.receipt_id && fmByKey.get(c.receipt_id)) || null;
    const byEmail = !byId && c.email ? fmByEmail.get(c.email) : null;

    if (byId) {
      // Same gift already on the roster: adopt the stable key, fill blanks.
      const patch = fillPatch(byId, {
        email: c.email, city: c.city, state: c.state, zip: c.zip, phone: c.phone, address1: c.address1,
        employer: c.employer, occupation: c.occupation, refcode: c.refcode, actblue_donor_id: c.actblue_donor_id,
        actblue_receipt_id: c.receipt_id,
      }, FM_FILL_FIELDS);
      let adopted = false;
      if (c.lineitem_id && byId.actblue_contribution_id !== c.lineitem_id && !isNumericId(byId.actblue_contribution_id)) {
        patch.actblue_contribution_id = c.lineitem_id;
        adopted = true;
      }
      if (c.recurrence === 'monthly' && byId.recurrence === 'one_time') patch.recurrence = 'monthly';
      if (Object.keys(patch).length) {
        plan.push({ action: adopted ? 'founding_adopt' : 'founding_fill', lineitem: c.lineitem_id, receipt: c.receipt_id, refcode: c.refcode, fields: Object.keys(patch) });
        if (!dryRun) {
          if (patch.actblue_contribution_id) {
            // The fan-out trigger copies the new key onto the donors row; make
            // sure no stray donors row already holds it or the update fails.
            const { data: clash, error: clashErr } = await admin.from('donors')
              .select('id, founding_member_id').eq('actblue_contribution_id', patch.actblue_contribution_id).limit(1);
            if (clashErr) throw new Error(`donors read failed: ${clashErr.message}`);
            if (clash?.length && clash[0].founding_member_id !== byId.id) {
              delete patch.actblue_contribution_id;
              adopted = false;
              problems.push({ kind: 'lineitem_clash', lineitem: c.lineitem_id, founding_member_id: byId.id, donor_id: clash[0].id });
            }
          }
          if (Object.keys(patch).length) {
            const { error } = await admin.from('founding_members').update(patch).eq('id', byId.id);
            if (error) { counts.errors++; problems.push({ kind: 'founding_update_failed', lineitem: c.lineitem_id, message: error.message }); continue; }
          }
        }
        Object.assign(byId, patch);
        if (patch.actblue_contribution_id) fmByKey.set(patch.actblue_contribution_id, byId);
        if (adopted) counts.founding_adopted++; else counts.founding_updated++;
      } else {
        plan.push({ action: 'founding_exists', lineitem: c.lineitem_id, receipt: c.receipt_id, refcode: c.refcode });
      }
      continue;
    }

    if (byEmail) {
      // Already a founding member: this is an additional gift, not a second seat.
      toDonorPass.push({ c, reason: 'Additional founding-tier gift' });
      continue;
    }

    fmInserts.push(c);
  }

  // Insert new founding members one at a time (chronological numbering, and a
  // single bad row must not sink the batch).
  for (const c of fmInserts) {
    const row = {
      full_name: c.full_name || c.email || 'Anonymous',
      email: c.email,
      display_name: null,
      amount_cents: c.amount_cents,
      recurrence: c.recurrence === 'weekly' ? 'monthly' : c.recurrence,
      actblue_contribution_id: c.lineitem_id || c.receipt_id,
      actblue_receipt_id: c.receipt_id,
      actblue_donor_id: c.actblue_donor_id,
      contributed_at: c.contributed_at,
      // The paid export does not carry refund columns today; if it ever does,
      // a refunded membership payment must not mint a counted seat.
      refunded_at: c.refunded_at || null,
      is_public: !!autoPublish,
      is_vetted: !!autoPublish,
      city: c.city, state: c.state, zip: c.zip, phone: c.phone, address1: c.address1,
      employer: c.employer, occupation: c.occupation,
      refcode: c.refcode,
    };
    plan.push({ action: 'founding_insert', lineitem: c.lineitem_id, receipt: c.receipt_id, refcode: c.refcode, amount_cents: c.amount_cents, recurrence: row.recurrence });
    if (dryRun) { counts.founding_inserted++; continue; }
    const { data, error } = await admin.from('founding_members').insert(row).select('id, actblue_contribution_id, actblue_receipt_id, email, contributed_at').single();
    if (error) {
      counts.errors++;
      problems.push({ kind: 'founding_insert_failed', lineitem: c.lineitem_id, message: error.message });
      continue;
    }
    counts.founding_inserted++;
    fmById.set(data.id, data);
    if (data.actblue_contribution_id) fmByKey.set(data.actblue_contribution_id, data);
    if (data.actblue_receipt_id) fmByKey.set(data.actblue_receipt_id, data);
    if (c.email) fmByEmail.set(c.email, data);
  }

  /* ---- donors pass ------------------------------------------------------ */
  if (toDonorPass.length) {
    const dLineitems = toDonorPass.map(({ c }) => c.lineitem_id).filter(Boolean);
    const dReceipts = toDonorPass.map(({ c }) => c.receipt_id).filter(Boolean);
    const dIds = [...new Set([...dLineitems, ...dReceipts])];
    const D_SELECT = 'id, email, actblue_contribution_id, actblue_receipt_id, amount_cents, contributed_at, recurrence, founding_member_id, phone, address1, address2, city, state, zip, employer, occupation, refcode, actblue_donor_id, fee_cents, recurrence_number, kind';
    const donorRows = [
      ...await readIn(admin, 'donors', D_SELECT, 'actblue_contribution_id', dIds),
      ...await readIn(admin, 'donors', D_SELECT, 'actblue_receipt_id', dIds),
    ];
    const donorById = new Map();
    for (const r of donorRows) donorById.set(r.id, r);
    const donorByLineitem = new Map();
    const donorsByReceipt = new Map();
    for (const r of donorById.values()) {
      if (r.actblue_contribution_id) donorByLineitem.set(r.actblue_contribution_id, r);
      for (const k of [r.actblue_receipt_id, r.actblue_contribution_id]) {
        if (!k) continue;
        if (!donorsByReceipt.has(k)) donorsByReceipt.set(k, []);
        if (!donorsByReceipt.get(k).includes(r)) donorsByReceipt.get(k).push(r);
      }
    }
    // Founding rows share their key with the fan-out donors row, so a lineitem
    // that keys a founding member is already a recorded gift.
    const claimed = new Set();
    const inserts = [];

    for (const { c, reason } of toDonorPass) {
      const key = c.lineitem_id || c.receipt_id;
      if (c.lineitem_id && (donorByLineitem.has(c.lineitem_id) || fmByKey.has(c.lineitem_id))) {
        counts.donors_skipped++;
        plan.push({ action: 'donor_exists', lineitem: c.lineitem_id, receipt: c.receipt_id, refcode: c.refcode });
        continue;
      }
      // Older imports keyed rows on the receipt. Adopt the row that is the same
      // payment (same amount, within 36h) rather than inserting a duplicate.
      const candidates = c.receipt_id ? (donorsByReceipt.get(c.receipt_id) || []) : [];
      const same = candidates.find((r) => !claimed.has(r.id)
        && !isNumericId(r.actblue_contribution_id)
        && r.amount_cents === c.amount_cents
        && Math.abs(new Date(r.contributed_at).getTime() - new Date(c.contributed_at).getTime()) <= ADOPT_WINDOW_MS);
      if (same) {
        claimed.add(same.id);
        counts.donors_skipped++;
        const patch = fillPatch(same, { ...c, actblue_receipt_id: c.receipt_id }, DONOR_FILL_FIELDS);
        // The fan-out row's key belongs to its founding member row; it was
        // adopted in the founding pass and the trigger keeps it in step.
        if (c.lineitem_id && !same.founding_member_id && !donorByLineitem.has(c.lineitem_id)) {
          patch.actblue_contribution_id = c.lineitem_id;
        }
        if (Object.keys(patch).length) {
          plan.push({ action: patch.actblue_contribution_id ? 'donor_adopt' : 'donor_fill', lineitem: c.lineitem_id, receipt: c.receipt_id, refcode: c.refcode, fields: Object.keys(patch) });
          if (!dryRun) {
            const { error } = await admin.from('donors').update(patch).eq('id', same.id);
            if (error) { counts.errors++; problems.push({ kind: 'donor_update_failed', lineitem: c.lineitem_id, message: error.message }); continue; }
          }
          Object.assign(same, patch);
          if (patch.actblue_contribution_id) { donorByLineitem.set(patch.actblue_contribution_id, same); counts.donors_adopted++; }
          else counts.donors_updated++;
        } else {
          plan.push({ action: 'donor_exists', lineitem: c.lineitem_id, receipt: c.receipt_id, refcode: c.refcode });
        }
        continue;
      }
      if (!key) { counts.donors_skipped++; continue; }
      const fm = c.email ? fmByEmail.get(c.email) : null;
      inserts.push({
        full_name: c.full_name || c.email || 'Anonymous',
        email: c.email,
        phone: c.phone, address1: c.address1, address2: c.address2,
        city: c.city, state: c.state, zip: c.zip,
        employer: c.employer, occupation: c.occupation,
        amount_cents: c.amount_cents,
        fee_cents: c.fee_cents,
        recurrence: c.recurrence,
        recurrence_number: c.recurrence_number,
        kind: c.kind,
        actblue_contribution_id: key,
        actblue_receipt_id: c.receipt_id,
        actblue_donor_id: c.actblue_donor_id,
        refcode: c.refcode,
        contributed_at: c.contributed_at,
        refunded_at: c.refunded_at || null,
        reason: reason || (c.kind === 'event' ? 'Event contribution' : null),
        source: 'actblue',
        // founding_member_id is unique per founding row (the fan-out owns it),
        // so installments link through the contact instead.
        contact_id: null,
      });
      plan.push({ action: 'donor_insert', lineitem: c.lineitem_id, receipt: c.receipt_id, refcode: c.refcode, amount_cents: c.amount_cents, recurrence_number: c.recurrence_number, founding_member: !!fm });
      donorByLineitem.set(key, { id: null, actblue_contribution_id: key });
    }

    if (dryRun) {
      counts.donors_inserted += inserts.length;
    } else {
      for (const part of chunk(inserts, 100)) {
        // ignoreDuplicates rides the unique index on actblue_contribution_id, so a
        // concurrent run cannot double-insert the same payment.
        const { data, error } = await admin.from('donors')
          .upsert(part, { onConflict: 'actblue_contribution_id', ignoreDuplicates: true })
          .select('id');
        if (error) {
          // Fall back to one-at-a-time so one bad row does not hide the rest.
          for (const one of part) {
            const { error: e1 } = await admin.from('donors').upsert(one, { onConflict: 'actblue_contribution_id', ignoreDuplicates: true });
            if (e1) { counts.errors++; problems.push({ kind: 'donor_insert_failed', lineitem: one.actblue_contribution_id, message: e1.message }); }
            else counts.donors_inserted++;
          }
          continue;
        }
        counts.donors_inserted += data?.length ?? part.length;
      }
    }
  }

  /* ---- contacts pass ---------------------------------------------------- */
  // The link_or_create_contact triggers already created/linked a contact for
  // every inserted row; this pass fills the fields the trigger does not carry
  // (employer, occupation, address, state) and tags the roles/sources.
  if (emails.length) {
    const byEmail = new Map();
    for (const c of rows) {
      if (!c.email) continue;
      const rec = byEmail.get(c.email) || { email: c.email, founding: false };
      for (const f of CONTACT_FILL_FIELDS) if (c[f] && !rec[f]) rec[f] = c[f];
      if (c.is_founding) rec.founding = true;
      if (c.sms_optin === true) rec.sms_optin = true;
      byEmail.set(c.email, rec);
    }
    const existing = await readIn(admin, 'contacts',
      'id, email, first_name, last_name, full_name, phone, address1, address2, city, state, zip, employer, occupation, roles, sources, sms_optin, is_merged',
      'email', emails);
    const contactByEmail = new Map();
    for (const c of existing) contactByEmail.set(normEmail(c.email), c);

    for (const [email, rec] of byEmail) {
      const cur = contactByEmail.get(email);
      if (!cur) {
        if (dryRun) { counts.contacts_created++; continue; }
        const insert = {
          email,
          first_name: rec.first_name || null,
          last_name: rec.last_name || null,
          full_name: [rec.first_name, rec.last_name].filter(Boolean).join(' ') || null,
          phone: rec.phone || null, address1: rec.address1 || null, address2: rec.address2 || null,
          city: rec.city || null, state: rec.state || null, zip: rec.zip || null,
          employer: rec.employer || null, occupation: rec.occupation || null,
          roles: rec.founding ? ['donor', 'founding_member'] : ['donor'],
          sources: ['actblue'],
          source: 'actblue',
          sms_optin: rec.sms_optin ?? null,
        };
        // The triggers normally beat us here; upsert on email keeps this
        // idempotent if they did not (e.g. a contribution with no writable row).
        const { error } = await admin.from('contacts').upsert(insert, { onConflict: 'email', ignoreDuplicates: true });
        if (error) { counts.errors++; problems.push({ kind: 'contact_insert_failed', message: error.message }); continue; }
        counts.contacts_created++;
        continue;
      }
      if (cur.is_merged) continue;
      const patch = fillPatch(cur, rec, CONTACT_FILL_FIELDS);
      const roles = new Set(cur.roles || []);
      const sources = new Set(cur.sources || []);
      roles.add('donor');
      if (rec.founding) roles.add('founding_member');
      sources.add('actblue');
      if (roles.size !== (cur.roles || []).length) patch.roles = [...roles];
      if (sources.size !== (cur.sources || []).length) patch.sources = [...sources];
      if ((patch.first_name || patch.last_name) && !norm(cur.full_name)) {
        patch.full_name = [patch.first_name || cur.first_name, patch.last_name || cur.last_name].filter(Boolean).join(' ') || null;
      }
      if (rec.sms_optin === true && cur.sms_optin == null) patch.sms_optin = true;
      if (!Object.keys(patch).length) continue;
      if (!dryRun) {
        const { error } = await admin.from('contacts').update(patch).eq('id', cur.id);
        if (error) { counts.errors++; problems.push({ kind: 'contact_update_failed', message: error.message }); continue; }
      }
      counts.contacts_enriched++;
    }
  }

  log({ counts, problems: problems.length });
  return { counts, plan, problems };
}

/**
 * Stamp refunds. `refunds` are mapped contributions from the
 * refunded_contributions export (refund_id / refunded_at set).
 */
export async function applyRefunds(admin, refunds, { dryRun = false } = {}) {
  const counts = { rows: refunds.length, founding_refunded: 0, donors_refunded: 0, unmatched: 0, errors: 0 };
  const plan = [];
  const problems = [];
  if (!refunds.length) return { counts, plan, problems };

  const ids = [...new Set(refunds.flatMap((r) => [r.lineitem_id, r.receipt_id]).filter(Boolean))];
  const FM_SELECT = 'id, actblue_contribution_id, actblue_receipt_id, refunded_at, amount_cents, contributed_at';
  const fm = [
    ...await readIn(admin, 'founding_members', FM_SELECT, 'actblue_contribution_id', ids),
    ...await readIn(admin, 'founding_members', FM_SELECT, 'actblue_receipt_id', ids),
  ];
  const D_SELECT = 'id, actblue_contribution_id, actblue_receipt_id, refunded_at, amount_cents, contributed_at, founding_member_id';
  const donors = [
    ...await readIn(admin, 'donors', D_SELECT, 'actblue_contribution_id', ids),
    ...await readIn(admin, 'donors', D_SELECT, 'actblue_receipt_id', ids),
  ];
  const uniq = (rows) => [...new Map(rows.map((r) => [r.id, r])).values()];
  const fmRows = uniq(fm);
  const donorRows = uniq(donors);

  const samePayment = (row, r) => row.amount_cents === r.amount_cents
    && Math.abs(new Date(row.contributed_at).getTime() - new Date(r.contributed_at).getTime()) <= ADOPT_WINDOW_MS;

  for (const r of refunds) {
    const when = r.refunded_at || r.contributed_at;
    let hit = false;

    // Founding row: only the membership payment (first installment) refunds a seat.
    if (r.is_founding && r.is_first_installment) {
      const target = fmRows.find((f) => f.actblue_contribution_id === r.lineitem_id)
        || fmRows.find((f) => (f.actblue_receipt_id === r.receipt_id || f.actblue_contribution_id === r.receipt_id) && samePayment(f, r));
      if (target) {
        hit = true;
        if (!target.refunded_at) {
          plan.push({ action: 'founding_refund', lineitem: r.lineitem_id, receipt: r.receipt_id, founding_member_id: target.id });
          if (!dryRun) {
            const { error } = await admin.from('founding_members').update({ refunded_at: when }).eq('id', target.id);
            if (error) { counts.errors++; problems.push({ kind: 'founding_refund_failed', lineitem: r.lineitem_id, message: error.message }); continue; }
          }
          target.refunded_at = when;
          counts.founding_refunded++;
        }
      }
    }

    // Donors row(s): the exact payment by lineitem, else the receipt-keyed row
    // that is the same payment.
    const dTargets = donorRows.filter((d) => d.actblue_contribution_id === r.lineitem_id);
    if (!dTargets.length && r.receipt_id) {
      const d = donorRows.find((x) => (x.actblue_receipt_id === r.receipt_id || x.actblue_contribution_id === r.receipt_id) && samePayment(x, r));
      if (d) dTargets.push(d);
    }
    for (const d of dTargets) {
      hit = true;
      if (d.refunded_at) continue;
      plan.push({ action: 'donor_refund', lineitem: r.lineitem_id, receipt: r.receipt_id, donor_id: d.id });
      if (!dryRun) {
        const { error } = await admin.from('donors').update({ refunded_at: when }).eq('id', d.id);
        if (error) { counts.errors++; problems.push({ kind: 'donor_refund_failed', lineitem: r.lineitem_id, message: error.message }); continue; }
      }
      d.refunded_at = when;
      counts.donors_refunded++;
    }
    if (!hit) { counts.unmatched++; plan.push({ action: 'refund_unmatched', lineitem: r.lineitem_id, receipt: r.receipt_id }); }
  }
  return { counts, plan, problems };
}

/**
 * Apply cancelled recurring series. `cancellations` are mapped rows from the
 * cancelled_recurring_contributions export.
 */
export async function applyCancellations(admin, cancellations, { dryRun = false } = {}) {
  const counts = { rows: cancellations.length, founding_cancelled: 0, donors_cancelled: 0, unmatched: 0, errors: 0 };
  const plan = [];
  const problems = [];
  if (!cancellations.length) return { counts, plan, problems };

  const receipts = [...new Set(cancellations.map((c) => c.receipt_id).filter(Boolean))];
  const emails = [...new Set(cancellations.map((c) => c.email).filter(Boolean))];
  const FM_SELECT = 'id, email, actblue_contribution_id, actblue_receipt_id, recurrence, recurring_cancelled_at';
  const fmRows = [...new Map([
    ...await readIn(admin, 'founding_members', FM_SELECT, 'actblue_contribution_id', receipts),
    ...await readIn(admin, 'founding_members', FM_SELECT, 'actblue_receipt_id', receipts),
    ...await readIn(admin, 'founding_members', FM_SELECT, 'email', emails),
  ].map((r) => [r.id, r])).values()];
  const D_SELECT = 'id, email, actblue_contribution_id, actblue_receipt_id, recurrence, recurrence_number, founding_member_id, recurring_cancelled_at';
  const donorRows = [...new Map([
    ...await readIn(admin, 'donors', D_SELECT, 'actblue_contribution_id', receipts),
    ...await readIn(admin, 'donors', D_SELECT, 'actblue_receipt_id', receipts),
  ].map((r) => [r.id, r])).values()];

  for (const c of cancellations) {
    let hit = false;
    const byReceipt = (f) => c.receipt_id && (f.actblue_receipt_id === c.receipt_id || f.actblue_contribution_id === c.receipt_id);

    let fmTarget = fmRows.find(byReceipt) || null;
    if (!fmTarget && c.email) {
      fmTarget = fmRows.find((f) => normEmail(f.email) === c.email && f.recurrence === 'monthly') || null;
    }
    if (fmTarget) {
      hit = true;
      if (fmTarget.recurrence !== 'cancelled') {
        plan.push({ action: 'founding_cancel', receipt: c.receipt_id, founding_member_id: fmTarget.id });
        if (!dryRun) {
          const { error } = await admin.from('founding_members')
            .update({ recurrence: 'cancelled', recurring_cancelled_at: c.cancelled_at }).eq('id', fmTarget.id);
          if (error) { counts.errors++; problems.push({ kind: 'founding_cancel_failed', receipt: c.receipt_id, message: error.message }); continue; }
        }
        fmTarget.recurrence = 'cancelled';
        counts.founding_cancelled++;
      } else if (c.cancelled_at && !fmTarget.recurring_cancelled_at) {
        if (!dryRun) await admin.from('founding_members').update({ recurring_cancelled_at: c.cancelled_at }).eq('id', fmTarget.id);
        fmTarget.recurring_cancelled_at = c.cancelled_at;
      }
    }

    // The series' first donors row carries the recurrence flag. Fan-out rows
    // are updated by the founding trigger, so only touch non-founding rows here.
    const dTargets = donorRows.filter((d) => byReceipt(d) && !d.founding_member_id && (d.recurrence_number == null || d.recurrence_number <= 1));
    for (const d of dTargets) {
      hit = true;
      if (d.recurrence === 'cancelled') continue;
      plan.push({ action: 'donor_cancel', receipt: c.receipt_id, donor_id: d.id });
      if (!dryRun) {
        const { error } = await admin.from('donors')
          .update({ recurrence: 'cancelled', recurring_cancelled_at: c.cancelled_at }).eq('id', d.id);
        if (error) { counts.errors++; problems.push({ kind: 'donor_cancel_failed', receipt: c.receipt_id, message: error.message }); continue; }
      }
      d.recurrence = 'cancelled';
      counts.donors_cancelled++;
    }
    if (!hit) { counts.unmatched++; plan.push({ action: 'cancel_unmatched', receipt: c.receipt_id }); }
  }
  return { counts, plan, problems };
}

/* ---------------------------------------------------------------------------
 * Convenience: map a whole export
 * ------------------------------------------------------------------------- */

export function mapContributionCsv(text, opts = {}) {
  const { records } = parseContributionCsv(text);
  const mapped = [];
  const skipped = { no_id: 0, no_amount: 0, bad_date: 0 };
  for (const rec of records) {
    const m = mapContribution(rec, opts);
    if (m.ok) mapped.push(m); else skipped[m.reason] = (skipped[m.reason] || 0) + 1;
  }
  return { rows: mapped, skipped, total: records.length };
}

export function mapCancellationCsv(text) {
  const { records } = parseContributionCsv(text);
  const mapped = [];
  let skipped = 0;
  for (const rec of records) {
    const m = mapCancellation(rec);
    if (m.ok) mapped.push(m); else skipped++;
  }
  return { rows: mapped, skipped, total: records.length };
}
