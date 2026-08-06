'use client';
// Prospects: the PAC major-donor pipeline, ported from the static fundraising
// console so it works on a phone between meetings.
//
// Reads public.pac_pipeline (the prospect row plus its owner name and activity
// rollup). contact_id lives on public.pac_prospects and is not in the view, so
// it is fetched alongside and merged in to link a prospect to its contact
// record. Writes go to pac_prospects; stage moves go through the RPC.
//
// PAC money stands on its own and is never combined with any other entity.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAdmin } from '../../lib/permissions';
import { money } from '../../lib/format';
import ProspectDrawer from './drawer';
import {
  STAGES, STAGE_LABEL, STAGE_COLOR, PRIORITY_OPTIONS, PRIORITY_LABEL,
  TYPE_OPTIONS, titleize, todayISO, fmtDay, ownerLabel,
} from './lib';
import './prospects.css';

const PAGE_STEP = 100;

const SORTS = [
  { key: 'capacity_desc',  label: 'Capacity, high first' },
  { key: 'capacity_asc',   label: 'Capacity, low first' },
  { key: 'committed_desc', label: 'Committed, high first' },
  { key: 'name_asc',       label: 'Name A to Z' },
  { key: 'name_desc',      label: 'Name Z to A' },
];

// PostgREST caps a single response (1000 rows on Supabase), so read the view in
// blocks instead of trusting one unbounded select.
async function fetchPipeline(sb) {
  const all = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await sb.from('pac_pipeline').select('*')
      .order('full_name', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + 999);
    if (error) return { error };
    all.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return { data: all };
}

