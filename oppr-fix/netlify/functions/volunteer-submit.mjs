/* =============================================================================
 * Netlify Function: volunteer-submit
 * -----------------------------------------------------------------------------
 * Receives JSON POSTs from the multi-step form on /volunteer.
 *
 * Routes by `application_type`:
 *   - "volunteer"  (default) -> public.volunteers (UPSERT on email)
 *   - "internship"           -> public.intern_applications (UPSERT on (email, position))
 *
 * Endpoint:
 *   POST /.netlify/functions/volunteer-submit
 *   body: { application_type: "volunteer" | "internship", website, ... }
 *   -> { ok: true,  id, kind }                            on success
 *   -> { ok: false, error }                                on failure
 *
 * Honeypot: if the hidden 'website' field is filled, we silently return ok
 * without writing anything.
 * ============================================================================= */

import { createClient } from '@supabase/supabase-js';

// ---------- Volunteer enums ----------
const ALLOWED_INTERESTS = new Set([
  'field_canvassing', 'phone_text_banking', 'pride_tabling', 'social_amplification',
  'skills_based', 'house_party_host', 'local_captain', 'day_of_logistics',
]);
const ALLOWED_SKILLS = new Set([
  'writing', 'graphic_design', 'photography', 'videography', 'legal',
  'data_analysis', 'web_development', 'accounting_finance', 'event_planning',
  'public_speaking', 'fundraising', 'social_media', 'asl', 'spanish', 'other_language',
]);
const ALLOWED_AVAILABILITY    = new Set(['weekday_days', 'weekday_evenings', 'weekends']);
const ALLOWED_TIME_COMMITMENT = new Set(['one_time', 'monthly', 'weekly', 'surge_only']);
const ALLOWED_REGISTERED_VOTER = new Set(['yes', 'no', 'unsure']);

