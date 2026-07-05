/* =============================================================================
 * Vercel Function: board-members
 * -----------------------------------------------------------------------------
 * Returns the public list of active board members from Supabase. This is the
 * endpoint the /board page hits to hydrate its grid.
 *
 * We could have the client hit Supabase directly (the anon key is safe to
 * ship), but routing through a function gives us:
 *   - one place to cache aggressively at the edge
 *   - the ability to shape the JSON exactly how the front-end wants it,
 *     without exposing internal column names
 *   - a clean swap-out path if we ever move off Supabase
 *
 * Endpoint (after deploy):
 *   GET /api/board-members
 *   -> { ok: true, members: [ { name, role, chip, img_path, bio: [...] }, ... ] }
 * ============================================================================= */

import { createClient } from '@supabase/supabase-js';

export default async function handler(_req, res) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ ok: false, error: 'missing_supabase_env' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // is_active = true is enforced at the RLS layer for anon reads, but we
  // include it here too so the query stays explicit and does not depend on
  // the RLS policy staying exactly as-is.
  const { data, error } = await supabase
    .from('board_members')
    .select('name, role, chip, img_path, bio, display_order')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('name',          { ascending: true });

  if (error) {
    return res.status(500).json({ ok: false, error: 'supabase_query_failed', message: error.message });
  }

  // Strip display_order from the wire format; the client does not need it.
  const members = (data || []).map(row => ({
    name:     row.name,
    role:     row.role,
    chip:     row.chip,
    img_path: row.img_path,
    bio:      row.bio || [],
  }));

  // Board changes rarely. Cache for 5 min at edge, 2 min in browser.
  // A new production deploy invalidates Vercel's edge cache.
  res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=300, stale-while-revalidate=600');
  return res.status(200).json({ ok: true, members, fetched_at: new Date().toISOString() });
}
