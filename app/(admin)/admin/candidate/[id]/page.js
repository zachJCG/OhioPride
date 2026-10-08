'use client';
// One candidate application. Left: the application as submitted, grouped the
// way the form asked it. Right (sticky on desktop): everything staff do with
// it. Below: the activity timeline.
//
// Every action that changes the record (status, assignment, mentor, referral)
// also writes a candidate_application_activity row, so the timeline is the
// audit trail and nothing happens silently.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { useAdmin } from '../../../lib/permissions';
import {
  getApplication, updateApplication, listActivity, insertActivity, listActiveAdmins,
  listMentorCandidates, listRaces,
} from '../../../../../lib/db/candidates.mjs';
import {
  STATUS_ORDER, STATUS_LABEL, PRIORITY_ORDER, HELP_LABEL, IS_OUT_LABEL, SIGNATURE_LABEL,
  RACE_RESULT_LABEL, BALLOT_PATH_LABEL, ACTIVITY_KIND_LABEL, MANUAL_ACTIVITY_KINDS, TIER_LABEL,
  applicationRaceLabel, filingLine, shortDate,
} from '../../../../../lib/candidates.mjs';
import { RACE_LEVEL_LABEL } from '../../endorsements/shared';
import { Gate, StatusPill, fullName, useDebounced, useToast, when } from '../shared';

const ET = 'America/New_York';
const stamp = (v) => v ? new Date(v).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: ET }) : '';

function Block({ title, children }) {
  return (
    <section className="card" style={{ marginBottom: 10 }}>
      <h3 style={{ font: '700 .8rem var(--op-font-head)', textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--op-muted)', margin: '0 0 8px' }}>{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children }) {
  if (children == null || children === '' || (Array.isArray(children) && !children.length)) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 32%) 1fr', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--op-line)', fontSize: '.9rem' }}>
      <span className="muted small" style={{ paddingTop: 2 }}>{label}</span>
      <span style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{children}</span>
    </div>
  );
}

