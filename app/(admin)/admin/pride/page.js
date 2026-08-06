'use client';
// Pride road tour: every 2026 stop, the volunteers who staff them, and the
// Director's own schedule, in one module with three tabs.
//
// Ported from the static console at /admin/pride/{events,volunteers,ED}. The
// week grid did not survive the move on purpose: a calendar that needs a
// pointer is useless at a festival. The same data is a date-ordered list you
// can work with one thumb, and the Director tab is that list filtered to the
// stops flagged ed_attending, which is exactly what the old ED page was.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAdmin } from '../../lib/permissions';
import {
  REGIONS, AttendanceDots, AttendanceLegend,
  eventTypeLabel, fmtEventDate, fmtRel, fmtTimeET, parseDateOnly,
  prettyRole, regionLabel, titleCase, volunteerName,
} from './lib';
import { EventDrawer, VolunteerDrawer } from './drawers';

const TABS = [
  { key: 'events', label: 'Events' },
  { key: 'volunteers', label: 'Volunteers' },
  { key: 'ed', label: 'Director' },
];

const EVENT_SCOPES = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'all', label: 'All stops' },
  { key: 'pac', label: 'PAC attending' },
  { key: 'priority', label: 'Priority' },
  { key: 'tentative', label: 'Tentative time' },
];

const CSV_COLS = ['first_name', 'last_name', 'email', 'phone', 'city', 'zip',
  'preferred_region', 'roles_interested', 'can_travel', 'has_vehicle',
  'confirmed_events', 'tentative_events', 'created_at'];

const startOfToday = () => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
};

function blankEvent(edAttending) {
  return {
    name: '', city: '', region: 'Central', event_date: '', event_type: 'festival',
    venue: '', pac_attending: false, pac_role: 'none', pac_priority: false,
    registration_status: 'tbd', description: '',
    start_time_utc: null, end_time_utc: null, time_confirmed: false,
    board_attending: false, staff_attending: false, ed_attending: edAttending,
  };
}

function EventRow({ ev, roster, canWrite, onOpen, onConfirmTime }) {
  const r = roster || {};
  const pipeline = (r.confirmed_count || 0) + (r.tentative_count || 0);
  const flags = {
    volunteers: pipeline > 0,
    board: !!ev.board_attending,
    staff: !!ev.staff_attending,
    ed: !!ev.ed_attending,
  };
  const time = ev.start_time_utc
    ? fmtTimeET(ev.start_time_utc) + (ev.end_time_utc ? ` to ${fmtTimeET(ev.end_time_utc)}` : '')
    : 'All day';

  return (
    <div className="row card" role="button" tabIndex={0} style={{ cursor: 'pointer' }}
         onClick={onOpen}
         onKeyDown={(e) => {
           if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); }
         }}>
      <div>
        <strong>{ev.name}</strong>
        {ev.pac_priority && <span className="badge badge-founding" style={{ marginLeft: 6 }}>Priority</span>}
        <AttendanceDots flags={flags} />
        <div className="muted small">
          {[ev.city, regionLabel(ev.region), eventTypeLabel(ev.event_type)].filter(Boolean).join(' · ')}
        </div>
      </div>

      <div className="small">
        <strong>{fmtEventDate(ev.event_date)}</strong>
        <div className="muted small">
          {time}
          {!ev.time_confirmed && <span className="badge badge-review" style={{ marginLeft: 6 }}>Time tentative</span>}
        </div>
      </div>

      <div className="small">
        {pipeline ? (
          <>
            <strong>{r.confirmed_count || 0} confirmed</strong>
            {r.tentative_count ? <span className="muted"> · {r.tentative_count} tentative</span> : null}
          </>
        ) : <span className="muted">No volunteers yet</span>}
        <div className="muted small">
          {ev.pac_attending ? `PAC ${prettyRole(ev.pac_role)}` : 'PAC not attending'}
          {ev.registration_status ? ` · reg ${titleCase(ev.registration_status)}` : ''}
        </div>
      </div>

      <div onClick={(e) => e.stopPropagation()}>
        {canWrite && !ev.time_confirmed
          ? <button className="btn btn-sm" onClick={onConfirmTime}>Confirm time</button>
          : <span className={`badge ${ev.pac_attending ? 'badge-ok' : 'badge-muted'}`}>
              {ev.pac_attending ? 'Attending' : 'Not on'}
            </span>}
      </div>
    </div>
  );
}

