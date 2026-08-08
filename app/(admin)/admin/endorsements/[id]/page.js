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
import { STATUS_LABEL, PATH_LABEL, VOTE_ORDER, VOTE_LABEL, tallyOf } from '../shared';

const yn = (v) => v === true ? 'Yes' : v === false ? 'No' : 'No answer';
const dt = (v) => v ? new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

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
      const [a, qs, ad] = await Promise.all([
        sb.from('endorsement_applications').select('*').eq('id', id).maybeSingle(),
        sb.from('endorsement_questions').select('question_key, prompt, response_type, path, sort_order, has_explanation, active'),
        sb.from('admin_users').select('id, email, full_name').eq('is_active', true).order('full_name'),
      ]);
      if (!a.data) { setNotFound(true); return; }
      setApp(a.data);
      setNotes(a.data.reviewer_notes || '');
      setQuestions(qs.data || []);
      setAdmins(ad.data || []);
      await loadDrawerData();
    })();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // is stamped by a database trigger on the status change, so the value the
    // page should show does not exist until the write lands.
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

  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '2px 0 8px' }}>
        <a className="btn btn-sm" href="/admin/endorsements">← Queue</a>
        <span style={{ flex: 1 }} />
        <button className="btn btn-sm" disabled={exporting} onClick={doExport}>{exporting ? 'Building…' : 'Export PDF'}</button>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <h2 style={{ font: '800 1.3rem var(--op-font-head)', margin: 0, color: 'var(--op-navy)' }}>
          {name}{app.pronouns ? <span className="muted" style={{ fontSize: '.9rem', fontWeight: 400 }}> · {app.pronouns}</span> : null}
        </h2>
        <div className="muted" style={{ margin: '2px 0 8px' }}>
          {[app.office_sought, app.district && `District ${app.district}`, app.party, app.election_year].filter(Boolean).join(' · ')}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span className="badge badge-muted">{STATUS_LABEL[app.status] || app.status}</span>
          {app.endorsement_path && <span className="badge badge-muted">{PATH_LABEL[app.endorsement_path] || app.endorsement_path}</span>}
          <span className="badge badge-muted">{app.is_incumbent ? 'Incumbent' : 'Challenger/open'}</span>
          {app.is_out === 'yes' && <span className="badge badge-founding">Out</span>}
          {app.is_special_election && <span className="badge badge-muted">Special election</span>}
          {app.status === 'endorsed' && (
            <span className={`badge ${app.is_published ? 'badge-ok' : 'badge-review'}`}>
              {app.is_published ? 'Published on site' : 'Not published'}
            </span>
          )}
        </div>
        <div className="muted small" style={{ marginTop: 6 }}>
          Submitted {dt(app.created_at)}
          {app.reviewed_at ? ` · decided ${dt(app.reviewed_at)}` : ''}
          {app.endorsed_at ? ` · endorsement dated ${dt(app.endorsed_at)}` : ''}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <strong style={{ font: '700 .95rem var(--op-font-head)' }}>Your vote</strong>
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
        <strong style={{ font: '700 .95rem var(--op-font-head)' }}>Board review</strong>
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
        <strong style={{ font: '700 .95rem var(--op-font-head)' }}>Candidate details</strong>
        <div className="detail-grid" style={{ marginTop: 8 }}>
          {[['Current office', app.current_office], ['Office category', app.office_category],
            ['Committee', app.committee_name], ['Treasurer', app.treasurer_name],
            ['Email', app.email], ['Phone', app.phone], ['Website', app.website]]
            .filter(([, v]) => v)
            .map(([l, v]) => <div key={l}><div className="lbl">{l}</div><div className="val">{String(v)}</div></div>)}
        </div>
        {app.bio && <><div className="lbl" style={{ fontSize: '.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--op-muted)' }}>Bio</div><p style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{app.bio}</p></>}
        {app.conflicts_disclosure && <><div className="lbl" style={{ fontSize: '.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--op-muted)' }}>Disclosures</div><p style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{app.conflicts_disclosure}</p></>}
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <strong style={{ font: '700 .95rem var(--op-font-head)' }}>Questionnaire</strong>
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
        <strong style={{ font: '700 .95rem var(--op-font-head)' }}>Assignments</strong>
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
          <strong style={{ font: '700 .95rem var(--op-font-head)' }}>Record the decision</strong>

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
          <strong style={{ font: '700 .95rem var(--op-font-head)' }}>Activity</strong>
          {activity.map(a => (
            <div key={a.id} className="small" style={{ padding: '5px 0', borderBottom: '1px solid var(--op-line)' }}>
              <span className="muted">{dt(a.created_at)}</span> · {a.summary || a.event_type}
            </div>
          ))}
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
