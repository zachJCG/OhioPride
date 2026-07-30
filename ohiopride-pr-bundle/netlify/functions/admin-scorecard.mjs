/* =============================================================================
 * Netlify Function: admin-scorecard
 * -----------------------------------------------------------------------------
 * Authenticated write endpoint for the /admin/scorecard dashboard.
 *
 * Auth model: bearer JWT from the user's Supabase session (Authorization
 * header). The function verifies the JWT, checks the caller's email is in
 * public.admin_emails, and only then writes with the service role.
 *
 * Routes (single endpoint, dispatched by `action`):
 *   GET                                          -> { legislators, bills,
 *                                                    sponsorships, roll_calls,
 *                                                    exceptions } (all current
 *                                                    state for the dashboard)
 *
 *   POST { action: 'upsert_legislator', row }    -> upsert one legislator
 *   POST { action: 'upsert_legislators', rows }  -> bulk upsert
 *   POST { action: 'delete_legislator', id }
 *
 *   POST { action: 'upsert_sponsorship', row }   -> { legislator_id, bill_slug, role }
 *   POST { action: 'delete_sponsorship', row }
 *
 *   POST { action: 'upsert_roll_call', row }
 *   POST { action: 'delete_roll_call', id }
 *
 *   POST { action: 'upsert_vote_exception', row }
 *   POST { action: 'delete_vote_exception', row }
 *
 *   POST { action: 'publish', changes: [...] }   -> apply a batch atomically
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

  const { data: allow, error: allowErr } = await anonClient
    .from('admin_emails')
    .select('email')
    .eq('email', email)
    .maybeSingle();
  if (allowErr) return { ok: false, status: 500, error: allowErr.message };
  if (!allow)   return { ok: false, status: 403, error: 'not_admin' };

  return { ok: true, email };
}

async function loadState(svc) {
  const [legRes, billsRes, sponsRes, rollRes, excRes] = await Promise.all([
    svc.from('legislators').select('*').order('chamber').order('district'),
    svc.from('bills').select('slug, label, title, ga, stance').order('slug'),
    svc.from('legislator_sponsorships').select('*'),
    svc.from('roll_calls').select('*').order('vote_date', { ascending: false }),
    svc.from('legislator_vote_exceptions').select('*'),
  ]);
  const err = [legRes, billsRes, sponsRes, rollRes, excRes].find(r => r.error);
  if (err) return { error: err.error.message };
  return {
    legislators: legRes.data || [],
    bills:       billsRes.data || [],
    sponsorships: sponsRes.data || [],
    roll_calls:  rollRes.data || [],
    exceptions:  excRes.data || [],
  };
}

async function applyChange(svc, change) {
  const { action } = change;
  switch (action) {
    case 'upsert_legislator': {
      const { row } = change;
      const { error } = await svc.from('legislators').upsert(row, { onConflict: 'id' });
      if (error) throw error;
      return { ok: true, action, id: row.id };
    }
    case 'upsert_legislators': {
      const { rows } = change;
      const { error } = await svc.from('legislators').upsert(rows, { onConflict: 'id' });
      if (error) throw error;
      return { ok: true, action, count: rows.length };
    }
    case 'delete_legislator': {
      const { id } = change;
      const { error } = await svc.from('legislators').delete().eq('id', id);
      if (error) throw error;
      return { ok: true, action, id };
    }
    case 'upsert_sponsorship': {
      const { row } = change;
      const { error } = await svc
        .from('legislator_sponsorships')
        .upsert(row, { onConflict: 'legislator_id,bill_slug' });
      if (error) throw error;
      return { ok: true, action, key: `${row.legislator_id}/${row.bill_slug}` };
    }
    case 'delete_sponsorship': {
      const { row } = change;
      const { error } = await svc
        .from('legislator_sponsorships')
        .delete()
        .eq('legislator_id', row.legislator_id)
        .eq('bill_slug', row.bill_slug);
      if (error) throw error;
      return { ok: true, action, key: `${row.legislator_id}/${row.bill_slug}` };
    }
    case 'upsert_roll_call': {
      const { row } = change;
      const { data, error } = await svc.from('roll_calls').upsert(row).select().maybeSingle();
      if (error) throw error;
      return { ok: true, action, id: data?.id };
    }
    case 'delete_roll_call': {
      const { id } = change;
      const { error } = await svc.from('roll_calls').delete().eq('id', id);
      if (error) throw error;
      return { ok: true, action, id };
    }
    case 'upsert_vote_exception': {
      const { row } = change;
      const { error } = await svc
        .from('legislator_vote_exceptions')
        .upsert(row, { onConflict: 'roll_call_id,legislator_id' });
      if (error) throw error;
      return { ok: true, action };
    }
    case 'delete_vote_exception': {
      const { row } = change;
      const { error } = await svc
        .from('legislator_vote_exceptions')
        .delete()
        .eq('roll_call_id', row.roll_call_id)
        .eq('legislator_id', row.legislator_id);
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

  // Batch publish
  if (body.action === 'publish' && Array.isArray(body.changes)) {
    const results = [];
    for (const change of body.changes) {
      try { results.push(await applyChange(svc, change)); }
      catch (e) {
        return json(400, { ok: false, error: e.message, applied: results.length });
      }
    }
    const state = await loadState(svc);
    return json(200, { ok: true, applied: results.length, ...state });
  }

  // Single op
  try {
    const result = await applyChange(svc, body);
    const state  = await loadState(svc);
    return json(200, { ok: true, result, ...state });
  } catch (e) {
    return json(400, { ok: false, error: e.message });
  }
};
