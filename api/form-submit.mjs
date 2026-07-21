/* =============================================================================
 * Vercel Function: form-submit
 * -----------------------------------------------------------------------------
 * Replaces Netlify Forms for the contact, connect, and launch-day-rsvp forms.
 * Accepts urlencoded (default from the site JS) or JSON bodies.
 *
 *   POST /api/form-submit
 *   body: form-name=<contact|connect|launch-day-rsvp>&...fields...
 *
 * Behavior:
 *   1. Honeypot: if `bot-field` is filled, silently return { ok: true }.
 *   2. Insert the submission into public.form_submissions (Supabase, service role).
 *   3. Email a notification to info@ohiopride.org via Resend.
 *   4. Return { ok: true } if either the DB write or the email succeeded.
 *
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (DB write)
 *   RESEND_API_KEY                            (email; recommended)
 *   RESEND_FROM_EMAIL                         (optional; default onboarding@resend.dev)
 *   FORM_NOTIFY_TO                            (optional; default info@ohiopride.org)
 * ============================================================================= */

import { createClient } from '@supabase/supabase-js';

const NOTIFY_TO = process.env.FORM_NOTIFY_TO || 'info@ohiopride.org';
const FROM = process.env.RESEND_FROM_EMAIL || 'Ohio Pride PAC <onboarding@resend.dev>';
const ALLOWED = new Set(['contact', 'connect', 'launch-day-rsvp']);

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
function esc(s) { return String(s == null ? '' : s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }
function notifyHtml(formName, data) {
  const rows = Object.entries(data)
    .filter(([k, v]) => !['bot-field', 'form-name'].includes(k) && String(v || '').trim() !== '')
    .map(([k, v]) => `<tr><td style="padding:4px 14px 4px 0;color:#556;font-size:12px;text-transform:uppercase;letter-spacing:.4px;">${esc(k)}</td><td style="padding:4px 0;color:#0F2233;">${esc(v)}</td></tr>`)
    .join('');
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;max-width:600px;">
    <h2 style="color:#0F2233;margin:0 0 2px;">New ${esc(formName)} submission</h2>
    <p style="color:#8891a0;margin:0 0 16px;font-size:13px;">ohiopride.org</p>
    <table style="border-collapse:collapse;font-size:14px;">${rows}</table>
  </div>`;
}

export const config = { runtime: "edge" };

export default async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

  const data = await parseBody(req);
  const formName = clean(data['form-name'] || data.form_name) || 'unknown';
  if (!ALLOWED.has(formName)) return json(400, { ok: false, error: 'unknown_form' });

  // Honeypot: silently accept, do nothing.
  if (clean(data['bot-field'])) return json(200, { ok: true, kind: 'honeypot' });

  const name = displayName(data);
  const email = clean(data.email);
  if (!email && !name) return json(400, { ok: false, error: 'missing_fields' });

  let dbOk = false, mailOk = false, rowId = null;

  // 1. Persist to Supabase (service role bypasses RLS).
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
      const { data: row, error } = await sb
        .from('form_submissions')
        .insert({
          form_name: formName,
          data,
          name,
          email,
          subject: clean(data.subject),
          ip: clientIp(req),
          user_agent: clean(req.headers.get('user-agent'), 500),
          referrer: clean(req.headers.get('referer'), 500),
        })
        .select('id')
        .single();
      if (error) console.error('form_submissions insert error:', error.message);
      else { dbOk = true; rowId = row?.id ?? null; }
    } catch (e) { console.error('supabase error:', e); }
  }

  // 2. Email notification via Resend.
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (RESEND_API_KEY) {
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM,
          to: [NOTIFY_TO],
          subject: `[Ohio Pride PAC] ${formName}${name ? ' — ' + name : ''}`,
          html: notifyHtml(formName, data),
          reply_to: email || undefined,
        }),
      });
      mailOk = resp.ok;
      if (!resp.ok) console.error('resend error status:', resp.status);
    } catch (e) { console.error('resend error:', e); }
  }

  if (!dbOk && !mailOk) return json(502, { ok: false, error: 'not_delivered' });
  return json(200, { ok: true, id: rowId });
};
