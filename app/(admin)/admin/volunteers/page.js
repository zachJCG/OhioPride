'use client';
// Volunteers: every signup from /volunteer and /pride/signup, triaged on a
// phone. Ported from the static console.
//
// Data model is unchanged from that page: the same explicit column list off
// public.volunteers newest first, the active admin_users for the assignee
// picker, and writes that update volunteers by id. contact_id is read too so a
// volunteer can be opened in the contacts module when the sync trigger has
// linked one.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAdmin } from '../../lib/permissions';
import VolunteerDrawer, {
  INTEREST_LABEL, INTEREST_SHORT, TIME_LABEL, STATUS_OPTIONS, STATUS_LABEL,
  SOURCE_KNOWN, sourceLabel, personName, adminLabel,
} from './drawer';
import './volunteers.css';

const COLUMNS =
  'id, created_at, first_name, last_name, email, phone, pronouns, ' +
  'city, county, zip, registered_voter, interests, skills, availability, ' +
  'time_commitment, tshirt_size, prior_campaign_experience, prior_campaign_notes, ' +
  'is_founding_member, referral_source, additional_notes, ' +
  'email_optin, sms_optin, status, assigned_to, admin_notes, contact_id';

const SORTS = [
  { key: 'recent', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'name',   label: 'Name A to Z' },
  { key: 'county', label: 'County' },
  { key: 'status', label: 'Status' },
];

const PAGE_STEP = 100;