export default function PridePage() {
  const { loading: authLoading, me, can } = useAdmin();
  const canWrite = can('pride', 'write') || can('pride', 'admin');

  const [tab, setTab] = useState('events');
  const [events, setEvents] = useState(null);
  const [roster, setRoster] = useState({});
  const [volunteers, setVolunteers] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [err, setErr] = useState(null);

  const [scope, setScope] = useState('upcoming');
  const [eventQ, setEventQ] = useState('');
  const [eventRegion, setEventRegion] = useState('');
  const [volQ, setVolQ] = useState('');
  const [volRegion, setVolRegion] = useState('');

  const [activeEvent, setActiveEvent] = useState(null);       // event id, or 'new'
  const [activeVol, setActiveVol] = useState(null);           // volunteer id, or 'new'
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const notify = useCallback((m) => {
    setToast(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const loadEvents = useCallback(async () => {
    const sb = supabase();
    const [e, r] = await Promise.all([
      sb.from('pride_events').select('*').order('event_date', { ascending: true }),
      sb.from('pride_event_roster_v').select('*'),
    ]);
    if (e.error || r.error) {
      setErr('Could not load the tour stops. ' + (e.error || r.error).message +
        ' Your role may not include this module, or RLS blocked the query.');
      return;
    }
    setEvents(e.data || []);
    setRoster(Object.fromEntries((r.data || []).map(x => [x.event_id, x])));
  }, []);

  const loadPeople = useCallback(async () => {
    const sb = supabase();
    const [v, a] = await Promise.all([
      sb.from('pride_volunteers').select('*').order('created_at', { ascending: false }),
      sb.from('pride_event_volunteers_v').select('*'),
    ]);
    if (v.error || a.error) {
      setErr('Could not load the volunteer roster. ' + (v.error || a.error).message +
        ' Your role may not include this module, or RLS blocked the query.');
      return;
    }
    setVolunteers(v.data || []);
    setAssignments(a.data || []);
  }, []);

  const loadAll = useCallback(async () => {
    setErr(null);
    await Promise.all([loadEvents(), loadPeople()]);
  }, [loadEvents, loadPeople]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Deep link (?tab=) is read after mount, never during render: seeding state
  // from the URL makes the server and client markup disagree.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t && TABS.some(x => x.key === t)) setTab(t);
  }, []);

  function pickTab(key) {
    setTab(key);
    window.history.replaceState({}, '', key === 'events' ? '/admin/pride' : `/admin/pride?tab=${key}`);
  }

  const byVol = useMemo(() => {
    const m = {};
    for (const a of assignments) (m[a.volunteer_id] ||= []).push(a);
    return m;
  }, [assignments]);

  const statusCounts = useCallback((vid) => {
    const c = { confirmed: 0, tentative: 0, declined: 0, removed: 0 };
    for (const a of byVol[vid] || []) if (c[a.status] != null) c[a.status]++;
    return c;
  }, [byVol]);

  // The Director tab is the same list scoped to the stops flagged ed_attending,
  // KPIs included.
  const tabEvents = useMemo(() => {
    const list = events || [];
    return tab === 'ed' ? list.filter(e => e.ed_attending) : list;
  }, [events, tab]);

  const eventKpis = useMemo(() => {
    const today = startOfToday();
    const week = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);
    let pac = 0, soon = 0, confirmed = 0;
    for (const e of tabEvents) {
      if (e.pac_attending) pac++;
      const d = parseDateOnly(e.event_date);
      if (d && d >= today && d < week) soon++;
      confirmed += (roster[e.id] || {}).confirmed_count || 0;
    }
    return { stops: tabEvents.length, pac, soon, confirmed };
  }, [tabEvents, roster]);

  const filteredEvents = useMemo(() => {
    const today = startOfToday();
    const q = eventQ.trim().toLowerCase();
    return tabEvents.filter(e => {
      if (eventRegion && e.region !== eventRegion) return false;
      if (scope === 'upcoming') {
        const d = parseDateOnly(e.event_date);
        if (!d || d < today) return false;
      }
      if (scope === 'pac' && !e.pac_attending) return false;
      if (scope === 'priority' && !e.pac_priority) return false;
      if (scope === 'tentative' && e.time_confirmed) return false;
      if (q) {
        const hay = [e.name, e.city, e.venue, e.event_type, regionLabel(e.region)]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tabEvents, eventRegion, scope, eventQ]);

  const volKpis = useMemo(() => {
    let confirmed = 0, tentative = 0;
    const covered = new Set();
    for (const a of assignments) {
      if (a.status === 'confirmed') { confirmed++; covered.add(a.event_id); }
      else if (a.status === 'tentative') tentative++;
    }
    return { total: (volunteers || []).length, confirmed, tentative, covered: covered.size };
  }, [assignments, volunteers]);

  const filteredVols = useMemo(() => {
    const q = volQ.trim().toLowerCase();
    return (volunteers || []).filter(v => {
      if (volRegion && v.preferred_region !== volRegion) return false;
      if (q) {
        const hay = [v.first_name, v.last_name, v.email, v.city, ...(v.roles_interested || [])]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [volunteers, volRegion, volQ]);

  async function confirmTime(ev) {
    const { error } = await supabase().from('pride_events')
      .update({ time_confirmed: true }).eq('id', ev.id);
    if (error) { notify('Could not confirm that time. ' + error.message); return; }
    await loadEvents();
    notify(`${ev.name} is on the schedule.`);
  }

  function exportCsv() {
    if (!filteredVols.length) { notify('Nothing to export with these filters.'); return; }
    const esc = (val) => {
      let s = typeof val === 'boolean' ? (val ? 'true' : 'false') : val == null ? '' : String(val);
      s = s.replace(/"/g, '""');
      return /[,"\n]/.test(s) ? `"${s}"` : s;
    };
    const lines = [CSV_COLS.join(',')];
    for (const v of filteredVols) {
      const c = statusCounts(v.id);
      const rec = {
        first_name: v.first_name, last_name: v.last_name, email: v.email,
        phone: v.phone, city: v.city, zip: v.zip,
        preferred_region: v.preferred_region,
        roles_interested: (v.roles_interested || []).join('; '),
        can_travel: v.can_travel, has_vehicle: v.has_vehicle,
        confirmed_events: c.confirmed, tentative_events: c.tentative,
        created_at: v.created_at,
      };
      lines.push(CSV_COLS.map(k => esc(rec[k])).join(','));
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    a.download = `ohiopride-road-tour-volunteers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    notify(`Exported ${filteredVols.length} volunteers.`);
  }

  if (!authLoading && !can('pride', 'read')) {
    return <div className="alert alert-error">The Pride road tour module is limited by role. Ask the Director if you need it.</div>;
  }

  const openEvent = activeEvent === 'new'
    ? blankEvent(tab === 'ed')
    : (events || []).find(e => e.id === activeEvent) || null;
  const openVol = activeVol === 'new'
    ? null
    : (volunteers || []).find(v => v.id === activeVol) || null;

  const sub = tab === 'volunteers'
    ? 'Everyone who signed up to march, table, drive, or shoot photos, and the stops they are on.'
    : tab === 'ed'
      ? 'The tour list scoped to the stops the Director is attending.'
      : 'Every 2026 Pride stop in date order. Confirm a time, set who is going, and staff the roster.';

  return (
    <>
      <div className="page-head">
        <h2>Pride Road Tour</h2>
        <p className="sub">{sub}</p>
      </div>

      <div className="chip-row" role="tablist" aria-label="Road tour views">
        {TABS.map(t => (
          <button key={t.key} className="chip" role="tab" aria-selected={tab === t.key}
                  aria-pressed={tab === t.key} onClick={() => pickTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="page-actions">
        <a className="btn btn-sm" href="/pride/signup" target="_blank" rel="noopener noreferrer">View signup form</a>
        {tab === 'volunteers'
          ? <>
              <button className="btn btn-sm" onClick={exportCsv}>Export CSV</button>
              {canWrite && <button className="btn btn-sm btn-primary" onClick={() => setActiveVol('new')}>Add volunteer</button>}
            </>
          : canWrite && <button className="btn btn-sm btn-primary" onClick={() => setActiveEvent('new')}>Add stop</button>}
      </div>

      {err && <div className="alert alert-error">{err}</div>}

      {tab === 'volunteers' ? (
        <>
          <div className="kpi-grid">
            <div className="kpi"><div className="num">{volKpis.total}</div><div className="lbl">Volunteers</div></div>
            <div className="kpi"><div className="num">{volKpis.confirmed}</div><div className="lbl">Confirmed</div></div>
            <div className="kpi"><div className="num">{volKpis.tentative}</div><div className="lbl">Tentative</div></div>
            <div className="kpi"><div className="num">{volKpis.covered}</div><div className="lbl">Stops covered</div></div>
          </div>

          <div className="sticky-tools">
            <input className="input" placeholder="Search name, email, city, role…" value={volQ}
                   onChange={e => setVolQ(e.target.value)} inputMode="search" aria-label="Search volunteers" />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 10px', flexWrap: 'wrap' }}>
            <span className="muted small">
              {filteredVols.length === (volunteers || []).length
                ? `${filteredVols.length} total`
                : `${filteredVols.length} of ${(volunteers || []).length}`}
            </span>
            <span style={{ flex: 1 }} />
            <label className="muted small" htmlFor="volRegion">Region</label>
            <select id="volRegion" className="select" style={{ width: 'auto', minHeight: 34 }}
                    value={volRegion} onChange={e => setVolRegion(e.target.value)}>
              <option value="">All regions</option>
              {REGIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              <option value="Anywhere">Anywhere</option>
            </select>
          </div>

          {volunteers == null ? <div className="card">Loading volunteers…</div> : (
            <div className="rowlist">
              {filteredVols.map(v => {
                const c = statusCounts(v.id);
                return (
                  <button key={v.id} className="row card" onClick={() => setActiveVol(v.id)}
                          style={{ cursor: 'pointer', textAlign: 'left', font: 'inherit', width: '100%' }}>
                    <div>
                      <strong>{volunteerName(v) || v.email}</strong>
                      {v.is_vetted && <span className="badge badge-ok" style={{ marginLeft: 6 }}>Vetted</span>}
                      <div className="muted small" style={{ overflowWrap: 'anywhere' }}>{v.email}</div>
                    </div>
                    <div className="small">
                      {[v.city, regionLabel(v.preferred_region)].filter(Boolean).join(' · ') || <span className="muted">No location</span>}
                      {v.phone && <div className="muted small">{v.phone}</div>}
                    </div>
                    <div className="small">
                      {(v.roles_interested || []).length
                        ? (v.roles_interested || []).slice(0, 3).map(titleCase).join(', ')
                        : <span className="muted">No roles picked</span>}
                    </div>
                    <div className="small">
                      {c.confirmed ? <span className="badge badge-ok">{c.confirmed} confirmed</span> : null}
                      {c.tentative ? <span className="badge badge-review" style={{ marginLeft: 4 }}>{c.tentative} tentative</span> : null}
                      {!c.confirmed && !c.tentative ? <span className="muted">Not on a stop</span> : null}
                      <div className="muted small">{fmtRel(v.created_at)}</div>
                    </div>
                  </button>
                );
              })}
              {!filteredVols.length && (
                <div className="card muted">
                  {(volunteers || []).length
                    ? 'No volunteers match these filters.'
                    : 'No road tour signups yet. Anything submitted on the signup form lands here.'}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi"><div className="num">{eventKpis.stops}</div><div className="lbl">{tab === 'ed' ? 'Director stops' : 'Stops'}</div></div>
            <div className="kpi"><div className="num">{eventKpis.pac}</div><div className="lbl">PAC attending</div></div>
            <div className="kpi"><div className="num">{eventKpis.soon}</div><div className="lbl">Next 7 days</div></div>
            <div className="kpi"><div className="num">{eventKpis.confirmed}</div><div className="lbl">Confirmed vols</div></div>
          </div>

          <AttendanceLegend />

          <div className="sticky-tools">
            <input className="input" placeholder="Search stop, city, venue…" value={eventQ}
                   onChange={e => setEventQ(e.target.value)} inputMode="search" aria-label="Search tour stops" />
            <div className="chip-row" role="tablist" aria-label="Stop filters">
              {EVENT_SCOPES.map(s => (
                <button key={s.key} className="chip" aria-pressed={scope === s.key} onClick={() => setScope(s.key)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0 10px', flexWrap: 'wrap' }}>
            <span className="muted small">{filteredEvents.length} stop{filteredEvents.length === 1 ? '' : 's'}</span>
            <span style={{ flex: 1 }} />
            <label className="muted small" htmlFor="evRegion">Region</label>
            <select id="evRegion" className="select" style={{ width: 'auto', minHeight: 34 }}
                    value={eventRegion} onChange={e => setEventRegion(e.target.value)}>
              <option value="">All regions</option>
              {REGIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          {events == null ? <div className="card">Loading tour stops…</div> : (
            <div className="rowlist">
              {filteredEvents.map(ev => (
                <EventRow key={ev.id} ev={ev} roster={roster[ev.id]} canWrite={canWrite}
                          onOpen={() => setActiveEvent(ev.id)}
                          onConfirmTime={() => confirmTime(ev)} />
              ))}
              {!filteredEvents.length && (
                <div className="card muted">
                  {tab === 'ed' && !tabEvents.length
                    ? 'No stops are flagged for the Director yet. Open a stop on the Events tab and check Director under Who is going.'
                    : tabEvents.length
                      ? 'No stops match these filters. Try All stops.'
                      : 'No Pride stops on the calendar yet.'}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {activeEvent && openEvent && (
        <EventDrawer
          key={activeEvent}
          event={openEvent}
          isNew={activeEvent === 'new'}
          canWrite={canWrite}
          actorEmail={me?.email}
          notify={notify}
          onClose={() => setActiveEvent(null)}
          onChanged={loadAll}
        />
      )}

      {activeVol && (activeVol === 'new' || openVol) && (
        <VolunteerDrawer
          key={activeVol}
          volunteer={openVol}
          isNew={activeVol === 'new'}
          assignments={openVol ? (byVol[openVol.id] || []) : []}
          events={events || []}
          canWrite={canWrite}
          actorEmail={me?.email}
          notify={notify}
          onClose={() => setActiveVol(null)}
          onChanged={loadAll}
        />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
