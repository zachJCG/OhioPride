/* =============================================================================
 * Vercel Function: founding-members-progress
 * -----------------------------------------------------------------------------
 * Returns the current founding-member count and goal as JSON. This is the
 * public endpoint the website progress bar hits on every page load.
 *
 * Why we proxy through a function instead of calling Supabase from the
 * browser:
 *
 *   1. We do not want to ship even the Supabase anon key to the browser for
 *      this particular project. The anon key, combined with the way RLS is
 *      configured, is safe to expose — but a single server-side endpoint
 *      gives us one place to cache, rate-limit, or swap providers later.
 *   2. We can set aggressive HTTP caching here (Cache-Control + Vercel edge
 *      cache) so the homepage loads instantly even under traffic spikes,
 *      without hammering Supabase.
 *
 * Environment variables required:
 *   SUPABASE_URL                   - https://<project>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY      - service_role key (server-side only)
 *
 * Endpoint (after deploy):
 *   GET /api/founding-members-progress
 *   -> { member_count: 42, goal: 1969, total_cents: 523400, percent_to_goal: 2.13 }
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

  // Calls the SQL function defined in the migration. rpc() is the standard
  // way to invoke a Postgres function via PostgREST/Supabase.
  const { data, error } = await supabase.rpc('founding_members_progress');

  if (error) {
    return res.status(500).json({ ok: false, error: 'supabase_rpc_failed', message: error.message });
  }

  // rpc() returns an array even for single-row functions.
  const row = Array.isArray(data) ? data[0] : data;

  // Cache at the edge for 60 seconds, tell the browser to hold for 30
  // seconds. A one-minute lag on the homepage progress bar is completely
  // fine and makes this endpoint effectively free under load.
  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=300');
  return res.status(200).json({
    ok: true,
    member_count:    Number(row?.member_count    ?? 0),
    goal:            Number(row?.goal            ?? 1969),
    total_cents:     Number(row?.total_cents     ?? 0),
    percent_to_goal: Number(row?.percent_to_goal ?? 0),
    fetched_at:      new Date().toISOString(),
  });
}