// PostgREST caps a single response (1000 rows on Supabase), so read in blocks.
// id is a tiebreaker on created_at so paging cannot repeat or skip a row.
async function fetchVolunteers(sb) {
  const all = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await sb.from('volunteers').select(COLUMNS)
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

export default function VolunteersPage() {
  const { loading: authLoading, can } = useAdmin();
  const canWrite = can('volunteers', 'write');

  const [rows, setRows] = useState(null);
  const [admins, setAdmins] = useState([]);
  const [error, setError] = useState(null);
  const [warn, setWarn] = useState(null);

  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [county, setCounty] = useState('');
  const [interest, setInterest] = useState('');
  const [assignee, setAssignee] = useState('');
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
    const sb = supabase();
    setError(null);
    setWarn(null);
    const [vols, people] = await Promise.all([
      fetchVolunteers(sb),
      sb.from('admin_users').select('id, email, full_name, is_active')
        .eq('is_active', true).order('full_name', { ascending: true }),
    ]);
    if (vols.error) {
      setRows([]);
      setError('Could not load volunteers. ' + vols.error.message);
      return;
    }
    // A failed admin_users read only costs the assignee picker its names.
    if (people.error) setWarn('The assignee list is unavailable right now. ' + people.error.message);
    setRows(vols.data || []);
    setAdmins(people.data || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Read ?id= after mount only. Reading the URL during render makes the server
  // and client markup disagree and blanks the page. The dashboard activity feed
  // links here as /admin/volunteers?id=<id>.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id');
    if (id) setActiveId(id);
  }, []);

  useEffect(() => {
    if (!activeId || rows == null) return;
    if (!rows.some((r) => r.id === activeId)) {
      setActiveId(null);
      notify('That volunteer is not in this list.');
    }
  }, [activeId, rows, notify]);

  const adminsById = useMemo(() => Object.fromEntries(admins.map((u) => [u.id, u])), [admins]);

  const list = rows || [];

  const stats = useMemo(() => {
    const s = { total: list.length, new: 0, contacted: 0, assigned: 0, pride: 0 };
    const counties = new Set();
    for (const r of list) {
      if (r.status && s[r.status] != null) s[r.status] += 1;
      if (r.county) counties.add(r.county);
      if (r.referral_source === 'pride_signup') s.pride += 1;
    }
    return { ...s, counties: counties.size };
  }, [list]);

  const countyOptions = useMemo(() => {
    const counts = {};
    for (const r of list) if (r.county) counts[r.county] = (counts[r.county] || 0) + 1;
    return Object.keys(counts).sort().map((c) => ({ value: c, label: `${c} (${counts[c]})` }));
  }, [list]);

  // Known sources first with friendly labels, then whatever else is in the data.
  const sourceOptions = useMemo(() => {
    const counts = {};
    for (const r of list) {
      const key = r.referral_source ? String(r.referral_source) : '__none__';
      counts[key] = (counts[key] || 0) + 1;
    }
    const out = [];
    for (const s of SOURCE_KNOWN) {
      if (counts[s.value]) { out.push({ value: s.value, label: `${s.label} (${counts[s.value]})` }); delete counts[s.value]; }
    }
    if (counts.__none__) { out.push({ value: '__none__', label: `No source (${counts.__none__})` }); delete counts.__none__; }
    for (const k of Object.keys(counts).sort()) out.push({ value: k, label: `${k} (${counts[k]})` });
    return out;
  }, [list]);

  const assigneeOptions = useMemo(() => {
    const counts = {};
    let unassigned = 0;
    for (const r of list) {
      if (r.assigned_to) counts[r.assigned_to] = (counts[r.assigned_to] || 0) + 1;
      else unassigned += 1;
    }
    return [
      { value: '__unassigned__', label: `Unassigned (${unassigned})` },
      ...admins.map((u) => ({ value: u.id, label: `${adminLabel(u)} (${counts[u.id] || 0})` })),
    ];
  }, [list, admins]);

  const filtered = useMemo(() => {
    const out = list.filter((r) => {
      if (status && r.status !== status) return false;
      if (source === '__none__' && r.referral_source) return false;
      if (source && source !== '__none__' && r.referral_source !== source) return false;
      if (county && r.county !== county) return false;
      if (interest && !(r.interests || []).includes(interest)) return false;
      if (assignee === '__unassigned__' && r.assigned_to) return false;
      if (assignee && assignee !== '__unassigned__' && r.assigned_to !== assignee) return false;
      if (debouncedQ) {
        const hay = `${r.first_name || ''} ${r.last_name || ''} ${r.email || ''} ${r.city || ''} ${r.county || ''}`.toLowerCase();
        if (!hay.includes(debouncedQ)) return false;
      }
      return true;
    });
    const time = (r) => new Date(r.created_at || 0).getTime();
    if (sort === 'oldest') out.sort((a, b) => time(a) - time(b));
    else if (sort === 'name') out.sort((a, b) => cmp(a.last_name, b.last_name) || cmp(a.first_name, b.first_name));
    else if (sort === 'county') out.sort((a, b) => cmp(a.county, b.county) || cmp(a.last_name, b.last_name));
    else if (sort === 'status') out.sort((a, b) => cmp(a.status, b.status) || time(b) - time(a));
    else out.sort((a, b) => time(b) - time(a));
    return out;
  }, [list, status, source, county, interest, assignee, debouncedQ, sort]);

  useEffect(() => { setVisible(PAGE_STEP); }, [filtered]);

  const activeFilters =
    (source ? 1 : 0) + (county ? 1 : 0) + (interest ? 1 : 0) + (assignee ? 1 : 0);

  function resetFilters() {
    setSource(''); setCounty(''); setInterest(''); setAssignee(''); setStatus(''); setQ('');
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
      .from('volunteers').update({ status: next }).eq('id', row.id).select().single();
    setBusy((b) => { const n = { ...b }; delete n[row.id]; return n; });
    if (err) {
      patchRow(row.id, { status: prev });
      notify('Could not update status. ' + err.message);
      return;
    }
    if (data) patchRow(row.id, data);
    notify(`Status set to ${STATUS_LABEL[next] || next}.`);
  }

  async function changeAssignee(row, nextRaw) {
    if (!canWrite) { notify('Your role does not include write access.'); return; }
    const next = nextRaw || null;
    const prev = row.assigned_to || null;
    if (next === prev) return;
    patchRow(row.id, { assigned_to: next });
    setBusy((b) => ({ ...b, [row.id]: true }));
    const { data, error: err } = await supabase()
      .from('volunteers').update({ assigned_to: next }).eq('id', row.id).select().single();
    setBusy((b) => { const n = { ...b }; delete n[row.id]; return n; });
    if (err) {
      patchRow(row.id, { assigned_to: prev });
      notify('Could not update the assignee. ' + err.message);
      return;
    }
    if (data) patchRow(row.id, data);
    notify(next && adminsById[next] ? `Assigned to ${adminLabel(adminsById[next])}.` : 'Set to unassigned.');
  }

  function exportCsv() {
    if (!filtered.length) { notify('Nothing to export with the current filters.'); return; }
    const cols = [
      'created_at', 'first_name', 'last_name', 'email', 'phone', 'pronouns',
      'city', 'county', 'zip', 'registered_voter',
      'interests', 'skills', 'availability', 'time_commitment', 'tshirt_size',
      'prior_campaign_experience', 'is_founding_member', 'referral_source',
      'email_optin', 'sms_optin', 'status', 'assigned_to', 'assigned_to_name',
      'admin_notes', 'additional_notes',
    ];
    const esc = (v) => {
      let s = Array.isArray(v) ? v.join('; ') : typeof v === 'boolean' ? (v ? 'true' : 'false') : v == null ? '' : String(v);
      s = s.replace(/"/g, '""');
      return /[,"\n]/.test(s) ? `"${s}"` : s;
    };
    const lines = [cols.join(',')];
    for (const r of filtered) {
      const rec = { ...r, assigned_to_name: adminLabel(adminsById[r.assigned_to]) };
      lines.push(cols.map((c) => esc(rec[c])).join(','));
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    a.download = `ohio-pride-volunteers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    notify(`Exported ${filtered.length} volunteer${filtered.length === 1 ? '' : 's'}.`);
  }

  if (!authLoading && !can('volunteers', 'read')) {
    return (
      <div className="alert alert-error">
        The volunteers module holds contact details for people who signed up, so it is limited by role.
        Ask the Director if you need it.
      </div>
    );
  }

  const active = rows?.find((r) => r.id === activeId) || null;

  return (
    <>
      <div className="page-head">
        <h2>Volunteers</h2>
        <p className="sub">Triage signups, assign captains, and track county coverage.</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {warn && <div className="alert alert-warn">{warn}</div>}

      <div className="kpi-grid vol-kpis">
        <div className="kpi"><div className="num">{stats.total.toLocaleString()}</div><div className="lbl">Total</div></div>
        <div className="kpi"><div className="num">{stats.new.toLocaleString()}</div><div className="lbl">New</div></div>
        <div className="kpi"><div className="num">{stats.contacted.toLocaleString()}</div><div className="lbl">Contacted</div></div>
        <div className="kpi"><div className="num">{stats.assigned.toLocaleString()}</div><div className="lbl">Assigned</div></div>
        <div className="kpi"><div className="num">{stats.pride.toLocaleString()}</div><div className="lbl">Pride signups</div></div>
        <div className="kpi"><div className="num">{stats.counties.toLocaleString()}</div><div className="lbl">Counties</div></div>
      </div>

      <div className="sticky-tools">
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" placeholder="Search name, email, city" value={q} inputMode="search"
                 aria-label="Search volunteers" onChange={(e) => setQ(e.target.value)} />
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
        <div className="vol-filters">
          <label className="field">
            <span>Source</span>
            <select className="select" value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">All sources</option>
              {sourceOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>County</span>
            <select className="select" value={county} onChange={(e) => setCounty(e.target.value)}>
              <option value="">All counties</option>
              {countyOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Interest</span>
            <select className="select" value={interest} onChange={(e) => setInterest(e.target.value)}>
              <option value="">All interests</option>
              {Object.keys(INTEREST_LABEL).map((k) => <option key={k} value={k}>{INTEREST_LABEL[k]}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Assignee</span>
            <select className="select" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">All assignees</option>
              {assigneeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
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
        <label className="muted small" htmlFor="volSort">Sort</label>
        <select id="volSort" className="select" style={{ width: 'auto', minHeight: 34 }}
                value={sort} onChange={(e) => setSort(e.target.value)}>
          {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <button className="btn btn-sm" onClick={exportCsv}>Export CSV</button>
        <a className="btn btn-sm" href="/volunteer" target="_blank" rel="noopener">Public form</a>
      </div>

      {rows == null ? <div className="card">Loading volunteers…</div> : (
        <div className="rowlist vol-rows">
          {filtered.slice(0, visible).map((r) => {
            const name = personName(r) || 'Unnamed';
            const assignedMissing = r.assigned_to && !adminsById[r.assigned_to];
            return (
              <div key={r.id} className="row card">
                <div>
                  <button className="vol-name" onClick={() => setActiveId(r.id)}>
                    <strong>{name}</strong>
                    {r.referral_source === 'pride_signup'
                      ? <span className="badge badge-pride" style={{ marginLeft: 8 }}>Pride</span>
                      : r.referral_source
                        ? <span className="badge badge-muted" style={{ marginLeft: 8 }}>{sourceLabel(r.referral_source)}</span>
                        : null}
                    {r.pronouns && <span className="muted small" style={{ marginLeft: 8 }}>{r.pronouns}</span>}
                    <span className="muted small" style={{ display: 'block', overflowWrap: 'anywhere' }}>
                      {[r.email, r.phone].filter(Boolean).join(' · ') || 'No contact details on file'}
                    </span>
                  </button>
                </div>

                <div className="small">
                  <span className="vol-cell-label">Location</span>
                  {[r.city, r.county && `${r.county} Co.`].filter(Boolean).join(', ') || <span className="muted">Not given</span>}
                  {r.zip && <span className="muted small" style={{ display: 'block' }}>ZIP {r.zip}</span>}
                </div>

                <div className="small">
                  <span className="vol-cell-label">Interests</span>
                  <div className="vol-pills">
                    {(r.interests || []).length
                      ? (r.interests || []).map((k) => (
                          <span key={k} className="badge badge-muted">{INTEREST_SHORT[k] || k}</span>
                        ))
                      : <span className="muted">None picked</span>}
                  </div>
                  <span className="muted small" style={{ display: 'block', marginTop: 2 }}>
                    {[TIME_LABEL[r.time_commitment] || r.time_commitment,
                      r.registered_voter && `voter: ${r.registered_voter}`].filter(Boolean).join(' · ')}
                  </span>
                </div>

                <div className="muted small" style={{ whiteSpace: 'nowrap' }}>
                  <span className="vol-cell-label">Submitted</span>
                  {fmtWhen(r.created_at)}
                </div>

                <div>
                  <span className="vol-cell-label">Status</span>
                  <select className="select vol-inline vol-status" data-status={r.status || 'new'}
                          aria-label={`Status for ${name}`} value={r.status || 'new'}
                          disabled={!canWrite || !!busy[r.id]}
                          onChange={(e) => changeStatus(r, e.target.value)}>
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                </div>

                <div>
                  <span className="vol-cell-label">Assigned to</span>
                  {!canWrite && !r.assigned_to ? (
                    <span className="muted small">Unassigned</span>
                  ) : (
                    <select className="select vol-inline" aria-label={`Assignee for ${name}`}
                            value={r.assigned_to || ''} disabled={!canWrite || !!busy[r.id]}
                            onChange={(e) => changeAssignee(r, e.target.value)}>
                      <option value="">Unassigned</option>
                      {admins.map((u) => <option key={u.id} value={u.id}>{adminLabel(u)}</option>)}
                      {assignedMissing && <option value={r.assigned_to}>Former admin</option>}
                    </select>
                  )}
                </div>
              </div>
            );
          })}

          {!filtered.length && !error && (
            <div className="card muted">
              {list.length
                ? 'No volunteers match these filters.'
                : 'No volunteer signups yet. Submissions from the volunteer form and Pride signups land here.'}
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
        <VolunteerDrawer
          key={active.id}
          row={active}
          admins={admins}
          adminsById={adminsById}
          canWrite={canWrite}
          notify={notify}
          onSaved={(id, updated) => patchRow(id, updated)}
          onClose={() => setActiveId(null)}
        />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
