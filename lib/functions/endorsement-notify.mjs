/* =============================================================================
 * Vercel Function: endorsement-notify
 * -----------------------------------------------------------------------------
 * Emails staff when a candidate submits an endorsement application.
 *
 * Endorsement applications are the one public form that does NOT go through a
 * function: /endorsement/screening inserts straight into
 * public.endorsement_applications from the browser with the anon key. There is
 * no server hop to hang a notification off, so this endpoint is that hop.
 *
 *   POST /api/endorsement-notify
 *
 * Two accepted shapes:
 *
 *   1. { email }  — what the screening form sends after a successful insert.
 *      We look up the newest application for that address created inside
 *      ENDORSEMENT_NOTIFY_WINDOW_MS and email that row. Nothing the caller
 *      sends is ever echoed into the email: the body only selects which row to
 *      read, and every value comes back from the database under the service
 *      role. A request that matches no recent row sends nothing.
 *
 *   2. { type: 'INSERT', record: { id } }  — a Supabase database webhook,
 *      which fires even if the candidate closes the tab before the browser
 *      call lands. Requires the x-webhook-secret header to match
 *      SUBMISSION_WEBHOOK_SECRET; without that env set the shape is refused,
 *      so the webhook path is opt-in rather than open by default.
 *
 * Anon has no SELECT on endorsement_applications, which is why the browser
 * cannot read its own row back and this endpoint reads it with the service
 * role instead.
 *
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (row lookup)
 *   RESEND_API_KEY                            (see lib/notify.mjs)
 *   SUBMISSION_WEBHOOK_SECRET                 (optional; enables shape 2)
 *   ENDORSEMENT_NOTIFY_WINDOW_MS              (optional; default 900000 = 15 min)
 * ============================================================================= */

import { createClient } from '@supabase/supabase-js';
import { notifySubmission } from '../notify.mjs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;

const COLUMNS = [
  'id', 'created_at', 'candidate_name', 'first_name', 'last_name', 'pronouns',
  'office_sought', 'district', 'election_year', 'is_special_election', 'party',
  'committee_name', 'treasurer_name', 'email', 'phone', 'website', 'is_out',
  'endorsement_path', 'is_incumbent', 'current_office', 'responses', 'bio',
  'status',
].join(', ');

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function windowMs() {
  const n = Number.parseInt(process.env.ENDORSEMENT_NOTIFY_WINDOW_MS || '', 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_WINDOW_MS;
}

function answeredCount(responses) {
  if (!responses || typeof responses !== 'object') return null;
  const total = Object.keys(responses).length;
  return total ? `${total} question${total === 1 ? '' : 's'} answered` : null;
}

function raceLabel(row) {
  const parts = [row.office_sought];
  if (row.district) parts.push(`District ${row.district}`);
  if (row.is_special_election) parts.push('special election');
  else if (row.election_year) parts.push(String(row.election_year));
  return parts.filter(Boolean).join(' — ');
}

export const config = { runtime: 'edge' };

export default async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse(405, { ok: false, error: 'method_not_allowed' });
  }

  let body;
  try { body = await req.json(); }
  catch { return jsonResponse(400, { ok: false, error: 'invalid_json' }); }
  if (!body || typeof body !== 'object') {
    return jsonResponse(400, { ok: false, error: 'invalid_json' });
  }

  // Decide which row to read, and prove the caller may ask for it.
  const isWebhook = typeof body.type === 'string' && body.record && typeof body.record === 'object';
  let lookupId = null;
  let lookupEmail = null;

  if (isWebhook) {
    const secret = process.env.SUBMISSION_WEBHOOK_SECRET;
    if (!secret) return jsonResponse(404, { ok: false, error: 'webhook_disabled' });
    if (req.headers.get('x-webhook-secret') !== secret) {
      return jsonResponse(401, { ok: false, error: 'unauthorized' });
    }
    if (body.type !== 'INSERT') return jsonResponse(200, { ok: true, notified: false, skipped: 'not_insert' });
    lookupId = typeof body.record.id === 'string' && UUID_RE.test(body.record.id) ? body.record.id : null;
    if (!lookupId) return jsonResponse(400, { ok: false, error: 'invalid_record_id' });
  } else {
    const raw = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!raw || raw.length > 320 || !EMAIL_RE.test(raw)) {
      return jsonResponse(400, { ok: false, error: 'valid_email_required' });
    }
    lookupEmail = raw;
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('endorsement-notify: missing supabase env');
    return jsonResponse(500, { ok: false, error: 'server_misconfigured' });
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  let query = supabase.from('endorsement_applications').select(COLUMNS);
  if (lookupId) {
    query = query.eq('id', lookupId);
  } else {
    // Recency bounds the browser-triggered path: knowing a candidate's address
    // is not enough to make this endpoint email about an older application.
    query = query
      .ilike('email', lookupEmail)
      .gte('created_at', new Date(Date.now() - windowMs()).toISOString());
  }

  const { data: row, error } = await query
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('endorsement-notify lookup failed:', error);
    return jsonResponse(500, { ok: false, error: 'lookup_failed' });
  }
  // No matching recent row is a normal outcome, not an error: a stale retry or
  // a probe both land here. Say nothing about whether the address is known.
  if (!row) return jsonResponse(200, { ok: true, notified: false });

  const name = row.candidate_name
    || [row.first_name, row.last_name].filter(Boolean).join(' ')
    || 'a candidate';

  const { ok } = await notifySubmission({
    kind: 'endorsement',
    title: `New endorsement application: ${name}`,
    fields: {
      Candidate: name,
      Pronouns: row.pronouns,
      Race: raceLabel(row),
      Party: row.party,
      Incumbent: row.is_incumbent ? (row.current_office ? `Yes — ${row.current_office}` : 'Yes') : 'No',
      'Out publicly': row.is_out,
      Email: row.email,
      Phone: row.phone,
      Website: row.website,
      Committee: row.committee_name,
      Treasurer: row.treasurer_name,
      'Screening path': row.endorsement_path,
      Questionnaire: answeredCount(row.responses),
      Status: row.status,
      Bio: row.bio,
    },
    replyTo: row.email,
    adminPath: `/admin/endorsements/${row.id}`,
    adminLabel: 'Review this application',
  });

  return jsonResponse(200, { ok: true, notified: ok });
};
