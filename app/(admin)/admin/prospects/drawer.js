'use client';
// Prospect detail: bottom sheet on phones, side panel from 768px.
// Reads come from the pac_pipeline view; the CRM block writes pac_prospects by
// id, and stage moves go through pac_prospect_set_stage so the change is logged
// with its note instead of being a silent column update.
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { money } from '../../lib/format';
import {
  STAGES, STAGE_LABEL, STAGE_COLOR, STATUS_OPTIONS, STATUS_LABEL,
  PRIORITY_OPTIONS, PRIORITY_LABEL, titleize, fmtDay, ownerLabel,
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

export default function ProspectDrawer({ row, owners, ownersById, canWrite, notify, onStage, onSaved, onClose }) {
  const [priority, setPriority] = useState(row.priority || 'medium');
  const [status, setStatus] = useState(row.status || 'active');
  const [ownerId, setOwnerId] = useState(row.owner_id || '');
  const [tags, setTags] = useState((row.tags || []).join(', '));
  const [nextAction, setNextAction] = useState(row.next_action || '');
  const [nextDate, setNextDate] = useState(row.next_action_date || '');
  const [dnc, setDnc] = useState(!!row.do_not_contact);
  const [notes, setNotes] = useState(row.notes || '');
  const [stage, setStage] = useState(row.stage);
  const [stageNote, setStageNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [movingStage, setMovingStage] = useState(false);
  const [err, setErr] = useState(null);

  const ownerMissing = row.owner_id && !ownersById[row.owner_id];

  async function moveStage() {
    if (!canWrite || stage === row.stage) return;
    setMovingStage(true);
    setErr(null);
    const { error } = await supabase().rpc('pac_prospect_set_stage', {
      p_prospect_id: row.id,
      p_stage: stage,
      p_note: stageNote.trim() || null,
    });
    setMovingStage(false);
    if (error) {
      setStage(row.stage);
      setErr('Could not change the stage. ' + error.message);
      return;
    }
    setStageNote('');
    onStage(row.id, stage);
    notify('Stage set to ' + (STAGE_LABEL[stage] || stage));
  }

  async function save() {
    if (!canWrite) return;
    setSaving(true);
    setErr(null);
    const trimOrNull = (v) => {
      const s = String(v == null ? '' : v).trim();
      return s.length ? s : null;
    };
    const patch = {
      priority: priority || 'medium',
      status: status || 'active',
      owner_id: ownerId || null,
      next_action: trimOrNull(nextAction),
      next_action_date: trimOrNull(nextDate),
      notes: trimOrNull(notes),
      do_not_contact: dnc === true,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
    };
    const { error } = await supabase().from('pac_prospects').update(patch).eq('id', row.id);
    setSaving(false);
    if (error) { setErr('Could not save these changes. ' + error.message); return; }
    const owner = ownersById[patch.owner_id];
    onSaved(row.id, { ...patch, owner_name: owner ? ownerLabel(owner) : null });
    notify('Saved.');
  }

  return (
    <>
      <div className="drawer-scrim" onClick={() => onClose()} />
      <div className="drawer" role="dialog" aria-modal="true" aria-label={row.full_name || 'Prospect'}>
        <div className="drawer-head">
          <div>
            <div className="muted small" style={{ fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>
              Ohio Pride PAC
            </div>
            <h3>{row.full_name || 'Prospect'}</h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              <span className="pr-pill" style={{ background: STAGE_COLOR[row.stage] || '#64748B' }}>
                {STAGE_LABEL[row.stage] || row.stage}
              </span>
              {row.prospect_type && <span className="badge badge-muted">{titleize(row.prospect_type)}</span>}
              {row.priority === 'high' && <span className="badge badge-warn">High priority</span>}
              {row.do_not_contact && <span className="badge badge-bad">Do not contact</span>}
            </div>
          </div>
          <button className="btn btn-sm" onClick={() => onClose()}>Close</button>
        </div>

        {err && <div className="alert alert-error">{err}</div>}

        {row.contact_id ? (
          <a className="btn btn-sm" style={{ marginBottom: 10 }} href={`/admin/contacts?id=${row.contact_id}`}>
            Open the contact record
          </a>
        ) : (
          <p className="muted small" style={{ margin: '0 0 10px' }}>
            Not linked to a contact record yet. Adding an email links it automatically.
          </p>
        )}

        <section style={{ marginBottom: 14 }}>
          <h4 style={{ margin: '4px 0' }}>Profile</h4>
          <div className="detail-grid">
            <Detail label="Name" value={row.full_name} />
            <Detail label="Type" value={titleize(row.prospect_type)} />
            {row.committee_type && <Detail label="Committee type" value={titleize(row.committee_type)} />}
            <Detail label="Employer" value={row.employer} />
            <Detail label="Occupation" value={row.occupation} />
            <Detail label="Email" value={row.email} />
            <Detail label="Phone" value={row.phone} />
            <Detail label="City" value={row.city} />
            <Detail label="County" value={row.county} />
            <Detail label="Region" value={row.region} />
            {row.compliant_vehicle && <Detail label="Compliant vehicle" value={titleize(row.compliant_vehicle)} />}
          </div>
        </section>

        <section style={{ marginBottom: 14 }}>
          <h4 style={{ margin: '4px 0' }}>Money</h4>
          <div className="detail-grid">
            <Detail label="Demonstrated capacity" value={row.capacity_estimate_cents != null ? money(row.capacity_estimate_cents) : null} />
            <Detail label="Ask target" value={row.ask_target_cents != null ? money(row.ask_target_cents) : null} />
            <Detail label="Committed" value={row.committed_amount_cents != null ? money(row.committed_amount_cents) : null} />
          </div>
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            Capacity is demonstrated capacity from the public record, not pledged.
          </p>
        </section>

        {(row.evidence || row.source_citation) && (
          <section style={{ marginBottom: 14 }}>
            <h4 style={{ margin: '4px 0' }}>Evidence</h4>
            {row.evidence && <p className="pr-evidence">{row.evidence}</p>}
            {row.source_citation && <p className="muted small" style={{ margin: 0 }}>Source: {row.source_citation}</p>}
          </section>
        )}

        <section style={{ marginBottom: 14 }}>
          <h4 style={{ margin: '4px 0' }}>Pipeline</h4>

          <label className="field">
            <span>Stage</span>
            <select className="select" value={stage} disabled={!canWrite || movingStage}
                    onChange={(e) => setStage(e.target.value)}>
              {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
            </select>
          </label>
          {canWrite && stage !== row.stage && (
            <>
              <label className="field">
                <span>Note for this move (optional)</span>
                <input className="input" value={stageNote} onChange={(e) => setStageNote(e.target.value)}
                       placeholder="What changed, in one line" />
              </label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <button className="btn btn-primary" disabled={movingStage} onClick={moveStage}>
                  {movingStage ? 'Moving…' : `Move to ${STAGE_LABEL[stage] || stage}`}
                </button>
                <button className="btn" disabled={movingStage} onClick={() => { setStage(row.stage); setStageNote(''); }}>
                  Cancel move
                </button>
              </div>
            </>
          )}

          <div className="pr-form">
            <label className="field">
              <span>Priority</span>
              <select className="select" value={priority} disabled={!canWrite} onChange={(e) => setPriority(e.target.value)}>
                {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Status</span>
              <select className="select" value={status} disabled={!canWrite} onChange={(e) => setStatus(e.target.value)}>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </label>
            <label className="field pr-span2">
              <span>Owner</span>
              <select className="select" value={ownerId} disabled={!canWrite} onChange={(e) => setOwnerId(e.target.value)}>
                <option value="">Unassigned</option>
                {owners.map((u) => <option key={u.id} value={u.id}>{ownerLabel(u)}</option>)}
                {ownerMissing && <option value={row.owner_id}>Former admin</option>}
              </select>
            </label>
            <label className="field pr-span2">
              <span>Tags (comma separated)</span>
              <input className="input" value={tags} disabled={!canWrite} onChange={(e) => setTags(e.target.value)} />
            </label>
            <label className="field pr-span2">
              <span>Next action</span>
              <input className="input" value={nextAction} disabled={!canWrite}
                     onChange={(e) => setNextAction(e.target.value)} placeholder="Call, coffee, follow up" />
            </label>
            <label className="field">
              <span>Next action date</span>
              <input className="input" type="date" value={nextDate} disabled={!canWrite}
                     onChange={(e) => setNextDate(e.target.value)} />
            </label>
          </div>

          <label className="pr-check">
            <input type="checkbox" checked={dnc} disabled={!canWrite} onChange={(e) => setDnc(e.target.checked)} />
            Do not contact
          </label>
        </section>

        <section style={{ marginBottom: 14 }}>
          <h4 style={{ margin: '4px 0' }}>Notes</h4>
          <textarea className="textarea" value={notes} disabled={!canWrite} onChange={(e) => setNotes(e.target.value)} />
          {row.last_contacted_at && (
            <p className="muted small" style={{ margin: '4px 0 0' }}>Last contacted {fmtDay(row.last_contacted_at)}</p>
          )}
        </section>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {row.email && <a className="btn" href={`mailto:${row.email}`}>Email</a>}
          {row.phone && <a className="btn" href={`tel:${String(row.phone).replace(/[^\d+]/g, '')}`}>Call</a>}
          {canWrite ? (
            <button className="btn btn-primary" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          ) : (
            <span className="muted small" style={{ alignSelf: 'center' }}>You have read access only.</span>
          )}
        </div>
      </div>
    </>
  );
}
