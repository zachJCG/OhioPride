#!/usr/bin/env node
/* =============================================================================
 * Ohio Pride PAC, seed extractor
 * -----------------------------------------------------------------------------
 * Reads the static editorial JS data:
 *   /js/bill-data.js        -> BILLS[]
 *   /js/scorecard-data.js   -> HOUSE_MEMBERS[], SENATE_MEMBERS[], LEGISLATOR_SPONSORSHIPS{}
 *
 * Emits a single idempotent SQL seed migration to stdout (or to --out file).
 * The output upserts:
 *   - public.bills (incl. denorm fields: status_label, status_color,
 *     categories, category_labels, sponsors_text, last_action, next_date,
 *     house_vote, chamber, current_step, url, legislature_url, text_url,
 *     nickname, official_title)
 *   - public.bill_pipeline_steps
 *   - public.legislators (id = h-<d> or s-<d>)
 *   - public.legislator_sponsorships
 *
 * Re-run this any time the static JS data changes and the data team is not
 * yet using the /admin pages to edit data directly. Once admin CRUD is the
 * source of truth, retire this script.
 *
 * Usage:
 *   node scripts/seed-from-static.mjs \
 *        --bills   js/bill-data.js \
 *        --score   js/scorecard-data.js \
 *        --out     supabase/migrations/20260519010000_seed_bills_and_legislators.sql
 * ============================================================================= */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// -----------------------------------------------------------------------------
// Arg parsing
// -----------------------------------------------------------------------------
function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

const billsPath = arg('bills', 'js/bill-data.js');
const scorePath = arg('score', 'js/scorecard-data.js');
const outPath   = arg('out',   null);

// -----------------------------------------------------------------------------
// Load the static JS files inside a sandbox so we can grab their globals
// without polluting our own scope. Both files are plain ES5 `const X = ...`
// at module scope, so a v8 sandbox runs them fine.
// -----------------------------------------------------------------------------
function loadSandbox(...files) {
  const ctx = { console, module: {}, exports: {}, globalThis: null };
  vm.createContext(ctx);
  ctx.globalThis = ctx;
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    // Strip ES6 export/import statements just in case (these data files are plain
    // browser globals as of 2026-05). Top-level `const X = ...` does NOT bind
    // onto the vm context, so we rewrite the few names we care about into
    // explicit `globalThis.X = ...` assignments before running.
    let safe = src
      .replace(/^\s*export\s+/gm, '')
      .replace(/^\s*import\s.*;\s*$/gm, '');
    const exposeNames = [
      'BILLS', 'LAST_UPDATED',
      'HOUSE_MEMBERS', 'SENATE_MEMBERS',
      'LEGISLATOR_SPONSORSHIPS', 'LEGISLATOR_NEWS',
      'SCORECARD_UPDATED'
    ];
    for (const name of exposeNames) {
      const re = new RegExp(`^(\\s*)(?:const|let|var)\\s+${name}\\s*=`, 'm');
      safe = safe.replace(re, `$1globalThis.${name} =`);
    }
    vm.runInContext(safe, ctx, { filename: f });
  }
  return ctx;
}

const ctx = loadSandbox(billsPath, scorePath);
const BILLS                  = ctx.BILLS                  || [];
const HOUSE_MEMBERS          = ctx.HOUSE_MEMBERS          || [];
const SENATE_MEMBERS         = ctx.SENATE_MEMBERS         || [];
const LEGISLATOR_SPONSORSHIPS= ctx.LEGISLATOR_SPONSORSHIPS|| {};

// -----------------------------------------------------------------------------
// SQL escaping helpers
// -----------------------------------------------------------------------------
function q(v) {
  if (v === null || v === undefined || v === '') return 'null';
  return `'${String(v).replace(/'/g, "''")}'`;
}
function qArr(v) {
  if (!Array.isArray(v) || v.length === 0) return `'{}'`;
  const inner = v.map(x => `"${String(x).replace(/"/g, '\\"')}"`).join(',');
  return `'{${inner}}'`;
}
function qInt(v) {
  if (v === null || v === undefined || v === '') return 'null';
  const n = Number(v);
  return Number.isFinite(n) ? String(Math.round(n)) : 'null';
}

// -----------------------------------------------------------------------------
// Bill slug normalisation. Static JS uses bare bill ids like 'hb249'; some
// historical 135th-GA bills use 'hb467-135'. We keep them as-is so they match
// the existing scorecard migration's seed and the LEGISLATOR_SPONSORSHIPS keys.
// -----------------------------------------------------------------------------
function billSlug(id) { return String(id || '').trim(); }

