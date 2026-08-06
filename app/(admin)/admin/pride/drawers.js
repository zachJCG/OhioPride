'use client';
// The two Pride road tour drawers: a tour stop (edit, create, delete, roster)
// and a volunteer (assignments, detail, add, delete). Both write the same
// payloads the static console wrote, so RLS and the CHECK constraints behave
// exactly as before.
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  ASSIGNMENT_STATUSES, ATTENDANCE_BY_KEY, EVENT_TYPES, PAC_ROLES, REGIONS,
  REG_STATUSES, ROLE_OPTIONS, Dot, StatusBadge,
  easternTimeInput, easternToISO, fmtEventDate, fmtRel,
  prettyRole, regionLabel, setAssignmentStatus, slugify, titleCase, volunteerName,
} from './lib';

const STATUS_ORDER = { confirmed: 0, tentative: 1, declined: 2, removed: 3 };

function CheckRow({ checked, disabled, onChange, children }) {
  return (
    <label className="small" style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 'var(--op-tap)' }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange}
             style={{ width: 20, height: 20, flex: '0 0 auto' }} />
      <span>{children}</span>
    </label>
  );
}

function Section({ title, children, right }) {
  return (
    <section style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '4px 0 6px' }}>
        <h4 style={{ margin: 0, font: '700 .95rem var(--op-font-head)' }}>{title}</h4>
        <span style={{ flex: 1 }} />
        {right}
      </div>
      {children}
    </section>
  );
}

function formFromEvent(e) {
  return {
    name: e.name || '',
    city: e.city || '',
    region: e.region || 'Central',
    event_date: (e.event_date || '').slice(0, 10),
    event_type: e.event_type || 'festival',
    venue: e.venue || '',
    pac_attending: !!e.pac_attending,
    pac_role: e.pac_role || 'none',
    pac_priority: !!e.pac_priority,
    registration_status: e.registration_status || 'tbd',
    description: e.description || '',
    start_time: easternTimeInput(e.start_time_utc),
    end_time: easternTimeInput(e.end_time_utc),
    time_confirmed: !!e.time_confirmed,
    board_attending: !!e.board_attending,
    staff_attending: !!e.staff_attending,
    ed_attending: !!e.ed_attending,
  };
}

// Exactly the column set the static console wrote back to pride_events.
function payloadFromForm(f) {
  const date = (f.event_date || '').slice(0, 10);
  return {
    name: f.name.trim(),
    city: f.city.trim(),
    region: f.region,
    event_date: date,
    event_type: f.event_type,
    venue: f.venue.trim() || null,
    pac_attending: !!f.pac_attending,
    pac_role: f.pac_role,
    pac_priority: !!f.pac_priority,
    registration_status: f.registration_status,
    description: f.description.trim() || null,
    start_time_utc: f.start_time ? easternToISO(date, f.start_time) : null,
    end_time_utc: f.end_time ? easternToISO(date, f.end_time) : null,
    time_confirmed: !!f.time_confirmed,
    board_attending: !!f.board_attending,
    staff_attending: !!f.staff_attending,
    ed_attending: !!f.ed_attending,
  };
}

