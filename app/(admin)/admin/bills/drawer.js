'use client';
// Bill detail and editor: bottom sheet on phones, side panel from 768px.
// One drawer serves both flows, exactly like the static console did. Opened
// with bill = null it inserts; opened with a row it updates that row by id.
// The column list, the empty-string to null coercion, the integer cast on
// general_assembly, and the { note } shape on legal_risks all match what the
// static editor wrote, so an edit made here lands where it always did.
//
// The shared vocabulary lives here rather than in a fourth file: page.js
// imports it alongside the drawer itself.
import { useState } from 'react';
import { supabase } from '../../lib/supabase';

export const STATUS_OPTIONS = [
  'introduced', 'in_committee', 'passed_house', 'passed_senate', 'enacted', 'dead',
];

export const STATUS_LABEL = {
  introduced: 'Introduced',
  in_committee: 'In Committee',
  passed_house: 'Passed House',
  passed_senate: 'Passed Senate',
  enacted: 'Enacted',
  dead: 'Dead',
};

export const STANCE_OPTIONS = ['anti', 'pro', 'mixed'];
export const STANCE_LABEL = { anti: 'Opposes', pro: 'Supports', mixed: 'Mixed' };
export const STANCE_FORM_LABEL = {
  anti: 'Opposes equality',
  pro: 'Supports equality',
  mixed: 'Mixed',
};
export const STANCE_BADGE = { anti: 'badge-bad', pro: 'badge-ok', mixed: 'badge-warn' };

export const CHAMBER_OPTIONS = ['house', 'senate', 'joint'];
export const CHAMBER_LABEL = { house: 'House', senate: 'Senate', joint: 'Joint' };

export const GA_OPTIONS = [
  { value: '136', label: '136th' },
  { value: '135', label: '135th' },
];

