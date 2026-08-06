'use client';
// Members: the ActBlue founding-member roster (public.founding_members), the
// 1,969 campaign. Contacts is the person spine; this module is the membership
// lens on it, so every row links back out to its contact record.
//
// The roster is small and capped at 1,969 rows by design, so it loads whole and
// filters in memory. That keeps search across six fields exact instead of
// building a PostgREST .or() string, which breaks on commas in employer names.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAdmin } from '../../lib/permissions';
import { money, shortDate } from '../../lib/format';
import MemberDrawer from './member-drawer';

const GOAL = 1969;
const BLOCK = 500;

const FILTERS = [
  { key: 'all',      label: 'All' },
  { key: 'monthly',  label: 'Monthly' },
  { key: 'one_time', label: 'One time' },
  { key: 'public',   label: 'On public roster' },
  { key: 'vetted',   label: 'Vetted' },
  { key: 'unvetted', label: 'Needs vetting' },
];

const SORTS = [
  { key: 'number',  label: 'Founding number' },
  { key: 'newest',  label: 'Newest gift' },
  { key: 'largest', label: 'Largest gift' },
  { key: 'name',    label: 'Name' },
];

// Page in blocks of 500: PostgREST caps a single response, so one big .limit()
// would silently truncate. select('*') on purpose, because a hardcoded column
// list drifted from the live schema before and the whole page 400'd.
async function fetchAllMembers() {
  const rows = [];
  for (let from = 0; from < 5000; from += BLOCK) {
    const { data, error } = await supabase()
      .from('founding_members')
      .select('*')
      .order('founding_number', { ascending: true, nullsFirst: false })
      .range(from, from + BLOCK - 1);
    if (error) return { error };
    rows.push(...(data || []));
    if (!data || data.length < BLOCK) break;
  }
  return { rows };
}

function matchesFilter(m, key) {
  if (key === 'monthly')  return m.recurrence === 'monthly';
  if (key === 'one_time') return m.recurrence !== 'monthly';
  if (key === 'public')   return !!m.is_public;
  if (key === 'vetted')   return !!m.is_vetted;
  if (key === 'unvetted') return !m.is_vetted;
  return true;
}

function matchesSearch(m, term) {
  if (!term) return true;
  return [m.full_name, m.email, m.display_name, m.employer, m.city, m.county]
    .some(v => String(v || '').toLowerCase().includes(term));
}

function sortRows(rows, sort) {
  const out = [...rows];
  if (sort === 'newest') {
    out.sort((a, b) => new Date(b.contributed_at || 0) - new Date(a.contributed_at || 0));
  } else if (sort === 'largest') {
    out.sort((a, b) => (b.amount_cents || 0) - (a.amount_cents || 0));
  } else if (sort === 'name') {
    out.sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || '')));
  } else {
    out.sort((a, b) => (a.founding_number ?? 1e9) - (b.founding_number ?? 1e9));
  }
  return out;
}

const place = (m) => [m.city, m.county && `${m.county} County`].filter(Boolean).join(', ');