export default function CandidateDetailPage() {
  const { id } = useParams();
  const { loading: authLoading, me, can } = useAdmin();
  const canWrite = can('candidates', 'write');
  const [app, setApp] = useState(null);
  const [activity, setActivity] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [races, setRaces] = useState([]);
  const [mentors, setMentors] = useState([]);
  const [error, setError] = useState(null);
  const [toast, notify] = useToast();

  const [mentorQuery, setMentorQuery] = useState('');
  const [mentorOpen, setMentorOpen] = useState(false);
  const [nextAction, setNextAction] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [notes, setNotes] = useState('');
  const notesDebounced = useDebounced(notes, 900);
  const notesLoaded = useRef(false);
  const [noteBody, setNoteBody] = useState('');
  const [noteKind, setNoteKind] = useState('note');
  const [referOpen, setReferOpen] = useState(false);
  const [referBusy, setReferBusy] = useState(false);

  const load = useCallback(async () => {
    const sb = supabase();
    const [a, act, ad, r, m] = await Promise.all([
      getApplication(sb, id), listActivity(sb, id), listActiveAdmins(sb), listRaces(sb), listMentorCandidates(sb),
    ]);
    if (a.error || !a.data) { setError(a.error ? `Could not load: ${a.error.message}` : 'Application not found.'); return; }
    setApp(a.data);
    setActivity(act.data || []);
    setAdmins(ad.data || []);
    setRaces(r.data || []);
    setMentors(m.data || []);
    setNextAction(a.data.next_action || '');
    setNextDate(a.data.next_action_date || '');
    if (!notesLoaded.current) { setNotes(a.data.internal_notes || ''); notesLoaded.current = true; }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const refreshActivity = useCallback(async () => {
    const { data } = await listActivity(supabase(), id);
    setActivity(data || []);
  }, [id]);

  /* Save a patch, then record what happened. Returns the fresh row. */
  async function save(patch, act) {
    const { data, error: err } = await updateApplication(supabase(), id, patch);
    if (err) { notify(`Could not save: ${err.message}`); return null; }
    setApp(data);
    if (act) {
      await insertActivity(supabase(), { applicationId: id, actorEmail: me?.email, ...act });
      refreshActivity();
    }
    return data;
  }

  // Internal notes autosave, after the first load has filled the box.
  useEffect(() => {
    if (!app || !notesLoaded.current || !canWrite) return;
    if ((app.internal_notes || '') === notesDebounced) return;
    updateApplication(supabase(), id, { internal_notes: notesDebounced || null }).then(({ error: err }) => {
      if (err) notify(`Notes not saved: ${err.message}`);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notesDebounced]);

  async function changeStatus(next) {
    if (!app || next === app.status) return;
    const prev = app.status;
    const data = await save({ status: next }, { kind: 'status_change', body: `Status changed from ${STATUS_LABEL[prev]} to ${STATUS_LABEL[next]}` });
    if (data) notify(`Status: ${STATUS_LABEL[next]}`);
  }

  async function assign(userId) {
    const who = admins.find((u) => u.id === userId);
    const data = await save({ assigned_to: userId || null }, {
      kind: 'assignment',
      body: userId ? `Assigned to ${who?.full_name || who?.email}` : 'Unassigned',
    });
    if (data) notify(userId ? `Assigned to ${who?.full_name || who?.email}` : 'Unassigned');
  }

  async function matchMentor(person) {
    const data = await save(
      { mentor_network_contact_id: person.networkContactId || null, mentor_name: person.name },
      { kind: 'mentor_match', body: `Matched with mentor ${person.name}${person.detail ? ` (${person.detail})` : ''}` },
    );
    if (data) { notify(`Mentor: ${person.name}`); setMentorQuery(''); setMentorOpen(false); }
  }
  async function clearMentor() {
    const data = await save({ mentor_network_contact_id: null, mentor_name: null }, { kind: 'mentor_match', body: 'Mentor match cleared' });
    if (data) notify('Mentor cleared');
  }

  async function setRace(raceId) {
    const race = races.find((r) => r.id === raceId) || null;
    const patch = { target_race_id: raceId || null };
    if (race) {
      patch.cycle_id = race.cycle_id || app.cycle_id;
      patch.race_other = null;
    }
    const data = await save(patch, { kind: 'note', body: race ? `Target race set to ${race.jurisdiction}: ${race.office}` : 'Target race cleared' });
    if (data) notify(race ? 'Race updated' : 'Race cleared');
  }

  async function saveNext() {
    const data = await save({ next_action: nextAction.trim() || null, next_action_date: nextDate || null }, null);
    if (data) notify('Next action saved');
  }

  async function setPriority(p) {
    const data = await save({ priority: p || null }, null);
    if (data) notify(`Priority: ${p || 'normal'}`);
  }

  async function addNote(e) {
    e.preventDefault();
    if (!noteBody.trim()) return;
    const { error: err } = await insertActivity(supabase(), { applicationId: id, kind: noteKind, body: noteBody.trim(), actorEmail: me?.email });
    if (err) { notify(`Could not add: ${err.message}`); return; }
    setNoteBody('');
    refreshActivity();
  }

  async function refer() {
    setReferBusy(true);
    try {
      const { data: { session } } = await supabase().auth.getSession();
      const res = await fetch('/api/admin-candidate-refer', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ application_id: id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.message || body.error || `status ${res.status}`);
      notify('Referred to the endorsement process');
      setReferOpen(false);
      await load();
    } catch (err) {
      notify(`Could not refer: ${err.message}`);
    } finally {
      setReferBusy(false);
    }
  }

  const mentorMatches = useMemo(() => {
    const term = mentorQuery.trim().toLowerCase();
    if (!term) return mentors.slice(0, 8);
    return mentors.filter((m) => [m.name, m.detail, m.place].some((v) => String(v || '').toLowerCase().includes(term))).slice(0, 8);
  }, [mentors, mentorQuery]);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!app) return <Gate loading={authLoading} allowed={can('candidates', 'read')}><div className="card">Loading</div></Gate>;

  const race = app.target_race;
  const prevRaces = Array.isArray(app.previous_races) ? app.previous_races : [];

  return (
    <Gate loading={authLoading} allowed={can('candidates', 'read')}>
      <div className="page-head">
        <a href="/admin/candidate" className="small muted" style={{ textDecoration: 'none' }}>&larr; Candidates</a>
        <h2 style={{ marginTop: 4 }}>
          {fullName(app)}
          {app.pronouns && <span className="muted" style={{ fontWeight: 400, fontSize: '.9rem' }}> {app.pronouns}</span>}
        </h2>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
          <StatusPill status={app.status} />
          {app.priority && app.priority !== 'normal' && <span className="badge badge-review">{app.priority}</span>}
          <a className="chip" href={`mailto:${app.email}`}>{app.email}</a>
          {app.phone && <a className="chip" href={`tel:${app.phone}`}>{app.phone.replace(/^(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3')}</a>}
          <span className="muted small">Submitted {stamp(app.created_at)}</span>
        </div>
      </div>

      <div className="cand-detail">
        <div className="cand-detail-main">
          <Block title="Step 1: Info">
            <Row label="Name">{fullName(app)}</Row>
            <Row label="Pronouns">{app.pronouns}</Row>
            <Row label="Email">{app.email}</Row>
            <Row label="Phone">{app.phone}</Row>
            <Row label="City">{app.city}</Row>
            <Row label="County">{app.county}</Row>
            <Row label="ZIP">{app.zip}</Row>
            <Row label="Identifies as LGBTQ+">{IS_OUT_LABEL[app.is_out] || 'Not answered'}</Row>
            <Row label="Party">{app.party}</Row>
          </Block>

          <Block title="Step 2: The race">
            <Row label="Race">
              {applicationRaceLabel(app)}
              {race && <span className="muted small"> · {TIER_LABEL[race.tier]} · {race.region} · {filingLine(race)}</span>}
              {race && <> · <a href={`/2027/races?q=${encodeURIComponent(race.jurisdiction)}`} target="_blank" rel="noreferrer">View on site</a></>}
            </Row>
            {!race && <Row label="As written">{app.race_other}</Row>}
            <Row label="Race type">{RACE_LEVEL_LABEL[app.race_level] || app.race_level}</Row>
            <Row label="Ballot path">{BALLOT_PATH_LABEL[app.ballot_path] || app.ballot_path}</Row>
            <Row label="Election">{app.cycle?.label}</Row>
            <Row label="Already filed">{app.has_filed == null ? 'Not sure' : app.has_filed ? 'Yes' : 'No'}</Row>
          </Block>

          <Block title="Step 3: Experience">
            <Row label="Offices held">{app.previous_offices || 'None given'}</Row>
            <Row label="Races run">
              {prevRaces.length ? (
                <table className="cand-table">
                  <thead><tr><th>Office</th><th>Year</th><th>Result</th><th>Share</th><th>Notes</th></tr></thead>
                  <tbody>
                    {prevRaces.map((r, i) => (
                      <tr key={i}>
                        <td>{r.office}</td><td>{r.year || ''}</td><td>{RACE_RESULT_LABEL[r.result] || r.result || ''}</td>
                        <td>{r.vote_share != null && r.vote_share !== '' ? `${r.vote_share}%` : ''}</td><td>{r.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : 'Has never run before'}
            </Row>
            <Row label="Petition experience">{SIGNATURE_LABEL[app.signature_experience] || app.signature_experience}</Row>
            <Row label="Petition note">{app.signature_experience_note}</Row>
          </Block>

          <Block title="Step 4: What they need">
            <Row label="Help needed">
              <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                {(app.help_needed || []).map((k) => <span key={k} className="badge badge-muted">{HELP_LABEL[k] || k}</span>)}
              </span>
            </Row>
            <Row label="Something else">{app.help_other}</Row>
            <Row label="Why running">{app.why_running}</Row>
            <Row label="Anything else">{app.anything_else}</Row>
          </Block>

          <Block title="Step 5: Consent">
            <Row label="Contact">{app.consent_contact ? 'May be contacted by email, text, or phone' : 'No'}</Row>
            <Row label="Mentor sharing">{app.consent_share_with_mentors ? 'May be shared with board members and mentors' : 'Do not share with mentors'}</Row>
            <Row label="Source">{app.source}</Row>
          </Block>

          <Block title="Activity">
            {canWrite && (
              <form onSubmit={addNote} style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <select className="input" style={{ width: 'auto' }} value={noteKind} onChange={(e) => setNoteKind(e.target.value)} aria-label="Kind">
                    {MANUAL_ACTIVITY_KINDS.map((k) => <option key={k} value={k}>{ACTIVITY_KIND_LABEL[k]}</option>)}
                  </select>
                  <input className="input" placeholder="Add a note" value={noteBody} onChange={(e) => setNoteBody(e.target.value)} aria-label="Note" />
                  <button className="btn btn-primary" disabled={!noteBody.trim()}>Add</button>
                </div>
              </form>
            )}
            {!activity.length ? <div className="muted small">Nothing yet.</div> : activity.map((a, i) => (
              <div key={a.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 10, padding: '7px 0', borderBottom: i < activity.length - 1 ? '1px solid var(--op-line)' : 'none', fontSize: '.88rem' }}>
                <span className="badge badge-muted" style={{ alignSelf: 'start' }}>{ACTIVITY_KIND_LABEL[a.kind] || a.kind}</span>
                <span>
                  <span style={{ whiteSpace: 'pre-wrap' }}>{a.body}</span>
                  <span className="muted small" style={{ display: 'block' }}>{stamp(a.created_at)}{a.actor_email ? ` · ${a.actor_email}` : ''}</span>
                </span>
              </div>
            ))}
          </Block>
        </div>

        <aside className="cand-detail-side">
          <div className="card" style={{ display: 'grid', gap: 10 }}>
            <label className="field">
              <span>Status</span>
              <select className="input" value={app.status} disabled={!canWrite} onChange={(e) => changeStatus(e.target.value)}>
                {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Priority</span>
              <select className="input" value={app.priority || 'normal'} disabled={!canWrite} onChange={(e) => setPriority(e.target.value)}>
                {PRIORITY_ORDER.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Assigned to</span>
              <select className="input" value={app.assigned_to || ''} disabled={!canWrite} onChange={(e) => assign(e.target.value)}>
                <option value="">Unassigned</option>
                {admins.map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
              </select>
            </label>

            <div className="field">
              <span>Mentor</span>
              {app.mentor_name ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '.9rem' }}>{app.mentor_name}</strong>
                  {!app.mentor_network_contact_id && <span className="badge badge-muted">Not in CRM</span>}
                  {canWrite && <button type="button" className="btn btn-sm" onClick={clearMentor}>Change</button>}
                </div>
              ) : canWrite ? (
                <div style={{ position: 'relative' }}>
                  <input className="input" placeholder="Search serving and former officials" value={mentorQuery}
                         onFocus={() => setMentorOpen(true)} onChange={(e) => { setMentorQuery(e.target.value); setMentorOpen(true); }}
                         aria-label="Mentor search" />
                  {mentorOpen && (
                    <div className="card" style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, top: '100%', marginTop: 4, padding: 6, maxHeight: 260, overflowY: 'auto', boxShadow: '0 8px 24px rgba(15,34,51,.18)' }}>
                      {mentorMatches.map((m) => (
                        <button key={m.key} type="button" className="btn" style={{ width: '100%', justifyContent: 'flex-start', border: 0, minHeight: 40, textAlign: 'left' }} onClick={() => matchMentor(m)}>
                          <span>
                            <span style={{ display: 'block', fontSize: '.88rem' }}>{m.name}</span>
                            <span className="muted small">{[m.detail, m.place].filter(Boolean).join(' · ')}</span>
                          </span>
                        </button>
                      ))}
                      {mentorQuery.trim() && (
                        <button type="button" className="btn" style={{ width: '100%', justifyContent: 'flex-start', border: 0, minHeight: 40, textAlign: 'left' }}
                                onClick={() => matchMentor({ networkContactId: null, name: mentorQuery.trim(), detail: 'not yet in the CRM' })}>
                          Use &ldquo;{mentorQuery.trim()}&rdquo; as a freeform mentor name
                        </button>
                      )}
                      {!mentorMatches.length && !mentorQuery.trim() && <div className="muted small" style={{ padding: 8 }}>Type a name.</div>}
                      <button type="button" className="btn btn-sm" style={{ marginTop: 4 }} onClick={() => setMentorOpen(false)}>Close</button>
                    </div>
                  )}
                </div>
              ) : <span className="muted small">None</span>}
            </div>

            <label className="field">
              <span>Target race</span>
              <select className="input" value={app.target_race_id || ''} disabled={!canWrite} onChange={(e) => setRace(e.target.value)}>
                <option value="">Not on the list</option>
                {races.map((r) => <option key={r.id} value={r.id}>#{r.rank} {r.jurisdiction}: {r.office}</option>)}
              </select>
              {race && <a className="small" href={`/2027/races?q=${encodeURIComponent(race.jurisdiction)}`} target="_blank" rel="noreferrer">Open on /2027/races</a>}
            </label>

            <div className="field">
              <span>Next action</span>
              <input className="input" value={nextAction} disabled={!canWrite} onChange={(e) => setNextAction(e.target.value)} placeholder="Call to walk through petitions" />
              <input className="input" type="date" value={nextDate} disabled={!canWrite} onChange={(e) => setNextDate(e.target.value)} aria-label="Next action date" />
              {canWrite && <button type="button" className="btn btn-sm" onClick={saveNext}>Save next action</button>}
            </div>

            <div className="field">
              <span>Endorsement</span>
              {app.endorsement_application_id ? (
                <a className="btn btn-sm" href={`/admin/endorsements/${app.endorsement_application_id}`}>Open endorsement application</a>
              ) : canWrite ? (
                <button type="button" className="btn btn-accent" onClick={() => setReferOpen(true)}>Refer to endorsement process</button>
              ) : <span className="muted small">Not referred</span>}
            </div>

            <label className="field">
              <span>Internal notes {canWrite && <span className="muted" style={{ textTransform: 'none', fontWeight: 400 }}>(saves as you type)</span>}</span>
              <textarea className="textarea" value={notes} disabled={!canWrite} onChange={(e) => setNotes(e.target.value)} rows={5} />
            </label>

            <div className="muted small">
              {app.assignee ? `Owner: ${app.assignee.full_name || app.assignee.email}. ` : ''}
              Status since {shortDate(app.status_changed_at) || when(app.created_at)}.
            </div>
          </div>
        </aside>
      </div>

      {referOpen && (
        <>
          <div className="drawer-scrim" onClick={() => !referBusy && setReferOpen(false)} />
          <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="refer-title">
            <div className="drawer-head">
              <h3 id="refer-title">Refer to the endorsement process?</h3>
              <button className="btn btn-sm" onClick={() => setReferOpen(false)} disabled={referBusy}>Close</button>
            </div>
            <p className="small">
              This creates an endorsement application for {fullName(app)} prefilled from this form and places it in the
              Screening Committee queue, unpublished. Endorsement is a separate review by the Screening Committee and
              a Board vote; referring someone does not endorse them, and the candidate still has to complete the
              questionnaire and attestation.
            </p>
            <p className="small muted">This application moves to Referred to endorsement and a referral is recorded in the activity log.</p>
            <div className="page-actions">
              <button className="btn btn-primary" onClick={refer} disabled={referBusy}>{referBusy ? 'Referring' : 'Refer'}</button>
              <button className="btn" onClick={() => setReferOpen(false)} disabled={referBusy}>Cancel</button>
            </div>
          </div>
        </>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </Gate>
  );
}