export const titleCase = (s) =>
  String(s || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// introduced_on, last_action_on, and effective_date are date columns. Parsing
// "2026-04-22" as UTC midnight and printing it in a US timezone shows the day
// before, so anchor a bare date at noon.
export const fmtDay = (v) => {
  if (!v) return '';
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00` : v;
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// legal_risks is jsonb shaped { note }, but older rows carry a bare string.
export const legalRiskText = (v) =>
  v && typeof v === 'object' ? (v.note || '') : (v == null ? '' : String(v));

// The exact column list the static editor wrote. Do not add to this without
// a matching migration: bills also carries label, ga, display_order, and
// is_active, which are owned by the seed and the scorecard tooling.
const FIELDS = [
  'bill_number', 'slug', 'title', 'stance', 'status', 'chamber_of_origin',
  'general_assembly', 'category', 'introduced_on', 'last_action_on', 'summary',
  'what_it_does', 'equality_impact_note', 'legal_risks',
  'official_bill_url', 'bill_text_pdf_url',
];

const DATE_FIELDS = ['introduced_on', 'last_action_on'];

function formFromBill(bill) {
  const f = {};
  for (const k of FIELDS) {
    let v = bill ? bill[k] : null;
    if (k === 'legal_risks') v = legalRiskText(v);
    if (DATE_FIELDS.includes(k) && v) v = String(v).slice(0, 10);
    f[k] = v == null ? '' : String(v);
  }
  if (!bill) {
    f.general_assembly = '136';
    f.stance = 'anti';
    f.status = 'introduced';
  }
  f.is_featured = bill ? !!bill.is_featured : false;
  return f;
}

function Detail({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <div>
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
    </div>
  );
}

// A row can hold a value the fixed option list does not carry (an older
// General Assembly, a status added by the research pipeline). Keep it in the
// select so opening the editor cannot silently rewrite it on save.
function ExtraOption({ value, known }) {
  const v = value == null ? '' : String(value);
  if (!v || known.includes(v)) return null;
  return <option value={v}>{titleCase(v)}</option>;
}

function Prose({ label, body }) {
  if (!body) return null;
  return (
    <>
      <h4 style={{ margin: '10px 0 0' }}>{label}</h4>
      <p className="bl-prose">{body}</p>
    </>
  );
}

export default function BillDrawer({ bill, canWrite, notify, onSaved, onDeleted, onClose }) {
  const [editing, setEditing] = useState(!bill);
  const [form, setForm] = useState(() => formFromBill(bill));
  const [slugAuto, setSlugAuto] = useState(!bill);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  function onBillNumber(v) {
    set('bill_number', v);
    // Only suggest a slug while creating, and stop the moment the slug is
    // typed by hand. On an existing bill the slug is the join key and is
    // locked below.
    if (!bill && slugAuto) set('slug', v.toLowerCase().replace(/\s+/g, ''));
  }

  async function save(e) {
    e.preventDefault();
    if (!canWrite) return;
    const payload = {};
    for (const k of FIELDS) {
      let v = form[k];
      if (v === '') v = null;
      if (k === 'general_assembly' && v != null) v = parseInt(v, 10);
      if (k === 'legal_risks' && v != null) v = { note: v };
      payload[k] = v;
    }
    payload.is_featured = !!form.is_featured;

    setSaving(true);
    setErr(null);
    const sb = supabase();
    const res = bill
      ? await sb.from('bills').update(payload).eq('id', bill.id).select().single()
      : await sb.from('bills').insert(payload).select().single();
    setSaving(false);

    if (res.error) {
      setErr('Save failed. ' + res.error.message);
      return;
    }
    notify(bill ? 'Bill updated' : 'Bill created');
    onSaved(res.data, !bill);
  }

  async function remove() {
    if (!bill || !canWrite) return;
    const label = bill.bill_number || bill.slug || 'this bill';
    if (!window.confirm(`Delete ${label}? This removes the bill from /issues and /scorecard.`)) return;
    setDeleting(true);
    setErr(null);
    const { error } = await supabase().from('bills').delete().eq('id', bill.id);
    setDeleting(false);
    if (error) {
      setErr('Delete failed. ' + error.message);
      return;
    }
    notify('Bill deleted');
    onDeleted(bill.id);
  }

  const heading = bill ? (bill.bill_number || bill.slug || 'Bill') : 'New bill';

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer" role="dialog" aria-modal="true" aria-label={heading}>
        <div className="drawer-head">
          <div>
            <div className="muted small" style={{ fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>
              Statehouse
            </div>
            <h3>{heading}</h3>
            {bill && (
              <>
                <div className="small" style={{ marginTop: 2 }}>{bill.title}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {bill.stance && (
                    <span className={`badge ${STANCE_BADGE[bill.stance] || 'badge-muted'}`}>
                      {STANCE_LABEL[bill.stance] || bill.stance}
                    </span>
                  )}
                  <span className="badge badge-muted">
                    {STATUS_LABEL[bill.status] || titleCase(bill.status)}
                  </span>
                  {bill.is_featured && <span className="badge badge-founding">Featured</span>}
                </div>
              </>
            )}
          </div>
          <button className="btn btn-sm" onClick={onClose}>Close</button>
        </div>

        {err && <div className="alert alert-error">{err}</div>}

        {!editing && bill && (
          <>
            <section style={{ marginBottom: 12 }}>
              <div className="detail-grid">
                <Detail label="Slug" value={bill.slug} />
                <Detail label="Official title" value={bill.official_title} />
                <Detail label="General Assembly" value={bill.general_assembly} />
                <Detail label="Chamber of origin" value={CHAMBER_LABEL[bill.chamber_of_origin] || titleCase(bill.chamber_of_origin)} />
                <Detail label="Category" value={titleCase(bill.category)} />
                <Detail label="Introduced" value={fmtDay(bill.introduced_on)} />
                <Detail label="Last action" value={fmtDay(bill.last_action_on)} />
                <Detail label="Last action text" value={bill.last_action_text} />
                <Detail label="Next expected action" value={bill.next_expected_action} />
                <Detail label="Effective date" value={fmtDay(bill.effective_date)} />
                <Detail label="Featured" value={bill.is_featured ? 'Yes' : 'No'} />
              </div>
            </section>

            <Prose label="Summary" body={bill.summary} />
            <Prose label="What it does" body={bill.what_it_does} />
            <Prose label="Impact" body={bill.impact} />
            <Prose label="Equality impact" body={bill.equality_impact_note} />
            <Prose label="Legal risks" body={legalRiskText(bill.legal_risks)} />

            {(bill.official_bill_url || bill.bill_text_pdf_url || bill.enacted_text_url) && (
              <section style={{ margin: '10px 0' }}>
                <h4 style={{ margin: '0 0 6px' }}>Links</h4>
                <div className="bl-links">
                  {bill.official_bill_url && (
                    <a className="btn btn-sm" href={bill.official_bill_url} target="_blank" rel="noopener noreferrer">Official bill page</a>
                  )}
                  {bill.bill_text_pdf_url && (
                    <a className="btn btn-sm" href={bill.bill_text_pdf_url} target="_blank" rel="noopener noreferrer">Bill text PDF</a>
                  )}
                  {bill.enacted_text_url && (
                    <a className="btn btn-sm" href={bill.enacted_text_url} target="_blank" rel="noopener noreferrer">Enacted text</a>
                  )}
                </div>
              </section>
            )}

            <div className="bl-actions">
              {bill.slug && (
                <a className="btn" href={`/issues/${bill.slug}`} target="_blank" rel="noopener noreferrer">
                  View on the public tracker
                </a>
              )}
              {canWrite ? (
                <button className="btn btn-primary" onClick={() => setEditing(true)}>Edit bill</button>
              ) : (
                <span className="muted small" style={{ alignSelf: 'center' }}>You have read access only.</span>
              )}
            </div>
          </>
        )}

        {editing && (
          <form onSubmit={save} autoComplete="off">
            <div className="bl-form">
              <label className="field">
                <span>Bill number</span>
                <input className="input" required value={form.bill_number} placeholder="HB 249"
                       onChange={(e) => onBillNumber(e.target.value)} />
              </label>
              <label className="field">
                <span>Slug (URL stub)</span>
                <input className="input" required value={form.slug} placeholder="hb249"
                       pattern="[a-z0-9-]+" readOnly={!!bill}
                       onChange={(e) => { setSlugAuto(false); set('slug', e.target.value); }} />
              </label>
              <p className="muted small bl-span2" style={{ margin: '-6px 0 4px' }}>
                {bill
                  ? 'The slug is the join key for roll calls and sponsorships, so it stays locked once a bill exists.'
                  : 'Lowercase, no spaces. This becomes /issues/<slug>.'}
              </p>

              <label className="field bl-span2">
                <span>Title</span>
                <input className="input" required value={form.title} placeholder="Short editorial title"
                       onChange={(e) => set('title', e.target.value)} />
              </label>

              <label className="field">
                <span>Stance</span>
                <select className="select" required value={form.stance} onChange={(e) => set('stance', e.target.value)}>
                  {STANCE_OPTIONS.map((s) => <option key={s} value={s}>{STANCE_FORM_LABEL[s]}</option>)}
                  <ExtraOption value={form.stance} known={STANCE_OPTIONS} />
                </select>
              </label>
              <label className="field">
                <span>Status</span>
                <select className="select" required value={form.status} onChange={(e) => set('status', e.target.value)}>
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  <ExtraOption value={form.status} known={STATUS_OPTIONS} />
                </select>
              </label>
              <label className="field">
                <span>Chamber of origin</span>
                <select className="select" value={form.chamber_of_origin} onChange={(e) => set('chamber_of_origin', e.target.value)}>
                  <option value="">Not set</option>
                  {CHAMBER_OPTIONS.map((c) => <option key={c} value={c}>{CHAMBER_LABEL[c]}</option>)}
                  <ExtraOption value={form.chamber_of_origin} known={CHAMBER_OPTIONS} />
                </select>
              </label>
              <label className="field">
                <span>General Assembly</span>
                <select className="select" required value={form.general_assembly} onChange={(e) => set('general_assembly', e.target.value)}>
                  {GA_OPTIONS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                  <ExtraOption value={form.general_assembly} known={GA_OPTIONS.map((g) => g.value)} />
                </select>
              </label>
              <label className="field">
                <span>Category</span>
                <input className="input" value={form.category} placeholder="trans_health"
                       onChange={(e) => set('category', e.target.value)} />
              </label>
              <label className="field">
                <span>Introduced on</span>
                <input className="input" type="date" value={form.introduced_on}
                       onChange={(e) => set('introduced_on', e.target.value)} />
              </label>
              <label className="field">
                <span>Last action on</span>
                <input className="input" type="date" value={form.last_action_on}
                       onChange={(e) => set('last_action_on', e.target.value)} />
              </label>

              <label className="bl-check bl-span2">
                <input type="checkbox" checked={form.is_featured}
                       onChange={(e) => set('is_featured', e.target.checked)} />
                Featured, pinned to the top of /issues
              </label>

              <label className="field bl-span2">
                <span>Summary</span>
                <textarea className="textarea" rows={3} value={form.summary}
                          placeholder="One paragraph for /issues and the scorecard reference."
                          onChange={(e) => set('summary', e.target.value)} />
              </label>
              <label className="field bl-span2">
                <span>What it does</span>
                <textarea className="textarea" rows={3} value={form.what_it_does}
                          placeholder="Plain language explainer."
                          onChange={(e) => set('what_it_does', e.target.value)} />
              </label>
              <label className="field bl-span2">
                <span>Equality impact</span>
                <textarea className="textarea" rows={3} value={form.equality_impact_note}
                          placeholder="How does this affect LGBTQ+ Ohioans?"
                          onChange={(e) => set('equality_impact_note', e.target.value)} />
              </label>
              <label className="field bl-span2">
                <span>Legal risks</span>
                <textarea className="textarea" rows={2} value={form.legal_risks}
                          placeholder="Constitutional and statutory concerns."
                          onChange={(e) => set('legal_risks', e.target.value)} />
              </label>
              <label className="field bl-span2">
                <span>Official bill URL</span>
                <input className="input" type="url" value={form.official_bill_url}
                       placeholder="https://www.legislature.ohio.gov/..."
                       onChange={(e) => set('official_bill_url', e.target.value)} />
              </label>
              <label className="field bl-span2">
                <span>Bill text PDF URL</span>
                <input className="input" type="url" value={form.bill_text_pdf_url}
                       placeholder="https://search-prod.lis.state.oh.us/..."
                       onChange={(e) => set('bill_text_pdf_url', e.target.value)} />
              </label>
            </div>

            <div className="bl-actions">
              <button type="submit" className="btn btn-primary" disabled={saving || deleting || !canWrite}>
                {saving ? 'Saving…' : 'Save bill'}
              </button>
              <button type="button" className="btn" disabled={saving || deleting}
                      onClick={() => {
                        if (!bill) { onClose(); return; }
                        setForm(formFromBill(bill));
                        setErr(null);
                        setEditing(false);
                      }}>
                Cancel
              </button>
              <span style={{ flex: 1 }} />
              {bill && (
                <button type="button" className="btn btn-danger" disabled={saving || deleting} onClick={remove}>
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </>
  );
}
