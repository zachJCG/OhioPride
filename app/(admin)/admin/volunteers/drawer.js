'use client';
// Volunteer detail: bottom sheet on phones, side panel from 768px.
//
// The vocabularies below are the same option lists the public /volunteer and
// /pride/signup forms write, so they live here and the list page imports them
// rather than keeping a second copy that can drift.
//
// Every field on this form maps to a column on public.volunteers and the save
// writes them all in one update by id, exactly as the static console did.
import { useState } from 'react';
import { supabase } from '../../lib/supabase';

export const INTEREST_LABEL = {
  field_canvassing:     'Field & canvassing',
  phone_text_banking:   'Phone & text banking',
  pride_tabling:        'Pride tabling',
  walk_pride_parade:    'Walk in a Pride parade',
  social_amplification: 'Social amplification',
  skills_based:         'Skills-based',
  house_party_host:     'House party host',
  local_captain:        'Local captain',
  day_of_logistics:     'Day-of logistics',
};

export const INTEREST_SHORT = {
  field_canvassing:     'Field',
  phone_text_banking:   'Phone/Text',
  pride_tabling:        'Tabling',
  walk_pride_parade:    'Parade',
  social_amplification: 'Social',
  skills_based:         'Skills',
  house_party_host:     'House Party',
  local_captain:        'Captain',
  day_of_logistics:     'Logistics',
};

export const SKILL_LABEL = {
  writing: 'Writing', graphic_design: 'Graphic Design', photography: 'Photography',
  videography: 'Videography', legal: 'Legal', data_analysis: 'Data Analysis',
  web_development: 'Web Development', accounting_finance: 'Accounting & Finance',
  event_planning: 'Event Planning', public_speaking: 'Public Speaking',
  fundraising: 'Fundraising', social_media: 'Social Media', asl: 'ASL',
  spanish: 'Spanish', other_language: 'Other Language',
};

export const AVAIL_LABEL = {
  weekday_days: 'Weekday days', weekday_evenings: 'Weekday evenings', weekends: 'Weekends',
};

export const TIME_OPTIONS = ['one_time', 'monthly', 'weekly', 'surge_only'];
export const TIME_LABEL = {
  one_time: 'One-time', monthly: 'A few hrs/mo', weekly: 'A few hrs/wk', surge_only: 'Surge only',
};

export const TSHIRT_OPTIONS = ['xs', 's', 'm', 'l', 'xl', '2xl', '3xl', '4xl'];
export const TSHIRT_LABEL = {
  xs: 'XS', s: 'S', m: 'M', l: 'L', xl: 'XL', '2xl': '2XL', '3xl': '3XL', '4xl': '4XL',
};

export const VOTER_OPTIONS = ['yes', 'no', 'unsure'];

export const STATUS_OPTIONS = ['new', 'contacted', 'assigned', 'inactive', 'declined'];
export const STATUS_LABEL = {
  new: 'New', contacted: 'Contacted', assigned: 'Assigned',
  inactive: 'Inactive', declined: 'Declined',
};

// referral_source values worth a friendly label. 'pride_signup' is set by the
// trg_sync_pride_volunteer trigger whenever someone submits /pride/signup.
export const SOURCE_KNOWN = [
  { value: 'pride_signup',  label: 'Pride signup' },
  { value: 'volunteer_form', label: 'Volunteer form' },
];

export const sourceLabel = (src) =>
  !src ? '' : (SOURCE_KNOWN.find((s) => s.value === src)?.label || src);

export const personName = (r) =>
  `${r?.first_name || ''} ${r?.last_name || ''}`.trim();

export const adminLabel = (u) => (u ? (u.full_name || u.email) : '');

const trimOrNull = (v) => {
  const s = String(v == null ? '' : v).trim();
  return s.length ? s : null;
};

