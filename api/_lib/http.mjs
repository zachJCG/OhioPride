/* =============================================================================
 * Shared HTTP helpers for Vercel Node functions (server-side only)
 * -----------------------------------------------------------------------------
 * Small transport utilities shared by every endpoint in /api. Files under
 * /api/_lib are NOT exposed as routes (underscore prefix).
 * ============================================================================= */

/**
 * Return the parsed JSON request body, or null when the body is missing or
 * not valid JSON. Vercel's Node runtime pre-parses JSON bodies into
 * req.body when Content-Type is application/json; this normalizes the
 * string/object/undefined cases so handlers can treat null as a 400.
 */
export function readJsonBody(req) {
  const body = req.body;
  if (body == null) return null;
  if (typeof body === 'object') return body;
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { return null; }
  }
  return null;
}

/**
 * Best-effort client IP. Vercel sets x-forwarded-for (client first) and
 * x-real-ip on every request.
 */
export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.headers['x-real-ip'] || null;
}
