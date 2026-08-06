'use client';
// Bills: the tracked-legislation catalog behind /issues and the public
// scorecard. Ported from the static console so it works on a phone in a
// committee room.
//
// Reads public.bills with select('*') ordered by last_action_on, the same read
// the static page made, and filters and sorts in the browser because the whole
// catalog is a few dozen rows. Stance is the PAC assessment that drives
// scoring; status is the parliamentary state; is_featured pins a bill to the
// top of /issues. Writes go through the editor drawer.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAdmin } from '../../lib/permissions';
import BillDrawer, {
  STANCE_OPTIONS, STANCE_LABEL, STANCE_BADGE, STATUS_LABEL,
  CHAMBER_OPTIONS, CHAMBER_LABEL, titleCase, fmtDay,
} from './drawer';
import './bills.css';

const SORTS = [
  { value: 'last_action_on:desc', label: 'Last action, newest' },
  { value: 'last_action_on:asc',  label: 'Last action, oldest' },
  { value: 'introduced_on:desc',  label: 'Introduced, newest' },
  { value: 'introduced_on:asc',   label: 'Introduced, oldest' },
  { value: 'bill_number:asc',     label: 'Bill number' },
  { value: 'title:asc',           label: 'Title A to Z' },
  { value: 'status:asc',          label: 'Status' },
];

const DATE_KEYS = ['introduced_on', 'last_action_on'];

function sortRows(list, key, dir) {
  const d = dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (DATE_KEYS.includes(key)) {
      return (new Date(av || 0).getTime() - new Date(bv || 0).getTime()) * d;
    }
    return String(av || '').localeCompare(String(bv || ''), undefined, { numeric: true, sensitivity: 'base' }) * d;
  });
}