// -----------------------------------------------------------------------------
// Legislator id convention: matches migration 20260427000002 examples (`h-1`, `s-23`).
// LEGISLATOR_SPONSORSHIPS keys use the older `house-1` / `senate-1` convention;
// we translate at write time.
// -----------------------------------------------------------------------------
function legId(chamber, d) { return `${chamber === 'house' ? 'h' : 's'}-${d}`; }
function legIdFromSponsorshipKey(k) {
  const m = /^(house|senate)-(\d+)$/.exec(k);
  if (!m) return null;
  return legId(m[1], parseInt(m[2], 10));
}

// -----------------------------------------------------------------------------
// Build the output
// -----------------------------------------------------------------------------
const out = [];
const isoNow = new Date().toISOString();

out.push(`-- =============================================================================
-- Generated by scripts/seed-from-static.mjs at ${isoNow}
-- Sources:
--   ${billsPath}
--   ${scorePath}
-- Idempotent: every block is "insert ... on conflict ... do update".
-- =============================================================================

begin;
`);

// ---- bills upsert (denorm fields) ----
out.push(`-- ----------------------------------------------------------------------------
-- 1. Bills (upsert denorm fields used by /issues and /issues/<slug>)
-- ----------------------------------------------------------------------------`);

for (const b of BILLS) {
  const slug = billSlug(b.id);
  if (!slug) continue;
  out.push(`insert into public.bills
  (slug, label, title, ga, stance, summary, status,
   nickname, official_title, status_label, status_color,
   categories, category_labels, sponsors_text, last_action, next_date,
   house_vote, chamber, current_step, url, legislature_url, text_url)
values
  (${q(slug)}, ${q(b.bill)}, ${q(b.title)}, ${q('136th')}, ${q(b.stance || 'anti')},
   ${q(b.description || '')}, ${q(b.status || '')},
   ${q(b.nickname || '')}, ${q(b.officialTitle || b.title)}, ${q(b.statusLabel || '')}, ${q(b.statusColor || '')},
   ${qArr(b.categories || [])}, ${qArr(b.categoryLabels || [])}, ${q(b.sponsors || '')}, ${q(b.lastAction || '')}, ${q(b.nextDate || '')},
   ${q(b.houseVote || '')}, ${q(b.chamber || 'house')}, ${qInt(b.currentStep)}, ${q(b.url || `/issues/${slug}`)}, ${q(b.legislatureUrl || '')}, ${q(b.textUrl || '')})
on conflict (slug) do update set
  label           = excluded.label,
  title           = excluded.title,
  stance          = excluded.stance,
  summary         = excluded.summary,
  status          = excluded.status,
  nickname        = excluded.nickname,
  official_title  = excluded.official_title,
  status_label    = excluded.status_label,
  status_color    = excluded.status_color,
  categories      = excluded.categories,
  category_labels = excluded.category_labels,
  sponsors_text   = excluded.sponsors_text,
  last_action     = excluded.last_action,
  next_date       = excluded.next_date,
  house_vote      = excluded.house_vote,
  chamber         = excluded.chamber,
  current_step    = excluded.current_step,
  url             = excluded.url,
  legislature_url = excluded.legislature_url,
  text_url        = excluded.text_url;
`);
}

// ---- historical bill stubs referenced by sponsorships but not in BILLS ----
// Sponsorship FKs need a row in public.bills for each slug. Some historical
// (135th GA) bills are referenced from LEGISLATOR_SPONSORSHIPS but live
// outside bill-data.js. Insert a minimal stub so the FK lands; the scorecard
// migration may already have richer rows for some of these, in which case
// the `on conflict do nothing` keeps the richer rows.
const billSlugsInData = new Set(BILLS.map(b => billSlug(b.id)));
const sponsorshipSlugs = new Set();
for (const entries of Object.values(LEGISLATOR_SPONSORSHIPS || {})) {
  for (const e of (entries || [])) sponsorshipSlugs.add(billSlug(e.id));
}
const stubSlugs = [...sponsorshipSlugs].filter(s => s && !billSlugsInData.has(s));
if (stubSlugs.length) {
  out.push(`-- ----------------------------------------------------------------------------
-- 1b. Historical-bill stubs (referenced by sponsorships, not in bill-data.js)
-- ----------------------------------------------------------------------------`);
  for (const s of stubSlugs) {
    // Heuristic: anything ending -135 is a 135th-GA bill; everything else gets
    // 136th. Either way we leave label/title alone if the row already exists.
    const ga = /-135$/.test(s) ? '135th' : '136th';
    const label = s.replace(/-135$/, '').replace(/^(hb|sb|hjr|sjr)/i, m => m.toUpperCase() + ' ').replace(/\s+/g, ' ').trim();
    out.push(`insert into public.bills (slug, label, title, ga, stance, summary, status, is_active, display_order)
values (${q(s)}, ${q(label)}, ${q(label + ' (historical reference)')}, ${q(ga)}, 'pro', null, 'historical', false, 999)
on conflict (slug) do nothing;
`);
  }
}

