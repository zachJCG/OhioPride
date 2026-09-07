'use client';
// Candidate page: summary header, big thumb-reach vote bar, path-aware Q&A
// (responses jsonb against endorsement_questions, legacy q1..q10 fallback),
// board reviews, assignments, director controls, and the activity trail.
// Copy stays descriptive throughout (board firewall policy): this is a
// deliberation record about a candidate, never advocacy for one.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { useAdmin } from '../../../lib/permissions';
import { exportPdf } from '../pdf-client';
import { answersFor } from '../../../../../lib/endorsement-answers.mjs';
import { slugify } from '../../../../../lib/endorsement-slug.mjs';
import {
  raceLabel, countyLabel, cycleYearOf, isFutureCycle, daysInStage, submittedByLabel, SUBMITTED_BY_LABEL,
} from '../../../../../lib/endorsement-race.mjs';
import { STATUS_LABEL, PATH_LABEL, VOTE_ORDER, VOTE_LABEL, PHOTO_BUCKET, tallyOf } from '../shared';

const yn = (v) => v === true ? 'Yes' : v === false ? 'No' : 'No answer';
const dt = (v) => v ? new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

// The facts a write user may correct in place. Everything the candidate
// answered stays as filed; these are the race and contact details that
// arrive mistyped ("82" for the district, the county in the district box).
const EDITABLE = [
  'office_sought', 'district', 'county', 'election_year', 'is_special_election', 'party',
  'pronouns', 'website', 'email', 'phone',
  'submitted_by_kind', 'submitted_by_name', 'submitted_by_role', 'submitted_by_email',
];

const CARD_TITLE = { font: '700 .95rem var(--op-font-head)' };
const LBL = { fontSize: '.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--op-muted)' };

