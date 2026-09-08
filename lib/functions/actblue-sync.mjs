/* =============================================================================
 * actblue-sync (v4): hourly cron + admin "Sync now" for ActBlue contributions
 * -----------------------------------------------------------------------------
 * v3 called an endpoint that does not exist (GET /api/v1/contributions, which
 * ActBlue answers with 404) using username/password env that was never set,
 * so the cron had never ingested a single contribution. v4 uses the real CSV
 * API (request an export, poll it, download it) with the client UUID/secret
 * credentials ActBlue issues, and hands the rows to lib/actblue.mjs, which is
 * shared with the admin CSV import so both paths reconcile identically.
 *
 * What one run does:
 *   1. Works out the window. Incremental runs start 24h before the last
 *      successful run's end (never less than 48h back, never more than 180
 *      days). The very first run looks back 180 days so history self-heals.
 *      Backfills take ?since=YYYY-MM-DD[&until=...] and are chunked to the
 *      API's six-month cap.
 *   2. Pulls paid_contributions, refunded_contributions and
 *      cancelled_recurring_contributions for the window.
 *   3. Reconciles: founding members (one row per person), donors (one row per
 *      payment), contacts (fill-never-overwrite), refunds, cancellations.
 *   4. Records the run in public.actblue_sync_runs so the admin can see when
 *      the last sync happened and what it did.
 *
 * Auth (one of):
 *   - Authorization: Bearer <CRON_SECRET>      Vercel cron (set CRON_SECRET in
 *                                              the project; Vercel sends it).
 *   - Authorization: Bearer <supabase JWT>     an admin with donors:write
 *                                              (the Members page button).
 *   - no header, CRON_SECRET unset             allowed but flagged in the
 *                                              response; set the secret.
 *
 * Params (query string, or JSON body on POST):
 *   since, until   ISO dates: run a backfill over that range instead
 *   dry_run=1      compute and log the plan, write nothing
 *   types=a,b      subset of paid,refunded,cancelled (default all)
 *   force=1        ignore a run that appears to still be in progress
 *
 * Environment:
 *   ACTBLUE_CLIENT_UUID / ACTBLUE_CLIENT_SECRET   CSV API credentials
 *     (ACTBLUE_USERNAME / ACTBLUE_PASSWORD are read as a fallback)
 *   ACTBLUE_FOUNDING_REFCODE_MATCH   default "founding": a refcode containing
 *                                    it is a founding-member contribution
 *   ACTBLUE_SYNC_AUTO_PUBLISH        "true" to insert new founding members as
 *                                    vetted + public (default: private until
 *                                    an admin vets them)
 *   CRON_SECRET                      protects the endpoint (see Auth)
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * ============================================================================= */

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../supabase-public.mjs';
import {
  fetchActBlueCsv, mapContributionCsv, mapCancellationCsv,
  reconcileContributions, applyRefunds, applyCancellations,
  MAX_RANGE_DAYS, DEFAULT_FOUNDING_MATCH, ActBlueApiError,
} from '../actblue.mjs';

const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;
const OVERLAP_MS = 24 * HOUR_MS;        // re-read this much before the last run's end
const MIN_LOOKBACK_MS = 48 * HOUR_MS;   // never look back less than this
const FIRST_RUN_LOOKBACK_DAYS = 180;    // no prior run: pull the API's full window
const STALE_RUN_MS = 15 * 60 * 1000;    // a "running" row older than this is dead
const TIME_BUDGET_MS = 270 * 1000;      // route maxDuration is 300s
const PLAN_LIMIT = 400;                 // plan entries kept on the run row