export default function BillsPage() {
  const { loading: authLoading, can } = useAdmin();
  const canWrite = can('bills', 'write');

  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [stance, setStance] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [chamber, setChamber] = useState('');
  const [sort, setSort] = useState('last_action_on:desc');
  const [showFilters, setShowFilters] = useState(false);

  const [activeId, setActiveId] = useState(null);
  const [creating, setCreating] = useState(false);
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
    const { data, error: err } = await supabase()
      .from('bills')
      .select('*')
      .order('last_action_on', { ascending: false, nullsFirst: false });
    if (err) {
      setRows([]);
      setError('Could not load bills. Your account may not be authorized for this view. ' + err.message);
      return;
    }
    setError(null);
    setRows(data || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Read the URL after mount only. Reading it during render makes the server
  // and client markup disagree and blanks the page.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const s = p.get('stance');
    if (s && STANCE_OPTIONS.includes(s)) setStance(s);
    const st = p.get('status');
    if (st) setStatus(st);
    const c = p.get('category');
    if (c) setCategory(c);
    const ch = p.get('chamber');
    if (ch && CHAMBER_OPTIONS.includes(ch)) setChamber(ch);
    const term = p.get('q');
    if (term) setQ(term);
    const id = p.get('id');
    if (id) setActiveId(id);
  }, []);

  const stats = useMemo(() => {
    const list = rows || [];
    return {
      total: list.length,
      anti: list.filter((r) => r.stance === 'anti').length,
      pro: list.filter((r) => r.stance === 'pro').length,
      featured: list.filter((r) => r.is_featured).length,
    };
  }, [rows]);

  const statusValues = useMemo(
    () => [...new Set((rows || []).map((r) => r.status).filter(Boolean))].sort(), [rows]);
  const categoryValues = useMemo(
    () => [...new Set((rows || []).map((r) => r.category).filter(Boolean))].sort(), [rows]);

  const filtered = useMemo(() => {
    const list = (rows || []).filter((r) => {
      if (stance && r.stance !== stance) return false;
      if (status && r.status !== status) return false;
      if (category && r.category !== category) return false;
      if (chamber && r.chamber_of_origin !== chamber) return false;
      if (debouncedQ) {
        const hay = [r.bill_number, r.title, r.official_title, r.summary, r.what_it_does]
          .map((v) => v || '').join(' ').toLowerCase();
        if (!hay.includes(debouncedQ)) return false;
      }
      return true;
    });
    const [key, dir] = sort.split(':');
    return sortRows(list, key, dir);
  }, [rows, stance, status, category, chamber, debouncedQ, sort]);

  const activeFilters = (status ? 1 : 0) + (category ? 1 : 0) + (chamber ? 1 : 0);

  function resetFilters() {
    setStatus(''); setCategory(''); setChamber(''); setStance(''); setQ('');
  }

  if (!authLoading && !can('bills', 'read')) {
    return (
      <div className="alert alert-error">
        The bills module is limited by role. Ask the Director if you need it.
      </div>
    );
  }

  const active = (rows || []).find((r) => r.id === activeId) || null;

  return (
    <>
      <div className="page-head">
        <h2>Bills</h2>
        <p className="sub">Tracked legislation: our stance, where it sits in the process, and who it hits.</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="kpi-grid">
        <div className="kpi">
          <div className="num bl-figure">{stats.total.toLocaleString()}</div>
          <div className="lbl">Tracked bills</div>
        </div>
        <div className="kpi">
          <div className="num bl-figure">{stats.anti.toLocaleString()}</div>
          <div className="lbl">PAC opposes</div>
        </div>
        <div className="kpi">
          <div className="num bl-figure">{stats.pro.toLocaleString()}</div>
          <div className="lbl">PAC supports</div>
        </div>
        <div className="kpi">
          <div className="num bl-figure">{stats.featured.toLocaleString()}</div>
          <div className="lbl">Featured</div>
        </div>
      </div>

      {canWrite && (
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setCreating(true)}>New bill</button>
        </div>
      )}

      <div className="sticky-tools">
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" placeholder="Search bill number, title, summary" value={q}
                 inputMode="search" aria-label="Search bills"
                 onChange={(e) => setQ(e.target.value)} />
          <button className="btn" style={{ flex: '0 0 auto' }} aria-expanded={showFilters}
                  onClick={() => setShowFilters((v) => !v)}>
            Filters{activeFilters ? ` (${activeFilters})` : ''}
          </button>
        </div>
        <div className="chip-row" role="group" aria-label="Stance">
          <button className="chip" aria-pressed={stance === ''} onClick={() => setStance('')}>All stances</button>
          {STANCE_OPTIONS.map((s) => (
            <button key={s} className="chip" aria-pressed={stance === s} onClick={() => setStance(s)}>
              {STANCE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {showFilters && (
        <div className="bl-filters">
          <label className="field">
            <span>Status</span>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {statusValues.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s] || titleCase(s)}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Category</span>
            <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {categoryValues.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Chamber of origin</span>
            <select className="select" value={chamber} onChange={(e) => setChamber(e.target.value)}>
              <option value="">Both chambers</option>
              {CHAMBER_OPTIONS.map((c) => <option key={c} value={c}>{CHAMBER_LABEL[c]}</option>)}
            </select>
          </label>
          <div className="field" style={{ alignSelf: 'end' }}>
            <button className="btn" onClick={resetFilters}>Clear filters</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0 10px', flexWrap: 'wrap' }}>
        <span className="muted small bl-figure">
          {rows == null
            ? 'Loading'
            : filtered.length === rows.length
              ? `${rows.length.toLocaleString()} total`
              : `${filtered.length.toLocaleString()} of ${rows.length.toLocaleString()}`}
        </span>
        <span style={{ flex: 1 }} />
        <label className="muted small" htmlFor="blSort">Sort</label>
        <select id="blSort" className="select" style={{ width: 'auto', minHeight: 34 }}
                value={sort} onChange={(e) => setSort(e.target.value)}>
          {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {rows == null ? <div className="card">Loading bills…</div> : (
        <div className="rowlist">
          {filtered.map((r) => (
            <button key={r.id} className="row card" onClick={() => setActiveId(r.id)}
                    style={{ cursor: 'pointer', textAlign: 'left', font: 'inherit', width: '100%' }}>
              <div>
                <span className="bl-num">{r.bill_number || r.slug}</span>
                {r.is_featured && <span className="badge badge-founding" style={{ marginLeft: 8 }}>Featured</span>}
                <div style={{ marginTop: 2 }}>{r.title}</div>
              </div>
              <div className="small">
                {r.stance ? (
                  <span className={`badge ${STANCE_BADGE[r.stance] || 'badge-muted'}`}>
                    {STANCE_LABEL[r.stance] || r.stance}
                  </span>
                ) : <span className="muted">No stance set</span>}
                <div style={{ marginTop: 4 }}>
                  <span className="badge badge-muted">{STATUS_LABEL[r.status] || titleCase(r.status) || 'No status'}</span>
                </div>
              </div>
              <div className="small">
                <div>{r.category ? titleCase(r.category) : <span className="muted">No category</span>}</div>
                <div className="muted small">
                  {[CHAMBER_LABEL[r.chamber_of_origin] || titleCase(r.chamber_of_origin), r.general_assembly ? `${r.general_assembly}th GA` : '']
                    .filter(Boolean).join(' · ')}
                </div>
              </div>
              <div className="small bl-figure">
                <div className="muted small">{r.last_action_on ? `Acted ${fmtDay(r.last_action_on)}` : 'No action recorded'}</div>
                <div className="muted small">{r.introduced_on ? `Introduced ${fmtDay(r.introduced_on)}` : ''}</div>
              </div>
            </button>
          ))}
          {!filtered.length && !error && (
            <div className="card muted">
              {rows.length === 0
                ? 'No bills yet. Add the first one to start the tracker.'
                : 'No bills match these filters.'}
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <strong>How this data works.</strong>
        <p className="muted small" style={{ marginBottom: 0 }}>
          Bills live in public.bills and feed the public tracker at /issues plus the scorecard. Stance is
          the PAC assessment that drives scoring: opposes means a yes vote costs a legislator points,
          supports means a yes vote earns them. Status is the parliamentary state, kept separate from
          stance on purpose. The slug is the join key for roll calls and sponsorships, so it is locked
          once a bill exists.
        </p>
      </div>

      {(creating || active) && (
        <BillDrawer
          key={creating ? 'new' : active.id}
          bill={creating ? null : active}
          canWrite={canWrite}
          notify={notify}
          onSaved={(saved, isNew) => {
            setRows((list) => (isNew
              ? [saved, ...(list || [])]
              : (list || []).map((r) => (r.id === saved.id ? saved : r))));
            setCreating(false);
            setActiveId(null);
          }}
          onDeleted={(id) => {
            setRows((list) => (list || []).filter((r) => r.id !== id));
            setActiveId(null);
          }}
          onClose={() => { setCreating(false); setActiveId(null); }}
        />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
