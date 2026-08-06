'use client';
// Person view: bottom sheet on phones, side panel on desktop. Contact fields
// (email edits go through a confirm step), giving history from donors,
// founding-member roster toggles, volunteer / network / newsletter presence,
// duplicates with one-tap merge, and one "Add gift/check" action that writes
// donors. compliance_contributions is compliance-only and is never touched.
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { money, shortDate } from '../../lib/format';

const EDIT_FIELDS = [
  ['first_name', 'First name'], ['last_name', 'Last name'], ['phone', 'Phone'],
  ['employer', 'Employer'], ['occupation', 'Occupation'],
  ['address1', 'Address'], ['city', 'City'], ['zip', 'ZIP'],
];

export default function PersonDrawer({ contactId, seedRow, canWrite, notify, onClose }) {
  const [row, setRow] = useState(seedRow);
  const [gifts, setGifts] = useState(null);
  const [founding, setFounding] = useState([]);
  const [volunteer, setVolunteer] = useState(null);
  const [network, setNetwork] = useState(null);
  const [newsletter, setNewsletter] = useState(null);
  const [dupes, setDupes] = useState([]);
  const [form, setForm] = useState(null);
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [showGift, setShowGift] = useState(false);
  const changed = useRef(false);

  useEffect(() => {
    const sb = supabase();
    (async () => {
      const { data: fresh } = await sb.from('contacts_directory').select('*').eq('id', contactId).maybeSingle();
      const r = fresh || seedRow;
      if (!r) { onClose(false); return; }
      setRow(r);
      setForm(Object.fromEntries(EDIT_FIELDS.map(([k]) => [k, r[k] || ''])));
      setNotes(r.notes || '');
      setTags((r.tags || []).join(', '));
      const [g, f, v, n, nl, d] = await Promise.all([
        sb.from('donors').select('id, amount_cents, contributed_at, recurrence, source, refcode, reason, founding_member_id')
          .eq('contact_id', contactId).order('contributed_at', { ascending: false }),
        sb.from('founding_members').select('id, founding_number, amount_cents, recurrence, display_name, is_public, is_vetted')
          .eq('contact_id', contactId).order('founding_number'),
        sb.from('volunteers').select('id, status, created_at').eq('contact_id', contactId).limit(1).maybeSingle(),
        sb.from('network_contacts').select('id, organization, title').eq('contact_id', contactId).limit(1).maybeSingle(),
        sb.from('newsletter_subscribers').select('id, created_at').eq('contact_id', contactId).limit(1).maybeSingle(),
        sb.rpc('contacts_possible_duplicates', { p_id: contactId }),
      ]);
      setGifts(g.data || []);
      setFounding(f.data || []);
      setVolunteer(v.data || null);
      setNetwork(n.data || null);
      setNewsletter(nl.data || null);
      setDupes((d.data || []).filter(x => x.id !== contactId));
    })();
  }, [contactId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function zipLookup(zip) {
    if (!/^\d{5}$/.test(zip)) return;
    const sb = supabase();
    const [city, county, region] = await Promise.all([
      sb.rpc('city_for_zip', { p_zip: zip }), sb.rpc('county_for_zip', { p_zip: zip }), sb.rpc('region_for_zip', { p_zip: zip }),
    ]);
    setForm(f => ({ ...f, city: f.city || city.data || '', _county: county.data || '', _region: region.data || '' }));
  }

  async function save() {
    setSaving(true);
    const patch = {};
    for (const [k] of EDIT_FIELDS) {
      const v = String(form[k] || '').trim() || null;
      if (v !== (row[k] || null)) patch[k] = v;
    }
    if (form._county) patch.county = form._county;
    if (form._region) patch.region = form._region;
    if ((patch.first_name !== undefined) || (patch.last_name !== undefined)) {
      const fn = patch.first_name !== undefined ? patch.first_name : row.first_name;
      const ln = patch.last_name !== undefined ? patch.last_name : row.last_name;
      patch.full_name = [fn, ln].filter(Boolean).join(' ') || null;
      patch.name = patch.full_name;
    }
    if ((notes.trim() || null) !== (row.notes || null)) patch.notes = notes.trim() || null;
    const tagArr = tags.split(',').map(t => t.trim()).filter(Boolean);
    if (JSON.stringify(tagArr) !== JSON.stringify(row.tags || [])) patch.tags = tagArr;
    if (!Object.keys(patch).length) { setSaving(false); notify('Nothing to save.'); return; }
    const { error } = await supabase().from('contacts').update(patch).eq('id', contactId);
    setSaving(false);
    if (error) { notify('Save failed: ' + error.message); return; }
    changed.current = true;
    setRow(r => ({ ...r, ...patch }));
    notify('Saved.');
  }

  async function changeEmail() {
    const next = window.prompt(
      'Email is the identity key for this contact. Gifts, membership, and sync matching all key on it.\n\nNew email for ' + (row.full_name || row.email) + ':',
      row.email || '');
    if (next == null) return;
    const email = next.trim().toLowerCase();
    if (!email || email === row.email) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { notify('That does not look like an email address.'); return; }
    if (!window.confirm(`Change email from ${row.email || '(none)'} to ${email}?`)) return;
    const { error } = await supabase().from('contacts').update({ email }).eq('id', contactId);
    if (error) {
      notify(error.code === '23505'
        ? 'A contact with that email already exists. Merge the two records instead.'
        : 'Email change failed: ' + error.message);
      return;
    }
    changed.current = true;
    setRow(r => ({ ...r, email }));
    notify('Email updated.');
  }

  async function toggleDnc() {
    const next = !row.do_not_contact;
    const { error } = await supabase().from('contacts').update({ do_not_contact: next }).eq('id', contactId);
    if (error) { notify('Update failed.'); return; }
    changed.current = true;
    setRow(r => ({ ...r, do_not_contact: next }));
  }

  async function clearReview() {
    const { error } = await supabase().from('contacts').update({ needs_review: false, review_reason: null }).eq('id', contactId);
    if (error) { notify('Update failed.'); return; }
    changed.current = true;
    setRow(r => ({ ...r, needs_review: false, review_reason: null }));
    notify('Marked as reviewed.');
  }

  async function toggleFounding(fm, field) {
    const next = !fm[field];
    const { error } = await supabase().from('founding_members').update({ [field]: next }).eq('id', fm.id);
    if (error) { notify('Update failed: ' + error.message); return; }
    setFounding(list => list.map(x => x.id === fm.id ? { ...x, [field]: next } : x));
    changed.current = true;
  }

  async function mergeDupe(dupe) {
    if (!window.confirm(`Merge "${dupe.name || dupe.email}" INTO this contact?\n\nTheir gifts, signups, and history move here; the duplicate is tombstoned. This cannot be undone.`)) return;
    const { error } = await supabase().rpc('merge_contacts', { p_winner: contactId, p_loser: dupe.id });
    if (error) { notify('Merge failed: ' + error.message); return; }
    changed.current = true;
    setDupes(ds => ds.filter(x => x.id !== dupe.id));
    notify('Merged.');
  }

  async function addGift(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const dollars = parseFloat(String(fd.get('amount') || '').replace(/[$,]/g, ''));
    if (!(dollars > 0)) { notify('Enter a gift amount.'); return; }
    const date = String(fd.get('date') || '') || new Date().toISOString().slice(0, 10);
    const insert = {
      contact_id: contactId,
      full_name: row.full_name || row.email,
      email: row.email,
      amount_cents: Math.round(dollars * 100),
      contributed_at: new Date(date + 'T12:00:00').toISOString(),
      source: String(fd.get('source') || 'check'),
      reason: String(fd.get('reason') || '').trim() || null,
    };
    const { error } = await supabase().from('donors').insert(insert);
    if (error) { notify('Could not record the gift: ' + error.message); return; }
    changed.current = true;
    setShowGift(false);
    const { data: g } = await supabase().from('donors')
      .select('id, amount_cents, contributed_at, recurrence, source, refcode, reason, founding_member_id')
      .eq('contact_id', contactId).order('contributed_at', { ascending: false });
    setGifts(g || []);
    notify('Gift recorded.');
  }

  if (!row) return null;

  return (
    <>
      <div className="drawer-scrim" onClick={() => onClose(changed.current)} />
      <div className="drawer" role="dialog" aria-modal="true" aria-label={row.full_name || row.email}>
        <div className="drawer-head">
          <div>
            <h3>{row.full_name || row.email}</h3>
            <div className="muted small" style={{ overflowWrap: 'anywhere' }}>
              {row.email || 'no email on file'}
              {canWrite && <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={changeEmail}>Change</button>}
            </div>
          </div>
          <button className="btn btn-sm" onClick={() => onClose(changed.current)}>Close</button>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {founding.length > 0 && <span className="badge badge-founding">Founding{founding[0].founding_number ? ` #${founding[0].founding_number}` : ''}</span>}
          {volunteer && <span className="badge badge-ok">Volunteer{volunteer.status ? ` · ${volunteer.status}` : ''}</span>}
          {network && <span className="badge badge-muted">Network{network.organization ? ` · ${network.organization}` : ''}</span>}
          {newsletter && <span className="badge badge-muted">Newsletter</span>}
          {row.do_not_contact && <span className="badge badge-bad">Do not contact</span>}
        </div>

        {row.needs_review && (
          <div className="alert alert-warn">
            <strong>Needs review:</strong> {row.review_reason || 'flagged'}
            {canWrite && <div style={{ marginTop: 6 }}><button className="btn btn-sm" onClick={clearReview}>Mark reviewed</button></div>}
          </div>
        )}

        <section style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <h4 style={{ margin: '4px 0' }}>Giving</h4>
            {gifts?.length > 0 && <span className="muted small">{money(row.total_cents)} lifetime · {gifts.length} gift{gifts.length > 1 ? 's' : ''}</span>}
            <span style={{ flex: 1 }} />
            {canWrite && <button className="btn btn-sm btn-accent" onClick={() => setShowGift(s => !s)}>{showGift ? 'Cancel' : 'Add gift/check'}</button>}
          </div>
          {showGift && (
            <form className="card" style={{ margin: '6px 0' }} onSubmit={addGift}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <label className="field"><span>Amount</span><input className="input" name="amount" inputMode="decimal" placeholder="$25.00" required /></label>
                <label className="field"><span>Date</span><input className="input" name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label>
              </div>
              <label className="field"><span>Source</span>
                <select className="select" name="source" defaultValue="check">
                  <option value="check">Check</option>
                  <option value="manual">Manual entry</option>
                </select>
              </label>
              <label className="field"><span>Note</span><input className="input" name="reason" placeholder="Optional context" /></label>
              <button className="btn btn-primary" style={{ width: '100%' }}>Record gift</button>
            </form>
          )}
          {gifts == null ? <div className="muted small">Loading…</div> : gifts.length ? gifts.map(g => (
            <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--op-line)', fontSize: '.9rem' }}>
              <span>
                {shortDate(g.contributed_at)}
                <span className="muted"> · {g.source || 'gift'}{g.founding_member_id ? ' · founding' : ''}{g.recurrence === 'monthly' ? ' · monthly' : ''}</span>
                {g.reason && <span className="muted small" style={{ display: 'block' }}>{g.reason}</span>}
              </span>
              <strong>{money(g.amount_cents)}</strong>
            </div>
          )) : <div className="muted small">No gifts on file.</div>}
        </section>

        {founding.length > 0 && (
          <section style={{ marginBottom: 14 }}>
            <h4 style={{ margin: '4px 0' }}>Founding membership</h4>
            {founding.map(fm => (
              <div key={fm.id} className="card" style={{ marginBottom: 6, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span><strong>#{fm.founding_number ?? '—'}</strong> · {money(fm.amount_cents)}{fm.recurrence === 'monthly' ? '/mo' : ''}</span>
                <span className="muted small">as “{fm.display_name || row.full_name}”</span>
                <span style={{ flex: 1 }} />
                <label className="small" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input type="checkbox" checked={!!fm.is_public} disabled={!canWrite} onChange={() => toggleFounding(fm, 'is_public')} /> Public roster
                </label>
                <label className="small" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input type="checkbox" checked={!!fm.is_vetted} disabled={!canWrite} onChange={() => toggleFounding(fm, 'is_vetted')} /> Vetted
                </label>
              </div>
            ))}
          </section>
        )}

        <section style={{ marginBottom: 14 }}>
          <h4 style={{ margin: '4px 0' }}>Details</h4>
          {form && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {EDIT_FIELDS.map(([k, label]) => (
                <label key={k} className="field" style={{ gridColumn: k === 'address1' ? '1 / -1' : undefined }}>
                  <span>{label}</span>
                  <input className="input" value={form[k]} disabled={!canWrite}
                         onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                         onBlur={k === 'zip' ? (e) => zipLookup(e.target.value.trim()) : undefined} />
                </label>
              ))}
            </div>
          )}
          <div className="muted small" style={{ margin: '2px 0 8px' }}>
            {[row.county && `${row.county} County`, row.region, row.state].filter(Boolean).join(' · ')}
            {form?._county && form._county !== row.county ? ` → will set ${form._county} County` : ''}
          </div>
          <label className="field"><span>Tags (comma separated)</span>
            <input className="input" value={tags} disabled={!canWrite} onChange={e => setTags(e.target.value)} />
          </label>
          <label className="field"><span>Notes</span>
            <textarea className="textarea" value={notes} disabled={!canWrite} onChange={e => setNotes(e.target.value)} />
          </label>
          {canWrite && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save changes'}</button>
              <button className="btn" onClick={toggleDnc}>{row.do_not_contact ? 'Allow contact' : 'Mark do-not-contact'}</button>
            </div>
          )}
        </section>

        {dupes.length > 0 && (
          <section style={{ marginBottom: 8 }}>
            <h4 style={{ margin: '4px 0' }}>Possible duplicates</h4>
            {dupes.map(d => (
              <div key={d.id} className="card" style={{ marginBottom: 6, display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ flex: 1 }}>
                  <strong>{d.name || d.email || 'Unnamed'}</strong>
                  <span className="muted small" style={{ display: 'block' }}>{[d.email, d.phone, d.match_reason].filter(Boolean).join(' · ')}</span>
                </span>
                {canWrite && <button className="btn btn-sm" onClick={() => mergeDupe(d)}>Merge into this</button>}
              </div>
            ))}
          </section>
        )}
      </div>
    </>
  );
}
