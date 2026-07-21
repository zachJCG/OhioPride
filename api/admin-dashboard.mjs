/* =============================================================================
 * Netlify Function: admin-dashboard
 * -----------------------------------------------------------------------------
 * Aggregated stats + recent activity for the /admin/dashboard page.
 *
 * AUTH:
 *   Caller must pass `Authorization: Bearer <supabase access token>`. We
 *   create a per-request Supabase client with that JWT so RLS applies and
 *   public.is_admin() gates the data. Non-admins get a 403.
 *
 * RESPONSE SHAPE:
 *   {
 *     kpis: {
 *       volunteers_total, volunteers_new_7d, volunteers_new_30d,
 *       founding_members, founding_progress_pct, founding_target,
 *       endorsements_open, endorsements_total,
 *       bills_active, bills_total,
 *       counties_covered
 *     },
 *     pipeline: { submitted, under_review, endorsed, declined, withdrawn },
 *     top_counties: [{ county, count }],
 *     recent: [{ kind, label, sub, ts }]
 *   }
 *
 * ENDPOINT:
 *   GET /.netlify/functions/admin-dashboard
 * ============================================================================= */

import { createClient } from '@supabase/supabase-js';

const FOUNDING_TARGET = 1969;

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function envClient(jwt) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return null;
  }
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

