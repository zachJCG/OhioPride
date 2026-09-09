'use client';
// Election cycles: which elections are taking endorsement applications, and
// until when. Editing a close date or an override here changes what the public
// page shows and what the database will accept, with no deploy.
//
// The open/closed state is never computed in this file. It arrives as `is_open`
// on admin_election_cycles, which the database fills with the same
// cycle_is_open() the insert policy enforces, so this page cannot tell you a
// cycle is open while submissions are being refused.
//
// Cycles are seeded by migration. There is no create form here on purpose: a
// new election needs its board of elections dates checked against the county,
// which is a migration and a review, not a text box.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAdmin } from '../../../lib/permissions';

const ET = 'America/New_York';

const COLUMNS =
  'id, slug, label, jurisdiction, election_type, election_date, filing_deadline, ' +
  'applications_open_at, applications_close_at, board_action_earliest, is_open_override, ' +
  'override_note, is_published, is_open, is_upcoming, application_count, late_count';

/* A DATE column is a calendar day. Parsing "2027-11-02" as UTC midnight and
 * printing it in Eastern time would show November 1. */
const BARE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function etDate(value) {
  if (!value) return null;
  const bare = BARE_DATE.exec(String(value));
  const d = bare ? new Date(Date.UTC(+bare[1], +bare[2] - 1, +bare[3])) : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    timeZone: bare ? 'UTC' : ET,
  });
}

function etDateTime(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const time = d
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: ET })
    .replace(/\s?([AP])M$/i, (m, ap) => ` ${ap.toUpperCase()}M`);
  return `${etDate(value)}, ${time} ET`;
}

/* The value a datetime-local input wants, expressed in Eastern time so an
 * admin in any timezone edits the deadline candidates actually see. */
function toLocalInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/* The offset Eastern time is at that moment, so "2027-02-19T17:00" typed by a
 * person becomes the instant 5:00 PM ET, on either side of a DST change. */
