'use client';
// Internships: Summer and Fall 2026 applications, triaged on a phone. Ported
// from the static console.
//
// Data model is unchanged from that page: the same explicit column list off
// public.intern_applications newest first, the same search and filter rules,
// and the one write it has ever had, which is setting status by id.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAdmin } from '../../lib/permissions';
import InternDrawer, {
  POSITION_OPTIONS, TERM_OPTIONS, STATUS_OPTIONS, STATUS_LABEL,
  positionLabel, termLabel, personName,
} from './drawer';
import './internships.css';

const COLUMNS =
  'id, created_at, first_name, last_name, email, phone, pronouns, ' +
  'city, county, zip, position, term, start_date_pref, weekly_hours, credit_hours, ' +
  'institution, program_major, class_year, faculty_sponsor_name, faculty_sponsor_email, ' +
  'resume_url, portfolio_url, statement_of_interest, prior_experience, why_ohio_pride, ' +
  'referral_source, is_founding_member, email_optin, status';

const SORTS = [
  { key: 'recent',   label: 'Newest first' },
  { key: 'oldest',   label: 'Oldest first' },
  { key: 'name',     label: 'Name A to Z' },
  { key: 'position', label: 'Position' },
  { key: 'term',     label: 'Term' },
  { key: 'status',   label: 'Status' },
];

const PAGE_STEP = 60;

// PostgREST caps a single response (1000 rows on Supabase), so read in blocks.
// id is a tiebreaker on created_at so paging cannot repeat or skip a row.
async function fetchApplications(sb) {
  const all = [];
  for (let from = 0; from < 10000; from += 1000) {
    const { data, error } = await sb.from('intern_applications').select(COLUMNS)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + 999);
    if (error) return { error };
    all.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return { data: all };
}

const cmp = (a, b) =>
  String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base' });

function fmtWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function InternshipsPage() {
  const { loading: authLoading, can } = useAdmin();
  // Internships have always ridden along with the volunteers module, so a
  // volunteer lead with write access can still move an applicant forward.
  const canWrite = can('internships', 'write') || can('volunteers', 'write');

  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [status, setStatus] = useState('');
  const [position, setPosition] = useState('');
  const [term, setTerm] = useState('');
  const [sort, setSort] = useState('recent');
  const [showFilters, setShowFilters] = useState(false);
  const [visible, setVisible] = useState(PAGE_STEP);

  const [activeId, setActiveId] = useState(null);
  const [busy, setBusy] = useState({});
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const notify = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: err } = await fetchApplications(supabase());
    if (err) {
      setRows([]);
      setError('Could not load intern applications. Your role may not include this module. ' + err.message);
      return;
    }
    setRows(data || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Read ?id= after mount only. Reading the URL during render makes the server
  // and client markup disagree and blanks the page.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id');
    if (id) setActiveId(id);
  }, []);

  useEffect(() => {
    if (!activeId || rows == null) return;
    if (!rows.some((r) => r.id === activeId)) {
      setActiveId(null);
      notify('That application is not in this list.');
    }
  }, [activeId, rows, notify]);

  const list = rows || [];

  const stats = useMemo(() => {
    const s = { total: list.length, new: 0, contacted: 0, interviewing: 0, offered: 0, hired: 0 };
    for (const r of list) if (r.status && s[r.status] != null) s[r.status] += 1;
    return s;
  }, [list]);

  // Canonical positions first, then any retired value still present in the data
  // so those older rows stay reachable from the filter.
  const positionOptions = useMemo(() => {
    const counts = {};
    for (const r of list) if (r.position) counts[r.position] = (counts[r.position] || 0) + 1;
    const out = [];
    for (const p of POSITION_OPTIONS) {
      out.push({ value: p, label: `${positionLabel(p)} (${counts[p] || 0})` });
      delete counts[p];
    }
    for (const k of Object.keys(counts).sort()) {
      out.push({ value: k, label: `${positionLabel(k)} (${counts[k]})` });
    }
    return out;
  }, [list]);

  const termOptions = useMemo(() => {
    const counts = {};
    for (const r of list) if (r.term) counts[r.term] = (counts[r.term] || 0) + 1;
    return TERM_OPTIONS.map((t) => ({ value: t, label: `${termLabel(t)} (${counts[t] || 0})` }));
  }, [list]);

  const filtered = useMemo(() => {
    const out = list.filter((r) => {
      if (status && r.status !== status) return false;
      if (position && r.position !== position) return false;
      // Someone open to either term belongs in both term views.
      if (term && r.term !== term && r.term !== 'either') return false;
      if (debouncedQ) {
        const hay = `${r.first_name || ''} ${r.last_name || ''} ${r.email || ''} ${r.institution || ''} ${r.program_major || ''}`.toLowerCase();
        if (!hay.includes(debouncedQ)) return false;
      }
      return true;
    });
    const time = (r) => new Date(r.created_at || 0).getTime();
    const stage = (r) => {
      const i = STATUS_OPTIONS.indexOf(r.status || 'new');
      return i === -1 ? STATUS_OPTIONS.length : i;
    };
    if (sort === 'oldest') out.sort((a, b) => time(a) - time(b));
    else if (sort === 'name') out.sort((a, b) => cmp(a.last_name, b.last_name) || cmp(a.first_name, b.first_name));
    else if (sort === 'position') out.sort((a, b) => cmp(positionLabel(a.position), positionLabel(b.position)) || time(b) - time(a));
    else if (sort === 'term') out.sort((a, b) => cmp(termLabel(a.term), termLabel(b.term)) || time(b) - time(a));
    else if (sort === 'status') out.sort((a, b) => stage(a) - stage(b) || time(b) - time(a));
    else out.sort((a, b) => time(b) - time(a));
    return out;
  }, [list, status, position, term, debouncedQ, sort]);

  useEffect(() => { setVisible(PAGE_STEP); }, [filtered]);

  const activeFilters = (position ? 1 : 0) + (term ? 1 : 0);

  function resetFilters() {
    setPosition(''); setTerm(''); setStatus(''); setQ('');
  }

  function patchRow(id, patch) {
    setRows((cur) => (cur || []).map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function changeStatus(row, next) {
    if (!canWrite) { notify('Your role does not include write access.'); return; }
    const prev = row.status || 'new';
    if (next === prev) return;
    patchRow(row.id, { status: next });
    setBusy((b) => ({ ...b, [row.id]: true }));
    const { data, error: err } = await supabase()
      .from('intern_applications').update({ status: next }).eq('id', row.id)
      .select(COLUMNS).single();
    setBusy((b) => { const n = { ...b }; delete n[row.id]; return n; });
    if (err) {
      patchRow(row.id, { status: prev });
      notify('Could not update status. ' + err.message);
      return;
    }
    if (data) patchRow(row.id, data);
    notify(`Status set to ${STATUS_LABEL[next] || next}.`);
  }

  function exportCsv() {
    if (!filtered.length) { notify('Nothing to export with the current filters.'); return; }
    const cols = [
      'created_at', 'first_name', 'last_name', 'email', 'phone', 'pronouns',
      'city', 'county', 'zip',
      'position', 'term', 'start_date_pref', 'weekly_hours', 'credit_hours',
      'institution', 'program_major', 'class_year',
      'faculty_sponsor_name', 'faculty_sponsor_email',
      'resume_url', 'portfolio_url', 'statement_of_interest', 'prior_experience', 'why_ohio_pride',
      'referral_source', 'is_founding_member', 'email_optin', 'status',
    ];
    const esc = (v) => {
      let s = typeof v === 'boolean' ? (v ? 'true' : 'false') : v == null ? '' : String(v);
      s = s.replace(/"/g, '""');
      return /[,"\n]/.test(s) ? `"${s}"` : s;
    };
    const lines = [cols.join(',')];
    for (const r of filtered) lines.push(cols.map((c) => esc(r[c])).join(','));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    a.download = `ohio-pride-internships-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    notify(`Exported ${filtered.length} application${filtered.length === 1 ? '' : 's'}.`);
  }

  if (!authLoading && !can('internships', 'read')) {
    return (
      <div className="alert alert-error">
        The internships module holds resumes and contact details for applicants, so it is limited by role.
        Ask the Director if you need it.
      </div>
    );
  }

  const active = rows?.find((r) => r.id === activeId) || null;

  return (
    <>
      <div className="page-head">
        <h2>Internships</h2>
        <p className="sub">Summer and Fall 2026 applications. Triage, interview, and hire.</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="kpi-grid int-kpis">
        <div className="kpi"><div className="num">{stats.total.toLocaleString()}</div><div className="lbl">Total</div></div>
        <div className="kpi"><div className="num">{stats.new.toLocaleString()}</div><div className="lbl">New</div></div>
        <div className="kpi"><div className="num">{stats.contacted.toLocaleString()}</div><div className="lbl">Contacted</div></div>
        <div className="kpi"><div className="num">{stats.interviewing.toLocaleString()}</div><div className="lbl">Interviewing</div></div>
        <div className="kpi"><div className="num">{stats.offered.toLocaleString()}</div><div className="lbl">Offered</div></div>
        <div className="kpi"><div className="num">{stats.hired.toLocaleString()}</div><div className="lbl">Hired</div></div>
      </div>

      <div className="sticky-tools">
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" placeholder="Search name, email, school" value={q} inputMode="search"
                 aria-label="Search applications" onChange={(e) => setQ(e.target.value)} />
          <button className="btn" style={{ flex: '0 0 auto' }} aria-expanded={showFilters}
                  onClick={() => setShowFilters((v) => !v)}>
            Filters{activeFilters ? ` (${activeFilters})` : ''}
          </button>
        </div>
        <div className="chip-row" role="tablist" aria-label="Status">
          <button className="chip" aria-pressed={status === ''} onClick={() => setStatus('')}>All statuses</button>
          {STATUS_OPTIONS.map((s) => (
            <button key={s} className="chip" aria-pressed={status === s} onClick={() => setStatus(s)}>
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {showFilters && (
        <div className="int-filters">
          <label className="field">
            <span>Position</span>
            <select className="select" value={position} onChange={(e) => setPosition(e.target.value)}>
              <option value="">All positions</option>
              {positionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Term</span>
            <select className="select" value={term} onChange={(e) => setTerm(e.target.value)}>
              <option value="">All terms</option>
              {termOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <div className="muted small">Summer and Fall also show applicants open to either term.</div>
          </label>
          <div className="field" style={{ alignSelf: 'end' }}>
            <button className="btn" onClick={resetFilters}>Clear filters</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0 10px', flexWrap: 'wrap' }}>
        <span className="muted small">
          {filtered.length === list.length
            ? `${list.length.toLocaleString()} total`
            : `${filtered.length.toLocaleString()} of ${list.length.toLocaleString()}`}
        </span>
        <span style={{ flex: 1 }} />
        <label className="muted small" htmlFor="intSort">Sort</label>
        <select id="intSort" className="select" style={{ width: 'auto', minHeight: 34 }}
                value={sort} onChange={(e) => setSort(e.target.value)}>
          {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <button className="btn btn-sm" onClick={exportCsv}>Export CSV</button>
        <a className="btn btn-sm" href="/volunteer#internships" target="_blank" rel="noopener">Public listing</a>
      </div>

      {rows == null ? <div className="card">Loading applications…</div> : (
        <div className="rowlist int-rows">
          {filtered.slice(0, visible).map((r) => {
            const name = personName(r) || 'Unnamed applicant';
            return (
              <div key={r.id} className="row card">
                <div>
                  <button className="int-name" onClick={() => setActiveId(r.id)}>
                    <strong>{name}</strong>
                    {r.is_founding_member && <span className="badge badge-founding" style={{ marginLeft: 8 }}>Founding</span>}
                    {r.pronouns && <span className="muted small" style={{ marginLeft: 8 }}>{r.pronouns}</span>}
                    <span className="muted small" style={{ display: 'block', overflowWrap: 'anywhere' }}>
                      {[r.email, r.phone].filter(Boolean).join(' · ') || 'No contact details on file'}
                    </span>
                  </button>
                </div>

                <div className="small">
                  <span className="int-cell-label">Position</span>
                  <span className="badge badge-position">{positionLabel(r.position) || 'Not given'}</span>
                  <span className="muted small" style={{ display: 'block', marginTop: 2 }}>
                    {termLabel(r.term) || 'No term given'}
                  </span>
                </div>

                <div className="small">
                  <span className="int-cell-label">Institution</span>
                  {r.institution || <span className="muted">Not given</span>}
                  {r.program_major && <span className="muted small" style={{ display: 'block' }}>{r.program_major}</span>}
                </div>

                <div className="small">
                  <span className="int-cell-label">Materials</span>
                  <div className="int-links">
                    {r.resume_url && <a href={r.resume_url} target="_blank" rel="noopener">Resume</a>}
                    {r.portfolio_url && <a href={r.portfolio_url} target="_blank" rel="noopener">Portfolio</a>}
                    {!r.resume_url && !r.portfolio_url && <span className="muted">None attached</span>}
                  </div>
                </div>

                <div className="muted small" style={{ whiteSpace: 'nowrap' }}>
                  <span className="int-cell-label">Submitted</span>
                  {fmtWhen(r.created_at)}
                </div>

                <div>
                  <span className="int-cell-label">Status</span>
                  <select className="select int-inline int-status" data-status={r.status || 'new'}
                          aria-label={`Status for ${name}`} value={r.status || 'new'}
                          disabled={!canWrite || !!busy[r.id]}
                          onChange={(e) => changeStatus(r, e.target.value)}>
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                </div>
              </div>
            );
          })}

          {!filtered.length && !error && (
            <div className="card muted">
              {list.length
                ? 'No applications match these filters.'
                : 'No intern applications yet. Submissions from the apply path on the volunteer form land here.'}
            </div>
          )}
        </div>
      )}

      {filtered.length > visible && (
        <button className="btn" style={{ width: '100%', marginTop: 10 }}
                onClick={() => setVisible((v) => v + PAGE_STEP)}>
          Show more ({visible.toLocaleString()} of {filtered.length.toLocaleString()})
        </button>
      )}

      {active && (
        <InternDrawer
          key={active.id}
          row={active}
          canWrite={canWrite}
          busy={!!busy[active.id]}
          onStatus={changeStatus}
          onClose={() => setActiveId(null)}
        />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
