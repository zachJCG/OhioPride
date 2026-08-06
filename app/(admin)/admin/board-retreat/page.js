'use client';
// Board retreat results. Read-only view of GET /api/admin-board-retreat, which
// verifies is_admin() server-side and then reads the RLS-locked
// board_retreat_* tables with the service role. Nothing here talks to Supabase
// directly except to lift the caller's access token for the Authorization header.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAdmin } from '../../lib/permissions';

const SEG_LABEL = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// slot_date is a plain 'YYYY-MM-DD' calendar day. Build it in UTC and read it
// back in UTC so the day never slides backward for viewers west of Greenwich.
function fmtDate(iso) {
  const p = String(iso == null ? '' : iso).split('-');
  if (p.length !== 3) return String(iso == null ? '' : iso);
  const dt = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  if (Number.isNaN(dt.getTime())) return String(iso);
  return `${DOW[dt.getUTCDay()]}, ${MON[+p[1] - 1]} ${+p[2]}`;
}

function fmtWhen(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const ERROR_COPY = {
  not_admin: 'Your account is signed in but does not have admin access to these results. Ask the Director to add the board module to your role.',
  server_misconfigured: 'The server is missing its Supabase credentials. Set SUPABASE_SERVICE_ROLE_KEY in Vercel, then refresh.',
  missing_bearer: 'Your session token did not reach the server. Sign out, sign back in, and try again.',
  read_failed: 'The server reached Supabase but could not read the retreat tables. Try again in a moment.',
  method_not_allowed: 'The results endpoint rejected the request method. That is a server bug, not something you did.',
};

const IN_PERSON_STYLE = { background: 'var(--op-navy)', color: '#fff' };
const VIRTUAL_STYLE = { background: 'var(--op-blue)', color: 'var(--op-navy)' };
const HEADING_STYLE = { font: '700 1rem var(--op-font-head)', color: 'var(--op-navy)', margin: '0 0 2px' };
const SUBHEAD_STYLE = { margin: '0 0 10px' };

export default function BoardRetreatPage() {
  const { loading: authLoading, can } = useAdmin();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { data: { session } } = await supabase().auth.getSession();
      if (!session) {
        setData(null);
        setErr('No session token is available in this browser. Sign in again to load the results.');
        return;
      }
      const resp = await fetch('/api/admin-board-retreat', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });
      let body = null;
      try { body = await resp.json(); } catch { body = null; }
      if (!resp.ok || !body || body.ok === false) {
        const code = (body && body.error) || `http_${resp.status}`;
        setData(null);
        setErr(ERROR_COPY[code] || `Could not load the results (${code}).`);
        return;
      }
      setData(body);
      setLoadedAt(new Date());
    } catch (e) {
      setData(null);
      setErr(`Could not reach the results endpoint: ${(e && e.message) || e}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const roster = data?.roster || [];
  const detail = data?.detail || [];

  const tallies = useMemo(() => {
    const rows = [...(data?.tallies || [])];
    rows.sort((a, b) =>
      ((b.total_available || 0) - (a.total_available || 0)) ||
      (a.slot_date < b.slot_date ? -1 : a.slot_date > b.slot_date ? 1 : 0));
    return rows;
  }, [data]);

  const submitted = roster.filter(r => r.has_submitted);
  const pending = roster.filter(r => !r.has_submitted);
  const best = tallies.length ? (tallies[0].total_available || 0) : 0;
  const pct = roster.length ? Math.round(submitted.length * 100 / roster.length) : 0;

  if (!authLoading && !can('board', 'read')) {
    return <div className="alert alert-error">The board module is limited by role. Ask the Director if you need it.</div>;
  }

  return (
    <>
      <div className="page-head">
        <h2>Board retreat</h2>
        <p className="sub">August availability results. Pick the date and segment that clears the most calendars.</p>
      </div>

      <div className="page-actions">
        <button className="btn btn-sm" onClick={load} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
        {loadedAt && (
          <span className="muted small" style={{ alignSelf: 'center' }}>
            Loaded {fmtWhen(loadedAt)}
          </span>
        )}
      </div>

      {err && <div className="alert alert-error">{err}</div>}

      {loading && !data && !err && <div className="card">Loading results…</div>}

      {data && (
        <>
          <div className="kpi-grid">
            <div className="kpi">
              <div className="num">{submitted.length} / {roster.length}</div>
              <div className="lbl">Submitted</div>
              <div className="sub">{roster.length ? `${pct}% of the roster` : 'No roster loaded'}</div>
            </div>
            <div className="kpi">
              <div className="num">{pending.length}</div>
              <div className="lbl">Still pending</div>
              <div className="sub">{pending.length ? 'Waiting on a reply' : 'Everyone has answered'}</div>
            </div>
          </div>

          <section style={{ margin: '14px 0 18px' }}>
            <h3 style={HEADING_STYLE}>Availability by slot</h3>
            <p className="muted small" style={SUBHEAD_STYLE}>
              Most available first. Highlighted rows are tied for the lead.
            </p>
            {!tallies.length ? (
              <div className="card muted">No availability has come in yet.</div>
            ) : (
              <div className="rowlist">
                {tallies.map(t => {
                  const total = t.total_available || 0;
                  const isTop = total === best && best > 0;
                  return (
                    <div
                      key={`${t.slot_date}-${t.segment}`}
                      className="row card"
                      style={isTop ? { background: '#EAF8FD' } : undefined}
                    >
                      <div>
                        <strong>{fmtDate(t.slot_date)}</strong>
                        {isTop && (
                          <span className="badge" style={{ ...VIRTUAL_STYLE, marginLeft: 8 }}>Front runner</span>
                        )}
                      </div>
                      <div className="small">{SEG_LABEL[t.segment] || t.segment}</div>
                      <div className="muted small">
                        {t.in_person_count || 0} in person · {t.virtual_count || 0} virtual
                      </div>
                      <div className="small"><strong>{total}</strong> available</div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section style={{ margin: '0 0 18px' }}>
            <h3 style={HEADING_STYLE}>Who is in</h3>
            <p className="muted small" style={SUBHEAD_STYLE}>
              {submitted.length} submitted, {pending.length} pending.
            </p>
            {!roster.length ? (
              <div className="card muted">No one is on the retreat roster yet.</div>
            ) : (
              <div className="stack">
                {roster.map((r, i) => (
                  <div className="item" key={`${r.full_name}-${i}`}>
                    <span style={{ minWidth: 0 }}>
                      <strong>{r.full_name}</strong>
                      {r.role_label && <span className="muted small" style={{ display: 'block' }}>{r.role_label}</span>}
                    </span>
                    <span style={{ textAlign: 'right', flex: '0 0 auto' }}>
                      {r.has_submitted
                        ? <span className="badge badge-ok">In</span>
                        : <span className="badge badge-muted">Pending</span>}
                      {r.has_submitted && r.submitted_at && (
                        <span className="muted small" style={{ display: 'block', whiteSpace: 'nowrap' }}>
                          {fmtWhen(r.submitted_at)}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 style={HEADING_STYLE}>Detail</h3>
            <p className="muted small" style={SUBHEAD_STYLE}>
              Every pick and note, in the order they came in. Navy marks in person, blue marks virtual.
            </p>
            {!detail.length ? (
              <div className="card muted">No submissions yet.</div>
            ) : (
              detail.map((p, i) => (
                <div className="card" key={`${p.respondent_name}-${i}`} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <strong style={{ font: '700 .95rem var(--op-font-head)' }}>{p.respondent_name || 'Unknown'}</strong>
                    <span className="muted small">{fmtWhen(p.submitted_at)}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {(p.slots || []).map((s, j) => (
                      <span
                        key={`${s.slot_date}-${s.segment}-${j}`}
                        className="chip"
                        style={{ cursor: 'default', gap: 6, paddingTop: 4, paddingBottom: 4, whiteSpace: 'normal' }}
                      >
                        <span>{fmtDate(s.slot_date)}</span>
                        <strong>{SEG_LABEL[s.segment] || s.segment}</strong>
                        <span className="badge" style={s.mode === 'in_person' ? IN_PERSON_STYLE : VIRTUAL_STYLE}>
                          {s.mode === 'in_person' ? 'In person' : 'Virtual'}
                        </span>
                      </span>
                    ))}
                    {!(p.slots || []).length && <span className="muted small">No slots picked.</span>}
                  </div>
                  {p.notes && (
                    <div className="small" style={{ marginTop: 10, borderLeft: '3px solid var(--op-blue)', paddingLeft: 10 }}>
                      {p.notes}
                    </div>
                  )}
                </div>
              ))
            )}
          </section>
        </>
      )}
    </>
  );
}