// ---------- Intern enums ----------
const ALLOWED_POSITIONS = new Set([
  'chief_of_staff', 'graphics_social_media', 'volunteer_coordinator',
  'legislative_director', 'policy_aide',
]);
const ALLOWED_TERMS = new Set(['summer_2026', 'fall_2026', 'either']);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE   = /^https?:\/\/[^\s]+$/i;

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
  const out = []; const seen = new Set();
  for (const v of value) {
    if (typeof v !== 'string' || !allowed.has(v) || seen.has(v)) continue;
    seen.add(v); out.push(v);
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

// =============================================================================
// Handler
// =============================================================================
export default async (req, _context) => {
  if (req.method !== 'POST') {
    return jsonResponse(405, { ok: false, error: 'method_not_allowed' });
  }

  let body;
  try { body = await req.json(); }
  catch { return jsonResponse(400, { ok: false, error: 'invalid_json' }); }

  if (body && typeof body.website === 'string' && body.website.trim() !== '') {
    return jsonResponse(200, { ok: true, id: null, kind: 'honeypot' });
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('volunteer-submit: missing supabase env');
    return jsonResponse(500, { ok: false, error: 'server_misconfigured' });
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const appType = body.application_type === 'internship' ? 'internship' : 'volunteer';
  if (appType === 'internship') return await handleInternship(supabase, req, body);
  return await handleVolunteer(supabase, req, body);
};

// -----------------------------------------------------------------------------
// Volunteer path
// -----------------------------------------------------------------------------
async function handleVolunteer(supabase, req, body) {
  const first_name = clean(body.first_name, 100);
  const last_name  = clean(body.last_name,  100);
  const email      = clean(body.email,      320)?.toLowerCase() || null;

  if (!first_name || !last_name) return jsonResponse(400, { ok: false, error: 'name_required' });
  if (!email || !EMAIL_RE.test(email)) return jsonResponse(400, { ok: false, error: 'valid_email_required' });

  const zip = clean(body.zip, 10);
  if (zip && !/^\d{5}(-\d{4})?$/.test(zip)) return jsonResponse(400, { ok: false, error: 'invalid_zip' });

  const row = {
    first_name, last_name, email,
    phone:    clean(body.phone, 30),
    pronouns: clean(body.pronouns, 60),
    city:   clean(body.city, 100),
    county: clean(body.county, 60),
    zip,
    registered_voter: pickEnum(body.registered_voter, ALLOWED_REGISTERED_VOTER),
    interests:    filterArray(body.interests,    ALLOWED_INTERESTS),
    skills:       filterArray(body.skills,       ALLOWED_SKILLS),
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

  const { data, error } = await supabase
    .from('volunteers')
    .upsert(row, { onConflict: 'email' })
    .select('id')
    .single();

  if (error) {
    console.error('volunteer-submit (volunteer) insert failed:', error);
    return jsonResponse(500, {
      ok: false,
      error: 'insert_failed',
      // Safe to surface — Supabase error shape only includes a code + message,
      // never service-role credentials. Helps the admin debug when the live
      // function is returning insert_failed without exposing secrets.
      code: error.code || null,
      message: error.message || null,
      hint:    error.hint    || null,
      details: error.details || null,
    });
  }
  return jsonResponse(200, { ok: true, id: data?.id || null, kind: 'volunteer' });
}

// -----------------------------------------------------------------------------
// Internship path
// -----------------------------------------------------------------------------
async function handleInternship(supabase, req, body) {
  const first_name = clean(body.first_name, 100);
  const last_name  = clean(body.last_name,  100);
  const email      = clean(body.email,      320)?.toLowerCase() || null;
  const position   = pickEnum(body.position, ALLOWED_POSITIONS);
  const term       = pickEnum(body.term,     ALLOWED_TERMS);
  const statement  = clean(body.statement_of_interest, 2000);

  if (!first_name || !last_name) return jsonResponse(400, { ok: false, error: 'name_required' });
  if (!email || !EMAIL_RE.test(email)) return jsonResponse(400, { ok: false, error: 'valid_email_required' });
  if (!position) return jsonResponse(400, { ok: false, error: 'position_required' });
  if (!term)     return jsonResponse(400, { ok: false, error: 'term_required' });
  if (!statement) return jsonResponse(400, { ok: false, error: 'statement_required' });

  const zip = clean(body.zip, 10);
  if (zip && !/^\d{5}(-\d{4})?$/.test(zip)) return jsonResponse(400, { ok: false, error: 'invalid_zip' });

  const resume    = clean(body.resume_url, 500);
  const portfolio = clean(body.portfolio_url, 500);
  if (resume && !URL_RE.test(resume))       return jsonResponse(400, { ok: false, error: 'invalid_url' });
  if (portfolio && !URL_RE.test(portfolio)) return jsonResponse(400, { ok: false, error: 'invalid_url' });

  let weekly_hours = null;
  if (body.weekly_hours != null && body.weekly_hours !== '') {
    const n = Number.parseInt(body.weekly_hours, 10);
    if (!Number.isNaN(n) && n >= 1 && n <= 40) weekly_hours = n;
  }
  let credit_hours = null;
  if (body.credit_hours != null && body.credit_hours !== '') {
    const n = Number.parseFloat(body.credit_hours);
    if (!Number.isNaN(n) && n >= 0 && n <= 12) credit_hours = n;
  }

  const row = {
    first_name, last_name, email,
    phone:    clean(body.phone, 30),
    pronouns: clean(body.pronouns, 60),
    city:   clean(body.city, 100),
    county: clean(body.county, 60),
    zip,
    position, term,
    start_date_pref: clean(body.start_date_pref, 80),
    weekly_hours, credit_hours,
    institution:           clean(body.institution, 120),
    program_major:         clean(body.program_major, 120),
    class_year:            clean(body.class_year, 60),
    faculty_sponsor_name:  clean(body.faculty_sponsor_name, 120),
    faculty_sponsor_email: clean(body.faculty_sponsor_email, 320),
    resume_url:    resume,
    portfolio_url: portfolio,
    statement_of_interest: statement,
    prior_experience: clean(body.prior_experience, 1000),
    why_ohio_pride:   clean(body.why_ohio_pride, 1000),
    referral_source:  clean(body.referral_source, 200),
    is_founding_member: !!body.is_founding_member,
    email_optin: body.email_optin !== false,
    sms_optin:   false,
    submission_ip: clientIp(req),
    user_agent:    clean(req.headers.get('user-agent'), 500),
  };

  const { data, error } = await supabase
    .from('intern_applications')
    .upsert(row, { onConflict: 'email,position' })
    .select('id')
    .single();

  if (error) {
    console.error('volunteer-submit (intern) insert failed:', error);
    return jsonResponse(500, {
      ok: false,
      error: 'insert_failed',
      code: error.code || null,
      message: error.message || null,
      hint:    error.hint    || null,
      details: error.details || null,
    });
  }
  return jsonResponse(200, { ok: true, id: data?.id || null, kind: 'internship' });
}

export const config = { path: '/.netlify/functions/volunteer-submit' };