export default function ProspectsPage() {
  const { loading: authLoading, can } = useAdmin();
  const canWrite = can('pac_prospects', 'write');

  const [rows, setRows] = useState(null);
  const [owners, setOwners] = useState([]);
  const [error, setError] = useState(null);
  const [warn, setWarn] = useState(null);

  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [type, setType] = useState('individual');
  const [stageFilter, setStageFilter] = useState([]);
  const [ownerId, setOwnerId] = useState('');
  const [source, setSource] = useState('');
  const [county, setCounty] = useState('');
  const [priority, setPriority] = useState('');
  const [dnc, setDnc] = useState('');
  const [sort, setSort] = useState('capacity_desc');
  const [showFilters, setShowFilters] = useState(false);
  const [visible, setVisible] = useState(PAGE_STEP);

  const [activeId, setActiveId] = useState(null);
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
    const sb = supabase();
    setError(null);
    setWarn(null);
    const [pipe, links, admins] = await Promise.all([
      fetchPipeline(sb),
      sb.from('pac_prospects').select('id, contact_id'),
      sb.from('admin_users').select('id, email, full_name, is_active')
        .eq('is_active', true).order('full_name', { ascending: true }),
    ]);

    if (pipe.error) {
      setRows([]);
      setError('Could not load this pipeline. ' + pipe.error.message);
      return;
    }
    if (links.error) {
      setWarn('Contact links are unavailable right now, so the link to a contact record may be missing. ' + links.error.message);
    }
    if (admins.error) {
      setWarn((w) => (w ? w + ' ' : '') + 'Could not load the owner list. ' + admins.error.message);
    }

    const linkById = new Map((links.data || []).map((r) => [r.id, r.contact_id]));
    setRows((pipe.data || []).map((r) => ({ ...r, contact_id: linkById.get(r.id) ?? null })));
    setOwners(admins.data || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Read the URL after mount only. Reading it during render makes the server
  // and client markup disagree and blanks the page.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get('type');
    if (t === 'individual' || t === 'committee' || t === '') setType(t);
    const s = p.get('stage');
    if (s && STAGES.includes(s)) setStageFilter([s]);
    const id = p.get('id');
    if (id) setActiveId(id);
  }, []);

  const ownersById = useMemo(
    () => Object.fromEntries(owners.map((u) => [u.id, u])), [owners]);

  const typeMatches = useCallback((r) => !type || r.prospect_type === type, [type]);

  // Stat cards and the stage strip follow the type filter only, so the totals
  // stay honest while you narrow the list below them.
  const scoped = useMemo(() => (rows || []).filter(typeMatches), [rows, typeMatches]);

  const stats = useMemo(() => scoped.reduce((acc, r) => {
    acc.count += 1;
    acc.committed += Number(r.committed_amount_cents) || 0;
    acc.capacity += Number(r.capacity_estimate_cents) || 0;
    return acc;
  }, { count: 0, committed: 0, capacity: 0 }), [scoped]);

  const byStage = useMemo(() => {
    const m = {};
    for (const s of STAGES) m[s] = { count: 0, committed: 0 };
    for (const r of scoped) {
      const cell = m[r.stage] || (m[r.stage] = { count: 0, committed: 0 });
      cell.count += 1;
      cell.committed += Number(r.committed_amount_cents) || 0;
    }
    return m;
  }, [scoped]);

  const sources = useMemo(
    () => [...new Set((rows || []).map((r) => r.source).filter(Boolean))].sort(), [rows]);
  const counties = useMemo(
    () => [...new Set((rows || []).map((r) => r.county).filter(Boolean))].sort(), [rows]);

  const filtered = useMemo(() => {
    const list = scoped.filter((r) => {
      if (stageFilter.length && !stageFilter.includes(r.stage)) return false;
      if (ownerId === '__unassigned__' && r.owner_id) return false;
      if (ownerId && ownerId !== '__unassigned__' && r.owner_id !== ownerId) return false;
      if (source && r.source !== source) return false;
      if (county && r.county !== county) return false;
      if (priority && r.priority !== priority) return false;
      if (dnc === 'only' && !r.do_not_contact) return false;
      if (dnc === 'hide' && r.do_not_contact) return false;
      if (debouncedQ) {
        const hay = `${r.full_name || ''} ${r.email || ''}`.toLowerCase();
        if (!hay.includes(debouncedQ)) return false;
      }
      return true;
    });
    const num = (v) => Number(v) || 0;
    const byName = (a, b) => String(a.full_name || '').localeCompare(String(b.full_name || ''), undefined, { sensitivity: 'base' });
    if (sort === 'name_asc')  list.sort(byName);
    else if (sort === 'name_desc') list.sort((a, b) => byName(b, a));
    else if (sort === 'committed_desc') list.sort((a, b) => num(b.committed_amount_cents) - num(a.committed_amount_cents));
    else if (sort === 'capacity_asc') list.sort((a, b) => num(a.capacity_estimate_cents) - num(b.capacity_estimate_cents));
    else list.sort((a, b) => num(b.capacity_estimate_cents) - num(a.capacity_estimate_cents));
    return list;
  }, [scoped, stageFilter, ownerId, source, county, priority, dnc, debouncedQ, sort]);

  // Reset paging when the filters change, but not when a row is edited in
  // place, which would otherwise throw the reader back to the top of a long list.
  useEffect(() => { setVisible(PAGE_STEP); },
    [debouncedQ, type, stageFilter, ownerId, source, county, priority, dnc, sort]);

  const activeFilters =
    (ownerId ? 1 : 0) + (source ? 1 : 0) + (county ? 1 : 0) +
    (priority ? 1 : 0) + (dnc ? 1 : 0) + (stageFilter.length ? 1 : 0);

  function toggleStage(stage) {
    setStageFilter((cur) => cur.includes(stage) ? cur.filter((s) => s !== stage) : [...cur, stage]);
  }

  function resetFilters() {
    setStageFilter([]); setOwnerId(''); setSource(''); setCounty(''); setPriority(''); setDnc(''); setQ('');
  }

  function patchRow(id, patch) {
    setRows((list) => (list || []).map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  if (!authLoading && !can('pac_prospects', 'read')) {
    return (
      <div className="alert alert-error">
        The prospects module holds researched capacity on named people, so it is limited by role.
        Ask the Director if you need it.
      </div>
    );
  }

  const active = rows?.find((r) => r.id === activeId) || null;
  const today = todayISO();

  return (
    <>
      <div className="page-head">
        <h2>Prospects</h2>
        <p className="sub">The PAC major-donor pipeline: who we are working, where they stand, and what happens next.</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {warn && <div className="alert alert-warn">{warn}</div>}

      <div className="kpi-grid pr-kpi">
        <div className="kpi">
          <div className="num pr-num">{stats.count.toLocaleString()}</div>
          <div className="lbl">In pipeline</div>
        </div>
        <div className="kpi">
          <div className="num pr-num">{money(stats.committed)}</div>
          <div className="lbl">Committed</div>
        </div>
        <div className="kpi">
          <div className="num pr-num">{money(stats.capacity)}</div>
          <div className="lbl">Capacity</div>
        </div>
      </div>
      <p className="muted small" style={{ margin: '-4px 0 10px' }}>
        Capacity is demonstrated capacity from the public record, not pledged.
      </p>

      <div className="pr-strip" aria-label="Pipeline by stage">
        {STAGES.map((s) => {
          const cell = byStage[s] || { count: 0, committed: 0 };
          const on = stageFilter.includes(s);
          return (
            <button key={s} type="button" className="pr-stage" aria-pressed={on} onClick={() => toggleStage(s)}>
              <span className="pr-stage-top">
                <span className="pr-dot" style={{ background: STAGE_COLOR[s] }} />
                {STAGE_LABEL[s]}
              </span>
              <span className="pr-stage-count">{cell.count.toLocaleString()}</span>
              <span className="pr-stage-money">{cell.committed > 0 ? money(cell.committed) : ' '}</span>
            </button>
          );
        })}
      </div>

      <div className="sticky-tools">
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" placeholder="Search name or email" value={q} inputMode="search"
                 aria-label="Search prospects" onChange={(e) => setQ(e.target.value)} />
          <button className="btn" style={{ flex: '0 0 auto' }} aria-expanded={showFilters}
                  onClick={() => setShowFilters((v) => !v)}>
            Filters{activeFilters ? ` (${activeFilters})` : ''}
          </button>
        </div>
        <div className="chip-row">
          {TYPE_OPTIONS.map((t) => (
            <button key={t.value} className="chip" aria-pressed={type === t.value} onClick={() => setType(t.value)}>
              {t.label}
            </button>
          ))}
          <button className="chip" aria-pressed={type === ''} onClick={() => setType('')}>All types</button>
        </div>
      </div>

      {showFilters && (
        <div className="pr-filters">
          <label className="field">
            <span>Owner</span>
            <select className="select" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">All owners</option>
              <option value="__unassigned__">Unassigned</option>
              {owners.map((u) => <option key={u.id} value={u.id}>{ownerLabel(u)}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Source</span>
            <select className="select" value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">All sources</option>
              {sources.map((s) => <option key={s} value={s}>{titleize(s)}</option>)}
            </select>
          </label>
          <label className="field">
            <span>County</span>
            <select className="select" value={county} onChange={(e) => setCounty(e.target.value)}>
              <option value="">All counties</option>
              {counties.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Priority</span>
            <select className="select" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="">All priorities</option>
              {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Contact status</span>
            <select className="select" value={dnc} onChange={(e) => setDnc(e.target.value)}>
              <option value="">Any contact status</option>
              <option value="hide">Hide do not contact</option>
              <option value="only">Do not contact only</option>
            </select>
          </label>
          <div className="field" style={{ alignSelf: 'end' }}>
            <button className="btn" onClick={resetFilters}>Clear filters</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0 10px', flexWrap: 'wrap' }}>
        <span className="muted small pr-num">
          {filtered.length.toLocaleString()} {filtered.length === 1 ? 'prospect' : 'prospects'}
        </span>
        <span style={{ flex: 1 }} />
        <label className="muted small" htmlFor="prSort">Sort</label>
        <select id="prSort" className="select" style={{ width: 'auto', minHeight: 34 }}
                value={sort} onChange={(e) => setSort(e.target.value)}>
          {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>

      {rows == null ? <div className="card">Loading pipeline…</div> : (
        <div className="rowlist">
          {filtered.slice(0, visible).map((r) => {
            const overdue = r.next_action_date && r.next_action_date <= today;
            return (
              <button key={r.id} className="row card" onClick={() => setActiveId(r.id)}
                      style={{ cursor: 'pointer', textAlign: 'left', font: 'inherit', width: '100%' }}>
                <div>
                  <strong>{r.full_name || 'Unnamed'}</strong>
                  {r.do_not_contact && <span className="badge badge-bad" style={{ marginLeft: 8 }}>DNC</span>}
                  {r.priority === 'high' && <span className="badge badge-warn" style={{ marginLeft: 8 }}>High</span>}
                  <div className="muted small">
                    {[r.email, r.county && `${r.county} County`, r.employer].filter(Boolean).join(' · ') || 'No contact details on file'}
                  </div>
                </div>
                <div className="small">
                  <span className="pr-pill" style={{ background: STAGE_COLOR[r.stage] || '#64748B' }}>
                    {STAGE_LABEL[r.stage] || r.stage}
                  </span>
                  <div className="muted small" style={{ marginTop: 4 }}>
                    {r.owner_name || 'Unassigned'}
                  </div>
                </div>
                <div className="small pr-num">
                  {r.capacity_estimate_cents ? <strong>{money(r.capacity_estimate_cents)}</strong> : <span className="muted">No capacity</span>}
                  <div className="muted small">
                    {r.committed_amount_cents ? `${money(r.committed_amount_cents)} committed` : 'Nothing committed'}
                  </div>
                </div>
                <div className="small">
                  {r.next_action || r.next_action_date ? (
                    <>
                      <div>{r.next_action || 'Follow up'}</div>
                      {r.next_action_date && (
                        <span className={`badge ${overdue ? 'badge-warn' : 'badge-muted'}`}>
                          {overdue ? 'Due ' : ''}{fmtDay(r.next_action_date)}
                        </span>
                      )}
                    </>
                  ) : <span className="muted">No next action</span>}
                </div>
              </button>
            );
          })}
          {!filtered.length && !error && <div className="card muted">No prospects match these filters.</div>}
        </div>
      )}

      {filtered.length > visible && (
        <button className="btn" style={{ width: '100%', marginTop: 10 }}
                onClick={() => setVisible((v) => v + PAGE_STEP)}>
          Show more ({visible.toLocaleString()} of {filtered.length.toLocaleString()})
        </button>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <strong>How this data works.</strong>
        <p className="muted small" style={{ marginBottom: 0 }}>
          Prospects live in pac_prospects and this page reads the pac_pipeline view. Stage changes are
          logged automatically through pac_prospect_set_stage, so the note you add travels with the move.
          Capacity comes from public giving records and is what someone has demonstrated they can give,
          not a pledge. PAC figures stand on their own and are never combined with any other entity.
        </p>
      </div>

      {active && (
        <ProspectDrawer
          key={active.id}
          row={active}
          owners={owners}
          ownersById={ownersById}
          canWrite={canWrite}
          notify={notify}
          onStage={(id, stage) => patchRow(id, { stage })}
          onSaved={(id, patch) => patchRow(id, patch)}
          onClose={() => setActiveId(null)}
        />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