export function EventDrawer({ event, isNew, canWrite, actorEmail, notify, onClose, onChanged }) {
  const [form, setForm] = useState(() => formFromEvent(event));
  const [roster, setRoster] = useState(isNew ? [] : null);
  const [rosterErr, setRosterErr] = useState(null);
  const [rosterKey, setRosterKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (isNew) return;
    let alive = true;
    (async () => {
      const { data, error } = await supabase()
        .from('pride_event_volunteers_v').select('*').eq('event_id', event.id);
      if (!alive) return;
      if (error) { setRosterErr('Could not load the roster. ' + error.message); setRoster([]); return; }
      setRosterErr(null);
      setRoster(data || []);
    })();
    return () => { alive = false; };
  }, [event.id, isNew, rosterKey]);

  async function save() {
    const payload = payloadFromForm(form);
    if (!payload.name || !payload.city || !payload.event_date) {
      notify('Name, city and date are all required.');
      return;
    }
    setSaving(true);
    if (isNew) {
      // slug has to be unique and url safe; lat and lng are NOT NULL with no
      // default, so seed the Ohio geographic center until the stop is refined.
      payload.slug = slugify(payload.city) + '-' + payload.event_type + '-' + payload.event_date;
      payload.lat = 40.0;
      payload.lng = -83.0;
      payload.is_public = true;
      const { error } = await supabase().from('pride_events').insert(payload).select().single();
      setSaving(false);
      if (error) {
        notify(error.code === '23505'
          ? 'A stop with that city, type and date already exists.'
          : 'Could not create the stop. ' + error.message);
        return;
      }
      await onChanged();
      notify('Stop added to the tour.');
      onClose();
      return;
    }
    const { error } = await supabase().from('pride_events').update(payload).eq('id', event.id).select().single();
    setSaving(false);
    if (error) { notify('Could not save the stop. ' + error.message); return; }
    await onChanged();
    notify('Stop updated.');
    onClose();
  }

  async function remove() {
    setSaving(true);
    const { error } = await supabase().from('pride_events').delete().eq('id', event.id);
    setSaving(false);
    if (error) { notify('Could not delete the stop. ' + error.message); return; }
    await onChanged();
    notify('Stop deleted.');
    onClose();
  }

  async function flip(row, status) {
    if (!canWrite) { notify('You have read access only.'); return; }
    try {
      await setAssignmentStatus(row.id, status, actorEmail);
    } catch (e) {
      notify('Could not update that assignment. ' + e.message);
      return;
    }
    setRosterKey(k => k + 1);
    await onChanged();
    notify(`${volunteerName(row) || 'That volunteer'} marked ${status}.`);
  }

  const sorted = (roster || []).slice().sort((a, b) => {
    const d = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
    return d || volunteerName(a).localeCompare(volunteerName(b));
  });
  const counts = sorted.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer" role="dialog" aria-modal="true" aria-label={isNew ? 'Add a tour stop' : event.name}>
        <div className="drawer-head">
          <div>
            <div className="muted small">
              {isNew ? 'New stop' : `${fmtEventDate(event.event_date)} · ${regionLabel(event.region)}`}
            </div>
            <h3>{isNew ? 'Add a Pride stop' : event.name}</h3>
          </div>
          <button className="btn btn-sm" onClick={onClose}>Close</button>
        </div>

        {!canWrite && <div className="alert alert-warn">You have read access only, so these fields are locked.</div>}

        <Section title="Stop">
          <label className="field"><span>Name</span>
            <input className="input" value={form.name} disabled={!canWrite}
                   onChange={e => set('name', e.target.value)} placeholder="Columbus Pride" />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label className="field"><span>City</span>
              <input className="input" value={form.city} disabled={!canWrite} onChange={e => set('city', e.target.value)} />
            </label>
            <label className="field"><span>Region</span>
              <select className="select" value={form.region} disabled={!canWrite} onChange={e => set('region', e.target.value)}>
                {REGIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </label>
            <label className="field"><span>Date</span>
              <input className="input" type="date" value={form.event_date} disabled={!canWrite}
                     onChange={e => set('event_date', e.target.value)} />
            </label>
            <label className="field"><span>Type</span>
              <select className="select" value={form.event_type} disabled={!canWrite} onChange={e => set('event_type', e.target.value)}>
                {EVENT_TYPES.map(t => <option key={t} value={t}>{titleCase(t)}</option>)}
              </select>
            </label>
          </div>
          <label className="field"><span>Venue</span>
            <input className="input" value={form.venue} disabled={!canWrite} onChange={e => set('venue', e.target.value)} />
          </label>
        </Section>

        <Section title="PAC status">
          <CheckRow checked={form.pac_attending} disabled={!canWrite}
                    onChange={e => set('pac_attending', e.target.checked)}>
            PAC is attending this stop
          </CheckRow>
          <CheckRow checked={form.pac_priority} disabled={!canWrite}
                    onChange={e => set('pac_priority', e.target.checked)}>
            Flag as a PAC priority
          </CheckRow>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 6 }}>
            <label className="field"><span>PAC role</span>
              <select className="select" value={form.pac_role} disabled={!canWrite} onChange={e => set('pac_role', e.target.value)}>
                {PAC_ROLES.map(r => <option key={r} value={r}>{titleCase(r)}</option>)}
              </select>
            </label>
            <label className="field"><span>Registration</span>
              <select className="select" value={form.registration_status} disabled={!canWrite}
                      onChange={e => set('registration_status', e.target.value)}>
                {REG_STATUSES.map(r => <option key={r} value={r}>{titleCase(r)}</option>)}
              </select>
            </label>
          </div>
        </Section>

        <Section title="Who is going">
          <div className="small" style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 'var(--op-tap)' }}>
            <Dot color={ATTENDANCE_BY_KEY.volunteers.color} label="Volunteers" />
            <span>Volunteers</span>
            <span className="muted">
              {(counts.confirmed || 0) + (counts.tentative || 0)
                ? `${(counts.confirmed || 0) + (counts.tentative || 0)} assigned, from the roster below`
                : 'none assigned yet'}
            </span>
          </div>
          {['board', 'staff', 'ed'].map(key => {
            const a = ATTENDANCE_BY_KEY[key];
            return (
              <CheckRow key={key} checked={form[a.col]} disabled={!canWrite}
                        onChange={e => set(a.col, e.target.checked)}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Dot color={a.color} label={a.label} />{a.label}
                </span>
              </CheckRow>
            );
          })}
        </Section>

        <Section title="Times">
          <p className="muted small" style={{ margin: '0 0 6px' }}>
            Eastern time. Leave both blank for an all day stop.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label className="field"><span>Start</span>
              <input className="input" type="time" value={form.start_time} disabled={!canWrite}
                     onChange={e => set('start_time', e.target.value)} />
            </label>
            <label className="field"><span>End</span>
              <input className="input" type="time" value={form.end_time} disabled={!canWrite}
                     onChange={e => set('end_time', e.target.value)} />
            </label>
          </div>
          <CheckRow checked={form.time_confirmed} disabled={!canWrite}
                    onChange={e => set('time_confirmed', e.target.checked)}>
            Time confirmed, so this stop leaves the tentative list
          </CheckRow>
        </Section>

        <Section title="Notes">
          <label className="field"><span>Description</span>
            <textarea className="textarea" value={form.description} disabled={!canWrite}
                      onChange={e => set('description', e.target.value)} />
          </label>
        </Section>

        {!isNew && (
          <Section title={`Roster (${counts.confirmed || 0} confirmed, ${counts.tentative || 0} tentative)`}>
            {rosterErr && <div className="alert alert-error">{rosterErr}</div>}
            {roster == null ? <div className="muted small">Loading the roster…</div> : sorted.length === 0 ? (
              <p className="muted small" style={{ margin: 0 }}>
                No volunteers assigned yet. Assign them from the Volunteers tab.
              </p>
            ) : sorted.map(a => (
              <div key={a.id} className="card" style={{ marginBottom: 6, padding: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong>{volunteerName(a) || a.volunteer_email || 'Unnamed volunteer'}</strong>
                  {a.is_captain && <span className="badge badge-founding">Captain</span>}
                  <span style={{ flex: 1 }} />
                  <StatusBadge status={a.status} />
                </div>
                <div className="muted small">
                  {[prettyRole(a.role), a.volunteer_city, a.volunteer_email].filter(Boolean).join(' · ')}
                </div>
                {canWrite && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {ASSIGNMENT_STATUSES.map(s => (
                      <button key={s.key} className={`btn btn-sm${s.key === 'removed' ? ' btn-danger' : ''}`}
                              disabled={a.status === s.key} onClick={() => flip(a, s.key)}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </Section>
        )}

        {canWrite && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            <button className="btn btn-primary" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : isNew ? 'Create stop' : 'Save changes'}
            </button>
            {!isNew && !confirmDel && (
              <button className="btn btn-danger" disabled={saving} onClick={() => setConfirmDel(true)}>Delete</button>
            )}
          </div>
        )}

        {canWrite && !isNew && confirmDel && (
          <div className="alert alert-error" style={{ marginTop: 10 }}>
            <div style={{ marginBottom: 8 }}>
              Delete {event.name}? This also removes its volunteer assignments.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-sm" onClick={() => setConfirmDel(false)}>Keep it</button>
              <button className="btn btn-sm btn-danger" disabled={saving} onClick={remove}>Delete the stop</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export function VolunteerDrawer({
  volunteer, isNew, assignments, events, canWrite, actorEmail, notify, onClose, onChanged,
}) {
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [assignEvent, setAssignEvent] = useState('');
  const [assignRole, setAssignRole] = useState(ROLE_OPTIONS[0]);

  useEffect(() => {
    if (!assignEvent && events.length) setAssignEvent(events[0].id);
  }, [events, assignEvent]);

  async function create(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const first = String(fd.get('first_name') || '').trim();
    const last = String(fd.get('last_name') || '').trim();
    const email = String(fd.get('email') || '').trim();
    if (!first || !last || !email) { notify('First name, last name and email are all required.'); return; }
    const payload = {
      first_name: first,
      last_name: last,
      email,
      phone: String(fd.get('phone') || '').trim() || null,
      city: String(fd.get('city') || '').trim() || null,
      zip: String(fd.get('zip') || '').trim() || null,
      preferred_region: fd.get('preferred_region') || null,
      roles_interested: fd.getAll('role'),
      can_travel: fd.get('can_travel') === 'on',
      has_vehicle: fd.get('has_vehicle') === 'on',
      is_vetted: fd.get('is_vetted') === 'on',
      notes: String(fd.get('notes') || '').trim() || null,
      consent_communications: true,
      source: 'admin_pride_manual',
    };
    setBusy(true);
    const { error } = await supabase().from('pride_volunteers').insert(payload).select().single();
    setBusy(false);
    if (error) {
      notify(error.code === '23505'
        ? 'A volunteer with that email is already on the roster.'
        : 'Could not add the volunteer. ' + error.message);
      return;
    }
    await onChanged();
    notify('Volunteer added.');
    onClose();
  }

  async function remove() {
    setBusy(true);
    const { error } = await supabase().from('pride_volunteers').delete().eq('id', volunteer.id);
    setBusy(false);
    if (error) { notify('Could not delete the volunteer. ' + error.message); return; }
    await onChanged();
    notify('Volunteer deleted.');
    onClose();
  }

  async function flip(a, status) {
    setBusy(true);
    try {
      await setAssignmentStatus(a.id, status, actorEmail);
    } catch (e) {
      setBusy(false);
      notify('Could not update that assignment. ' + e.message);
      return;
    }
    await onChanged();
    setBusy(false);
    notify(`Marked ${status} for ${a.event_name}.`);
  }

  async function assign() {
    if (!assignEvent) { notify('Pick a stop first.'); return; }
    setBusy(true);
    const { error } = await supabase().from('pride_event_volunteers').insert({
      event_id: assignEvent,
      volunteer_id: volunteer.id,
      role: assignRole || 'marcher',
      status: 'tentative',
      set_by: actorEmail || null,
    }).select().single();
    setBusy(false);
    if (error) {
      notify(error.code === '23505'
        ? 'Already assigned to that stop.'
        : 'Could not assign. ' + error.message);
      return;
    }
    await onChanged();
    notify('Added to the stop as tentative.');
  }

  if (isNew) {
    const regionOptions = [...REGIONS, { value: 'Anywhere', label: 'Anywhere' }];
    return (
      <>
        <div className="drawer-scrim" onClick={onClose} />
        <div className="drawer" role="dialog" aria-modal="true" aria-label="Add a road tour volunteer">
          <div className="drawer-head">
            <div>
              <div className="muted small">New volunteer</div>
              <h3>Add a road tour volunteer</h3>
            </div>
            <button className="btn btn-sm" onClick={onClose}>Close</button>
          </div>
          <form onSubmit={create}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <label className="field"><span>First name</span><input className="input" name="first_name" required /></label>
              <label className="field"><span>Last name</span><input className="input" name="last_name" required /></label>
            </div>
            <label className="field"><span>Email</span>
              <input className="input" name="email" type="email" inputMode="email" required />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <label className="field"><span>Phone</span><input className="input" name="phone" inputMode="tel" /></label>
              <label className="field"><span>City</span><input className="input" name="city" /></label>
              <label className="field"><span>ZIP</span><input className="input" name="zip" inputMode="numeric" /></label>
              <label className="field"><span>Preferred region</span>
                <select className="select" name="preferred_region" defaultValue="">
                  <option value="">Not set</option>
                  {regionOptions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </label>
            </div>

            <Section title="Wants to">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 2 }}>
                {ROLE_OPTIONS.map(r => (
                  <label key={r} className="small" style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 'var(--op-tap)' }}>
                    <input type="checkbox" name="role" value={r} style={{ width: 20, height: 20 }} />
                    {titleCase(r)}
                  </label>
                ))}
              </div>
            </Section>

            <Section title="Logistics">
              <label className="small" style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 'var(--op-tap)' }}>
                <input type="checkbox" name="can_travel" style={{ width: 20, height: 20 }} /> Can travel
              </label>
              <label className="small" style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 'var(--op-tap)' }}>
                <input type="checkbox" name="has_vehicle" style={{ width: 20, height: 20 }} /> Has a vehicle
              </label>
              <label className="small" style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 'var(--op-tap)' }}>
                <input type="checkbox" name="is_vetted" style={{ width: 20, height: 20 }} /> Vetted
              </label>
              <label className="field" style={{ marginTop: 6 }}><span>Notes</span>
                <textarea className="textarea" name="notes" />
              </label>
            </Section>

            <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
              {busy ? 'Adding…' : 'Add volunteer'}
            </button>
          </form>
        </div>
      </>
    );
  }

  const list = (assignments || []).slice().sort((a, b) => {
    const d = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
    if (d) return d;
    return String(a.event_date || '').localeCompare(String(b.event_date || ''));
  });
  const confirmed = list.filter(a => a.status === 'confirmed');
  const name = volunteerName(volunteer) || volunteer.email || 'Volunteer';
  const vehicle = volunteer.has_vehicle
    ? 'Yes' + (volunteer.vehicle_capacity ? ` (${volunteer.vehicle_capacity} seats)` : '')
    : 'No';
  const detail = [
    ['Email', volunteer.email],
    ['Phone', volunteer.phone],
    ['City and ZIP', [volunteer.city, volunteer.zip].filter(Boolean).join(' · ')],
    ['Preferred region', regionLabel(volunteer.preferred_region)],
    ['Wants to', (volunteer.roles_interested || []).map(titleCase).join(', ')],
    ['Events interested', `${(volunteer.events_interested || []).length} selected`],
    ['Can travel', volunteer.can_travel ? 'Yes' : 'No'],
    ['Vehicle', vehicle],
    ['T-shirt', volunteer.tshirt_size],
    ['Accessibility', volunteer.accessibility_needs],
    ['Notes', volunteer.notes],
    ['Signed up', volunteer.created_at ? new Date(volunteer.created_at).toLocaleString() : ''],
  ];

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer" role="dialog" aria-modal="true" aria-label={name}>
        <div className="drawer-head">
          <div>
            <div className="muted small">{regionLabel(volunteer.preferred_region) || 'Volunteer'}</div>
            <h3>{name}</h3>
            <div className="muted small" style={{ overflowWrap: 'anywhere' }}>{volunteer.email}</div>
          </div>
          <button className="btn btn-sm" onClick={onClose}>Close</button>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {volunteer.is_vetted && <span className="badge badge-ok">Vetted</span>}
          {volunteer.can_travel && <span className="badge badge-muted">Can travel</span>}
          {volunteer.has_vehicle && <span className="badge badge-muted">Has a vehicle</span>}
        </div>

        <Section title="Confirmed stops">
          {confirmed.length ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {confirmed.map(a => (
                <span key={a.id} className="badge badge-ok">
                  {a.event_name} · {fmtEventDate(a.event_date)}
                </span>
              ))}
            </div>
          ) : <p className="muted small" style={{ margin: 0 }}>No confirmed stops yet.</p>}
        </Section>

        <Section title="All assignments">
          {list.length === 0 ? (
            <p className="muted small" style={{ margin: 0 }}>Not assigned to any stop yet.</p>
          ) : list.map(a => (
            <div key={a.id} className="card" style={{ marginBottom: 6, padding: 10 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <strong>{a.event_name}</strong>
                <span style={{ flex: 1 }} />
                <StatusBadge status={a.status} />
              </div>
              <div className="muted small">
                {[fmtEventDate(a.event_date), a.event_city, prettyRole(a.role)].filter(Boolean).join(' · ')}
                {a.set_by ? ` · set by ${a.set_by}` : ''}
              </div>
              {canWrite && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {ASSIGNMENT_STATUSES.map(s => (
                    <button key={s.key} className={`btn btn-sm${s.key === 'removed' ? ' btn-danger' : ''}`}
                            disabled={busy || a.status === s.key} onClick={() => flip(a, s.key)}>
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {canWrite && (
            <div className="card" style={{ marginTop: 8 }}>
              <label className="field"><span>Assign to a stop</span>
                <select className="select" value={assignEvent} onChange={e => setAssignEvent(e.target.value)}>
                  {events.map(ev => (
                    <option key={ev.id} value={ev.id}>
                      {fmtEventDate(ev.event_date)} · {ev.name} ({ev.city})
                    </option>
                  ))}
                </select>
              </label>
              <label className="field"><span>Role</span>
                <select className="select" value={assignRole} onChange={e => setAssignRole(e.target.value)}>
                  {ROLE_OPTIONS.map(r => <option key={r} value={r}>{titleCase(r)}</option>)}
                </select>
              </label>
              <button className="btn btn-accent" style={{ width: '100%' }} disabled={busy || !events.length} onClick={assign}>
                Add to stop as tentative
              </button>
            </div>
          )}
        </Section>

        <Section title="Volunteer detail">
          <div className="detail-grid">
            {detail.map(([label, value]) => (
              <div key={label}>
                <div className="lbl">{label}</div>
                <div className="val">{value || <span className="muted">Not set</span>}</div>
              </div>
            ))}
          </div>
          <div className="muted small">Signed up {fmtRel(volunteer.created_at)}</div>
        </Section>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {volunteer.email && <a className="btn" href={`mailto:${volunteer.email}`}>Email</a>}
          {volunteer.phone && <a className="btn" href={`tel:${volunteer.phone}`}>Call</a>}
          {canWrite && !confirmDel && (
            <button className="btn btn-danger" disabled={busy} onClick={() => setConfirmDel(true)}>Delete</button>
          )}
        </div>

        {canWrite && confirmDel && (
          <div className="alert alert-error" style={{ marginTop: 10 }}>
            <div style={{ marginBottom: 8 }}>Delete {name}? This also removes their stop assignments.</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-sm" onClick={() => setConfirmDel(false)}>Keep them</button>
              <button className="btn btn-sm btn-danger" disabled={busy} onClick={remove}>Delete the volunteer</button>
            </div>
          </div>
        )}

        <p className="muted small" style={{ marginTop: 12 }}>
          Road tour signups also land in the main volunteer roster through the database trigger, so this
          person shows up on the Volunteers module too.
        </p>
      </div>
    </>
  );
}