export default function MembersPage() {
  const { loading: authLoading, can } = useAdmin();
  const canWrite = can('donors', 'write');

  const [all, setAll] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('number');
  const [activeId, setActiveId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const notify = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const load = useCallback(async () => {
    setError(null);
    const { rows, error: err } = await fetchAllMembers();
    if (err) { setError('Could not load the member roster: ' + err.message); setAll([]); return; }
    setAll(rows);
  }, []);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const rows = all || [];
    return {
      count: rows.length,
      cents: rows.reduce((s, m) => s + (m.amount_cents || 0), 0),
      publicCount: rows.filter(m => m.is_public).length,
      unvetted: rows.filter(m => !m.is_vetted).length,
      monthly: rows.filter(m => m.recurrence === 'monthly').length,
    };
  }, [all]);

  const rows = useMemo(() => {
    if (!all) return [];
    const term = q.trim().toLowerCase();
    return sortRows(all.filter(m => matchesFilter(m, filter) && matchesSearch(m, term)), sort);
  }, [all, q, filter, sort]);

  // Optimistic patch from the drawer toggles; the drawer rolls back through the
  // same path when the write fails.
  const patchRow = useCallback((id, patch) => {
    setAll(list => (list || []).map(m => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  async function exportCsv() {
    setExporting(true);
    const { rows: fresh, error: err } = await fetchAllMembers();
    setExporting(false);
    if (err) { notify('Export failed: ' + err.message); return; }
    const term = q.trim().toLowerCase();
    const data = sortRows(fresh.filter(m => matchesFilter(m, filter) && matchesSearch(m, term)), sort);
    if (!data.length) { notify('Nothing to export with these filters.'); return; }
    const cols = ['founding_number', 'full_name', 'email', 'display_name', 'amount_cents', 'recurrence',
      'contributed_at', 'is_public', 'is_vetted', 'city', 'county', 'state', 'employer', 'occupation',
      'elected_office', 'jurisdiction', 'actblue_contribution_id', 'actblue_receipt_id', 'notes'];
    const esc = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const csv = [cols.join(','), ...data.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `members-${filter}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    notify(`Exported ${data.length} member${data.length === 1 ? '' : 's'}.`);
  }

  if (!authLoading && !can('donors', 'read')) {
    return <div className="alert alert-error">The members roster is limited by role. Ask the Director if you need it.</div>;
  }

  const pct = (stats.count / GOAL) * 100;
  const pctLabel = pct >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10;
  const active = (all || []).find(m => m.id === activeId) || null;

  return (
    <>
      <div className="page-head">
        <h2>Members</h2>
        <p className="sub">The founding member roster from ActBlue, and where each one stands on the public list.</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="kpi-grid">
        <div className="kpi">
          <div className="num">{stats.count.toLocaleString()}</div>
          <div className="lbl">Members</div>
          <div className="sub">{stats.monthly} giving monthly</div>
        </div>
        <div className="kpi">
          <div className="num">{money(stats.cents)}</div>
          <div className="lbl">Raised</div>
          <div className="sub">{stats.count ? money(Math.round(stats.cents / stats.count)) : money(0)} average</div>
        </div>
        <div className="kpi">
          <div className="num">{stats.publicCount.toLocaleString()}</div>
          <div className="lbl">On public roster</div>
          <div className="sub">{stats.unvetted} still need vetting</div>
        </div>
        <div className="kpi">
          <div className="num">{pctLabel}%</div>
          <div className="lbl">Toward 1,969</div>
          <div className="meter" style={{ marginTop: 8 }}>
            <span style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
          <div className="sub">{(GOAL - stats.count).toLocaleString()} to go</div>
        </div>
      </div>

      <div className="sticky-tools">
        <input className="input" placeholder="Search name, email, employer, city, county"
               value={q} onChange={e => setQ(e.target.value)} inputMode="search" aria-label="Search members" />
        <div className="chip-row" role="tablist" aria-label="Member filters">
          {FILTERS.map(f => (
            <button key={f.key} className="chip" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0 10px', flexWrap: 'wrap' }}>
        <span className="muted small">
          {rows.length.toLocaleString()} member{rows.length === 1 ? '' : 's'}
          {all && rows.length !== all.length ? ` of ${all.length.toLocaleString()}` : ''}
        </span>
        <span style={{ flex: 1 }} />
        <label className="muted small" htmlFor="memberSort">Sort</label>
        <select id="memberSort" className="select" style={{ width: 'auto', minHeight: 34 }}
                value={sort} onChange={e => setSort(e.target.value)}>
          {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <button className="btn btn-sm" onClick={exportCsv} disabled={exporting || !rows.length}>
          {exporting ? 'Preparing…' : 'Export CSV'}
        </button>
      </div>

      {all == null ? <div className="card">Loading members…</div> : (
        <div className="rowlist">
          {rows.map(m => (
            <button key={m.id} className="row card" onClick={() => setActiveId(m.id)}
                    style={{ cursor: 'pointer', textAlign: 'left', font: 'inherit', width: '100%' }}>
              <div>
                {m.founding_number != null
                  ? <span className="badge badge-founding">#{m.founding_number}</span>
                  : <span className="badge badge-muted">No number</span>}
                <strong style={{ marginLeft: 8 }}>{m.full_name || m.display_name || m.email || 'Unnamed'}</strong>
                <div className="muted small" style={{ overflowWrap: 'anywhere' }}>{m.email || 'no email on file'}</div>
              </div>
              <div className="small">
                <strong>{money(m.amount_cents)}</strong>
                {m.recurrence === 'monthly' ? <span className="muted">/mo</span> : ''}
                <span className="muted"> · {shortDate(m.contributed_at)}</span>
              </div>
              <div className="muted small">{place(m) || 'No location on file'}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span className={`badge ${m.is_public ? 'badge-ok' : 'badge-muted'}`}>
                  {m.is_public ? 'Public' : 'Private'}
                </span>
                <span className={`badge ${m.is_vetted ? 'badge-ok' : 'badge-review'}`}>
                  {m.is_vetted ? 'Vetted' : 'Needs vetting'}
                </span>
              </div>
            </button>
          ))}
          {!rows.length && !error && (
            <div className="card muted">No members match this search.</div>
          )}
        </div>
      )}

      {active && (
        <MemberDrawer
          member={active}
          canWrite={canWrite}
          notify={notify}
          onPatch={patchRow}
          onClose={() => setActiveId(null)}
        />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
