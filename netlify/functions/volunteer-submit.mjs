/* =============================================================================
 * Netlify Function: volunteer-submit
 * -----------------------------------------------------------------------------
 * Receives JSON POSTs from the multi-step form on /volunteer and inserts a
 * row into public.volunteers via the Supabase service-role key.
 *
 * Endpoint:
 *   POST /.netlify/functions/volunteer-submit
 *   body: { first_name, last_name, email, ..., website }   // 'website' = honeypot
 *   -> { ok: true, id }                                    on success
 *   -> { ok: false, error }                                on failure
 *
 * Honeypot: if the hidden 'website' field is filled, we silently return ok
 * without writing anything. That way a bot can't tell whether the submission
 * worked, and we don't pollute the table.
 * ============================================================================= */

import { createClient } from '@supabase/supabase-js';

const ALLOWED_INTERESTS = new Set([
  'field_canvassing', 'phone_text_banking', 'pride_tabling', 'social_amplification',
  'skills_based', 'house_party_host', 'local_captain', 'day_of_logistics',
]);

const ALLOWED_SKILLS = new Set([
  'writing', 'graphic_design', 'photography', 'videography', 'legal',
  'data_analysis', 'web_development', 'accounting_finance', 'event_planning',
  'public_speaking', 'fundraising', 'social_media', 'asl', 'spanish', 'other_language',
]);

const ALLOWED_AVAILABILITY = new Set(['weekday_days', 'weekday_evenings', 'weekends']);
const ALLOWED_TIME_COMMITMENT = new Set(['one_time', 'monthly', 'weekly', 'surge_only']);
const ALLOWED_REGISTERED_VOTER = new Set(['yes', 'no', 'unsure']);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function clean(value, max) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return max && s.length > max ? s.slice(0, max) : s;
}

function filterArray(value, allowed) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const v of value) {
    if (typeof v !== 'string') continue;
    if (!allowed.has(v)) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function pickEnum(value, allowed) {
  if (typeof value !== 'string') return null;
  return allowed.has(value) ? value : null;
}

function clientIp(req) {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-nf-client-connection-ip') || null;
}

export default async (req, _context) => {
  if (req.method !== 'POST') {
    return jsonResponse(405, { ok: false, error: 'method_not_allowed' });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { ok: false, error: 'invalid_json' });
  }

  // Honeypot: pretend success so bots don't retry.
  if (body && typeof body.website === 'string' && body.website.trim() !== '') {
    return jsonResponse(200, { ok: true, id: null });
  }

  const first_name = clean(body.first_name, 100);
  const last_name  = clean(body.last_name,  100);
  const email      = clean(body.email,      320)?.toLowerCase() || null;

  if (!first_name || !last_name) {
    return jsonResponse(400, { ok: false, error: 'name_required' });
  }
  if (!email || !EMAIL_RE.test(email)) {
    return jsonResponse(400, { ok: false, error: 'valid_email_required' });
  }

  const zip = clean(body.zip, 10);
  if (zip && !/^\d{5}(-\d{4})?$/.test(zip)) {
    return jsonResponse(400, { ok: false, error: 'invalid_zip' });
  }

  const row = {
    first_name,
    last_name,
    email,
    phone:    clean(body.phone, 30),
    pronouns: clean(body.pronouns, 60),

    city:   clean(body.city, 100),
    county: clean(body.county, 60),
    zip,
    registered_voter: pickEnum(body.registered_voter, ALLOWED_REGISTERED_VOTER),

    interests:    filterArray(body.interests, ALLOWED_INTERESTS),
    skills:       filterArray(body.skills, ALLOWED_SKILLS),
    availability: filterArray(body.availability, ALLOWED_AVAILABILITY),
    time_commitment: pickEnum(body.time_commitment, ALLOWED_TIME_COMMITMENT),

    prior_campaign_experience: !!body.prior_campaign_experience,
    prior_campaign_notes:      clean(body.prior_campaign_notes, 500),

    referral_source:    clean(body.referral_source, 200),
    is_founding_member: !!body.is_founding_member,
    additional_notes:   clean(body.additional_notes, 1000),
    email_optin: body.email_optin !== false,
    sms_optin:   body.sms_optin === true,

    submission_ip: clientIp(req),
    user_agent:    clean(req.headers.get('user-agent'), 500),
  };

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('volunteer-submit: missing supabase env');
    return jsonResponse(500, { ok: false, error: 'server_misconfigured' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Upsert on email so a returning volunteer updates their record instead
  // of failing the unique-email index.
  const { data, error } = await supabase
    .from('volunteers')
    .upsert(row, { onConflict: 'email' })
    .select('id')
    .single();

  if (error) {
    console.error('volunteer-submit insert failed:', error);
    return jsonResponse(500, { ok: false, error: 'insert_failed' });
  }

  return jsonResponse(200, { ok: true, id: data?.id || null });
};

export const config = { path: '/.netlify/functions/volunteer-submit' };
