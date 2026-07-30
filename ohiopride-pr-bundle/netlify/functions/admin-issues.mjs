/* =============================================================================
 * Netlify Function: admin-issues
 * -----------------------------------------------------------------------------
 * Authenticated write endpoint for the /admin/issues dashboard.
 *
 * Auth: bearer JWT verified against public.admin_emails (same pattern as
 * admin-scorecard).
 *
 *   GET                                       -> { bills, pipeline_steps }
 *
 *   POST { action: 'upsert_bill', row }       -> upsert single bill, returns it
 *   POST { action: 'delete_bill', slug }      -> soft delete (is_active=false)
 *
 *   POST { action: 'upsert_pipeline_step', row } -> { bill_slug, step_index, step_label, happened_on }
 *   POST { action: 'delete_pipeline_step', row } -> { bill_slug, step_index }
 *
 *   POST { action: 'publish', changes: [...] } -> apply a batch
 *
 * The shape of `row` for upsert_bill matches public.bills exactly:
 *   { slug, label, title, ga, stance, summary, status, is_active,
 *     display_order, nickname, official_title, status_label, status_color,
 *     categories[], category_labels[], sponsors_text, last_action, next_date,
 *     house_vote, chamber, current_step, url, legislature_url, text_url }
 * ============================================================================= */

import { createClient } from '@supabase/supabase-js';

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

async function verifyAdmin(req, anonClient) {
  const auth = req.headers.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/.exec(auth);
  if (!match) return { ok: false, status: 401, error: 'missing_bearer' };
  const token = match[1];
  const { data: userRes, error: userErr } = await anonClient.auth.getUser(token);
  if (userErr || !userRes?.user) return { ok: false, status: 401, error: 'invalid_session' };
  const email = userRes.user.email;
  if (!email) return { ok: false, status: 403, error: 'no_email' };
  const { data: allow } = await anonClient.from('admin_emails').select('email').eq('email', email).maybeSingle();
  if (!allow) return { ok: false, status: 403, error: 'not_admin' };
  return { ok: true, email };
}

async function loadState(svc) {
  const [billsRes, pipeRes] = await Promise.all([
    svc.from('bills').select('*').order('display_order').order('slug'),
    svc.from('bill_pipeline_steps').select('*').order('bill_slug').order('step_index'),
  ]);
  const err = [billsRes, pipeRes].find(r => r.error);
  if (err) return { error: err.error.message };
  return {
    bills:           billsRes.data || [],
    pipeline_steps:  pipeRes.data   || [],
  };
}

async function applyChange(svc, change) {
  const { action } = change;
  switch (action) {
    case 'upsert_bill': {
      const { row } = change;
      const { data, error } = await svc.from('bills').upsert(row, { onConflict: 'slug' }).select().maybeSingle();
      if (error) throw error;
      return { ok: true, action, slug: data?.slug };
    }
    case 'delete_bill': {
      const { slug } = change;
      // Soft delete — preserves roll_calls, sponsorships, pipeline_steps
      const { error } = await svc.from('bills').update({ is_active: false, updated_at: new Date().toISOString() }).eq('slug', slug);
      if (error) throw error;
      return { ok: true, action, slug };
    }
    case 'upsert_pipeline_step': {
      const { row } = change;
      const { error } = await svc
        .from('bill_pipeline_steps')
        .upsert(row, { onConflict: 'bill_slug,step_index' });
      if (error) throw error;
      return { ok: true, action, key: `${row.bill_slug}#${row.step_index}` };
    }
    case 'delete_pipeline_step': {
      const { row } = change;
      const { error } = await svc
        .from('bill_pipeline_steps')
        .delete()
        .eq('bill_slug', row.bill_slug)
        .eq('step_index', row.step_index);
      if (error) throw error;
      return { ok: true, action };
    }
    default:
      throw new Error('unknown_action:' + action);
  }
}

export default async (req) => {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { ok: false, error: 'missing_supabase_env' });
  }

  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const auth = await verifyAdmin(req, anon);
  if (!auth.ok) return json(auth.status, { ok: false, error: auth.error });

  const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  if (req.method === 'GET') {
    const state = await loadState(svc);
    if (state.error) return json(500, { ok: false, error: state.error });
    return json(200, { ok: true, ...state, fetched_at: new Date().toISOString() });
  }

  if (req.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

  let body;
  try { body = await req.json(); }
  catch { return json(400, { ok: false, error: 'invalid_json' }); }

  if (body.action === 'publish' && Array.isArray(body.changes)) {
    const results = [];
    for (const change of body.changes) {
      try { results.push(await applyChange(svc, change)); }
      catch (e) { return json(400, { ok: false, error: e.message, applied: results.length }); }
    }
    const state = await loadState(svc);
    return json(200, { ok: true, applied: results.length, ...state });
  }

  try {
    const result = await applyChange(svc, body);
    const state  = await loadState(svc);
    return json(200, { ok: true, result, ...state });
  } catch (e) {
    return json(400, { ok: false, error: e.message });
  }
};
