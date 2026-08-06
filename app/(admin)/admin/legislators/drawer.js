'use client';
// One legislator: the draft versus published grade, every roll call in their
// chamber with the vote we will publish for them, sponsorship roles, and the
// publish button. Every write here lands in the draft tables. The public
// scorecard only moves when someone publishes.
import { useState } from 'react';
import {
  CMTE_STAGES, FLOOR_STAGES, STAGE_LABEL, STAGE_OPTIONS, VOTE_LABEL, VOTE_OPTIONS,
  activeBills, defaultVoteFor, fmtDate, fmtScore, gradeClass, partyName,
  publishStateOf, resolveVote, rollCallsFor, titleCase,
} from './lib';

function Detail({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <div>
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
    </div>
  );
}

function GradePill({ grade }) {
  return <span className={`lg-grade ${gradeClass(grade)}`}>{grade || 'NA'}</span>;
}

function today() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function AddVoteForm({ legislator, bills, stagesHint, onCancel, onSave }) {
  const list = activeBills(bills);
  const [billSlug, setBillSlug] = useState(list[0] ? list[0].slug : '');
  const [stage, setStage] = useState(stagesHint === 'committee' ? 'committee' : 'pass');
  const [chamber, setChamber] = useState(legislator.chamber);
  const [voteDate, setVoteDate] = useState(today());
  const [label, setLabel] = useState('');
  const [yeas, setYeas] = useState('0');
  const [nays, setNays] = useState('0');
  const [result, setResult] = useState('');
  const [memberVote, setMemberVote] = useState('');
  const [memberNote, setMemberNote] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  async function save() {
    const payload = {
      bill_slug: billSlug,
      stage,
      chamber,
      vote_date: voteDate,
      label: label.trim(),
      yeas,
      nays,
      result: result.trim(),
      notes: notes.trim(),
    };
    if (!payload.bill_slug || !payload.stage || !payload.chamber
        || !payload.vote_date || !payload.label || !payload.result) {
      setErr('Fill out the bill, stage, chamber, date, label, and result before saving.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await onSave(payload, memberVote, memberNote.trim());
    } catch (e) {
      setSaving(false);
      setErr('Could not save that roll call. ' + (e.message || 'Unknown error.'));
      return;
    }
    setSaving(false);
  }

  if (!list.length) {
    return <div className="alert alert-warn">No active bills in the catalog, so there is nothing to record a vote on yet.</div>;
  }

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      {err && <div className="alert alert-error">{err}</div>}
      <div className="lg-form">
        <label className="field lg-wide">
          <span>Bill</span>
          <select className="select" value={billSlug} onChange={(e) => setBillSlug(e.target.value)}>
            {list.map((b) => (
              <option key={b.slug} value={b.slug}>{b.label} · {b.title} ({b.stance})</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Stage</span>
          <select className="select" value={stage} onChange={(e) => setStage(e.target.value)}>
            {STAGE_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Chamber</span>
          <select className="select" value={chamber} onChange={(e) => setChamber(e.target.value)}>
            <option value="house">House</option>
            <option value="senate">Senate</option>
          </select>
        </label>
        <label className="field">
          <span>Date</span>
          <input className="input" type="date" value={voteDate} onChange={(e) => setVoteDate(e.target.value)} />
        </label>
        <label className="field">
          <span>Label</span>
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="House passage" />
        </label>
        <label className="field">
          <span>Yeas</span>
          <input className="input" type="number" min="0" inputMode="numeric" value={yeas} onChange={(e) => setYeas(e.target.value)} />
        </label>
        <label className="field">
          <span>Nays</span>
          <input className="input" type="number" min="0" inputMode="numeric" value={nays} onChange={(e) => setNays(e.target.value)} />
        </label>
        <label className="field lg-wide">
          <span>Result text</span>
          <input className="input" value={result} onChange={(e) => setResult(e.target.value)} placeholder="Passed 60 to 31" />
        </label>
        <label className="field">
          <span>Vote by this member</span>
          <select className="select" value={memberVote} onChange={(e) => setMemberVote(e.target.value)}>
            <option value="">Use party line default</option>
            {VOTE_OPTIONS.map((v) => <option key={v} value={v}>{v} ({VOTE_LABEL[v]})</option>)}
          </select>
        </label>
        <label className="field">
          <span>Exception note</span>
          <input className="input" value={memberNote} onChange={(e) => setMemberNote(e.target.value)}
                 placeholder="Crossed party line, recorded absent" />
        </label>
        <label className="field lg-wide">
          <span>Shared note on this roll call</span>
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)}
                    placeholder="Editorial note visible on every member for this vote" />
        </label>
        <div className="lg-form-actions">
          <button className="btn btn-primary" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save roll call'}
          </button>
          <button className="btn" disabled={saving} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function VotesSection({
  title, stages, sectionKey, legislator, rollCalls, exceptions, bills,
  canWrite, adding, setAdding, onSetVote, onAddRollCall,
}) {
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState(null);
  const rcs = rollCallsFor(rollCalls, legislator.chamber, stages);

  async function pick(rc, value) {
    setBusyId(rc.id);
    setErr(null);
    try {
      await onSetVote(legislator, rc.id, value);
    } catch (e) {
      setErr('Could not save that vote. ' + (e.message || 'Unknown error.'));
    }
    setBusyId(null);
  }

  return (
    <>
      <div className="lg-section-head">
        <h4>{title}{rcs.length ? ` (${rcs.length})` : ''}</h4>
        {canWrite && adding !== sectionKey && (
          <button className="btn btn-sm" onClick={() => setAdding(sectionKey)}>Add vote</button>
        )}
      </div>

      {err && <div className="alert alert-error">{err}</div>}

      {canWrite && adding === sectionKey && (
        <AddVoteForm
          legislator={legislator}
          bills={bills}
          stagesHint={sectionKey}
          onCancel={() => setAdding(null)}
          onSave={async (payload, memberVote, memberNote) => {
            await onAddRollCall(payload, memberVote, memberNote, legislator);
            setAdding(null);
          }}
        />
      )}

      {rcs.length === 0 ? (
        <p className="muted small" style={{ margin: '2px 0 0' }}>
          No {title.toLowerCase()} recorded yet.
        </p>
      ) : rcs.map((rc) => {
        const { vote, exception } = resolveVote(legislator, rc, exceptions);
        const deflt = defaultVoteFor(legislator.party, rc.stance);
        return (
          <div className="lg-vote" key={rc.id}>
            <div>
              <strong>{rc.bill_label || rc.bill_slug || ''}</strong>{' '}
              <span className="muted small">{rc.bill_title || ''}</span>
            </div>
            <div className="muted small">
              {[STAGE_LABEL[rc.stage] || rc.stage, fmtDate(rc.vote_date), rc.result].filter(Boolean).join(' · ')}
            </div>
            {rc.notes && <div className="muted small" style={{ marginTop: 4 }}>{rc.notes}</div>}
            {canWrite ? (
              <div className="lg-vote-btns">
                {VOTE_OPTIONS.map((opt) => (
                  <button key={opt} type="button" disabled={busyId === rc.id}
                          className={`lg-vote-btn${opt === vote ? ' is-active' : ''}`}
                          aria-pressed={opt === vote} title={VOTE_LABEL[opt]}
                          onClick={() => pick(rc, opt)}>
                    {opt}
                  </button>
                ))}
                <button type="button" disabled={busyId === rc.id}
                        className="lg-vote-btn lg-vote-reset"
                        title={`Back to the party line default (${deflt})`}
                        onClick={() => pick(rc, '')}>
                  Party line
                </button>
                {exception && <span className="lg-exc">Recorded by hand</span>}
              </div>
            ) : (
              <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className={`lg-vote-pill lg-vote-${vote}`}>{vote}</span>
                {exception
                  ? <span className="lg-exc">Recorded by hand</span>
                  : <span className="muted small">Party line default</span>}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function Sponsorships({ legislator, bills, sponsorships, canWrite, onSetSponsorship }) {
  const [busySlug, setBusySlug] = useState(null);
  const [err, setErr] = useState(null);
  const current = {};
  for (const s of sponsorships) {
    if (s.legislator_id === legislator.id) current[s.bill_slug] = s.role;
  }
  const list = activeBills(bills);

  async function change(slug, role) {
    setBusySlug(slug);
    setErr(null);
    try {
      await onSetSponsorship(legislator, slug, role);
    } catch (e) {
      setErr('Could not save that sponsorship. ' + (e.message || 'Unknown error.'));
    }
    setBusySlug(null);
  }

  return (
    <>
      <div className="lg-section-head"><h4>Sponsorships</h4></div>
      {err && <div className="alert alert-error">{err}</div>}
      {!list.length ? (
        <p className="muted small" style={{ margin: '2px 0 0' }}>No bills in the catalog.</p>
      ) : list.map((b) => {
        const role = current[b.slug] || '';
        return (
          <div className="lg-spon" key={b.slug}>
            <div className="lg-spon-bill">
              <strong>{b.label}</strong>
              <div className="muted small">{b.title} ({b.stance})</div>
            </div>
            {canWrite ? (
              <select className="select" value={role} disabled={busySlug === b.slug}
                      aria-label={`Sponsorship role on ${b.label}`}
                      onChange={(e) => change(b.slug, e.target.value)}>
                <option value="">Not a sponsor</option>
                <option value="primary">Primary</option>
                <option value="co">Co-sponsor</option>
              </select>
            ) : (
              <span className={`badge ${role ? 'badge-founding' : 'badge-muted'}`}>
                {role === 'primary' ? 'Primary' : role === 'co' ? 'Co-sponsor' : 'Not a sponsor'}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}

export default function LegislatorDrawer({
  legislator, bills, rollCalls, exceptions, sponsorships, draft, snapshot,
  canWrite, notify, onSetVote, onSetSponsorship, onAddRollCall, onPublish, onClose,
}) {
  const [adding, setAdding] = useState(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [err, setErr] = useState(null);

  const state = publishStateOf(draft, snapshot);

  async function publish() {
    setPublishing(true);
    setErr(null);
    try {
      await onPublish(legislator.id);
      notify('Published ' + legislator.full_name + ' to the public scorecard');
      setConfirmPublish(false);
    } catch (e) {
      setErr('Publish failed. ' + (e.message || 'Unknown error.'));
    }
    setPublishing(false);
  }

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer" role="dialog" aria-modal="true" aria-label={legislator.full_name || 'Legislator'}>
        <div className="drawer-head">
          <div>
            <div className="muted small" style={{ fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>
              {titleCase(legislator.chamber)} district {legislator.district}
            </div>
            <h3>{legislator.full_name}</h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {legislator.party && <span className="badge badge-muted">{partyName(legislator.party)}</span>}
              <span className={state === 'clean' ? 'badge badge-ok' : state === 'dirty' ? 'badge badge-warn' : 'badge badge-bad'}>
                {state === 'clean' ? 'Published' : state === 'dirty' ? 'Draft changes' : 'Never published'}
              </span>
            </div>
          </div>
          <button className="btn btn-sm" onClick={onClose}>Close</button>
        </div>

        {err && <div className="alert alert-error">{err}</div>}

        <div className="lg-compare">
          <div>
            <span className="lbl">Draft, from the live math</span>
            <span className="val">
              <span className="lg-num">{draft ? draft.total_score : 'No score'}</span>
              <GradePill grade={draft ? draft.grade : null} />
            </span>
            <span className="muted small">
              {draft
                ? `Floor ${fmtScore(draft.floor_score)} · Committee ${fmtScore(draft.committee_score)} · Sponsorship ${fmtScore(draft.sponsorship_score)}`
                : 'No evidence recorded yet.'}
            </span>
          </div>
          <div>
            <span className="lbl">Published, on the public site</span>
            <span className="val">
              <span className="lg-num">{snapshot ? snapshot.total_score : 'No score'}</span>
              <GradePill grade={snapshot ? snapshot.grade : null} />
            </span>
            <span className="muted small">
              {snapshot
                ? `${fmtDate(snapshot.snapshot_at)}${snapshot.published_by ? ' by ' + snapshot.published_by : ''}`
                : 'Never published.'}
            </span>
          </div>
        </div>

        <div className="detail-grid">
          <Detail label="Chamber" value={titleCase(legislator.chamber)} />
          <Detail label="District" value={legislator.district} />
          <Detail label="Party" value={legislator.party ? partyName(legislator.party) : null} />
          <Detail label="Leadership role" value={legislator.leadership_role} />
          <Detail label="Term" value={[legislator.term_start_year, legislator.term_end_year].filter(Boolean).join(' to ')} />
          <Detail label="Counties" value={(legislator.counties || []).join(', ')} />
          <Detail label="Email" value={legislator.contact_email} />
          <Detail label="Phone" value={legislator.contact_phone} />
        </div>

        {(legislator.statehouse_url || legislator.official_url || legislator.contact_email) && (
          <div className="page-actions">
            {legislator.contact_email && (
              <a className="btn btn-sm" href={`mailto:${legislator.contact_email}`}>Email</a>
            )}
            {legislator.statehouse_url && (
              <a className="btn btn-sm" href={legislator.statehouse_url} target="_blank" rel="noopener noreferrer">Statehouse page</a>
            )}
            {legislator.official_url && legislator.official_url !== legislator.statehouse_url && (
              <a className="btn btn-sm" href={legislator.official_url} target="_blank" rel="noopener noreferrer">Official site</a>
            )}
          </div>
        )}

        <VotesSection
          title="Floor votes" stages={FLOOR_STAGES} sectionKey="floor"
          legislator={legislator} rollCalls={rollCalls} exceptions={exceptions} bills={bills}
          canWrite={canWrite} adding={adding} setAdding={setAdding}
          onSetVote={onSetVote} onAddRollCall={onAddRollCall}
        />

        <VotesSection
          title="Committee votes" stages={CMTE_STAGES} sectionKey="committee"
          legislator={legislator} rollCalls={rollCalls} exceptions={exceptions} bills={bills}
          canWrite={canWrite} adding={adding} setAdding={setAdding}
          onSetVote={onSetVote} onAddRollCall={onAddRollCall}
        />

        <Sponsorships
          legislator={legislator} bills={bills} sponsorships={sponsorships}
          canWrite={canWrite} onSetSponsorship={onSetSponsorship}
        />

        {canWrite && (
          <div style={{ marginTop: 18 }}>
            {confirmPublish ? (
              <div className="lg-confirm">
                <span className="small">
                  Publish {legislator.full_name} to the public scorecard at ohiopride.org/scorecard?
                </span>
                <button className="btn btn-sm btn-primary" disabled={publishing} onClick={publish}>
                  {publishing ? 'Publishing…' : 'Yes, publish'}
                </button>
                <button className="btn btn-sm" disabled={publishing} onClick={() => setConfirmPublish(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button className="btn btn-accent" onClick={() => setConfirmPublish(true)}>
                Publish this legislator
              </button>
            )}
            <p className="muted small" style={{ marginBottom: 0 }}>
              Votes and sponsorships save as you change them. The public page only moves when you publish.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
