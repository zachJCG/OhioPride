/* In-memory stand-in for the service-role Supabase client lib/actblue.mjs
 * drives. It supports exactly the query-builder chains the library uses and
 * resolves every terminal call to { data, error }, the way supabase-js does.
 *
 * It also emulates the parts of the production schema that shape what the
 * reconciliation sees on its next read:
 *
 *   unique keys   founding_members.actblue_contribution_id
 *                 donors.actblue_contribution_id, donors.founding_member_id
 *                 contacts.email (citext)
 *   trigger       donor_sync_founding_member: every founding_members insert or
 *                 update upserts the fan-out donors row keyed by
 *                 founding_member_id (identity, amount, recurrence, ActBlue
 *                 keys, contributed_at and the refund/cancel stamps follow the
 *                 founding row; phone/address/employer/... fill blanks only)
 *   trigger       link_or_create_contact: a donors / founding_members insert,
 *                 or an update that sets email, upserts the contact by email
 *                 (fill-never-overwrite) and stamps contact_id on the row
 *
 * Each terminal call runs as one statement: if anything it touches fails, the
 * whole call rolls back and returns { data: null, error }, like PostgREST.
 * Reads return copies, so the library mutating what it read (it does, for its
 * in-memory maps) never leaks into the "database". */

class DbError extends Error {
  constructor(message, code = '23505') { super(message); this.name = 'DbError'; this.code = code; }
}

const lower = (v) => String(v ?? '').toLowerCase();
const nz = (v) => { const s = String(v ?? '').trim(); return s ? s : null; };
const uniq = (arr) => [...new Set(arr)];
const cloneVal = (v) => (Array.isArray(v) ? [...v] : v);
const cloneRow = (r) => { const o = {}; for (const [k, v] of Object.entries(r)) o[k] = cloneVal(v); return o; };

const UNIQUE = {
  founding_members: ['actblue_contribution_id'],
  donors: ['actblue_contribution_id', 'founding_member_id'],
  contacts: ['email'],
};
const CITEXT = new Set(['email']);
const sameVal = (col, a, b) => (CITEXT.has(col) ? lower(a) === lower(b) : a === b);

const DEFAULTS = {
  founding_members: () => ({
    display_name: null, notes: null, is_public: false, is_vetted: false,
    refunded_at: null, recurring_cancelled_at: null, contact_id: null, county: null,
  }),
  donors: () => ({
    founding_member_id: null, contact_id: null, refunded_at: null, recurring_cancelled_at: null, county: null,
  }),
  contacts: () => ({
    roles: [], sources: [], source: null, is_merged: false, sms_optin: null,
    full_name: null, first_name: null, last_name: null, phone: null, address1: null, address2: null,
    city: null, state: null, zip: null, employer: null, occupation: null, county: null,
  }),
};

function project(row, cols) {
  if (!cols || cols.trim() === '*') return cloneRow(row);
  const o = {};
  for (const c of cols.split(',').map((s) => s.trim()).filter(Boolean)) {
    o[c] = row[c] === undefined ? null : cloneVal(row[c]);
  }
  return o;
}

/**
 * createFakeSupabase({ triggers })
 *   triggers: false disables both trigger emulations (useful to exercise the
 *   library's own contact upsert fallback).
 * Returns { admin, ops, tables, seed, rows, find, snapshot, failWhen }.
 */