const TYPE_ALIASES = {
  paid: 'paid_contributions', paid_contributions: 'paid_contributions',
  refunded: 'refunded_contributions', refunds: 'refunded_contributions', refunded_contributions: 'refunded_contributions',
  cancelled: 'cancelled_recurring_contributions', cancellations: 'cancelled_recurring_contributions',
  cancelled_recurring_contributions: 'cancelled_recurring_contributions',
};
const ALL_TYPES = ['paid_contributions', 'refunded_contributions', 'cancelled_recurring_contributions'];

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function constantTimeEqual(a, b) {
  const x = String(a || ''), y = String(b || '');
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

const truthyParam = (v) => ['1', 'true', 'yes', 'on'].includes(String(v ?? '').toLowerCase());

function parseDateParam(v, label) {
  if (v == null || v === '') return null;
  const s = String(v);
  // A bare date means midnight UTC of that day.
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00Z` : s);
  if (isNaN(d.getTime())) throw new Error(`${label} is not a valid date`);
  return d;
}

async function readParams(req) {
  const url = new URL(req.url);
  const p = Object.fromEntries(url.searchParams.entries());
  if (req.method === 'POST') {
    const ct = req.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try { Object.assign(p, await req.json()); } catch { /* empty body is fine */ }
    }
  }
  return p;
}

function sum(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) if (typeof v === 'number') out[k] = (out[k] || 0) + v;
  return out;
}

export default async (req) => {
  if (req.method !== 'GET' && req.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });
  const started = Date.now();
  const deadline = started + TIME_BUDGET_MS;

  const env = process.env;
  const clientUuid = env.ACTBLUE_CLIENT_UUID || env.ACTBLUE_USERNAME;
  const clientSecret = env.ACTBLUE_CLIENT_SECRET || env.ACTBLUE_PASSWORD;
  const foundingMatch = env.ACTBLUE_FOUNDING_REFCODE_MATCH || DEFAULT_FOUNDING_MATCH;
  const autoPublish = truthyParam(env.ACTBLUE_SYNC_AUTO_PUBLISH);
  const cronSecret = env.CRON_SECRET;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = env.SUPABASE_URL || SUPABASE_URL;

  const missing = [
    ['ACTBLUE_CLIENT_UUID', clientUuid],
    ['ACTBLUE_CLIENT_SECRET', clientSecret],
    ['SUPABASE_SERVICE_ROLE_KEY', serviceKey],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    return json(500, { ok: false, error: 'missing_env', missing, hint: 'Set these in the Vercel project (Settings > Environment Variables) and redeploy.' });
  }

  /* ---- auth ------------------------------------------------------------- */
  const bearer = (req.headers.get('authorization') || '').match(/^Bearer (.+)$/i)?.[1] || null;
  let trigger = 'cron';
  let triggeredBy = null;
  const warnings = [];
  if (bearer && cronSecret && constantTimeEqual(bearer, cronSecret)) {
    trigger = 'cron';
  } else if (bearer) {
    const userClient = createClient(supabaseUrl, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: allowed, error: permErr } = await userClient.rpc('has_permission', { p_module: 'donors', p_action: 'write' });
    if (permErr || !allowed) return json(403, { ok: false, error: 'not_authorized' });
    const { data: userData } = await userClient.auth.getUser();
    triggeredBy = userData?.user?.email || null;
    trigger = 'manual';
  } else if (!cronSecret) {
    warnings.push('CRON_SECRET is not set, so this endpoint accepts unauthenticated requests. Set it in Vercel; the cron sends it automatically.');
  } else {
    return json(401, { ok: false, error: 'missing_bearer' });
  }

  /* ---- params ----------------------------------------------------------- */
  let params;
  try { params = await readParams(req); } catch { params = {}; }
  const dryRun = truthyParam(params.dry_run);
  const force = truthyParam(params.force);
  let since, until;
  try {
    since = parseDateParam(params.since, 'since');
    until = parseDateParam(params.until, 'until');
  } catch (e) {
    return json(400, { ok: false, error: 'bad_param', message: e.message });
  }
  let types = ALL_TYPES;
  if (params.types) {
    const wanted = String(params.types).split(',').map((t) => TYPE_ALIASES[t.trim().toLowerCase()]).filter(Boolean);
    if (!wanted.length) return json(400, { ok: false, error: 'bad_param', message: 'types must include paid, refunded and/or cancelled' });
    types = ALL_TYPES.filter((t) => wanted.includes(t));
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const now = new Date(started);

  /* ---- stale + concurrent runs ----------------------------------------- */
  const staleBefore = new Date(started - STALE_RUN_MS).toISOString();
  await admin.from('actblue_sync_runs')
    .update({ status: 'error', finished_at: now.toISOString(), error: 'Run never finished (marked stale by a later run).' })
    .eq('status', 'running').lt('started_at', staleBefore);
  if (!force) {
    const { data: active, error: activeErr } = await admin.from('actblue_sync_runs')
      .select('id, started_at, trigger').eq('status', 'running').gte('started_at', staleBefore).limit(1);
    if (activeErr) return json(500, { ok: false, error: 'runs_read_failed', message: activeErr.message });
    if (active?.length) {
      return json(409, { ok: false, error: 'already_running', run_id: active[0].id, started_at: active[0].started_at, trigger: active[0].trigger });
    }
  }

  /* ---- window ----------------------------------------------------------- */
  let rangeStart, rangeEnd;
  if (since) {
    // A ranged run is a backfill whoever started it; triggered_by keeps the who.
    trigger = 'backfill';
    rangeStart = since;
    rangeEnd = until || now;
    if (rangeEnd > now) rangeEnd = now;
    if (rangeEnd <= rangeStart) return json(400, { ok: false, error: 'bad_param', message: 'until must be after since' });
    if (rangeEnd - rangeStart > 2 * 365 * DAY_MS) return json(400, { ok: false, error: 'bad_param', message: 'backfill ranges are limited to two years per run' });
  } else {
    const { data: last } = await admin.from('actblue_sync_runs')
      .select('range_end').eq('status', 'ok').eq('dry_run', false)
      .contains('csv_types', ['paid_contributions'])
      .order('range_end', { ascending: false }).limit(1);
    const lastEnd = last?.[0]?.range_end ? new Date(last[0].range_end) : null;
    rangeEnd = now;
    if (lastEnd) {
      rangeStart = new Date(Math.min(started - MIN_LOOKBACK_MS, lastEnd.getTime() - OVERLAP_MS));
      rangeStart = new Date(Math.max(rangeStart.getTime(), started - MAX_RANGE_DAYS * DAY_MS));
    } else {
      rangeStart = new Date(started - FIRST_RUN_LOOKBACK_DAYS * DAY_MS);
    }
  }

  // Chunk to the API's per-request cap, oldest first so founding numbers
  // follow join order across chunks too.
  const chunks = [];
  for (let s = rangeStart.getTime(); s < rangeEnd.getTime(); s += MAX_RANGE_DAYS * DAY_MS) {
    chunks.push({ start: new Date(s), end: new Date(Math.min(s + MAX_RANGE_DAYS * DAY_MS, rangeEnd.getTime())) });
  }

  /* ---- run row ---------------------------------------------------------- */
  const { data: runRow, error: runErr } = await admin.from('actblue_sync_runs').insert({
    status: 'running', trigger, triggered_by: triggeredBy, dry_run: dryRun,
    range_start: rangeStart.toISOString(), range_end: rangeEnd.toISOString(), csv_types: types,
  }).select('id').single();
  if (runErr) return json(500, { ok: false, error: 'run_insert_failed', message: runErr.message });
  const runId = runRow.id;

  const totals = {
    rows_seen: 0, rows_skipped: 0,
    founding_inserted: 0, founding_updated: 0, donors_inserted: 0, donors_skipped: 0,
    refunds_applied: 0, cancellations_applied: 0, contacts_created: 0, contacts_enriched: 0,
  };
  const detail = { chunks: chunks.length, csv: {}, plan: [], problems: [], warnings, auto_publish: autoPublish };
  let sub = { founding_adopted: 0, donors_adopted: 0, donors_updated: 0, founding_refunded: 0, donors_refunded: 0, founding_cancelled: 0, donors_cancelled: 0, refunds_unmatched: 0, cancellations_unmatched: 0, errors: 0 };

  const pushPlan = (entries) => { for (const e of entries) if (detail.plan.length < PLAN_LIMIT) detail.plan.push(e); };
  const csvOpts = { clientUuid, clientSecret };
  const remaining = () => deadline - Date.now();

  let failure = null;
  try {
    for (const [i, ch] of chunks.entries()) {
      if (remaining() < 20_000) throw new Error(`time budget exhausted before chunk ${i + 1} of ${chunks.length}`);
      const label = `${ch.start.toISOString().slice(0, 10)}..${ch.end.toISOString().slice(0, 10)}`;

      if (types.includes('paid_contributions')) {
        const text = await fetchActBlueCsv({ ...csvOpts, csvType: 'paid_contributions', start: ch.start, end: ch.end, deadlineMs: Date.now() + Math.min(150_000, remaining() - 10_000) });
        const { rows, skipped, total } = mapContributionCsv(text, { foundingMatch });
        detail.csv[`paid:${label}`] = { rows: total, skipped };
        totals.rows_seen += total;
        totals.rows_skipped += Object.values(skipped).reduce((a, b) => a + b, 0);
        const r = await reconcileContributions(admin, rows, { dryRun, autoPublish });
        totals.founding_inserted += r.counts.founding_inserted;
        totals.founding_updated += r.counts.founding_updated + r.counts.founding_adopted;
        totals.donors_inserted += r.counts.donors_inserted;
        totals.donors_skipped += r.counts.donors_skipped;
        totals.contacts_created += r.counts.contacts_created;
        totals.contacts_enriched += r.counts.contacts_enriched;
        sub = sum(sub, { founding_adopted: r.counts.founding_adopted, donors_adopted: r.counts.donors_adopted, donors_updated: r.counts.donors_updated, errors: r.counts.errors });
        pushPlan(r.plan.filter((p) => p.action !== 'donor_exists' && p.action !== 'founding_exists'));
        detail.problems.push(...r.problems);
      }

      if (types.includes('refunded_contributions')) {
        if (remaining() < 20_000) throw new Error('time budget exhausted before refunds');
        const text = await fetchActBlueCsv({ ...csvOpts, csvType: 'refunded_contributions', start: ch.start, end: ch.end, deadlineMs: Date.now() + Math.min(90_000, remaining() - 10_000) });
        const { rows, skipped, total } = mapContributionCsv(text, { foundingMatch });
        detail.csv[`refunded:${label}`] = { rows: total, skipped };
        const r = await applyRefunds(admin, rows, { dryRun });
        totals.refunds_applied += r.counts.founding_refunded + r.counts.donors_refunded;
        sub = sum(sub, { founding_refunded: r.counts.founding_refunded, donors_refunded: r.counts.donors_refunded, refunds_unmatched: r.counts.unmatched, errors: r.counts.errors });
        pushPlan(r.plan);
        detail.problems.push(...r.problems);
      }

      if (types.includes('cancelled_recurring_contributions')) {
        if (remaining() < 20_000) throw new Error('time budget exhausted before cancellations');
        const text = await fetchActBlueCsv({ ...csvOpts, csvType: 'cancelled_recurring_contributions', start: ch.start, end: ch.end, deadlineMs: Date.now() + Math.min(90_000, remaining() - 10_000) });
        const { rows, skipped, total } = mapCancellationCsv(text);
        detail.csv[`cancelled:${label}`] = { rows: total, skipped };
        const r = await applyCancellations(admin, rows, { dryRun });
        totals.cancellations_applied += r.counts.founding_cancelled + r.counts.donors_cancelled;
        sub = sum(sub, { founding_cancelled: r.counts.founding_cancelled, donors_cancelled: r.counts.donors_cancelled, cancellations_unmatched: r.counts.unmatched, errors: r.counts.errors });
        pushPlan(r.plan);
        detail.problems.push(...r.problems);
      }
    }
  } catch (err) {
    failure = err;
  }

  const durationMs = Date.now() - started;
  const status = failure ? 'error' : (sub.errors ? 'error' : 'ok');
  const errorText = failure
    ? (failure instanceof ActBlueApiError ? `${failure.message}${failure.body ? ` :: ${String(failure.body).slice(0, 300)}` : ''}` : failure.message)
    : (sub.errors ? `${sub.errors} row(s) failed to write; see detail.problems` : null);
  detail.sub = sub;
  detail.problems = detail.problems.slice(0, 100);

  await admin.from('actblue_sync_runs').update({
    status, finished_at: new Date().toISOString(), duration_ms: durationMs, error: errorText,
    ...totals, detail,
  }).eq('id', runId);

  const body = {
    ok: status === 'ok',
    run_id: runId,
    trigger, triggered_by: triggeredBy, dry_run: dryRun,
    range_start: rangeStart.toISOString(), range_end: rangeEnd.toISOString(), csv_types: types,
    ...totals,
    detail: { ...detail, plan: detail.plan.slice(0, 100) },
    error: errorText,
    ms: durationMs,
  };
  if (failure instanceof ActBlueApiError) body.actblue_status = failure.status ?? null;
  return json(failure ? (failure instanceof ActBlueApiError ? 502 : 500) : 200, body);
};
