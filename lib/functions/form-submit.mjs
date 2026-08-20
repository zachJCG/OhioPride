/* =============================================================================
 * Vercel Function: form-submit
 * -----------------------------------------------------------------------------
 * Replaces the legacy hosted form handling for the contact, connect, and RSVP forms.
 * Accepts urlencoded (default from the site JS) or JSON bodies.
 *
 *   POST /api/form-submit
 *   body: form-name=<contact|connect|event slug>&...fields...
 *
 * Any form-name matching a public.events slug is accepted and also recorded as
 * an RSVP on that event, so adding a Pride Hour is a row in events, not a code
 * change.
 *
 * Behavior:
 *   1. Honeypot: if `bot-field` is filled, silently return { ok: true }.
 *   2. Insert the submission into public.form_submissions (Supabase, service role).
 *   3. Email a staff notification via lib/notify.mjs (Resend).
 *   4. Return { ok: true } if either the DB write or the email succeeded.
 *
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (DB write)
 *   RESEND_API_KEY                            (email; recommended)
 *   see lib/notify.mjs for the recipient + sender env
 * ============================================================================= */

import { createClient } from '@supabase/supabase-js';
import { notifySubmission } from '../notify.mjs';

const ALLOWED = new Set(['contact', 'connect']);

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
function clean(v, max = 2000) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}
function clientIp(req) {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || null;
}
async function parseBody(req) {
  const ct = (req.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('application/json')) {
    try { return await req.json(); } catch { return {}; }
  }
  const out = {};
  try {
    const params = new URLSearchParams(await req.text());
    for (const [k, v] of params) out[k] = v;
  } catch { /* ignore */ }
  return out;
}
function displayName(d) {
  const full = clean(d.fullName || d.name);
  if (full) return full;
  const composed = [clean(d.first_name), clean(d.last_name)].filter(Boolean).join(' ');
  return composed || null;
}

export const config = { runtime: "edge" };

export default async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

  const data = await parseBody(req);
  const formName = clean(data['form-name'] || data.form_name) || 'unknown';

  // Honeypot: silently accept, do nothing.
  if (clean(data['bot-field'])) return json(200, { ok: true, kind: 'honeypot' });

  const name = displayName(data);
  const email = clean(data.email);
  if (!email && !name) return json(400, { ok: false, error: 'missing_fields' });

  let dbOk = false, mailOk = false, rowId = null, rsvpOk = false;

  // 1. Persist to Supabase (service role bypasses RLS).
  //
  // Column names here must match public.form_submissions exactly. They drifted
  // once (data/ip/referrer against payload/ip_address) and every insert failed
  // for months while the endpoint still answered ok because the email had
  // sent, so contact submissions and Pride Hour RSVPs were quietly lost.
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  let sb = null;
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  }

  // Any form-name matching an event slug is a valid RSVP form.
  let event = null;
  if (sb) {
    const { data: ev } = await sb.from('events').select('id, name, slug').eq('slug', formName).maybeSingle();
    event = ev || null;
  }
  if (!ALLOWED.has(formName) && !event) return json(400, { ok: false, error: 'unknown_form' });

  if (sb) {
    try {
      const { data: row, error } = await sb
        .from('form_submissions')
        .insert({
          form_name: formName,
          name,
          email,
          phone: clean(data.phone),
          subject: clean(data.subject),
          payload: { ...data, referrer: clean(req.headers.get('referer'), 500) },
          ip_address: clientIp(req),
          user_agent: clean(req.headers.get('user-agent'), 500),
        })
        .select('id')
        .single();
      if (error) console.error('form_submissions insert error:', error.message);
      else { dbOk = true; rowId = row?.id ?? null; }
    } catch (e) { console.error('supabase error:', e); }

    // 1b. Record the RSVP against the event. One per person per event: a
    // resubmit updates rather than duplicating.
    if (event) {
      try {
        const first = clean(data.first_name);
        const last = clean(data.last_name);
        const rsvp = {
          event_id: event.id,
          first_name: first,
          last_name: last,
          full_name: name || [first, last].filter(Boolean).join(' ') || null,
          email,
          phone: clean(data.phone),
          organization: clean(data.organization),
          guests: Number.parseInt(clean(data.guests) || '0', 10) || 0,
          source: 'website',
          payload: data,
        };
        const { error } = email
          ? await sb.from('event_rsvps').upsert(rsvp, { onConflict: 'event_id,email' })
          : await sb.from('event_rsvps').insert(rsvp);
        if (error) console.error('event_rsvps write error:', error.message);
        else rsvpOk = true;
      } catch (e) { console.error('event rsvp error:', e); }
    }
  }

  // 2. Staff notification. Best-effort: a delivery failure never fails a
  // submission that already reached the database.
  const label = event ? `${event.name} RSVP` : `${formName} submission`;
  const { ok: notified } = await notifySubmission({
    kind: 'contact',
    title: `New ${label}${name ? ': ' + name : ''}`,
    fields: Object.fromEntries(
      Object.entries(data).filter(([k]) => !['bot-field', 'form-name'].includes(k)),
    ),
    replyTo: email || undefined,
    adminPath: event ? '/admin/events' : '/admin/contacts',
    adminLabel: event ? 'Open events in the admin console' : 'Open contacts in the admin console',
  });
  mailOk = notified;

  if (!dbOk && !mailOk) return json(502, { ok: false, error: 'not_delivered' });
  // stored/rsvp are reported so a silent storage failure is visible to anyone
  // checking the response, rather than hiding behind a successful email.
  return json(200, { ok: true, id: rowId, stored: dbOk, rsvp: event ? rsvpOk : undefined });
};