export default function CandidatePage() {
  const { id } = useParams();
  const { loading: authLoading, me, can } = useAdmin();
  const canWrite = can('endorsements', 'write');

  const [app, setApp] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [activity, setActivity] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [counties, setCounties] = useState([]);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [recommendation, setRecommendation] = useState('');
  const [notes, setNotes] = useState('');
  const [busyVote, setBusyVote] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState(null);

  const notify = (m) => { setToast(m); setTimeout(() => setToast(null), 3200); };

  async function loadDrawerData() {
    const sb = supabase();
    const [r, asg, act] = await Promise.all([
      sb.from('endorsement_reviews').select('*').eq('application_id', id).order('created_at'),
      sb.from('endorsement_assignments').select('*').eq('application_id', id).order('assigned_at'),
      sb.from('endorsement_activity').select('*').eq('application_id', id).order('created_at', { ascending: false }).limit(40),
    ]);
    setReviews(r.data || []);
    setAssignments(asg.data || []);
    setActivity(act.data || []);
    return r.data || [];
  }

  useEffect(() => {
    const sb = supabase();
    (async () => {
      const [a, qs, ad, co] = await Promise.all([
        sb.from('endorsement_applications').select('*').eq('id', id).maybeSingle(),
        sb.from('endorsement_questions').select('question_key, prompt, response_type, path, sort_order, has_explanation, active'),
        sb.from('admin_users').select('id, email, full_name').eq('is_active', true).order('full_name'),
        sb.from('ohio_counties').select('name').order('sort_order'),
      ]);
      if (!a.data) { setNotFound(true); return; }
      setApp(a.data);
      setNotes(a.data.reviewer_notes || '');
      setQuestions(qs.data || []);
      setAdmins(ad.data || []);
      setCounties((co.data || []).map(c => c.name));
      await loadDrawerData();
    })();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The bucket is private: the preview is a short-lived signed URL, minted
  // again whenever the path changes (upload, replace, remove).
  useEffect(() => {
    let cancelled = false;
    if (!app?.photo_path) { setPhotoUrl(null); return; }
    supabase().storage.from(PHOTO_BUCKET).createSignedUrl(app.photo_path, 3600).then(({ data }) => {
      if (!cancelled) setPhotoUrl(data?.signedUrl || null);
    });
    return () => { cancelled = true; };
  }, [app?.photo_path]);

  // Seed the recommendation box from the caller's existing vote once both the
  // reviews and the caller's identity have resolved; never clobber typing.
  const seededRec = useRef(false);
  useEffect(() => {
    if (seededRec.current || !me || !reviews.length) return;
    const mine = reviews.find(r => String(r.reviewer_email || '').toLowerCase() === me.email.toLowerCase());
    if (mine?.recommendation) { setRecommendation(mine.recommendation); seededRec.current = true; }
  }, [me, reviews]);

  // Shared with /api/endorsement-pdf so the packet the board signs off on and
  // the screen they voted from can never show different answers.
  const qa = useMemo(() => answersFor(app, questions), [app, questions]);

  const myEmail = (me?.email || '').toLowerCase();
  const myReview = reviews.find(r => String(r.reviewer_email || '').toLowerCase() === myEmail);
  const tally = tallyOf(reviews);

  async function logActivity(event_type, summary, detail) {
    await supabase().from('endorsement_activity').insert({
      application_id: id,
      actor_email: me?.email || null,
      actor_name: me?.full_name || null,
      event_type, summary, detail: detail || {},
    });
  }

  async function castVote(vote) {
    if (!me) return;
    setBusyVote(vote);
    const row = {
      application_id: id,
      reviewer_user_id: me.id,
      reviewer_email: me.email,
      reviewer_name: me.full_name || me.email,
      vote,
      recommendation: recommendation.trim() || null,
    };
    const { error } = await supabase().from('endorsement_reviews')
      .upsert(row, { onConflict: 'application_id,reviewer_email' });
    setBusyVote(null);
    if (error) { notify('Vote failed: ' + error.message); return; }
    await logActivity('vote', `${me.full_name || me.email} voted ${VOTE_LABEL[vote]}`);
    await loadDrawerData();
    notify('Vote recorded: ' + VOTE_LABEL[vote]);
  }

  async function setStatus(status, { confirm: confirmText } = {}) {
    if (confirmText && !window.confirm(confirmText)) return;
    const patch = { status };
    if (status === 'endorsed' || status === 'declined') {
      patch.reviewed_by = me?.email || null;
      patch.reviewed_at = new Date().toISOString();
    }
    // Select the row back rather than merging the patch locally: endorsed_at
    // and status_changed_at are stamped by database triggers on the status
    // change, so the values the page should show do not exist until the write
    // lands.
    const { data, error } = await supabase().from('endorsement_applications')
      .update(patch).eq('id', id).select().maybeSingle();
    if (error) { notify('Status change failed: ' + error.message); return; }
    await logActivity('status_change', `Status set to ${STATUS_LABEL[status] || status}`);
    setApp(a => data || { ...a, ...patch });
    await loadDrawerData();
    notify(status === 'endorsed' ? 'Recorded as endorsed.'
         : status === 'declined' ? 'Recorded as declined.'
         : 'Status updated.');
  }

  async function togglePublished() {
    const next = !app.is_published;
    const { error } = await supabase().from('endorsement_applications').update({ is_published: next }).eq('id', id);
    if (error) { notify('Update failed: ' + error.message); return; }
    setApp(a => ({ ...a, is_published: next }));
  }

  async function saveNotes() {
    const { error } = await supabase().from('endorsement_applications').update({ reviewer_notes: notes.trim() || null }).eq('id', id);
    if (error) { notify('Save failed: ' + error.message); return; }
    notify('Notes saved.');
  }

  /* ── Details editor ─────────────────────────────────────────────────── */
  function startEditing() {
    const d = {};
    for (const k of EDITABLE) d[k] = app[k] == null ? '' : app[k];
    d.is_special_election = !!app.is_special_election;
    d.submitted_by_kind = app.submitted_by_kind || 'candidate';
    setDraft(d);
    setEditing(true);
  }

  async function saveDetails(e) {
    e.preventDefault();
    setSaving(true);
    const patch = {};
    const changed = [];
    for (const k of EDITABLE) {
      let v = draft[k];
      if (k === 'is_special_election') v = !!v;
      else if (k === 'election_year') v = v === '' || v == null ? null : Number(v);
      else v = typeof v === 'string' ? (v.trim() || null) : v;
      if (k === 'submitted_by_kind' && !v) v = 'candidate';
      const before = app[k] == null ? null : app[k];
      if (v !== before && !(k === 'is_special_election' && !!v === !!before)) {
        patch[k] = v;
        changed.push(k);
      }
    }
    if (!changed.length) { setSaving(false); setEditing(false); return; }
    if (patch.office_sought === null) { setSaving(false); notify('Office sought cannot be blank.'); return; }
    if (patch.email === null) { setSaving(false); notify('Email cannot be blank.'); return; }
    const { data, error } = await supabase().from('endorsement_applications')
      .update(patch).eq('id', id).select().maybeSingle();
    setSaving(false);
    if (error) { notify('Save failed: ' + error.message); return; }
    await logActivity('edit', `Details updated: ${changed.map(k => k.replace(/_/g, ' ')).join(', ')}`, { fields: changed });
    setApp(a => data || { ...a, ...patch });
    await loadDrawerData();
    setEditing(false);
    notify('Details saved.');
  }

  /* ── Photo ──────────────────────────────────────────────────────────── */
  async function uploadPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\//.test(file.type)) { notify('Choose an image file.'); return; }
    if (file.size > 8 * 1024 * 1024) { notify('That photo is over 8 MB. Resize it first.'); return; }
    setPhotoBusy(true);
    const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || 'jpg').toLowerCase();
    const path = `staff/${id}/${Date.now()}.${ext}`;
    const sb = supabase();
    const up = await sb.storage.from(PHOTO_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (up.error) { setPhotoBusy(false); notify('Upload failed: ' + up.error.message); return; }
    const old = app.photo_path;
    const { error } = await sb.from('endorsement_applications').update({ photo_path: path }).eq('id', id);
    if (error) { setPhotoBusy(false); notify('Upload saved but the record did not update: ' + error.message); return; }
    if (old) await sb.storage.from(PHOTO_BUCKET).remove([old]);
    await logActivity('photo', old ? 'Photo replaced' : 'Photo added', { path });
    setApp(a => ({ ...a, photo_path: path }));
    await loadDrawerData();
    setPhotoBusy(false);
    notify(old ? 'Photo replaced.' : 'Photo added.');
  }

  async function removePhoto() {
    if (!window.confirm('Remove this photo from the application? The file is deleted.')) return;
    setPhotoBusy(true);
    const sb = supabase();
    const old = app.photo_path;
    const { error } = await sb.from('endorsement_applications').update({ photo_path: null }).eq('id', id);
    if (error) { setPhotoBusy(false); notify('Remove failed: ' + error.message); return; }
    await sb.storage.from(PHOTO_BUCKET).remove([old]);
    await logActivity('photo', 'Photo removed', { path: old });
    setApp(a => ({ ...a, photo_path: null }));
    await loadDrawerData();
    setPhotoBusy(false);
    notify('Photo removed.');
  }

  async function addAssignment(e) {
    e.preventDefault();
    const userId = new FormData(e.target).get('assignee');
    const person = admins.find(a => a.id === userId);
    if (!person) return;
    const { error } = await supabase().from('endorsement_assignments').insert({
      application_id: id,
      assignee_user_id: person.id,
      assignee_email: person.email,
      assignee_name: person.full_name || person.email,
      role_label: String(new FormData(e.target).get('role') || '').trim() || null,
      assigned_by: me?.email || null,
    });
    if (error) { notify('Assignment failed: ' + error.message); return; }
    await logActivity('assignment', `${person.full_name || person.email} assigned`);
    await loadDrawerData();
  }

  async function removeAssignment(a) {
    const { error } = await supabase().from('endorsement_assignments').delete().eq('id', a.id);
    if (error) { notify('Remove failed: ' + error.message); return; }
    await logActivity('unassignment', `${a.assignee_name || a.assignee_email} unassigned`);
    await loadDrawerData();
  }

  async function doExport() {
    setExporting(true);
    const err = await exportPdf(`id=${encodeURIComponent(id)}`);
    setExporting(false);
    if (err) notify(err);
  }

  if (!authLoading && !can('endorsements', 'read')) {
    return <div className="alert alert-error">The endorsements module is limited by role.</div>;
  }
  if (notFound) return <div className="alert alert-error">Application not found. <a href="/admin/endorsements">Back to the queue</a>.</div>;
  if (!app) return <div className="card">Loading…</div>;

  const name = app.candidate_name || [app.first_name, app.last_name].filter(Boolean).join(' ');
  // "Open" means the Board has not recorded an outcome yet, so the decision
  // panel offers Endorse/Decline; the closed states offer Reopen instead.
  const open = app.status === 'submitted' || app.status === 'under_review';
  const publicSlug = slugify(name);
  const days = daysInStage(app);
  const nextCycle = isFutureCycle(app);
  const filedByOther = app.submitted_by_kind && app.submitted_by_kind !== 'candidate';

  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '2px 0 8px' }}>
        <a className="btn btn-sm" href="/admin/endorsements">← Queue</a>
        <span style={{ flex: 1 }} />
        <button className="btn btn-sm" disabled={exporting} onClick={doExport}>{exporting ? 'Building…' : 'Export PDF'}</button>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover', flex: 'none', border: '1px solid var(--op-line)' }} />
          )}
          <div style={{ minWidth: 0 }}>
            <h2 style={{ font: '800 1.3rem var(--op-font-head)', margin: 0, color: 'var(--op-navy)' }}>
              {name}{app.pronouns ? <span className="muted" style={{ fontSize: '.9rem', fontWeight: 400 }}> · {app.pronouns}</span> : null}
            </h2>
            <div className="muted" style={{ margin: '2px 0 8px' }}>
              {raceLabel(app, ' · ', { includeParty: true })}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span className="badge badge-muted">{STATUS_LABEL[app.status] || app.status}</span>
          {nextCycle && <span className="badge badge-founding">{cycleYearOf(app)} cycle</span>}
          {app.endorsement_path && <span className="badge badge-muted">{PATH_LABEL[app.endorsement_path] || app.endorsement_path}</span>}
          <span className="badge badge-muted">{app.is_incumbent ? 'Incumbent' : 'Challenger/open'}</span>
          {app.is_out === 'yes' && <span className="badge badge-founding">Out</span>}
          {app.is_special_election && <span className="badge badge-muted">Special election</span>}
          {filedByOther && <span className="badge badge-muted">{app.submitted_by_kind === 'pac_staff' ? 'Filed by PAC staff' : 'Filed by campaign'}</span>}
          {app.status === 'endorsed' && (
            <span className={`badge ${app.is_published ? 'badge-ok' : 'badge-review'}`}>
              {app.is_published ? 'Published on site' : 'Not published'}
            </span>
          )}
        </div>
        <div className="muted small" style={{ marginTop: 6 }}>
          Submitted {dt(app.created_at)}
          {days != null && ` · in ${(STATUS_LABEL[app.status] || app.status).toLowerCase()} ${days === 0 ? 'since today' : days === 1 ? 'for 1 day' : `for ${days} days`}${app.status_changed_at ? ` (since ${dt(app.status_changed_at)})` : ''}`}
          {app.reviewed_at ? ` · decided ${dt(app.reviewed_at)}` : ''}
          {app.endorsed_at ? ` · endorsement dated ${dt(app.endorsed_at)}` : ''}
        </div>
        {nextCycle && (
          <p className="small muted" style={{ margin: '6px 0 0' }}>
            Running in {cycleYearOf(app)}. This application sits under <strong>Next cycle</strong> in the queue and moves into the main queue on its own after this November&apos;s election.
          </p>
        )}
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <strong style={CARD_TITLE}>Your vote</strong>
        {myReview && <span className="badge badge-ok" style={{ marginLeft: 8 }}>Recorded: {VOTE_LABEL[myReview.vote]}</span>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, margin: '10px 0' }}>
          {VOTE_ORDER.map(v => (
            <button key={v}
              className={`btn ${myReview?.vote === v ? 'btn-primary' : ''}`}
              // Three across still clears the 44px tap target; the narrower
              // padding keeps "Abstain" from clipping on a small phone.
              style={{ padding: '0 6px' }}
              aria-pressed={myReview?.vote === v}
              disabled={busyVote != null}
              onClick={() => castVote(v)}>
              {busyVote === v ? 'Saving…' : VOTE_LABEL[v]}
            </button>
          ))}
        </div>
        <label className="field"><span>Recommendation (optional, saved with your vote)</span>
          <input className="input" value={recommendation} onChange={e => setRecommendation(e.target.value)}
                 placeholder="One line of context for the board" />
        </label>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <strong style={CARD_TITLE}>Board review</strong>
        <div style={{ display: 'flex', gap: 10, margin: '8px 0' }}>
          {[['Endorse', tally.endorse], ['Decline', tally.decline], ['Abstain', tally.abstain]].map(([l, n]) => (
            <div key={l} className="kpi" style={{ flex: 1, textAlign: 'center', padding: '8px 6px' }}>
              <div className="num">{n}</div><div className="lbl">{l}</div>
            </div>
          ))}
        </div>
        {reviews.length ? reviews.map(r => (
          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--op-line)', fontSize: '.9rem' }}>
            <span>{r.reviewer_name || r.reviewer_email}{r.recommendation ? <span className="muted small" style={{ display: 'block' }}>{r.recommendation}</span> : null}</span>
            <strong>{VOTE_LABEL[r.vote] || r.vote}</strong>
          </div>
        )) : <div className="muted small">No votes recorded yet.</div>}
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong style={CARD_TITLE}>Candidate details</strong>
          <span style={{ flex: 1 }} />
          {canWrite && !editing && <button className="btn btn-sm" onClick={startEditing}>Edit details</button>}
        </div>

        {editing ? (
          <form onSubmit={saveDetails} style={{ marginTop: 10 }}>
            <p className="muted small" style={{ margin: '0 0 10px' }}>
              Corrects the race and contact facts on the record. The candidate&apos;s answers are never edited here.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0 12px' }}>
              <label className="field"><span>Office sought</span>
                <input className="input" value={draft.office_sought} onChange={e => setDraft(d => ({ ...d, office_sought: e.target.value }))} required />
              </label>
              <label className="field"><span>District</span>
                <input className="input" value={draft.district} onChange={e => setDraft(d => ({ ...d, district: e.target.value }))} placeholder="e.g., 28 or Ward 3" />
              </label>
              <label className="field"><span>County</span>
                <select className="select" value={draft.county} onChange={e => setDraft(d => ({ ...d, county: e.target.value }))}>
                  <option value="">Not recorded</option>
                  {counties.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="field"><span>Election year</span>
                <input className="input" type="number" min="2024" max="2040" value={draft.election_year}
                       onChange={e => setDraft(d => ({ ...d, election_year: e.target.value }))} />
              </label>
              <label className="field"><span>Party</span>
                <input className="input" value={draft.party} onChange={e => setDraft(d => ({ ...d, party: e.target.value }))} />
              </label>
              <label className="field"><span>Pronouns</span>
                <input className="input" value={draft.pronouns} onChange={e => setDraft(d => ({ ...d, pronouns: e.target.value }))} />
              </label>
              <label className="field"><span>Email</span>
                <input className="input" type="email" value={draft.email} onChange={e => setDraft(d => ({ ...d, email: e.target.value }))} required />
              </label>
              <label className="field"><span>Phone</span>
                <input className="input" value={draft.phone} onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))} />
              </label>
              <label className="field"><span>Website</span>
                <input className="input" value={draft.website} onChange={e => setDraft(d => ({ ...d, website: e.target.value }))} />
              </label>
            </div>
            <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '2px 0 12px' }}>
              <input type="checkbox" checked={!!draft.is_special_election} onChange={e => setDraft(d => ({ ...d, is_special_election: e.target.checked }))} />
              Special election
            </label>

            <div style={{ ...LBL, marginBottom: 6 }}>Who filled the application in</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0 12px' }}>
              <label className="field"><span>Submitted by</span>
                <select className="select" value={draft.submitted_by_kind} onChange={e => setDraft(d => ({ ...d, submitted_by_kind: e.target.value }))}>
                  {Object.entries(SUBMITTED_BY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
              {draft.submitted_by_kind !== 'candidate' && (<>
                <label className="field"><span>Their name</span>
                  <input className="input" value={draft.submitted_by_name} onChange={e => setDraft(d => ({ ...d, submitted_by_name: e.target.value }))} />
                </label>
                <label className="field"><span>Their role</span>
                  <input className="input" value={draft.submitted_by_role} onChange={e => setDraft(d => ({ ...d, submitted_by_role: e.target.value }))} placeholder="e.g., Campaign manager" />
                </label>
                <label className="field"><span>Their email</span>
                  <input className="input" type="email" value={draft.submitted_by_email} onChange={e => setDraft(d => ({ ...d, submitted_by_email: e.target.value }))} />
                </label>
              </>)}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Saving…' : 'Save details'}</button>
              <button type="button" className="btn btn-sm" disabled={saving} onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </form>
        ) : (
          <div className="detail-grid" style={{ marginTop: 8 }}>
            {[['Office', app.office_sought], ['District', app.district], ['County', countyLabel(app.county)],
              ['Election', app.is_special_election ? `${app.election_year || ''} special election`.trim() : app.election_year],
              ['Party', app.party], ['Current office', app.current_office], ['Office category', app.office_category],
              ['Committee', app.committee_name], ['Treasurer', app.treasurer_name],
              ['Email', app.email], ['Phone', app.phone], ['Website', app.website],
              ['Submitted by', submittedByLabel(app)],
              ['Submitter email', filedByOther ? app.submitted_by_email : null]]
              .filter(([, v]) => v)
              .map(([l, v]) => <div key={l}><div className="lbl">{l}</div><div className="val">{String(v)}</div></div>)}
          </div>
        )}

        {!editing && !app.county && (app.endorsement_path === 'judicial' || app.endorsement_path === 'local') && (
          <p className="small" style={{ margin: '4px 0 0', color: 'var(--op-warn)' }}>
            No county on file for a {app.endorsement_path} race.{canWrite ? ' Use Edit details to add it.' : ''}
          </p>
        )}

        {app.bio && <><div style={{ ...LBL, marginTop: 8 }}>Bio</div><p style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{app.bio}</p></>}
        {app.conflicts_disclosure && <><div style={LBL}>Disclosures</div><p style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{app.conflicts_disclosure}</p></>}
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <strong style={CARD_TITLE}>Photo</strong>
        <p className="muted small" style={{ margin: '4px 0 8px' }}>
          {app.photo_path
            ? `${app.photo_path.startsWith('staff/') ? 'Uploaded by staff' : 'Submitted with the application'}. The public page still uses the photo in lib/endorsement-content.mjs; download this one to prepare it.`
            : 'No photo was submitted. A write user can add one here.'}
        </p>
        {photoUrl && (
          <a href={photoUrl} target="_blank" rel="noopener" style={{ display: 'inline-block', marginBottom: 8 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl} alt={`Photo submitted for ${name}`} style={{ maxWidth: 240, maxHeight: 240, borderRadius: 12, border: '1px solid var(--op-line)', display: 'block' }} />
          </a>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {photoUrl && <a className="btn btn-sm" href={photoUrl} target="_blank" rel="noopener" download>Download</a>}
          {canWrite && (
            <label className={`btn btn-sm ${photoBusy ? 'disabled' : ''}`} style={{ cursor: 'pointer' }}>
              {photoBusy ? 'Working…' : app.photo_path ? 'Replace' : 'Upload a photo'}
              <input type="file" accept="image/*" onChange={uploadPhoto} disabled={photoBusy} style={{ display: 'none' }} />
            </label>
          )}
          {canWrite && app.photo_path && <button className="btn btn-sm btn-danger" disabled={photoBusy} onClick={removePhoto}>Remove</button>}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <strong style={CARD_TITLE}>Questionnaire</strong>
        {qa.length ? qa.map(x => (
          <div key={x.key} style={{ padding: '8px 0', borderBottom: '1px solid var(--op-line)' }}>
            <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{x.prompt}</div>
            {x.isBool && (
              <span className={`badge ${x.boolValue === true ? 'badge-ok' : x.boolValue === false ? 'badge-bad' : 'badge-muted'}`} style={{ marginTop: 4 }}>
                {yn(x.boolValue)}
              </span>
            )}
            {!x.isBool && x.value && <div style={{ marginTop: 2 }}>{x.value}</div>}
            {x.explanation && <p className="small" style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{x.explanation}</p>}
          </div>
        )) : <div className="muted small" style={{ marginTop: 6 }}>No questionnaire responses on file.</div>}
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <strong style={CARD_TITLE}>Assignments</strong>
        {assignments.length ? assignments.map(a => (
          <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--op-line)', fontSize: '.9rem' }}>
            <span>{a.assignee_name || a.assignee_email}{a.role_label ? <span className="muted"> · {a.role_label}</span> : null}</span>
            {canWrite && <button className="btn btn-sm" onClick={() => removeAssignment(a)}>Remove</button>}
          </div>
        )) : <div className="muted small" style={{ margin: '6px 0' }}>Nobody assigned.</div>}
        {canWrite && (
          <form onSubmit={addAssignment} style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <select className="select" name="assignee" style={{ flex: 2, minWidth: 140 }} required defaultValue="">
              <option value="" disabled>Assign someone…</option>
              {admins.map(a => <option key={a.id} value={a.id}>{a.full_name || a.email}</option>)}
            </select>
            <input className="input" name="role" placeholder="Role (optional)" style={{ flex: 1, minWidth: 100 }} />
            <button className="btn btn-primary btn-sm" style={{ minHeight: 44 }}>Add</button>
          </form>
        )}
      </div>

      {canWrite && (
        <div className="card" style={{ marginBottom: 12 }}>
          <strong style={CARD_TITLE}>Record the decision</strong>

          {/* The status used to be a bare <select> of database values, which
              made "endorsed" one mis-tap away and said nothing about what the
              choice does. Each state now offers only the moves that make sense
              from it, and the two that publish or unpublish a candidate ask
              first. The states themselves are unchanged — see STATUS_ORDER in
              ../shared.js, which still mirrors the table's CHECK constraint. */}
          {open ? (
            <>
              <p className="muted small" style={{ margin: '6px 0 10px' }}>
                {tally.endorse + tally.decline + tally.abstain === 0
                  ? 'No votes recorded yet. Record the outcome once the Board has voted.'
                  : `Board so far: ${tally.endorse} endorse · ${tally.decline} decline${tally.abstain ? ` · ${tally.abstain} abstain` : ''}.`}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button className="btn btn-primary" onClick={() => setStatus('endorsed', {
                  confirm: `Record ${name} as ENDORSED?\n\nThis publishes them at ohiopride.org/endorsements and stamps today as the endorsement date.`,
                })}>Endorsed</button>
                <button className="btn" onClick={() => setStatus('declined', {
                  confirm: `Record ${name} as DECLINED?\n\nNothing is published. Remember to email the campaign.`,
                })}>Declined</button>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {app.status === 'submitted' && (
                  <button className="btn btn-sm" onClick={() => setStatus('under_review')}>Move to under review</button>
                )}
                <button className="btn btn-sm" onClick={() => setStatus('withdrawn', {
                  confirm: `Mark ${name} withdrawn? Use this when the campaign pulls out or the candidate leaves the race.`,
                })}>Candidate withdrew</button>
              </div>
            </>
          ) : (
            <>
              <p className="muted small" style={{ margin: '6px 0 10px' }}>
                Recorded as <strong>{STATUS_LABEL[app.status] || app.status}</strong>
                {app.reviewed_at ? ` on ${dt(app.reviewed_at)}` : ''}
                {app.reviewed_by ? ` by ${app.reviewed_by}` : ''}.
              </p>
              <button className="btn btn-sm" onClick={() => setStatus('under_review', {
                confirm: app.status === 'endorsed'
                  ? `Reopen ${name}?\n\nThis removes them from the public endorsements page and clears the endorsement date.`
                  : `Reopen ${name} for review?`,
              })}>Reopen for review</button>
            </>
          )}

          {app.status === 'endorsed' && (
            <div className={`alert ${app.is_published ? '' : 'alert-error'}`} style={{ marginTop: 12 }}>
              <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <input type="checkbox" checked={!!app.is_published} onChange={togglePublished} style={{ marginTop: 2 }} />
                <span>
                  <strong>Show on the public endorsements page.</strong>{' '}
                  {app.is_published
                    ? <>Live at <a href={`/endorsements/${publicSlug}`} target="_blank" rel="noopener">/endorsements/{publicSlug}</a>. Their photo and endorsement statement come from <code>lib/endorsement-content.mjs</code>; without an entry there they show an initial and their own bio.</>
                    : <>Endorsed but hidden from the public page. Untick until the announcement, then tick to publish.</>}
                </span>
              </label>
            </div>
          )}

          <label className="field" style={{ marginTop: 12 }}><span>Reviewer notes (internal, never public)</span>
            <textarea className="textarea" value={notes} onChange={e => setNotes(e.target.value)} />
          </label>
          <button className="btn btn-sm" onClick={saveNotes}>Save notes</button>
        </div>
      )}

      {activity.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <strong style={CARD_TITLE}>Activity</strong>
          {activity.map(a => (
            <div key={a.id} className="small" style={{ padding: '5px 0', borderBottom: '1px solid var(--op-line)' }}>
              <span className="muted">{dt(a.created_at)}</span> · {a.summary || a.event_type}
              {a.actor_name && a.event_type !== 'vote' ? <span className="muted"> · {a.actor_name}</span> : null}
            </div>
          ))}
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
