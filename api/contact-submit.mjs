/* =============================================================================
 * Vercel Function: contact-submit
 * -----------------------------------------------------------------------------
 * Form target for the contact / connect / launch-day forms. Replaces Netlify
 * Forms + submission-created.js: writes to public.contact_submissions and
 * sends the Resend notification email. All logic lives in
 * _lib/contact-core.mjs (shared with the temporary Netlify twin).
 *
 *   POST /api/contact-submit
 *   body: { form_name, name|fullName|first_name+last_name, email, phone?,
 *           subject?, message, organization?, company (honeypot) }
 *   -> { ok: true, id } | { ok: false, error }
 * ============================================================================= */

import { processContactSubmission } from './_lib/contact-core.mjs';
import { readJsonBody, clientIp } from './_lib/http.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const result = await processContactSubmission(readJsonBody(req), {
    referer: req.headers['referer'] || null,
    userAgent: req.headers['user-agent'] || null,
    ip: clientIp(req),
  });

  return res.status(result.status).json(result.body);
}
