'use client';
// Build drawer: pick the segment, write the message once, preview who lands in
// the queue, then snapshot them into text_blast_recipients.
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  DEFAULT_TPL, FLAG_LABEL, REGIONS, SEGMENTS, segmentInfo, snapshotContact,
} from './lib';

const CHUNK = 250;

export default function BuildDrawer({ canWrite, actorEmail, notify, onClose, onBuilt }) {
  const [form, setForm] = useState({
    name: '', segment: SEGMENTS[0].key, region: '', county: '', tag: '',
    optin_only: false, include_email: false, is_fundraising: false,
  });
  const [template, setTemplate] = useState(DEFAULT_TPL);
  const [preview, setPreview] = useState(null); // { rows, flagCounts }
  const [busy, setBusy] = useState(false);

  const set = (patch) => { setForm(f => ({ ...f, ...patch })); setPreview(null); };
  const info = segmentInfo(template);
  const seg = SEGMENTS.find(s => s.key === form.segment) || SEGMENTS[0];

  const filters = () => ({
    segment: form.segment,
    region: form.region.trim(),
    county: form.county.trim(),
    tag: form.tag.trim(),
    optin_only: form.optin_only,
    include_email: form.include_email,
  });

  async function runPreview() {
    setBusy(true);
    const f = filters();
    let q = supabase().from('contacts')
      .select('id, name, full_name, first_name, last_name, email, phone, city, county, region, sms_optin, tags')
      .eq('is_merged', false)
      .not('do_not_contact', 'is', true)
      .order('name', { ascending: true })
      .limit(2000);
    if (seg.role) q = q.contains('roles', [seg.role]);
    if (f.region) q = q.eq('region', f.region);
    if (f.county) q = q.ilike('county', `%${f.county}%`);
    if (f.tag) q = q.contains('tags', [f.tag]);
    if (f.optin_only) q = q.eq('sms_optin', true);

    const { data, error } = await q;
    setBusy(false);
    if (error) { notify('Preview failed: ' + error.message); return; }

    const rows = (data || []).map(c => snapshotContact(c, f.include_email)).filter(Boolean);
    const flagCounts = {};
    rows.forEach(r => (r.flags || []).forEach(fl => { flagCounts[fl] = (flagCounts[fl] || 0) + 1; }));
    setPreview({ rows, flagCounts });
  }

  async function build() {
    if (!preview?.rows.length) return;
    if (!form.name.trim()) { notify('Give the blast a name'); return; }
    if (!template.trim()) { notify('The message is empty'); return; }
    setBusy(true);
    const sb = supabase();
    try {
      const { data: blast, error: bErr } = await sb.from('text_blasts').insert({
        name: form.name.trim(),
        audience_key: seg.key,
        audience_label: seg.label,
        template,
        filters: filters(),
        is_fundraising: form.is_fundraising,
        created_by: actorEmail,
      }).select('id').single();
      if (bErr) throw new Error(bErr.message);

      const payload = preview.rows.map((r, i) => ({ ...r, blast_id: blast.id, queue_order: i }));
      // Chunked so a large segment does not hit a single oversized request.
      for (let i = 0; i < payload.length; i += CHUNK) {
        const { error } = await sb.from('text_blast_recipients').insert(payload.slice(i, i + CHUNK));
        if (error) throw new Error(error.message);
      }
      notify('Queue built');
      onBuilt(blast.id);
    } catch (e) {
      notify('Could not build the queue: ' + e.message);
      setBusy(false);
    }
  }

  const flagSummary = preview
    ? Object.entries(preview.flagCounts).map(([k, n]) => `${FLAG_LABEL[k]?.text || k}: ${n}`).join(' · ')
    : '';

  return (
    <>
      <div className="drawer-scrim" onClick={() => onClose(false)} />
      <div className="drawer" role="dialog" aria-modal="true" aria-label="New text blast">
        <div className="drawer-head">
          <div>
            <h3>New text blast</h3>
            <div className="muted small">Pick the segment, write the message once</div>
          </div>
          <button className="btn btn-sm" onClick={() => onClose(false)}>Close</button>
        </div>

        <label className="field"><span>Name</span>
          <input className="input" value={form.name} placeholder="August founding member check-in"
                 onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </label>

        <div className="tx-grid2">
          <label className="field"><span>Audience</span>
            <select className="select" value={form.segment} onChange={e => set({ segment: e.target.value })}>
              {SEGMENTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
          <label className="field"><span>Region</span>
            <select className="select" value={form.region} onChange={e => set({ region: e.target.value })}>
              <option value="">Every region</option>
              {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
        </div>
        <div className="tx-grid2">
          <label className="field"><span>County contains</span>
            <input className="input" value={form.county} placeholder="Hamilton"
                   onChange={e => set({ county: e.target.value })} />
          </label>
          <label className="field"><span>Tag</span>
            <input className="input" value={form.tag} placeholder="pride-tour"
                   onChange={e => set({ tag: e.target.value })} />
          </label>
        </div>

        <label className="tx-check">
          <input type="checkbox" checked={form.optin_only} onChange={e => set({ optin_only: e.target.checked })} />
          <span>SMS opt-in only. Off by default because most contacts never saw an SMS box; person-to-person from your own phone is the model precisely because of that.</span>
        </label>
        <label className="tx-check">
          <input type="checkbox" checked={form.include_email} onChange={e => set({ include_email: e.target.checked })} />
          <span>Include people with no usable phone as an email branch.</span>
        </label>
        <label className="tx-check">
          <input type="checkbox" checked={form.is_fundraising}
                 onChange={e => setForm(f => ({ ...f, is_fundraising: e.target.checked }))} />
          <span>This blast asks for money. Government addresses are blocked from the email branch.</span>
        </label>

        <label className="field"><span>Message. {'{first}'} swaps in each first name</span>
          <textarea className="textarea" style={{ minHeight: 150 }} value={template}
                    onChange={e => { setTemplate(e.target.value); setPreview(null); }} />
        </label>
        <div className="muted small" style={{ marginTop: -4 }}>
          {info.chars} characters · {info.segments} segment{info.segments === 1 ? '' : 's'}
          {info.unicode ? ' · unicode, shorter segments' : ''}
        </div>
        <p className="muted small">Link on its own line. No em dashes, no hashtags, no "Paid for by" line on texts.</p>
        <div className="tx-preview">{template.replace(/\{first\}/g, 'Nicole')}</div>

        {preview && (
          <div className="card" style={{ marginTop: 12 }}>
            <strong style={{ font: '800 1.1rem var(--op-font-head)' }}>{preview.rows.length}</strong>{' '}
            <span className="muted">{preview.rows.length === 1 ? 'person in the queue' : 'people in the queue'}</span>
            <div className="muted small" style={{ marginTop: 4 }}>
              {flagSummary || 'No data flags on this segment.'}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn" style={{ flex: 1 }} disabled={busy} onClick={runPreview}>
            {busy && !preview ? 'Loading…' : 'Preview list'}
          </button>
          <button className="btn btn-primary" style={{ flex: 1 }}
                  disabled={busy || !canWrite || !preview?.rows.length} onClick={build}>
            {busy && preview ? 'Building…' : 'Build queue'}
          </button>
        </div>
        {!canWrite && <p className="muted small">You have read access only.</p>}
      </div>
    </>
  );
}

export function TemplateDrawer({ blast, overrideCount, notify, onClose, onSaved }) {
  const [value, setValue] = useState(blast.template);
  const [busy, setBusy] = useState(false);
  const info = segmentInfo(value);

  async function save() {
    if (!value.trim()) { notify('The message is empty'); return; }
    setBusy(true);
    const { error } = await supabase().from('text_blasts').update({ template: value }).eq('id', blast.id);
    setBusy(false);
    if (error) { notify('Could not save: ' + error.message); return; }
    notify('Message updated');
    onSaved(value);
  }

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer" role="dialog" aria-modal="true" aria-label="Edit the message">
        <div className="drawer-head">
          <div>
            <h3>Edit the message</h3>
            <div className="muted small">Applies to everyone without a per-person edit</div>
          </div>
          <button className="btn btn-sm" onClick={onClose}>Close</button>
        </div>
        <textarea className="textarea" style={{ minHeight: 170 }} value={value}
                  onChange={e => setValue(e.target.value)} />
        <div className="muted small">
          {info.chars} characters · {info.segments} segment{info.segments === 1 ? '' : 's'}
        </div>
        <div className="tx-preview">{value.replace(/\{first\}/g, 'Nicole')}</div>
        <p className="muted small">
          {overrideCount} {overrideCount === 1 ? 'person has' : 'people have'} a per-person edit. Their text is left alone.
        </p>
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy} onClick={save}>
          {busy ? 'Saving…' : 'Save message'}
        </button>
      </div>
    </>
  );
}