// ---- pipeline steps ----
out.push(`-- ----------------------------------------------------------------------------
-- 2. Bill pipeline steps (one row per (bill, step))
-- ----------------------------------------------------------------------------`);
out.push(`-- Wipe pipeline rows for the bills we are about to seed, then reinsert.
delete from public.bill_pipeline_steps
where bill_slug in (${BILLS.map(b => q(billSlug(b.id))).join(', ')});
`);

for (const b of BILLS) {
  const slug = billSlug(b.id);
  if (!slug) continue;
  const dates = b.pipelineDates || {};
  const steps = Object.keys(dates).map(k => parseInt(k, 10)).filter(n => Number.isFinite(n)).sort((a,b)=>a-b);
  for (const step of steps) {
    const raw = String(dates[step] || '');
    // Try to parse mm/dd/yyyy or "Mon DD, YYYY"; fall back to keeping as label.
    let happened = null;
    const d1 = new Date(raw);
    if (!isNaN(d1.getTime()) && /\d{4}/.test(raw)) {
      happened = d1.toISOString().slice(0, 10);
    }
    out.push(`insert into public.bill_pipeline_steps (bill_slug, step_index, step_label, happened_on)
values (${q(slug)}, ${step}, ${q(happened ? '' : raw)}, ${happened ? q(happened) : 'null'})
on conflict (bill_slug, step_index) do update set step_label = excluded.step_label, happened_on = excluded.happened_on;
`);
  }
}

// ---- legislators ----
out.push(`-- ----------------------------------------------------------------------------
-- 3. Legislators (HOUSE_MEMBERS + SENATE_MEMBERS)
-- The static JS exposes a single \`v\` field that represents combined
-- floor + committee evidence. Until we split it in the editorial source,
-- we map \`v\` into floor_subscore and leave committee_subscore at 0.
-- Sponsorship subscore comes from \`s\`. News (\`n\`) is intentionally
-- dropped (v6 methodology).
-- ----------------------------------------------------------------------------`);

function emitLegislators(members, chamber) {
  for (const m of members) {
    const id = legId(chamber, m.d);
    const vf = Math.max(-5, Math.min(5, Number(m.v) || 0));
    const vc = 0;
    const ss = Math.max(-5, Math.min(5, Number(m.s) || 0));
    out.push(`insert into public.legislators
  (id, chamber, district, full_name, party,
   floor_subscore, committee_subscore, sponsorship_subscore, notes, is_active)
values
  (${q(id)}, ${q(chamber)}, ${m.d}, ${q(m.name)}, ${q(m.party)},
   ${vf}, ${vc}, ${ss}, ${q(m.notes || '')}, true)
on conflict (id) do update set
  chamber              = excluded.chamber,
  district             = excluded.district,
  full_name            = excluded.full_name,
  party                = excluded.party,
  floor_subscore       = excluded.floor_subscore,
  committee_subscore   = excluded.committee_subscore,
  sponsorship_subscore = excluded.sponsorship_subscore,
  notes                = excluded.notes,
  is_active            = true;
`);
  }
}
emitLegislators(HOUSE_MEMBERS, 'house');
emitLegislators(SENATE_MEMBERS, 'senate');

// ---- sponsorships ----
out.push(`-- ----------------------------------------------------------------------------
-- 4. Legislator sponsorships
-- Wipe + reinsert from the editorial source.
-- ----------------------------------------------------------------------------`);
out.push(`delete from public.legislator_sponsorships;`);

for (const [k, entries] of Object.entries(LEGISLATOR_SPONSORSHIPS || {})) {
  const legid = legIdFromSponsorshipKey(k);
  if (!legid) continue;
  for (const e of (entries || [])) {
    const billSlugId = billSlug(e.id);
    const role = (e.role === 'primary') ? 'primary' : 'co';
    out.push(`insert into public.legislator_sponsorships (legislator_id, bill_slug, role)
values (${q(legid)}, ${q(billSlugId)}, ${q(role)})
on conflict (legislator_id, bill_slug) do update set role = excluded.role;
`);
  }
}

out.push(`commit;
`);

// -----------------------------------------------------------------------------
// Output
// -----------------------------------------------------------------------------
const text = out.join('\n');
if (outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, text);
  console.error(`Wrote ${text.length.toLocaleString()} chars to ${outPath}`);
  console.error(`  ${BILLS.length} bills, ${HOUSE_MEMBERS.length + SENATE_MEMBERS.length} legislators, ${Object.keys(LEGISLATOR_SPONSORSHIPS).length} sponsorship keys`);
} else {
  process.stdout.write(text);
}
