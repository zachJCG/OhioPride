/* =============================================================================
 * Vercel Function: admin-board-retreat
 * -----------------------------------------------------------------------------
 * Results feed for the /admin/board-retreat page: per-slot availability
 * tallies, who has / has not submitted, and the full per-person detail
 * (modes + notes) for scheduling the August board retreat.
 *
 * AUTH:
 *   Caller must pass `Authorization: Bearer <supabase access token>`. We
 *   verify the caller is an admin with a per-request JWT client + is_admin()
 *   (same gate as admin-dashboard). Only after that do we read results with
 *   the service-role key, because the board_retreat_submissions / _slots
 *   tables have RLS on with no read policy — anon and even a normal signed-in
 *   user cannot see them by design. Non-admins get a 403.
 *
 * RESPONSE SHAPE:
 *   {
 *     ok: true,
 *     roster:   [{ full_name, role_label, has_submitted, submitted_at }],
 *     tallies:  [{ slot_date, segment, in_person_count, virtual_count, total_available }],
 *     detail:   [{ respondent_name, notes, submitted_at,
 *                  slots: [{ slot_date, segment, mode }] }]
 *   }
 *
 * ENDPOINT:
 *   GET /api/admin-board-retreat
 * ============================================================================= */

import { createClient } from '@supabase/supabase-js';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

// Per-request client bound to the caller's JWT so RLS + is_admin() apply.
function jwtClient(jwt) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

// Service-role client for reading the results tables (bypasses RLS). Used only
// after the caller has been confirmed as an admin above.
function serviceClient() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export const config = { runtime: 'edge' };

export default async (req, _ctx) => {
  if (req.method !== 'GET') return json(405, { ok: false, error: 'method_not_allowed' });

  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer (.+)$/i);
  if (!m) return json(401, { ok: false, error: 'missing_bearer' });
  const jwt = m[1];

  // 1. Confirm the caller is an admin.
  const gate = jwtClient(jwt);
  if (!gate) return json(500, { ok: false, error: 'server_misconfigured' });
  const { data: isAdmin, error: adminErr } = await gate.rpc('is_admin');
  if (adminErr || !isAdmin) return json(403, { ok: false, error: 'not_admin' });

  // 2. Read results with the service role.
  const sb = serviceClient();
  if (!sb) return json(500, { ok: false, error: 'server_misconfigured' });

  const [rosterRes, talliesRes, subsRes, slotsRes] = await Promise.all([
    sb.from('board_retreat_respondents')
      .select('full_name, role_label, has_submitted, submitted_at, sort_order')
      .order('sort_order', { ascending: true }),
    sb.from('board_retreat_slot_tallies')
      .select('slot_date, segment, in_person_count, virtual_count, total_available')
      .order('slot_date', { ascending: true })
      .order('segment', { ascending: true }),
    sb.from('board_retreat_submissions')
      .select('id, respondent_name, notes, submitted_at')
      .order('submitted_at', { ascending: true }),
    sb.from('board_retreat_slots')
      .select('submission_id, slot_date, segment, mode'),
  ]);

  const firstErr = [rosterRes, talliesRes, subsRes, slotsRes].find(r => r.error);
  if (firstErr) return json(500, { ok: false, error: 'read_failed', detail: firstErr.error.message });

  // Group slots under their submission.
  const slotsBySub = {};
  for (const s of slotsRes.data || []) {
    (slotsBySub[s.submission_id] || (slotsBySub[s.submission_id] = [])).push({
      slot_date: s.slot_date, segment: s.segment, mode: s.mode,
    });
  }
  const segRank = { morning: 0, afternoon: 1, evening: 2 };
  const detail = (subsRes.data || []).map(sub => ({
    respondent_name: sub.respondent_name,
    notes: sub.notes || '',
    submitted_at: sub.submitted_at,
    slots: (slotsBySub[sub.id] || []).sort((a, b) =>
      a.slot_date === b.slot_date
        ? (segRank[a.segment] ?? 9) - (segRank[b.segment] ?? 9)
        : a.slot_date < b.slot_date ? -1 : 1),
  }));

  const roster = (rosterRes.data || []).map(r => ({
    full_name: r.full_name,
    role_label: r.role_label,
    has_submitted: r.has_submitted,
    submitted_at: r.submitted_at,
  }));

  return json(200, {
    ok: true,
    roster,
    tallies: talliesRes.data || [],
    detail,
  });
};
