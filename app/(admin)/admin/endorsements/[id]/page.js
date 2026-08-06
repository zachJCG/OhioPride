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
import { STATUS_ORDER, STATUS_LABEL, PATH_LABEL, VOTE_ORDER, VOTE_LABEL, tallyOf } from '../shared';

const LEGACY_BOOL = [
  ['q1_nondiscrimination', 'q1_explanation', 'Supports comprehensive nondiscrimination protections'],
  ['q2_anti_lgbtq_legislation', 'q2_explanation', 'Will oppose anti-LGBTQ+ legislation'],
  ['q3_conversion_therapy', 'q3_explanation', 'Supports banning conversion therapy'],
  ['q4_inclusive_education', 'q4_explanation', 'Supports inclusive education'],
  ['q5_vote_against_rollbacks', 'q5_explanation', 'Will vote against rollbacks of existing protections'],
];
const LEGACY_TEXT = [
  ['q6_priorities', 'Top priorities'],
  ['q7_legislation', 'Legislation they would champion'],
  ['q8_safety', 'Community safety'],
  ['q9_intersection', 'Intersectional equity'],
  ['q10_why_endorsement', 'Why they seek this endorsement'],
];

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

  const qByKey = useMemo(() => Object.fromEntries(questions.map(x => [x.question_key, x])), [questions]);

  const qa = useMemo(() => {
    if (!app) return [];
    const responses = app.responses || {};
    const catalogKeys = Object.keys(responses).filter(k => qByKey[k]);
    if (catalogKeys.length) {
      return catalogKeys
        .sort((a, b) => (qByKey[a].sort_order ?? 999) - (qByKey[b].sort_order ?? 999) || a.localeCompare(b))
        .map(k => {
          const raw = responses[k];
          const ans = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : { value: raw };
          const type = qByKey[k].response_type || (typeof ans.value === 'boolean' ? 'boolean' : 'long_text');
          return {
            key: k,
            prompt: qByKey[k].prompt,
            value: type === 'boolean' || typeof ans.value === 'boolean' ? yn(ans.value) : String(ans.value ?? ''),
            isBool: type === 'boolean' || typeof ans.value === 'boolean',
            boolVal: ans.value,
            explanation: ans.explanation || '',
          };
        });
    }
    const out = [];
    for (const [k, ek, prompt] of LEGACY_BOOL) {
      if (app[k] !== null && app[k] !== undefined) out.push({ key: k, prompt, value: yn(app[k]), isBool: true, boolVal: app[k], explanation: app[ek] || '' });
    }
    for (const [k, prompt] of LEGACY_TEXT) {
      if (app[k]) out.push({ key: k, prompt, value: '', isBool: false, explanation: app[k] });
    }
    return out;
  }, [app, qByKey]);

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

  async function setStatus(status) {
    const patch = { status };
    if (status === 'endorsed' || status === 'declined') {
      patch.reviewed_by = me?.email || null;
      patch.reviewed_at = new Date().toISOString();
    }
    const { error } = await supabase().from('endorsement_applications').update(patch).eq('id', id);
    if (error) { notify('Status change failed: ' + error.message); return; }
    await logActivity('status_change', `Status set to ${STATUS_LABEL[status] || status}`);
    setApp(a => ({ ...a, ...patch }));
    await loadDrawerData();
    notify('Status updated.');
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
        <div className="muted small" style={{ marginTop: 6 }}>Submitted {dt(app.created_at)}{app.reviewed_at ? ` · decided ${dt(app.reviewed_at)}` : ''}</div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <strong style={{ font: '700 .95rem var(--op-font-head)' }}>Your vote</strong>
        {myReview && <span className="badge badge-ok" style={{ marginLeft: 8 }}>Recorded: {VOTE_LABEL[myReview.vote]}</span>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, margin: '10px 0' }}>
          {VOTE_ORDER.map(v => (
            <button key={v}
              className={`btn ${myReview?.vote === v ? 'btn-primary' : ''}`}
              style={v === 'recuse' ? { gridColumn: '1 / -1' } : undefined}
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
          {[['For', tally.for], ['Against', tally.against], ['Other', tally.other]].map(([l, n]) => (
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
              <span className={`badge ${x.boolVal === true ? 'badge-ok' : x.boolVal === false ? 'badge-bad' : 'badge-muted'}`} style={{ marginTop: 4 }}>
                {x.value}
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
          <strong style={{ font: '700 .95rem var(--op-font-head)' }}>Director controls</strong>
          <div style={{ display: 'flex', gap: 8, margin: '8px 0', flexWrap: 'wrap', alignItems: 'center' }}>
            <label className="muted small" htmlFor="statusSel">Status</label>
            <select id="statusSel" className="select" style={{ width: 'auto' }} value={app.status} onChange={e => setStatus(e.target.value)}>
              {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            {app.status === 'endorsed' && (
              <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={!!app.is_published} onChange={togglePublished} />
                Show on the public endorsements page
              </label>
            )}
          </div>
          <label className="field"><span>Reviewer notes (internal)</span>
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
