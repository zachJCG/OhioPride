/* =============================================================================
 * Netlify Function: contact-submit (cutover twin — delete with Netlify)
 * -----------------------------------------------------------------------------
 * Same endpoint as api/contact-submit.mjs, wrapped for Netlify's Request →
 * Response signature. Exists only so the rebuilt forms keep working on the
 * Netlify deployment during the DNS-cutover parachute window (the site's
 * netlify.toml rewrites /api/* to /.netlify/functions/*). All logic lives in
 * api/_lib/contact-core.mjs; Netlify's esbuild bundles the relative import.
 *
 * Once Netlify is decommissioned, delete this file along with the rest of
 * netlify/.
 * ============================================================================= */

import { processContactSubmission } from '../../api/_lib/contact-core.mjs';

function clientIp(req) {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-nf-client-connection-ip') || null;
}

export default async (req, _context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
      status: 405, headers: { 'content-type': 'application/json' },
    });
  }

  let body = null;
  try { body = await req.json(); } catch { /* handled by the core as invalid_json */ }

  const result = await processContactSubmission(body, {
    referer: req.headers.get('referer'),
    userAgent: req.headers.get('user-agent'),
    ip: clientIp(req),
  });

  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'content-type': 'application/json' },
  });
};
