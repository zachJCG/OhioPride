'use client';
// Events: the RSVP roster for Pride Hours and anything that follows.
//
// An event is a row, not code. Its slug is the form-name the public page
// posts, so adding a Pride Hour here makes its RSVP form work immediately
// with no deploy.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAdmin } from '../../lib/permissions';
import EventDrawer from './event-drawer';

const STATUS_LABEL = { rsvp: 'RSVP', attended: 'Attended', no_show: 'No show', cancelled: 'Cancelled' };
const STATUS_BADGE = { rsvp: 'badge-muted', attended: 'badge-ok', no_show: 'badge-warn', cancelled: 'badge-bad' };

const when = (starts) => {
  if (!starts) return 'Date to be set';
  const d = new Date(starts);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) +
    ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

export default function EventsPage() {
  const { loading: authLoading, can } = useAdmin();
  const canWrite = can('events', 'write');

  const [events, setEvents] = useState(null);
  const [summary, setSummary] = useState({});
  const [openId, setOpenId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [err, setErr] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const notify = useCallback((m) => {
    setToast(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const load = useCallback(async () => {
    const sb = supabase();
    const [e, s] = await Promise.all([
      sb.from('events').select('*').order('starts_at', { ascending: false }),
      sb.from('event_rsvp_summary').select('*'),
    ]);
    if (e.error) { setErr('Could not load events. ' + e.error.message); return; }
    setEvents(e.data || []);
    setSummary(Object.fromEntries((s.data || []).map(r => [r.event_id, r])));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Deep link (?event=slug) read after mount, never during render.
  useEffect(() => {
    if (!events) return;
    const slug = new URLSearchParams(window.location.search).get('event');
    if (slug) {
      const match = events.find(e => e.slug === slug);
      if (match) setOpenId(match.id);
    }
  }, [events]);

  const totals = useMemo(() => {
    const list = Object.values(summary);
    return {
      rsvps: list.reduce((n, r) => n + Number(r.rsvps || 0), 0),
      headcount: list.reduce((n, r) => n + Number(r.headcount || 0), 0),
      upcoming: (events || []).filter(e => e.status === 'upcoming').length,
    };
  }, [summary, events]);

  async function createEvent(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const name = String(fd.get('name') || '').trim();
    const slug = String(fd.get('slug') || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!name || !slug) { notify('Name and slug are both required.'); return; }
    const date = String(fd.get('date') || '');
    const time = String(fd.get('time') || '18:00');
    const row = {
      name, slug,
      city: String(fd.get('city') || '').trim() || null,
      venue: String(fd.get('venue') || '').trim() || null,
      page_path: String(fd.get('page_path') || '').trim() || null,
      starts_at: date ? new Date(`${date}T${time}`).toISOString() : null,
      status: 'upcoming',
    };
    const { error } = await supabase().from('events').insert(row);
    if (error) {
      notify(error.code === '23505' ? 'That slug is already in use.' : 'Could not create: ' + error.message);
      return;
    }
    setShowNew(false);
    notify('Event created. Its RSVP form is live at once.');
    load();
  }

  if (!authLoading && !can('events', 'read')) {
    return <div className="alert alert-error">The events module is limited by role. Ask the Director if you need it.</div>;
  }
  if (err) return <div className="alert alert-error">{err}</div>;

  const active = events?.find(e => e.id === openId) || null;

  return (
    <>
      <div className="page-head">
        <h2>Events</h2>
        <p className="sub">RSVP rosters for Pride Hours and everything after them.</p>
      </div>

      {events && (
        <div className="kpi-grid">
          <div className="kpi"><div className="num">{totals.upcoming}</div><div className="lbl">Upcoming</div></div>
          <div className="kpi"><div className="num">{totals.rsvps}</div><div className="lbl">RSVPs</div></div>
          <div className="kpi"><div className="num">{totals.headcount}</div><div className="lbl">Headcount</div>
            <div className="sub">RSVPs plus guests</div></div>
        </div>
      )}

      {canWrite && (
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setShowNew(s => !s)}>
            {showNew ? 'Cancel' : 'New event'}
          </button>
        </div>
      )}

      {showNew && (
        <form className="card" style={{ marginBottom: 12 }} onSubmit={createEvent}>
          <label className="field"><span>Event name</span>
            <input className="input" name="name" placeholder="Columbus Pride Hour" required />
          </label>
          <label className="field"><span>Slug. This is the form name the page posts.</span>
            <input className="input" name="slug" placeholder="pride-hour-columbus" required />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label className="field"><span>City</span><input className="input" name="city" /></label>
            <label className="field"><span>Venue</span><input className="input" name="venue" /></label>
            <label className="field"><span>Date</span><input className="input" name="date" type="date" /></label>
            <label className="field"><span>Start time</span><input className="input" name="time" type="time" defaultValue="18:00" /></label>
          </div>
          <label className="field"><span>Public page path</span>
            <input className="input" name="page_path" placeholder="/pride-hour-columbus" />
          </label>
          <button className="btn btn-primary" style={{ width: '100%' }}>Create event</button>
        </form>
      )}

      {events == null ? <div className="card">Loading events…</div> : events.length === 0 ? (
        <div className="card">
          <strong>No events yet</strong>
          <p className="muted" style={{ marginBottom: 0 }}>
            Create one and its RSVP form starts collecting straight away.
          </p>
        </div>
      ) : (
        <div className="stack">
          {events.map(ev => {
            const s = summary[ev.id] || { rsvps: 0, guests: 0, headcount: 0, attended: 0 };
            return (
              <button key={ev.id} className="item" style={{ display: 'block', textAlign: 'left', font: 'inherit', cursor: 'pointer' }}
                      onClick={() => setOpenId(ev.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                  <strong>{ev.name}</strong>
                  <span className={`badge ${ev.status === 'upcoming' ? 'badge-ok' : 'badge-muted'}`}>{ev.status}</span>
                </div>
                <div className="muted small">{when(ev.starts_at)}</div>
                <div className="muted small">{[ev.venue, ev.city].filter(Boolean).join(', ')}</div>
                <div className="small" style={{ marginTop: 6 }}>
                  <strong>{s.headcount}</strong> expected
                  <span className="muted"> · {s.rsvps} RSVP{Number(s.rsvps) === 1 ? '' : 's'}{Number(s.guests) ? ` plus ${s.guests} guest${Number(s.guests) === 1 ? '' : 's'}` : ''}{Number(s.attended) ? ` · ${s.attended} attended` : ''}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <strong>How RSVPs arrive.</strong>
        <p className="muted small" style={{ marginBottom: 0 }}>
          The RSVP form on each public page posts its event slug. Anything matching a slug here is
          recorded against that event and linked to the person's contact record, so one person shows
          up the same way across Contacts, Members and Volunteers. One RSVP per email per event: a
          resubmit updates rather than duplicating.
        </p>
      </div>

      {active && (
        <EventDrawer event={active} canWrite={canWrite} notify={notify}
                     onClose={(changed) => { setOpenId(null); if (changed) load(); }} />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

export { STATUS_LABEL, STATUS_BADGE };