function fromLocalInput(local) {
  if (!local) return null;
  const [datePart, timePart] = local.split('T');
  if (!datePart || !timePart) return null;
  const guess = new Date(`${datePart}T${timePart}:00Z`);
  if (Number.isNaN(guess.getTime())) return null;
  const shown = new Intl.DateTimeFormat('en-CA', {
    timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(guess).reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  const asUtc = Date.UTC(+shown.year, +shown.month - 1, +shown.day, +shown.hour, +shown.minute, +shown.second);
  const offset = asUtc - guess.getTime();
  return new Date(guess.getTime() - offset).toISOString();
}

function daysRemaining(cycle) {
  if (!cycle.applications_close_at) return null;
  const ms = new Date(cycle.applications_close_at).getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  return Math.ceil(ms / 86400000);
}

function stateOf(cycle) {
  if (cycle.is_open) return { key: 'open', label: 'Open', cls: 'badge-ok' };
  if (cycle.is_upcoming) return { key: 'upcoming', label: 'Not open yet', cls: 'badge-muted' };
  return { key: 'closed', label: 'Closed', cls: 'badge-bad' };
}

const OVERRIDE_OPTIONS = [
  { value: 'dates', label: 'Follow the dates' },
  { value: 'open', label: 'Force open' },
  { value: 'closed', label: 'Force closed' },
];

const overrideValue = (cycle) =>
  cycle.is_open_override === true ? 'open' : cycle.is_open_override === false ? 'closed' : 'dates';

function CycleRow({ cycle, canWrite, onSaved, notify }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [closeAt, setCloseAt] = useState(toLocalInput(cycle.applications_close_at));
  const [override, setOverride] = useState(overrideValue(cycle));
  const [note, setNote] = useState(cycle.override_note || '');
  const [published, setPublished] = useState(!!cycle.is_published);

  useEffect(() => {
    setCloseAt(toLocalInput(cycle.applications_close_at));
    setOverride(overrideValue(cycle));
    setNote(cycle.override_note || '');
    setPublished(!!cycle.is_published);
  }, [cycle]);

  const state = stateOf(cycle);
  const days = daysRemaining(cycle);

  async function save(e) {
    e.preventDefault();
    setErr(null);

    const nextOverride = override === 'open' ? true : override === 'closed' ? false : null;
    // The database enforces this too. Saying it here first means the admin
    // gets a sentence rather than a constraint name.
    if (nextOverride !== null && !note.trim()) {
      setErr('An override has to say why. Add a note explaining it, so the reason is on the record.');
      return;
    }
    const closeIso = fromLocalInput(closeAt);
    if (!closeIso) {
      setErr('Enter a closing date and time.');
      return;
    }

    setSaving(true);
    const { error } = await supabase()
      .from('election_cycles')
      .update({
        applications_close_at: closeIso,
        is_open_override: nextOverride,
        override_note: nextOverride === null ? null : note.trim(),
        is_published: published,
      })
      .eq('id', cycle.id);
    setSaving(false);

    if (error) {
      setErr(
        /override_needs_note/.test(error.message)
          ? 'An override has to say why. Add a note explaining it.'
          : /window_valid/.test(error.message)
            ? 'The closing time has to be after the opening time.'
            : `Could not save: ${error.message}`
      );
      return;
    }
    notify(`${cycle.label} saved.`);
    setEditing(false);
    onSaved();
  }

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong style={{ font: '700 1rem var(--op-font-head)' }}>{cycle.label}</strong>
        <span className={`badge ${state.cls}`}>{state.label}</span>
        {!cycle.is_published && <span className="badge badge-review">Not published</span>}
        {cycle.is_open_override !== null && cycle.is_open_override !== undefined && (
          <span className="badge badge-muted">Override</span>
        )}
        <span className="muted small" style={{ marginLeft: 'auto' }}>
          {cycle.application_count} application{cycle.application_count === 1 ? '' : 's'}
          {cycle.late_count > 0 ? ` · ${cycle.late_count} late` : ''}
        </span>
      </div>

      <div className="muted small" style={{ marginTop: 4 }}>
        {cycle.jurisdiction} · Election Day {etDate(cycle.election_date)} · closes{' '}
        {etDateTime(cycle.applications_close_at)}
        {cycle.is_open && days != null && (
          <> · {days <= 0 ? 'closing today' : `${days} day${days === 1 ? '' : 's'} left`}</>
        )}
      </div>

      {cycle.override_note && (
        <div className="muted small" style={{ marginTop: 4 }}>Override note: {cycle.override_note}</div>
      )}

      <div className="page-actions" style={{ margin: '8px 0 0' }}>
        <a className="btn btn-sm" href={`/admin/endorsements?cycle=${encodeURIComponent(cycle.slug)}`}>
          View applications
        </a>
        {canWrite && (
          <button className="btn btn-sm" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
            {editing ? 'Cancel' : 'Edit'}
          </button>
        )}
      </div>

      {editing && canWrite && (
        <form className="card" style={{ marginTop: 8 }} onSubmit={save}>
          <label className="field">
            <span>Applications close (Eastern time)</span>
            <input
              className="input"
              type="datetime-local"
              value={closeAt}
              onChange={(e) => setCloseAt(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Open or closed</span>
            <select className="input" value={override} onChange={(e) => setOverride(e.target.value)}>
              {OVERRIDE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          {override !== 'dates' && (
            <label className="field">
              <span>Why (required for an override)</span>
              <input
                className="input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Board voted to reopen through Friday"
              />
            </label>
          )}
          <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 34 }}>
            <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
            Show this election on ohiopride.org
          </label>
          {err && <div className="alert alert-error">{err}</div>}
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={saving}>
            {saving ? 'Saving' : 'Save'}
          </button>
        </form>
      )}
    </div>
  );
}

export default function CyclesPage() {
  const { loading: authLoading, can } = useAdmin();
  const canWrite = can('endorsements', 'write');
  const [cycles, setCycles] = useState(null);
  const [error, setError] = useState(null);
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
    const { data, error: err } = await supabase()
      .from('admin_election_cycles')
      .select(COLUMNS)
      .order('election_date', { ascending: true });
    if (err) { setError(`Could not load election cycles: ${err.message}`); setCycles([]); return; }
    setCycles(data || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!authLoading && !can('endorsements', 'read')) {
    return <div className="alert alert-error">Election cycles are limited by role. Ask the Director if you need them.</div>;
  }

  const open = (cycles || []).filter((c) => c.is_open);

  return (
    <>
      <div className="page-head">
        <h2>Election Cycles</h2>
        <p className="sub">
          Which elections are taking endorsement applications, and until when. Times are Eastern.
        </p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="small">
          {cycles == null
            ? 'Loading'
            : open.length === 0
              ? 'No election is accepting applications right now, so the application form is closed on the public site.'
              : `${open.length} election${open.length === 1 ? ' is' : 's are'} accepting applications.`}
        </div>
        <div className="muted small" style={{ marginTop: 4 }}>
          Closing a cycle stops the database accepting applications for it, not just the form. New
          cycles are added by migration so their board of elections dates get checked first.
        </div>
      </div>

      {cycles == null ? (
        <div className="card">Loading election cycles</div>
      ) : cycles.length === 0 ? (
        <div className="card">No election cycles yet.</div>
      ) : (
        cycles.map((c) => (
          <CycleRow key={c.id} cycle={c} canWrite={canWrite} onSaved={load} notify={notify} />
        ))
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