function relative(d) {
  if (!d) return '';
  const t = new Date(d).getTime();
  if (!t) return '';
  const diff = (Date.now() - t) / 1000;
  if (diff < 60)        return 'just now';
  if (diff < 3600)      return Math.floor(diff / 60)   + 'm ago';
  if (diff < 86400)     return Math.floor(diff / 3600) + 'h ago';
  if (diff < 86400 * 7) return Math.floor(diff / 86400) + 'd ago';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const config = { runtime: "edge" };

export default async (req, _ctx) => {
  if (req.method !== 'GET') return json(405, { ok: false, error: 'method_not_allowed' });

  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer (.+)$/i);
  if (!m) return json(401, { ok: false, error: 'missing_bearer' });
  const jwt = m[1];

  const sb = envClient(jwt);
  if (!sb) return json(500, { ok: false, error: 'server_misconfigured' });

  // Confirm the caller is an admin (RLS would also block this, but better
  // to fail fast with a clean error).
  const { data: isAdminRow, error: adminErr } = await sb.rpc('is_admin');
  if (adminErr || !isAdminRow) return json(403, { ok: false, error: 'not_admin' });

  // -----------------------------------------------------------------
  // Run all reads in parallel.
  // -----------------------------------------------------------------
  const now = new Date();
  const d7  = new Date(now.getTime() - 7  * 86400000).toISOString();
  const d30 = new Date(now.getTime() - 30 * 86400000).toISOString();

  const promises = {
    volTotal:    sb.from('volunteers').select('id', { count: 'exact', head: true }),
    volNew7:     sb.from('volunteers').select('id', { count: 'exact', head: true }).gte('created_at', d7),
    volNew30:    sb.from('volunteers').select('id', { count: 'exact', head: true }).gte('created_at', d30),
    volStatus:   sb.from('volunteers').select('status'),
    volCounties: sb.from('volunteers').select('county'),
    volRecent:   sb.from('volunteers').select('id, first_name, last_name, county, created_at, status')
                   .order('created_at', { ascending: false }).limit(8),

    endTotal:    sb.from('endorsement_applications').select('id', { count: 'exact', head: true }),
    endStatus:   sb.from('endorsement_applications').select('status'),
    endRecent:   sb.from('endorsement_applications').select('id, candidate_name, office_sought, status, created_at')
                   .order('created_at', { ascending: false }).limit(5),

    fmProgress:  sb.rpc('founding_members_progress'),
    fmRecent:    sb.from('founding_members_public')
                   .select('first_name, last_initial, usps_city, county_name, amount, created_at')
                   .order('created_at', { ascending: false }).limit(5),

    billsActive: sb.from('bills').select('id', { count: 'exact', head: true }).eq('is_active', true),
    billsTotal:  sb.from('bills').select('id', { count: 'exact', head: true }),
  };

  const results = await Promise.allSettled(Object.values(promises));
  const keys = Object.keys(promises);
  const r = {};
  results.forEach((res, i) => { r[keys[i]] = res; });

  const okValue = (key, fallback = null) =>
    r[key] && r[key].status === 'fulfilled' && !r[key].value.error ? r[key].value : { data: fallback, count: 0 };

  // -----------------------------------------------------------------
  // Synthesize response
  // -----------------------------------------------------------------
  const volStatus = okValue('volStatus', []).data || [];
  const volByStatus = volStatus.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});

  const endStatus = okValue('endStatus', []).data || [];
  const pipeline = ['submitted','under_review','endorsed','declined','withdrawn'].reduce((acc, s) => {
    acc[s] = 0;
    return acc;
  }, {});
  endStatus.forEach(row => { if (pipeline[row.status] != null) pipeline[row.status]++; });

  const counties = (okValue('volCounties', []).data || [])
    .filter(x => x.county)
    .reduce((acc, x) => { acc[x.county] = (acc[x.county] || 0) + 1; return acc; }, {});
  const top_counties = Object.entries(counties)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([county, count]) => ({ county, count }));

  const fmProgress = okValue('fmProgress', null).data;
  // founding_members_progress() rpc returns either an array of rows or a single row.
  const fmRow = Array.isArray(fmProgress) ? fmProgress[0] : fmProgress;
  const fmCount   = fmRow && (fmRow.member_count ?? fmRow.count) || 0;
  const fmTarget  = fmRow && (fmRow.target ?? FOUNDING_TARGET) || FOUNDING_TARGET;
  const fmPct     = fmTarget ? Math.min(100, Math.round((fmCount / fmTarget) * 1000) / 10) : 0;

  // Recent activity feed (mixed sources, sorted)
  const recent = [];
  (okValue('volRecent', []).data || []).forEach(v => {
    recent.push({
      kind: 'volunteer',
      label: `${v.first_name || ''} ${v.last_name || ''}`.trim() + ' signed up to volunteer',
      sub: v.county ? v.county + ' County' : 'Volunteer',
      ts: v.created_at,
      href: '/admin/volunteers?id=' + encodeURIComponent(v.id)
    });
  });
  (okValue('endRecent', []).data || []).forEach(e => {
    recent.push({
      kind: 'endorsement',
      label: `${e.candidate_name} applied for endorsement`,
      sub: e.office_sought || 'Endorsement',
      ts: e.created_at,
      href: '/admin/endorsements/detail?id=' + encodeURIComponent(e.id)
    });
  });
  (okValue('fmRecent', []).data || []).forEach(f => {
    recent.push({
      kind: 'donor',
      label: `${f.first_name || ''} ${f.last_initial || ''}. joined as Founding Member`,
      sub: [f.usps_city, f.county_name].filter(Boolean).join(', '),
      ts: f.created_at,
      href: '/admin/donors'
    });
  });
  recent.sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0));
  const recent15 = recent.slice(0, 15).map(x => ({
    ...x,
    when: relative(x.ts)
  }));

  return json(200, {
    ok: true,
    kpis: {
      volunteers_total:     okValue('volTotal').count || 0,
      volunteers_new_7d:    okValue('volNew7').count || 0,
      volunteers_new_30d:   okValue('volNew30').count || 0,
      volunteers_new:       volByStatus.new || 0,
      volunteers_contacted: volByStatus.contacted || 0,
      volunteers_assigned:  volByStatus.assigned || 0,

      founding_members:      fmCount,
      founding_target:       fmTarget,
      founding_progress_pct: fmPct,

      endorsements_total:    okValue('endTotal').count || 0,
      endorsements_open:     (pipeline.submitted || 0) + (pipeline.under_review || 0),

      bills_active:          okValue('billsActive').count || 0,
      bills_total:           okValue('billsTotal').count || 0,

      counties_covered:      top_counties.length === 0 ? 0 : Object.keys(counties).length,
    },
    pipeline,
    top_counties,
    recent: recent15
  });
};

