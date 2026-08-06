'use client';
// Networking: who we know by region, who we want to reach, and the warm path
// between the two.
//
// The list reads public.network_contacts_directory (the contact row plus owner
// name, activity rollup, and inbound/outbound path counts). The region strip
// reads network_by_region, and the targets panel reads network_target_paths.
// Writes go to network_contacts, network_introductions, and network_activities.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAdmin } from '../../lib/permissions';
import NetworkDrawer, { CreateDrawer } from './drawer';
import {
  REGIONS, WARMTH, WARMTH_LABEL, WARMTH_COLOR, STATUSES, STATUS_LABEL,
  ownerLabel, relTime, todayISO, stars,
} from './lib';
import './networking.css';

const PAGE_SIZE = 50;
const PATHS_PREVIEW = 5;

const SORTS = [
  { key: 'name_asc',      label: 'Name A to Z' },
  { key: 'name_desc',     label: 'Name Z to A' },
  { key: 'activity_desc', label: 'Recent activity' },
  { key: 'activity_asc',  label: 'Quietest first' },
];

const ROLES = [
  { key: '',          label: 'Targets and connectors' },
  { key: 'target',    label: 'Targets only' },
  { key: 'connector', label: 'Connectors only' },
];

function buildQuery(sb, f, offset) {
  let q = sb.from('network_contacts_directory').select('*', { count: 'exact' });

  const term = f.q.replace(/[%,()]/g, ' ').trim();
  if (term) q = q.or(`full_name.ilike.%${term}%,organization.ilike.%${term}%,email.ilike.%${term}%`);

  // network_by_region buckets a blank region as "Unspecified", so that chip has
  // to match on a null region rather than on the literal word.
  if (f.region === 'Unspecified') q = q.is('region', null);
  else if (f.region) q = q.eq('region', f.region);

  if (f.warmth) q = q.eq('warmth', f.warmth);
  if (f.role === 'target') q = q.eq('is_target', true);
  else if (f.role === 'connector') q = q.eq('is_connector', true);

  if (f.ownerId === '__unassigned__') q = q.is('owner_id', null);
  else if (f.ownerId) q = q.eq('owner_id', f.ownerId);

  if (f.status) q = q.eq('status', f.status);
  else q = q.neq('status', 'archived');

  if (f.actionsDue) q = q.not('next_action_date', 'is', null).lte('next_action_date', todayISO());

  if (f.sort === 'activity_desc') q = q.order('last_activity_at', { ascending: false, nullsFirst: false });
  else if (f.sort === 'activity_asc') q = q.order('last_activity_at', { ascending: true, nullsFirst: false });
  else q = q.order('full_name', { ascending: f.sort !== 'name_desc' });

  return q.range(offset, offset + PAGE_SIZE - 1);
}

