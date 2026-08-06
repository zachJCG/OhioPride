'use client';
// One event: the RSVP roster, check-in, walk-up adds, and CSV export for the door.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';

const STATUS_LABEL = { rsvp: 'RSVP', attended: 'Attended', no_show: 'No show', cancelled: 'Cancelled' };
const STATUS_BADGE = { rsvp: 'badge-muted', attended: 'badge-ok', no_show: 'badge-warn', cancelled: 'badge-bad' };
const FILTERS = [
  { key: 'all', label: 'Everyone' },
  { key: 'rsvp', label: 'Not checked in' },
  { key: 'attended', label: 'Attended' },
  { key: 'cancelled', label: 'Cancelled' },
];

export default function EventDrawer({ event, canWrite, notify, onClose }) {
  const [rsvps, setRsvps] = useState(null);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const changed = useState({ v: false })[0];

  const load = useCallback(async () => {
    const { data, error } = await supabase().from('event_rsvps')
      .select('*').eq('event_id', event.id).order('created_at', { ascending: false });
    if (error) { notify('Could not load RSVPs: ' + error.message); return; }
    setRsvps(data || []);
  }, [event.id, notify]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    if (!rsvps) return [];
    const term = q.trim().toLowerCase();
    return rsvps
      .filter(r => filter === 'all' ? true : r.status === filter)
      .filter(r => !term || [r.full_name, r.email, r.organization, r.phone]
        .some(v => String(v || '').toLowerCase().includes(term)));
  }, [rsvps, filter, q]);

  const counts = useMemo(() => {
    const live = (rsvps || []).filter(r => r.status !== 'cancelled');
    return {
      rsvps: live.length,
      guests: live.reduce((n, r) => n + Number(r.guests || 0), 0),
      attended: (rsvps || []).filter(r => r.status === 'attended').length,
    };
  }, [rsvps]);

  async function setStatus(row, status) {
    if (!canWrite) { notify('You have read access only'); return; }
    const prev = row.status;
    setRsvps(list => list.map(r => (r.id === row.id ? { ...r, status } : r)));
    changed.v = true;
    const { error } = await supabase().from('event_rsvps').update({ status }).eq('id', row.id);
    if (error) {
      setRsvps(list => list.map(r => (r.id === row.id ? { ...r, status: prev } : r)));
      notify('Could not save: ' + error.message);
    }
  }

  async function addWalkUp(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const first = String(fd.get('first_name') || '').trim();
    const last = String(fd.get('last_name') || '').trim();
    const email = String(fd.get('email') || '').trim().toLowerCase() || null;
    if (!first && !last && !email) { notify('Enter at least a name or an email.'); return; }
    const row = {
      event_id: event.id,
      first_name: first || null,
      last_name: last || null,
      full_name: [first, last].filter(Boolean).join(' ') || email,
      email,
      guests: Number.parseInt(String(fd.get('guests') || '0'), 10) || 0,
      status: 'attended',
      source: 'walk-up',
    };
    const { error } = await supabase().from('event_rsvps').insert(row);
    if (error) {
      notify(error.code === '23505' ? 'That email already has an RSVP for this event.' : 'Could not add: ' + error.message);
      return;
    }
    changed.v = true;
    setShowAdd(false);
    notify('Added and checked in.');
    load();
  }

  function exportCsv() {
    const cols = ['full_name', 'email', 'phone', 'organization', 'guests', 'status', 'source', 'created_at'];
    const esc = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const csv = [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `${event.slug}-rsvps.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <div className="drawer-scrim" onClick={() => onClose(changed.v)} />
      <div className="drawer" role="dialog" aria-modal="true" aria-label={event.name}>
        <div className="drawer-head">
          <div>
            <h3>{event.name}</h3>
            <div className="muted small">{[event.venue, event.city].filter(Boolean).join(', ')}</div>
          </div>
          <button className="btn btn-sm" onClick={() => onClose(changed.v)}>Close</button>
        </div>

        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="kpi"><div className="num">{counts.rsvps + counts.guests}</div><div className="lbl">Expected</div></div>
          <div className="kpi"><div className="num">{counts.rsvps}</div><div className="lbl">RSVPs</div></div>
          <div className="kpi"><div className="num">{counts.attended}</div><div className="lbl">Checked in</div></div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '4px 0 8px' }}>
          {canWrite && <button className="btn btn-sm btn-accent" onClick={() => setShowAdd(s => !s)}>
            {showAdd ? 'Cancel' : 'Add walk-up'}
          </button>}
          <button className="btn btn-sm" onClick={exportCsv} disabled={!rows.length}>Export CSV</button>
          {event.page_path && (
            <a className="btn btn-sm" href={event.page_path} target="_blank" rel="noopener noreferrer">View page</a>
          )}
        </div>

        {showAdd && (
          <form className="card" style={{ marginBottom: 10 }} onSubmit={addWalkUp}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <label className="field"><span>First name</span><input className="input" name="first_name" /></label>
              <label className="field"><span>Last name</span><input className="input" name="last_name" /></label>
            </div>
            <label className="field"><span>Email</span><input className="input" name="email" type="email" inputMode="email" /></label>
            <label className="field"><span>Guests</span><input className="input" name="guests" type="number" min="0" defaultValue="0" /></label>
            <button className="btn btn-primary" style={{ width: '100%' }}>Add and check in</button>
          </form>
        )}

        <input className="input" placeholder="Search name, email, organization…" value={q}
               onChange={e => setQ(e.target.value)} inputMode="search" aria-label="Search RSVPs" />
        <div className="chip-row">
          {FILTERS.map(f => (
            <button key={f.key} className="chip" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>

        {rsvps == null ? <div className="card">Loading RSVPs…</div> : rows.length === 0 ? (
          <div className="card muted">
            {rsvps.length === 0 ? 'No RSVPs yet. They appear here the moment someone submits the form.' : 'Nobody matches this filter.'}
          </div>
        ) : rows.map(r => (
          <div key={r.id} className="card" style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
              <strong>{r.full_name || r.email || 'Unnamed'}</strong>
              <span className={`badge ${STATUS_BADGE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
            </div>
            <div className="muted small" style={{ overflowWrap: 'anywhere' }}>
              {[r.email, r.phone, r.organization].filter(Boolean).join(' · ')}
            </div>
            {Number(r.guests) > 0 && <div className="small">Bringing {r.guests} guest{Number(r.guests) === 1 ? '' : 's'}</div>}
            {canWrite && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {r.status !== 'attended' && (
                  <button className="btn btn-sm btn-primary" onClick={() => setStatus(r, 'attended')}>Check in</button>
                )}
                {r.status === 'attended' && (
                  <button className="btn btn-sm" onClick={() => setStatus(r, 'rsvp')}>Undo check-in</button>
                )}
                {r.status !== 'cancelled' && (
                  <button className="btn btn-sm" onClick={() => setStatus(r, 'cancelled')}>Cancelled</button>
                )}
                {r.contact_id && (
                  <a className="btn btn-sm" href={`/admin/contacts?id=${r.contact_id}`}>Contact record</a>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
