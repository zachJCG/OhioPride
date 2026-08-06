'use client';
// Dashboard: aggregated KPIs + recent activity via GET /api/admin-dashboard
// (same endpoint the static page used; is_admin() gates it server-side).
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAdmin } from '../../lib/permissions';

const QUICK_ACTIONS = [
  { href: '/admin/contacts', label: 'Contacts', permission: ['contacts', 'read'] },
  { href: '/admin/endorsements', label: 'Endorsements', permission: ['endorsements', 'read'] },
  { href: '/admin/tasks', label: 'Tasks', permission: ['tasks', 'read'] },
  { href: '/admin/texting', label: 'Text Blast', permission: ['texting', 'read'] },
  { href: '/admin/volunteers', label: 'Volunteers', permission: ['volunteers', 'read'] },
  { href: '/admin/users', label: 'Users', permission: ['users', 'read'] },
];

const PIPELINE_LABEL = {
  submitted: 'Submitted', under_review: 'Under review', endorsed: 'Endorsed',
  declined: 'Declined', withdrawn: 'Withdrawn',
};

export default function DashboardPage() {
  const { loading: authLoading, me, can } = useAdmin();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase().auth.getSession();
      if (!session) return;
      try {
        const resp = await fetch('/api/admin-dashboard', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const body = await resp.json();
        if (!resp.ok || !body.ok) throw new Error(body.error || `status ${resp.status}`);
        setData(body);
      } catch (e) {
        setErr(e.message === 'not_admin'
          ? 'Your account has no admin access.'
          : 'Could not load the dashboard. Pull to refresh or try again shortly.');
      }
    })();
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = (me?.full_name || '').split(' ')[0];

  if (err) return <div className="alert alert-error">{err}</div>;

  const k = data?.kpis;
  const maxCounty = Math.max(1, ...(data?.top_counties || []).map(c => c.count));

  return (
    <>
      <div className="page-head">
        <h2>{greeting}{firstName ? `, ${firstName}` : ''}</h2>
        <p className="sub">The pulse on volunteers, endorsements, and donors.</p>
      </div>

      {!data && !err && <div className="card">Loading…</div>}

      {k && (
        <div className="kpi-grid">
          {can('volunteers') && (
            <div className="kpi">
              <div className="num">{k.volunteers_total.toLocaleString()}</div>
              <div className="lbl">Volunteers</div>
              <div className="sub">+{k.volunteers_new_7d} this week</div>
            </div>
          )}
          {can('donors') && (
            <div className="kpi">
              <div className="num">{k.founding_members.toLocaleString()}<span className="muted" style={{ fontSize: '.85rem' }}> / {k.founding_target.toLocaleString()}</span></div>
              <div className="lbl">Founding members</div>
              <div className="meter" style={{ marginTop: 6 }}><span style={{ width: `${k.founding_progress_pct}%` }} /></div>
            </div>
          )}
          {can('endorsements') && (
            <div className="kpi">
              <div className="num">{k.endorsements_open.toLocaleString()}</div>
              <div className="lbl">Open endorsements</div>
              <div className="sub">{k.endorsements_total} total applications</div>
            </div>
          )}
          {can('bills') && (
            <div className="kpi">
              <div className="num">{k.bills_active.toLocaleString()}</div>
              <div className="lbl">Active bills</div>
              <div className="sub">{k.bills_total} tracked</div>
            </div>
          )}
        </div>
      )}

      {!authLoading && (
        <section style={{ marginBottom: 14 }}>
          <div className="chip-row">
            {QUICK_ACTIONS.filter(a => can(...a.permission)).map(a => (
              <a key={a.href} className="chip" href={a.href}>{a.label}</a>
            ))}
          </div>
        </section>
      )}

      {data && can('endorsements') && (
        <div className="card" style={{ marginBottom: 12 }}>
          <strong style={{ font: '700 .95rem var(--op-font-head)' }}>Endorsement pipeline</strong>
          <div style={{ marginTop: 8 }}>
            {Object.entries(PIPELINE_LABEL).map(([key, label]) => (
              <div className="bar-row" key={key}>
                <span className="muted">{label}</span>
                <span className="meter"><span style={{ width: `${Math.min(100, (data.pipeline[key] || 0) * 100 / Math.max(1, data.kpis.endorsements_total))}%` }} /></span>
                <strong>{data.pipeline[key] || 0}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {data?.recent?.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <strong style={{ font: '700 .95rem var(--op-font-head)' }}>Recent activity</strong>
          <div style={{ marginTop: 4 }}>
            {data.recent.map((r, i) => (
              <a key={i} href={r.href} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderBottom: i < data.recent.length - 1 ? '1px solid var(--op-line)' : 'none', textDecoration: 'none' }}>
                <span>
                  <span style={{ display: 'block', fontSize: '.9rem' }}>{r.label}</span>
                  <span className="muted small">{r.sub}</span>
                </span>
                <span className="muted small" style={{ whiteSpace: 'nowrap' }}>{r.when}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {data?.top_counties?.length > 0 && can('volunteers') && (
        <div className="card">
          <strong style={{ font: '700 .95rem var(--op-font-head)' }}>Volunteer counties</strong>
          <div className="muted small" style={{ marginBottom: 6 }}>{data.kpis.counties_covered} of 88 counties represented</div>
          {data.top_counties.map(c => (
            <div className="bar-row" key={c.county}>
              <span className="muted">{c.county}</span>
              <span className="meter"><span style={{ width: `${c.count * 100 / maxCounty}%` }} /></span>
              <strong>{c.count}</strong>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
