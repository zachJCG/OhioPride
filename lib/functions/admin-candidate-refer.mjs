/* =============================================================================
 * Vercel Function: admin-candidate-refer
 * -----------------------------------------------------------------------------
 * "Refer to endorsement process" on /admin/candidate/<id>.
 *
 *   POST /api/admin-candidate-refer   { application_id }
 *   Authorization: Bearer <caller's Supabase access token>
 *
 * Creates an endorsement_applications row prefilled from the candidate
 * application, links it back, moves the application to
 * referred_to_endorsement and records a referral activity row.
 *
 * Why a server hop: authenticated users have no INSERT policy on
 * endorsement_applications (only anon may insert, and only an open cycle's
 * fresh submission). So the caller's permission is checked with
 * has_permission('candidates', 'write') under their own JWT, and the writes
 * run under the service role.
 *
 * Two facts about the endorsement table shape this row:
 *   - status is CHECK constrained to submitted / under_review / endorsed /
 *     declined / withdrawn. There is no 'draft', so the referral lands as
 *     'submitted' with is_published = false and a reviewer note saying where
 *     it came from. It shows in the Screening Committee queue like any other
 *     application, which is the point of a referral.
 *   - submitted_by_kind is CHECK constrained to candidate / campaign_staff /
 *     pac_staff, so staff referrals are 'pac_staff' with the referring admin's
 *     name and email.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * ============================================================================= */

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL as PUBLIC_URL, SUPABASE_ANON_KEY } from '../supabase-public.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_CYCLE_SLUG = '2027-general';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return json(401, { ok: false, error: 'unauthorized' });

  let body;
  try { body = await req.json(); } catch { return json(400, { ok: false, error: 'invalid_json' }); }
  const applicationId = typeof body?.application_id === 'string' && UUID_RE.test(body.application_id)
    ? body.application_id : null;
  if (!applicationId) return json(400, { ok: false, error: 'application_id_required' });

  // Who is asking, and may they?
  const caller = createClient(PUBLIC_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json(401, { ok: false, error: 'unauthorized' });
  const { data: allowed } = await caller.rpc('has_permission', { p_module: 'candidates', p_action: 'write' });
  if (!allowed) return json(403, { ok: false, error: 'forbidden' });

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('admin-candidate-refer: missing supabase env');
    return json(500, { ok: false, error: 'server_misconfigured' });
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { data: app, error: readErr } = await sb
    .from('candidate_applications')
    .select('id, first_name, last_name, pronouns, email, phone, county, city, is_out, party, office_sought, ' +
      'jurisdiction, race_other, race_level, ballot_path, cycle_id, why_running, endorsement_application_id, ' +
      'status, target_race:target_races!candidate_applications_target_race_id_fkey(jurisdiction, office, county, race_level, ballot_path, cycle_id)')
    .eq('id', applicationId)
    .maybeSingle();
  if (readErr || !app) return json(404, { ok: false, error: 'not_found' });
  if (app.endorsement_application_id) {
    return json(409, { ok: false, error: 'already_referred', endorsement_application_id: app.endorsement_application_id });
  }

  const { data: me } = await sb
    .from('admin_users')
    .select('full_name, email')
    .eq('email', (user.email || '').toLowerCase())
    .maybeSingle();

  let cycleId = app.cycle_id || app.target_race?.cycle_id || null;
  if (!cycleId) {
    const { data: c } = await sb.from('election_cycles').select('id').eq('slug', DEFAULT_CYCLE_SLUG).maybeSingle();
    cycleId = c?.id || null;
  }
  if (!cycleId) return json(500, { ok: false, error: 'no_cycle' });

  const office = app.target_race?.office || app.office_sought || app.race_other || 'Office to be confirmed';
  const jurisdiction = app.target_race?.jurisdiction || app.jurisdiction || null;
  const row = {
    status: 'submitted',
    is_published: false,
    candidate_name: `${app.first_name} ${app.last_name}`.trim(),
    first_name: app.first_name,
    last_name: app.last_name,
    pronouns: app.pronouns,
    email: app.email,
    phone: app.phone,
    office_sought: office,
    jurisdiction,
    county: app.target_race?.county || app.county || null,
    race_level: app.target_race?.race_level || app.race_level || null,
    ballot_path: app.target_race?.ballot_path || app.ballot_path || null,
    cycle_id: cycleId,
    is_out: app.is_out,
    party: app.party,
    bio: app.why_running,
    election_year: 2027,
    attestation: false,
    submitted_by_kind: 'pac_staff',
    submitted_by_name: me?.full_name || user.email,
    submitted_by_email: me?.email || user.email,
    reviewer_notes: `Referred from the Race to 100 candidate application ${app.id} by ${me?.full_name || user.email}. ` +
      'The candidate has not completed the endorsement questionnaire; attestation is unsigned.',
  };

  const { data: ea, error: insErr } = await sb
    .from('endorsement_applications')
    .insert(row)
    .select('id')
    .single();
  if (insErr || !ea) {
    console.error('admin-candidate-refer: insert failed', insErr);
    return json(500, { ok: false, error: 'insert_failed', message: insErr?.message });
  }

  const { error: updErr } = await sb
    .from('candidate_applications')
    .update({ endorsement_application_id: ea.id, status: 'referred_to_endorsement' })
    .eq('id', app.id);
  if (updErr) console.error('admin-candidate-refer: link failed', updErr);

  const { error: actErr } = await sb.from('candidate_application_activity').insert({
    application_id: app.id,
    kind: 'referral',
    actor_email: user.email || null,
    body: `Referred to the endorsement process (application ${ea.id}). Status set to Referred to endorsement.`,
  });
  if (actErr) console.error('admin-candidate-refer: activity failed', actErr);

  return json(200, { ok: true, endorsement_application_id: ea.id });
};
