/* =============================================================================
 * Vercel Function: newsletter-submit
 * -----------------------------------------------------------------------------
 * Receives JSON POSTs from the newsletter capture form on /signup.
 *
 * Writes to public.newsletter_subscribers (UPSERT on email). The table
 * server-defaults status='active' and consented_at=now(), so we only send
 * the columns a visitor provides; we never set status/consent directly.
 *
 * Endpoint:
 *   POST /api/newsletter-submit
 *   body: { website, email, first_name, last_name, zip, source, referrer }
 *   -> { ok: true,  id }      on success
 *   -> { ok: false, error }   on failure
 *
 * Honeypot: if the hidden 'website' field is filled, we silently return ok
 * without writing anything.
 * ============================================================================= */

import { createClient } from '@supabase/supabase-js';
import { syncSubscriberSafe } from './_lib/mailerlite.mjs';
import { readJsonBody, clientIp } from './_lib/http.mjs';

// Group new newsletter signups land in. A MailerLite automation on join can
// send the welcome / confirmation email. Override with MAILERLITE_NEWSLETTER_GROUP.
const NEWSLETTER_GROUP = process.env.MAILERLITE_NEWSLETTER_GROUP || 'Newsletter';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_SOURCES = new Set(['homepage', 'signup_page', 'website_newsletter', 'other']);

function clean(value, max) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return max && s.length > max ? s.slice(0, max) : s;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const body = readJsonBody(req);
  if (!body) return res.status(400).json({ ok: false, error: 'invalid_json' });

  // Honeypot — silently accept without writing.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return res.status(200).json({ ok: true, id: null, kind: 'honeypot' });
  }

  const email = clean(body.email, 320)?.toLowerCase() || null;
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ ok: false, error: 'valid_email_required' });
  }

  const zip = clean(body.zip, 10);
  if (zip && !/^\d{5}(-\d{4})?$/.test(zip)) {
    return res.status(400).json({ ok: false, error: 'invalid_zip' });
  }

  const phone = clean(body.phone, 40);

  const source = ALLOWED_SOURCES.has(body.source) ? body.source : 'signup_page';

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('newsletter-submit: missing supabase env');
    return res.status(500).json({ ok: false, error: 'server_misconfigured' });
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Only columns a visitor controls. status/consented_at are server-defaults,
  // and we deliberately omit them so a re-subscribe never silently flips an
  // unsubscribed person back to active.
  const row = {
    email,
    first_name: clean(body.first_name, 100),
    last_name:  clean(body.last_name, 100),
    phone,
    zip,
    source,
    referrer:   clean(body.referrer, 500),
    submission_ip: clientIp(req),
    user_agent:    clean(req.headers['user-agent'], 500),
  };

  const { data, error } = await supabase
    .from('newsletter_subscribers')
    .upsert(row, { onConflict: 'email' })
    .select('id')
    .single();

  if (error) {
    console.error('newsletter-submit insert failed:', error);
    return res.status(500).json({
      ok: false,
      error: 'insert_failed',
      code: error.code || null,
      message: error.message || null,
      hint:    error.hint    || null,
      details: error.details || null,
    });
  }
  // Sync into MailerLite so the welcome/confirmation automation can fire.
  // Best-effort: never blocks or fails the submission.
  await syncSubscriberSafe({
    email,
    fields: { name: row.first_name || undefined, last_name: row.last_name || undefined },
    groupName: NEWSLETTER_GROUP,
  });

  return res.status(200).json({ ok: true, id: data?.id || null });
}
