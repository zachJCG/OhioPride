/* =============================================================================
 * Vercel Function: pride-volunteer-submit
 * -----------------------------------------------------------------------------
 * Receives JSON POSTs from the /pride/signup road-tour volunteer form and
 * inserts into public.pride_volunteers using the service-role key.
 *
 *   POST /api/pride-volunteer-submit
 *   body: { website (honeypot), first_name, last_name, email, ... }
 *   -> { ok: true,  id }                       on success
 *   -> { ok: false, error, [message] }         on failure
 *
 * Honeypot: if the hidden 'website' field is filled, silently return ok
 * without writing anything. Mirrors volunteer-submit.mjs.
 * ============================================================================= */

import { createClient } from '@supabase/supabase-js';
import { readJsonBody } from './_lib/http.mjs';

const ALLOWED_REGIONS = new Set(['NE', 'NW', 'SE', 'SW', 'Central', 'Anywhere']);
const ALLOWED_ROLES = new Set([
  'marcher', 'booth_staff', 'driver', 'photographer',
  'marshal', 'setup_breakdown', 'wherever_needed',
]);
const ALLOWED_TSHIRT = new Set(['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL']);
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const SLUG_RE = /^[a-z0-9-]{1,80}$/;

function clean(value, max) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return max && s.length > max ? s.slice(0, max) : s;
}
function filterArray(value, allowed, validator) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const v of value) {
    if (typeof v !== 'string' || seen.has(v)) continue;
    if (allowed && !allowed.has(v)) continue;
    if (validator && !validator(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}
function pickEnum(value, allowed) {
  if (typeof value !== 'string') return null;
  return allowed.has(value) ? value : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const body = readJsonBody(req);
  if (!body) return res.status(400).json({ ok: false, error: 'invalid_json' });

  // Honeypot: bots fill hidden fields. Pretend success, write nothing.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return res.status(200).json({ ok: true, id: null, kind: 'honeypot' });
  }

  const first_name = clean(body.first_name, 100);
  const last_name = clean(body.last_name, 100);
  const email = clean(body.email, 320)?.toLowerCase() || null;

  if (!first_name || !last_name) {
    return res.status(400).json({ ok: false, error: 'name_required' });
  }
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ ok: false, error: 'valid_email_required' });
  }
  if (body.consent_communications !== true) {
    return res.status(400).json({ ok: false, error: 'consent_required' });
  }

  const preferred_region = pickEnum(body.preferred_region, ALLOWED_REGIONS);
  if (!preferred_region) {
    return res.status(400).json({ ok: false, error: 'region_required' });
  }

  const zip = clean(body.zip, 10);
  if (zip && !/^\d{5}(-\d{4})?$/.test(zip)) {
    return res.status(400).json({ ok: false, error: 'invalid_zip' });
  }

  const has_vehicle = body.has_vehicle === true;
  let vehicle_capacity = null;
  if (has_vehicle && body.vehicle_capacity != null && body.vehicle_capacity !== '') {
    const n = Number.parseInt(body.vehicle_capacity, 10);
    if (!Number.isNaN(n) && n >= 1 && n <= 12) vehicle_capacity = n;
  }

  const row = {
    first_name,
    last_name,
    email,
    phone: clean(body.phone, 30),
    city: clean(body.city, 100),
    zip,
    preferred_region,
    events_interested: filterArray(body.events_interested, null, (v) => SLUG_RE.test(v)),
    roles_interested: filterArray(body.roles_interested, ALLOWED_ROLES),
    can_travel: body.can_travel === true,
    has_vehicle,
    vehicle_capacity,
    tshirt_size: pickEnum(body.tshirt_size, ALLOWED_TSHIRT),
    accessibility_needs: clean(body.accessibility_needs, 1000),
    emergency_contact_name: clean(body.emergency_contact_name, 120),
    emergency_contact_phone: clean(body.emergency_contact_phone, 30),
    how_heard: clean(body.how_heard, 200),
    notes: clean(body.notes, 1000),
    consent_communications: true,
    source: 'website_pride_signup',
  };

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('pride-volunteer-submit: missing supabase env');
    return res.status(500).json({ ok: false, error: 'server_misconfigured' });
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from('pride_volunteers')
    .insert(row)
    .select('id')
    .single();

  if (error) {
    // 23505 = unique violation on lower(email): already signed up.
    if (error.code === '23505') {
      return res.status(409).json({ ok: false, error: 'already_signed_up' });
    }
    console.error('pride-volunteer-submit insert failed:', error);
    return res.status(500).json({
      ok: false,
      error: 'insert_failed',
      code: error.code || null,
      message: error.message || null,
    });
  }

  return res.status(200).json({ ok: true, id: data?.id || null });
}