function CheckGrid({ legend, labels, selected, disabled, onToggle }) {
  return (
    <fieldset className="vol-fieldset">
      <legend>{legend}</legend>
      <div className="vol-checks">
        {Object.keys(labels).map((k) => (
          <label key={k} className="vol-check">
            <input type="checkbox" value={k} checked={selected.includes(k)}
                   disabled={disabled} onChange={() => onToggle(k)} />
            {labels[k]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function VolunteerDrawer({ row, admins, adminsById, canWrite, notify, onSaved, onClose }) {
  const [f, setF] = useState({
    first_name: row.first_name || '',
    last_name: row.last_name || '',
    email: row.email || '',
    phone: row.phone || '',
    pronouns: row.pronouns || '',
    city: row.city || '',
    county: row.county || '',
    zip: row.zip || '',
    registered_voter: row.registered_voter || '',
    time_commitment: row.time_commitment || '',
    tshirt_size: row.tshirt_size || '',
    referral_source: row.referral_source || '',
    prior_campaign_notes: row.prior_campaign_notes || '',
    additional_notes: row.additional_notes || '',
    admin_notes: row.admin_notes || '',
    status: row.status || 'new',
    assigned_to: row.assigned_to || '',
    prior_campaign_experience: !!row.prior_campaign_experience,
    is_founding_member: !!row.is_founding_member,
    email_optin: !!row.email_optin,
    sms_optin: !!row.sms_optin,
  });
  const [interests, setInterests] = useState(row.interests || []);
  const [skills, setSkills] = useState(row.skills || []);
  const [availability, setAvailability] = useState(row.availability || []);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setF((cur) => ({ ...cur, [k]: v }));
  };
  const toggle = (setter) => (k) =>
    setter((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));

  const assigneeMissing = row.assigned_to && !adminsById[row.assigned_to];

  async function save() {
    if (!canWrite) return;
    const patch = {
      first_name: trimOrNull(f.first_name) || '',
      last_name: trimOrNull(f.last_name) || '',
      email: trimOrNull(f.email),
      phone: trimOrNull(f.phone),
      pronouns: trimOrNull(f.pronouns),
      city: trimOrNull(f.city),
      county: trimOrNull(f.county),
      zip: trimOrNull(f.zip),
      registered_voter: trimOrNull(f.registered_voter),
      time_commitment: trimOrNull(f.time_commitment),
      tshirt_size: trimOrNull(f.tshirt_size),
      referral_source: trimOrNull(f.referral_source),
      prior_campaign_experience: f.prior_campaign_experience === true,
      prior_campaign_notes: trimOrNull(f.prior_campaign_notes),
      is_founding_member: f.is_founding_member === true,
      email_optin: f.email_optin === true,
      sms_optin: f.sms_optin === true,
      additional_notes: trimOrNull(f.additional_notes),
      admin_notes: trimOrNull(f.admin_notes),
      status: f.status || 'new',
      assigned_to: f.assigned_to || null,
      interests,
      skills,
      availability,
    };
    if (!patch.first_name || !patch.last_name || !patch.email) {
      setErr('First name, last name and email are required.');
      return;
    }

    setSaving(true);
    setErr(null);
    const { data, error } = await supabase()
      .from('volunteers').update(patch).eq('id', row.id).select().single();
    setSaving(false);
    if (error) {
      // Email is uniquely indexed on volunteers, so a duplicate lands here.
      setErr(error.code === '23505'
        ? 'Another volunteer already has that email.'
        : 'Could not save changes. ' + error.message);
      return;
    }
    onSaved(row.id, data);
    notify('Volunteer saved.');
    onClose();
  }

  const submitted = row.created_at ? new Date(row.created_at).toLocaleString() : '';
  const title = personName(row) || 'Volunteer';

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="drawer-head">
          <div>
            <div className="muted small" style={{ fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>
              {row.county ? `${row.county} County` : 'Volunteer'}
            </div>
            <h3>{title}</h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {row.referral_source === 'pride_signup'
                ? <span className="badge badge-pride">Pride signup</span>
                : row.referral_source
                  ? <span className="badge badge-muted">{sourceLabel(row.referral_source)}</span>
                  : null}
              <span className="badge badge-muted">{STATUS_LABEL[row.status] || row.status || 'New'}</span>
              {row.is_founding_member && <span className="badge badge-founding">Founding member</span>}
            </div>
          </div>
          <button className="btn btn-sm" onClick={onClose}>Close</button>
        </div>

        {err && <div className="alert alert-error">{err}</div>}
        {!canWrite && <div className="alert alert-warn">You have read access only, so these fields cannot be changed.</div>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {row.contact_id && (
            <a className="btn btn-sm" href={`/admin/contacts?id=${row.contact_id}`}>Open the contact record</a>
          )}
          {row.email && <a className="btn btn-sm" href={`mailto:${row.email}`}>Email</a>}
          {row.phone && <a className="btn btn-sm" href={`tel:${String(row.phone).replace(/[^\d+]/g, '')}`}>Call</a>}
        </div>

        <section style={{ marginBottom: 14 }}>
          <h4 style={{ margin: '4px 0' }}>Assignment</h4>
          <div className="vol-form">
            <label className="field">
              <span>Status</span>
              <select className="select" value={f.status} disabled={!canWrite} onChange={set('status')}>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Assigned to</span>
              <select className="select" value={f.assigned_to} disabled={!canWrite} onChange={set('assigned_to')}>
                <option value="">Unassigned</option>
                {admins.map((u) => <option key={u.id} value={u.id}>{adminLabel(u)}</option>)}
                {assigneeMissing && <option value={row.assigned_to}>Former admin</option>}
              </select>
            </label>
            <label className="field vol-span2">
              <span>Admin notes (internal)</span>
              <textarea className="textarea" value={f.admin_notes} disabled={!canWrite} onChange={set('admin_notes')}
                        placeholder="Follow-up notes for staff. Not shown to the volunteer." />
            </label>
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            {submitted ? `Submitted ${submitted}` : 'No submission timestamp on file'}
            {row.referral_source ? ` via ${sourceLabel(row.referral_source)}` : ''}
          </p>
        </section>

        <section style={{ marginBottom: 14 }}>
          <h4 style={{ margin: '4px 0' }}>Contact</h4>
          <div className="vol-form">
            <label className="field">
              <span>First name</span>
              <input className="input" value={f.first_name} disabled={!canWrite} onChange={set('first_name')} />
            </label>
            <label className="field">
              <span>Last name</span>
              <input className="input" value={f.last_name} disabled={!canWrite} onChange={set('last_name')} />
            </label>
            <label className="field">
              <span>Email</span>
              <input className="input" type="email" inputMode="email" value={f.email}
                     disabled={!canWrite} onChange={set('email')} />
            </label>
            <label className="field">
              <span>Phone</span>
              <input className="input" type="tel" inputMode="tel" value={f.phone}
                     disabled={!canWrite} onChange={set('phone')} />
            </label>
            <label className="field vol-span2">
              <span>Pronouns</span>
              <input className="input" value={f.pronouns} disabled={!canWrite} onChange={set('pronouns')} />
            </label>
          </div>
        </section>

        <section style={{ marginBottom: 14 }}>
          <h4 style={{ margin: '4px 0' }}>Location</h4>
          <div className="vol-form">
            <label className="field">
              <span>City</span>
              <input className="input" value={f.city} disabled={!canWrite} onChange={set('city')} />
            </label>
            <label className="field">
              <span>County</span>
              <input className="input" value={f.county} disabled={!canWrite} onChange={set('county')} />
            </label>
            <label className="field">
              <span>ZIP</span>
              <input className="input" inputMode="numeric" value={f.zip} disabled={!canWrite} onChange={set('zip')} />
            </label>
            <label className="field">
              <span>Registered voter</span>
              <select className="select" value={f.registered_voter} disabled={!canWrite} onChange={set('registered_voter')}>
                <option value="">Not answered</option>
                {VOTER_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
          </div>
        </section>

        <section style={{ marginBottom: 14 }}>
          <h4 style={{ margin: '4px 0' }}>How they want to help</h4>
          <CheckGrid legend="Interests" labels={INTEREST_LABEL} selected={interests}
                     disabled={!canWrite} onToggle={toggle(setInterests)} />
          <CheckGrid legend="Skills" labels={SKILL_LABEL} selected={skills}
                     disabled={!canWrite} onToggle={toggle(setSkills)} />
          <CheckGrid legend="Availability" labels={AVAIL_LABEL} selected={availability}
                     disabled={!canWrite} onToggle={toggle(setAvailability)} />

          <div className="vol-form">
            <label className="field">
              <span>Commitment</span>
              <select className="select" value={f.time_commitment} disabled={!canWrite} onChange={set('time_commitment')}>
                <option value="">Not answered</option>
                {TIME_OPTIONS.map((t) => <option key={t} value={t}>{TIME_LABEL[t]}</option>)}
              </select>
            </label>
            <label className="field">
              <span>T-shirt size</span>
              <select className="select" value={f.tshirt_size} disabled={!canWrite} onChange={set('tshirt_size')}>
                <option value="">Not answered</option>
                {TSHIRT_OPTIONS.map((t) => <option key={t} value={t}>{TSHIRT_LABEL[t]}</option>)}
              </select>
            </label>
            <label className="field vol-span2">
              <span>Referral source</span>
              <input className="input" value={f.referral_source} disabled={!canWrite} onChange={set('referral_source')} />
            </label>
            <label className="field vol-span2">
              <span>Prior campaign notes</span>
              <textarea className="textarea" value={f.prior_campaign_notes} disabled={!canWrite}
                        onChange={set('prior_campaign_notes')} />
            </label>
          </div>

          <label className="vol-check">
            <input type="checkbox" checked={f.prior_campaign_experience} disabled={!canWrite}
                   onChange={set('prior_campaign_experience')} />
            Prior campaign experience
          </label>
          <label className="vol-check">
            <input type="checkbox" checked={f.is_founding_member} disabled={!canWrite}
                   onChange={set('is_founding_member')} />
            Founding member
          </label>
          <label className="vol-check">
            <input type="checkbox" checked={f.email_optin} disabled={!canWrite} onChange={set('email_optin')} />
            Email opt-in
          </label>
          <label className="vol-check">
            <input type="checkbox" checked={f.sms_optin} disabled={!canWrite} onChange={set('sms_optin')} />
            SMS opt-in
          </label>
        </section>

        <section style={{ marginBottom: 14 }}>
          <h4 style={{ margin: '4px 0' }}>Notes from the volunteer</h4>
          <textarea className="textarea" value={f.additional_notes} disabled={!canWrite}
                    onChange={set('additional_notes')} />
        </section>

        {canWrite && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button className="btn" disabled={saving} onClick={onClose}>Cancel</button>
          </div>
        )}
      </div>
    </>
  );
}
