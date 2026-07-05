/* =============================================================================
 * Vercel Function: pride-events
 * -----------------------------------------------------------------------------
 * Live data source for /pride and /pride/signup.
 *
 *   GET /api/pride-events
 *   -> { ok: true, events: [...], tour_status: {...} | null, fetched_at }
 *
 * Reads the public-safe view public.pride_events_public plus the single
 * public.pride_tour_status row, resolving current/next event references to
 * lightweight {slug,name,city,event_date} objects so the client can render
 * the status banner without a second round trip.
 *
 * Mirrors the service-role proxy pattern used by bills.mjs / board-members.mjs.
 * ============================================================================= */

import { createClient } from '@supabase/supabase-js';

const json = (res, status, body, cacheSeconds = 120) => {
  if (cacheSeconds > 0) {
    res.setHeader('Cache-Control', `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds * 2}, stale-while-revalidate=900`);
  }
  return res.status(status).json(body);
};

export default async function handler(_req, res) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(res, 500, { ok: false, error: 'missing_supabase_env' }, 0);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const [eventsRes, statusRes] = await Promise.all([
    supabase
      .from('pride_events_public')
      .select('*')
      .order('event_date', { ascending: true })
      .order('display_order', { ascending: true }),
    supabase
      .from('pride_tour_status')
      .select('*')
      .eq('id', 1)
      .maybeSingle(),
  ]);

  if (eventsRes.error) return json(res, 500, { ok: false, error: eventsRes.error.message }, 0);
  if (statusRes.error) return json(res, 500, { ok: false, error: statusRes.error.message }, 0);

  const events = eventsRes.data || [];
  const byId = new Map(events.map(e => [e.id, e]));

  let tour_status = null;
  if (statusRes.data) {
    const s = statusRes.data;
    const shape = (id) => {
      const e = id ? byId.get(id) : null;
      return e
        ? { slug: e.slug, name: e.name, city: e.city, event_date: e.event_date }
        : null;
    };
    tour_status = {
      status_message: s.status_message || null,
      current_event: shape(s.current_event_id),
      next_event: shape(s.next_event_id),
      updated_at: s.updated_at,
    };
  }

  return json(res, 200, {
    ok: true,
    events,
    tour_status,
    fetched_at: new Date().toISOString(),
  });
}