export default function NetworkingPage() {
  const { loading: authLoading, me, can } = useAdmin();
  const canWrite = can('networking', 'write');

  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [region, setRegion] = useState('');
  const [warmth, setWarmth] = useState('');
  const [role, setRole] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [status, setStatus] = useState('');
  const [actionsDue, setActionsDue] = useState(false);
  const [sort, setSort] = useState('name_asc');
  const [showFilters, setShowFilters] = useState(false);

  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [warn, setWarn] = useState(null);

  const [regionRows, setRegionRows] = useState(null);
  const [targetPaths, setTargetPaths] = useState(null);
  const [showAllPaths, setShowAllPaths] = useState(false);
  const [owners, setOwners] = useState([]);
  const [allContacts, setAllContacts] = useState([]);

  const [active, setActive] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const loadSeq = useRef(0);

  const notify = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const filters = useMemo(
    () => ({ q: debouncedQ, region, warmth, role, ownerId, status, actionsDue, sort }),
    [debouncedQ, region, warmth, role, ownerId, status, actionsDue, sort]);

  const load = useCallback(async (offset = 0) => {
    const seq = ++loadSeq.current;
    setLoading(true);
    const { data, count, error: err } = await buildQuery(supabase(), filters, offset);
    if (seq !== loadSeq.current) return; // a newer filter or search superseded this one
    if (err) {
      setError('Could not load contacts. ' + err.message);
      if (offset === 0) { setRows([]); setTotal(0); }
    } else {
      setError(null);
      setRows((prev) => (offset === 0 ? (data || []) : [...(prev || []), ...(data || [])]));
      setTotal(count || 0);
    }
    setLoading(false);
  }, [filters]);

  useEffect(() => { load(0); }, [load]);

  const loadRollup = useCallback(async () => {
    const { data, error: err } = await supabase().from('network_by_region').select('*');
    if (err) { setRegionRows([]); setWarn('Region totals are unavailable right now. ' + err.message); return; }
    setRegionRows(data || []);
  }, []);

  const loadTargetPaths = useCallback(async () => {
    const { data, error: err } = await supabase().from('network_target_paths')
      .select('*').order('best_strength', { ascending: false }).limit(25);
    if (err) { setTargetPaths([]); setWarn('Paths to targets could not load. ' + err.message); return; }
    setTargetPaths(data || []);
  }, []);

  const loadLookups = useCallback(async () => {
    const sb = supabase();
    const [admins, contacts] = await Promise.all([
      sb.from('admin_users').select('id, email, full_name, is_active')
        .eq('is_active', true).order('full_name', { ascending: true }),
      sb.from('network_contacts').select('id, full_name, organization')
        .order('full_name', { ascending: true }).limit(2000),
    ]);
    if (admins.error) setWarn('The owner list could not load. ' + admins.error.message);
    else setOwners(admins.data || []);
    if (contacts.error) setWarn('The contact picker could not load. ' + contacts.error.message);
    else setAllContacts(contacts.data || []);
  }, []);

  useEffect(() => {
    loadRollup();
    loadTargetPaths();
    loadLookups();
  }, [loadRollup, loadTargetPaths, loadLookups]);

  const refreshAll = useCallback(() => {
    loadRollup();
    loadTargetPaths();
    load(0);
  }, [loadRollup, loadTargetPaths, load]);

  const openById = useCallback(async (id) => {
    const known = (rows || []).find((r) => r.id === id);
    if (known) { setActive(known); return; }
    const { data, error: err } = await supabase()
      .from('network_contacts_directory').select('*').eq('id', id).maybeSingle();
    if (err || !data) { notify('Could not open that contact.'); return; }
    setActive(data);
  }, [rows, notify]);

  // Read the URL after mount only. Reading it during render makes the server
  // and client markup disagree and blanks the page.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const r = p.get('region');
    if (r && (REGIONS.includes(r) || r === 'Unspecified')) setRegion(r);
    const id = p.get('id');
    if (id) openById(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ownersById = useMemo(
    () => Object.fromEntries(owners.map((u) => [u.id, u])), [owners]);

  const activeFilters =
    (region ? 1 : 0) + (warmth ? 1 : 0) + (role ? 1 : 0) +
    (ownerId ? 1 : 0) + (status ? 1 : 0) + (actionsDue ? 1 : 0);

  function resetFilters() {
    setRegion(''); setWarmth(''); setRole(''); setOwnerId(''); setStatus(''); setActionsDue(false); setQ('');
  }

  if (!authLoading && !can('networking', 'read')) {
    return (
      <div className="alert alert-error">
        Networking holds relationship notes on named people, so it is limited by role.
        Ask the Director if you need it.
      </div>
    );
  }

  const shownPaths = targetPaths
    ? (showAllPaths ? targetPaths : targetPaths.slice(0, PATHS_PREVIEW))
    : [];

  return (
    <>
      <div className="page-head">
        <h2>Networking</h2>
        <p className="sub">Map who can connect us to whom, by region, and chart the path to every target.</p>
      </div>

      <div className="page-actions">
        <a className="btn" href="/admin/networking/capture">Capture card</a>
        {canWrite && <button className="btn btn-primary" onClick={() => setShowCreate(true)}>Add contact</button>}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {warn && <div className="alert alert-warn">{warn}</div>}

      <div className="nw-strip" aria-label="Contacts by region">
        {(regionRows || []).map((r) => {
          const on = region === r.region;
          const due = Number(r.actions_due) || 0;
          return (
            <button key={r.region} type="button" className="nw-region" aria-pressed={on}
                    onClick={() => setRegion(on ? '' : r.region)}>
              <span className="nw-region-label">{r.region}</span>
              <span className="nw-region-count">{(Number(r.contact_count) || 0).toLocaleString()}</span>
              <span className="nw-region-sub">
                {Number(r.target_count) || 0} tgt · {Number(r.connector_count) || 0} conn
                {due ? <> · <span className="nw-due">{due} due</span></> : null}
              </span>
            </button>
          );
        })}
        {regionRows == null && <span className="muted small" style={{ padding: '8px 2px' }}>Loading regions…</span>}
        {regionRows != null && !regionRows.length && (
          <span className="muted small" style={{ padding: '8px 2px' }}>No contacts yet.</span>
        )}
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, font: '800 1rem var(--op-font-head)', color: 'var(--op-navy)' }}>Paths to targets</h3>
          <span className="muted small">How do we get to the people we want to reach?</span>
        </div>

        {targetPaths == null ? (
          <div className="muted small" style={{ marginTop: 8 }}>Loading target paths…</div>
        ) : targetPaths.length === 0 ? (
          <p className="muted small" style={{ margin: '8px 0 0' }}>
            No introduction paths recorded yet. Mark a contact as a target, then add an introduction
            from a connector who can reach them.
          </p>
        ) : (
          <div style={{ marginTop: 8 }}>
            {shownPaths.map((p) => (
              <button key={p.target_id} type="button" className="card nw-path" onClick={() => openById(p.target_id)}>
                <span className="nw-path-top">
                  <strong>{p.target_name}</strong>
                  {(p.target_org || p.target_region) && (
                    <span className="muted small">{[p.target_org, p.target_region].filter(Boolean).join(' · ')}</span>
                  )}
                  <span style={{ flex: 1 }} />
                  {Number(p.best_strength) > 0 && (
                    <span className="nw-stars" title={`Best path ${p.best_strength} of 5`}>{stars(p.best_strength)}</span>
                  )}
                  <span className="muted small nw-num">
                    {Number(p.path_count) || 0} path{Number(p.path_count) === 1 ? '' : 's'}
                    {Number(p.paths_made) ? `, ${p.paths_made} made` : ''}
                  </span>
                </span>
                <span className="nw-path-connectors">{p.connector_paths || ''}</span>
              </button>
            ))}
            {targetPaths.length > PATHS_PREVIEW && (
              <button className="btn btn-sm" onClick={() => setShowAllPaths((v) => !v)}>
                {showAllPaths ? 'Show fewer paths' : `Show all ${targetPaths.length} targets`}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="sticky-tools">
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" placeholder="Search name, organization, or email" value={q} inputMode="search"
                 aria-label="Search networking contacts" onChange={(e) => setQ(e.target.value)} />
          <button className="btn" style={{ flex: '0 0 auto' }} aria-expanded={showFilters}
                  onClick={() => setShowFilters((v) => !v)}>
            Filters{activeFilters ? ` (${activeFilters})` : ''}
          </button>
        </div>
        <div className="chip-row">
          {ROLES.map((r) => (
            <button key={r.key || 'all'} className="chip" aria-pressed={role === r.key} onClick={() => setRole(r.key)}>
              {r.label}
            </button>
          ))}
          <button className="chip" aria-pressed={actionsDue} onClick={() => setActionsDue((v) => !v)}>
            Actions due
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="nw-filters">
          <label className="field">
            <span>Region</span>
            <select className="select" value={region} onChange={(e) => setRegion(e.target.value)}>
              <option value="">All regions</option>
              {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              <option value="Unspecified">Unspecified</option>
            </select>
          </label>
          <label className="field">
            <span>Warmth</span>
            <select className="select" value={warmth} onChange={(e) => setWarmth(e.target.value)}>
              <option value="">Any warmth</option>
              {WARMTH.map((w) => <option key={w} value={w}>{WARMTH_LABEL[w]}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Role</span>
            <select className="select" value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => <option key={r.key || 'all'} value={r.key}>{r.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Owner</span>
            <select className="select" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">All owners</option>
              <option value="__unassigned__">Unassigned</option>
              {owners.map((u) => <option key={u.id} value={u.id}>{ownerLabel(u)}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Status</span>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Any status except archived</option>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </label>
          <div className="field" style={{ alignSelf: 'end' }}>
            <button className="btn" onClick={resetFilters}>Clear filters</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0 10px', flexWrap: 'wrap' }}>
        <span className="muted small nw-num">
          {total.toLocaleString()} {total === 1 ? 'contact' : 'contacts'}
        </span>
        <span style={{ flex: 1 }} />
        <label className="muted small" htmlFor="nwSort">Sort</label>
        <select id="nwSort" className="select" style={{ width: 'auto', minHeight: 34 }}
                value={sort} onChange={(e) => setSort(e.target.value)}>
          {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>

      {rows == null ? <div className="card">Loading contacts…</div> : (
        <div className="rowlist">
          {rows.map((r) => {
            const sub = [
              r.title && r.organization ? `${r.title}, ${r.organization}` : (r.organization || r.title),
              r.email,
            ].filter(Boolean).join(' · ');
            const pathBits = [];
            if (Number(r.inbound_path_count)) pathBits.push(`${r.inbound_path_count} way in`);
            if (Number(r.outbound_intro_count)) pathBits.push(`${r.outbound_intro_count} intro${Number(r.outbound_intro_count) === 1 ? '' : 's'} out`);
            return (
              <button key={r.id} className="row card" onClick={() => setActive(r)}
                      style={{ cursor: 'pointer', textAlign: 'left', font: 'inherit', width: '100%' }}>
                <div>
                  <strong>{r.full_name || 'Unnamed'}</strong>
                  {r.do_not_contact && <span className="badge badge-bad" style={{ marginLeft: 8 }}>DNC</span>}
                  <div className="muted small">{sub || 'No organization on file'}</div>
                </div>
                <div className="small">
                  <div>{r.region || <span className="muted">No region</span>}</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
                    {r.is_target && <span className="badge badge-warn">Target</span>}
                    {r.is_connector && <span className="badge badge-ok">Connector</span>}
                    {!r.is_target && !r.is_connector && <span className="muted small">No role set</span>}
                  </div>
                </div>
                <div className="small">
                  {r.warmth ? (
                    <span className="nw-pill" style={{ background: WARMTH_COLOR[r.warmth] || '#64748B' }}>
                      {WARMTH_LABEL[r.warmth] || r.warmth}
                    </span>
                  ) : <span className="muted">No warmth set</span>}
                  <div className="muted small nw-num" style={{ marginTop: 4 }}>
                    {pathBits.length ? pathBits.join(' · ') : 'No paths'}
                  </div>
                </div>
                <div className="small">
                  <div>{r.owner_name || <span className="muted">Unassigned</span>}</div>
                  <div className="muted small">
                    {r.last_activity_at ? relTime(r.last_activity_at) : 'No activity'}
                  </div>
                </div>
              </button>
            );
          })}
          {!rows.length && !loading && !error && <div className="card muted">No contacts match these filters.</div>}
        </div>
      )}

      {rows && rows.length < total && (
        <button className="btn" style={{ width: '100%', marginTop: 10 }} disabled={loading}
                onClick={() => load(rows.length)}>
          {loading ? 'Loading…' : `Load more (${rows.length.toLocaleString()} of ${total.toLocaleString()})`}
        </button>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <strong>How this data works.</strong>
        <p className="muted small" style={{ marginBottom: 0 }}>
          Contacts are tagged by region and flagged as targets, the people we want to reach, and
          connectors, the people who open doors. Each introduction you record is one edge in the path
          graph that feeds Paths to targets, so the more honestly you log them the better the map gets.
          Snap business cards from your phone at Capture card and promote them here later.
        </p>
      </div>

      {active && (
        <NetworkDrawer
          key={active.id}
          row={active}
          owners={owners}
          ownersById={ownersById}
          allContacts={allContacts}
          canWrite={canWrite}
          actorEmail={me?.email || ''}
          notify={notify}
          onClose={(changed) => { setActive(null); if (changed) refreshAll(); }}
        />
      )}

      {showCreate && (
        <CreateDrawer
          owners={owners}
          notify={notify}
          onClose={(created) => {
            setShowCreate(false);
            if (!created) return;
            setAllContacts((list) => [...list, {
              id: created.id, full_name: created.full_name, organization: created.organization,
            }].sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || ''))));
            refreshAll();
          }}
        />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