export function createFakeSupabase({ triggers = true } = {}) {
  const tables = { founding_members: [], donors: [], contacts: [] };
  const ops = [];          // every write, in order: { table, op, id, fields?, trigger }
  let seq = 0;
  let depth = 0;           // > 0 while inside a trigger
  let failWhen = null;     // (table, op, payload) => error message | falsy

  function checkUnique(table, row, selfId) {
    for (const col of UNIQUE[table] || []) {
      const v = row[col];
      if (v == null) continue;
      const dup = tables[table].find((r) => r.id !== selfId && r[col] != null && sameVal(col, r[col], v));
      if (dup) throw new DbError(`duplicate key value violates unique constraint "${table}_${col}_key"`);
    }
  }

  function insertRow(table, input, fire = triggers) {
    const row = { ...DEFAULTS[table](), ...cloneRow(input) };
    if (row.id == null) row.id = `${table}-${++seq}`;
    // BEFORE INSERT
    if (fire && table !== 'contacts') linkOrCreateContact(row, table === 'donors' ? 'donor' : 'founding_member');
    checkUnique(table, row, row.id);
    tables[table].push(row);
    ops.push({ table, op: 'insert', id: row.id, trigger: depth > 0 });
    // AFTER INSERT
    if (fire && table === 'founding_members') donorSyncFoundingMember(row);
    return row;
  }

  function updateRows(table, patch, pred, fire = triggers) {
    const targets = tables[table].filter(pred);
    for (const row of targets) {
      checkUnique(table, { ...row, ...patch }, row.id);
      Object.assign(row, cloneRow(patch));
      ops.push({ table, op: 'update', id: row.id, fields: Object.keys(patch), trigger: depth > 0 });
      if (fire && table !== 'contacts' && Object.prototype.hasOwnProperty.call(patch, 'email')) {
        linkOrCreateContact(row, table === 'donors' ? 'donor' : 'founding_member');
      }
      if (fire && table === 'founding_members') donorSyncFoundingMember(row);
    }
    return targets;
  }

  /* public.link_or_create_contact(role): BEFORE INSERT OR UPDATE OF email */
  function linkOrCreateContact(row, role) {
    const email = lower(nz(row.email));
    if (!email || !/@.*\./.test(email)) return;
    depth++;
    try {
      const vals = {
        full_name: nz(row.full_name), first_name: nz(row.first_name), last_name: nz(row.last_name),
        phone: nz(row.phone), zip: nz(row.zip), city: nz(row.city), county: nz(row.county),
      };
      let c = tables.contacts.find((x) => lower(x.email) === email);
      if (!c) {
        c = insertRow('contacts', { email, ...vals, roles: [role], sources: [role], source: role }, false);
      } else {
        const patch = { roles: uniq([...(c.roles || []), role]), sources: uniq([...(c.sources || []), role]) };
        for (const k of Object.keys(vals)) patch[k] = c[k] ?? vals[k];
        updateRows('contacts', patch, (x) => x === c, false);
      }
      row.contact_id = c.id;
    } finally { depth--; }
  }

  /* public.donor_sync_founding_member(fm.id): AFTER INSERT OR UPDATE on founding_members */
  function donorSyncFoundingMember(fm) {
    depth++;
    try {
      const excluded = {
        full_name: nz(fm.full_name) || nz(fm.display_name) || 'Anonymous',
        email: fm.email ?? null, phone: fm.phone ?? null, address1: fm.address1 ?? null,
        city: fm.city ?? null, county: fm.county ?? null, state: fm.state ?? null, zip: fm.zip ?? null,
        employer: fm.employer ?? null, occupation: fm.occupation ?? null,
        amount_cents: fm.amount_cents ?? null, recurrence: fm.recurrence ?? null, recurrence_number: 1,
        actblue_contribution_id: fm.actblue_contribution_id ?? null,
        actblue_receipt_id: fm.actblue_receipt_id ?? null,
        actblue_donor_id: fm.actblue_donor_id ?? null,
        refcode: fm.refcode ?? null,
        contributed_at: fm.contributed_at ?? null,
        refunded_at: fm.refunded_at ?? null,
        recurring_cancelled_at: fm.recurring_cancelled_at ?? null,
        reason: 'Founding Member', source: 'founding_member', founding_member_id: fm.id,
      };
      const d = tables.donors.find((x) => x.founding_member_id === fm.id);
      if (!d) { insertRow('donors', excluded); return; }
      updateRows('donors', {
        full_name: excluded.full_name, email: excluded.email, city: excluded.city, county: excluded.county,
        state: excluded.state, amount_cents: excluded.amount_cents, recurrence: excluded.recurrence,
        actblue_contribution_id: excluded.actblue_contribution_id, actblue_receipt_id: excluded.actblue_receipt_id,
        contributed_at: excluded.contributed_at,
        refunded_at: excluded.refunded_at, recurring_cancelled_at: excluded.recurring_cancelled_at,
        phone: d.phone ?? excluded.phone, address1: d.address1 ?? excluded.address1, zip: d.zip ?? excluded.zip,
        employer: d.employer ?? excluded.employer, occupation: d.occupation ?? excluded.occupation,
        refcode: d.refcode ?? excluded.refcode, actblue_donor_id: d.actblue_donor_id ?? excluded.actblue_donor_id,
        recurrence_number: d.recurrence_number ?? 1, source: 'founding_member',
      }, (x) => x === d);
    } finally { depth--; }
  }

  class Query {
    constructor(table) {
      this.table = table; this.op = 'select'; this.cols = '*'; this.filters = [];
      this.payload = null; this.opts = {}; this.rangeSpec = null; this.limitN = null;
      this.wantSingle = false; this.returning = false;
    }
    select(cols = '*') {
      if (this.op === 'select') this.cols = cols; else { this.returning = true; this.cols = cols; }
      return this;
    }
    in(col, values) { const vals = Array.isArray(values) ? values : [values]; this.filters.push((r) => vals.some((v) => sameVal(col, r[col], v))); return this; }
    eq(col, v) { this.filters.push((r) => sameVal(col, r[col], v)); return this; }
    range(a, b) { this.rangeSpec = [a, b]; return this; }
    limit(n) { this.limitN = n; return this; }
    single() { this.wantSingle = true; return this; }
    update(patch) { this.op = 'update'; this.payload = patch; return this; }
    insert(rows) { this.op = 'insert'; this.payload = rows; return this; }
    upsert(rows, opts = {}) { this.op = 'upsert'; this.payload = rows; this.opts = opts; return this; }
    then(onFulfilled, onRejected) { return this.exec().then(onFulfilled, onRejected); }

    async exec() {
      const snap = JSON.parse(JSON.stringify(tables));
      const opsLen = ops.length;
      try {
        if (failWhen && this.op !== 'select') {
          const msg = failWhen(this.table, this.op, this.payload);
          if (msg) throw new DbError(msg, 'XXFAKE');
        }
        return this.run();
      } catch (e) {
        if (!(e instanceof DbError)) throw e;
        for (const t of Object.keys(tables)) { tables[t].length = 0; tables[t].push(...snap[t]); }
        ops.length = opsLen;
        return { data: null, error: { message: e.message, code: e.code } };
      }
    }

    reply(rows) {
      if (!this.returning) return { data: null, error: null };
      if (this.wantSingle) {
        if (rows.length !== 1) throw new DbError('JSON object requested, multiple (or no) rows returned', 'PGRST116');
        return { data: project(rows[0], this.cols), error: null };
      }
      return { data: rows.map((r) => project(r, this.cols)), error: null };
    }

    run() {
      const { table } = this;
      const match = (r) => this.filters.every((f) => f(r));
      switch (this.op) {
        case 'select': {
          let rows = tables[table].filter(match);
          if (this.rangeSpec) rows = rows.slice(this.rangeSpec[0], this.rangeSpec[1] + 1);
          else if (this.limitN != null) rows = rows.slice(0, this.limitN);
          if (this.wantSingle) {
            if (rows.length !== 1) throw new DbError('JSON object requested, multiple (or no) rows returned', 'PGRST116');
            return { data: project(rows[0], this.cols), error: null };
          }
          return { data: rows.map((r) => project(r, this.cols)), error: null };
        }
        case 'insert': {
          const list = Array.isArray(this.payload) ? this.payload : [this.payload];
          return this.reply(list.map((r) => insertRow(table, r)));
        }
        case 'update': {
          const targets = tables[table].filter(match);
          updateRows(table, this.payload, (r) => targets.includes(r));
          return this.reply(targets);
        }
        case 'upsert': {
          const list = Array.isArray(this.payload) ? this.payload : [this.payload];
          const col = this.opts.onConflict || 'id';
          const out = [];
          for (const r of list) {
            const hit = r[col] == null ? null : tables[table].find((x) => x[col] != null && sameVal(col, x[col], r[col]));
            if (hit) {
              if (this.opts.ignoreDuplicates) continue;       // ON CONFLICT DO NOTHING
              updateRows(table, r, (x) => x === hit);          // ON CONFLICT DO UPDATE
              out.push(hit);
            } else {
              out.push(insertRow(table, r));
            }
          }
          return this.reply(out);
        }
        default:
          throw new Error(`fake supabase: unsupported op ${this.op}`);
      }
    }
  }

  const admin = {
    from(table) {
      if (!tables[table]) throw new Error(`fake supabase: unknown table ${table}`);
      return new Query(table);
    },
  };

  return {
    admin, ops, tables,
    /* Insert a row directly (triggers on by default, like production). */
    seed(table, row, opts = {}) { return cloneRow(insertRow(table, row, opts.triggers ?? triggers)); },
    rows(table) { return tables[table].map(cloneRow); },
    find(table, pred) { const r = tables[table].find(pred); return r ? cloneRow(r) : null; },
    snapshot() { return JSON.parse(JSON.stringify(tables)); },
    failWhen(fn) { failWhen = fn; },
  };
}
