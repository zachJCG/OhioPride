'use client';
// Full member record. The two roster toggles write founding_members directly
// and patch the list optimistically through onPatch, rolling the same way back
// if the write is refused, so the row never shows a state the database did not
// accept.
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { money, shortDate } from '../../lib/format';

function Cell({ label, children }) {
  return (
    <div>
      <div className="lbl">{label}</div>
      <div className="val">{children || <span className="muted">Not on file</span>}</div>
    </div>
  );
}

export default function MemberDrawer({ member, canWrite, notify, onPatch, onClose }) {
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function toggle(field) {
    if (!canWrite || saving) return;
    const next = !member[field];
    setSaving(field);
    onPatch(member.id, { [field]: next });
    const { error } = await supabase().from('founding_members')
      .update({ [field]: next }).eq('id', member.id);
    setSaving(null);
    if (error) {
      onPatch(member.id, { [field]: !next });
      notify('Could not save that change: ' + error.message);
      return;
    }
    notify(field === 'is_public'
      ? (next ? 'Added to the public roster.' : 'Removed from the public roster.')
      : (next ? 'Marked as vetted.' : 'Vetting cleared.'));
  }

  const name = member.full_name || member.display_name || member.email || 'Unnamed member';

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer" role="dialog" aria-modal="true" aria-label={name}>
        <div className="drawer-head">
          <div>
            <h3>{name}</h3>
            <div className="muted small" style={{ overflowWrap: 'anywhere' }}>
              {member.email || 'no email on file'}
            </div>
          </div>
          <button className="btn btn-sm" onClick={onClose}>Close</button>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {member.founding_number != null && (
            <span className="badge badge-founding">Founding #{member.founding_number}</span>
          )}
          <span className="badge badge-muted">
            {money(member.amount_cents)}{member.recurrence === 'monthly' ? ' monthly' : ' one time'}
          </span>
          <span className={`badge ${member.is_public ? 'badge-ok' : 'badge-muted'}`}>
            {member.is_public ? 'On public roster' : 'Not public'}
          </span>
          <span className={`badge ${member.is_vetted ? 'badge-ok' : 'badge-review'}`}>
            {member.is_vetted ? 'Vetted' : 'Needs vetting'}
          </span>
        </div>

        <section style={{ marginBottom: 14 }}>
          <h4 style={{ margin: '4px 0' }}>Public roster</h4>
          <div className="card">
            <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 34 }}>
              <input type="checkbox" checked={!!member.is_public} disabled={!canWrite || saving === 'is_public'}
                     onChange={() => toggle('is_public')} />
              Show on the public founding members list
            </label>
            <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 34 }}>
              <input type="checkbox" checked={!!member.is_vetted} disabled={!canWrite || saving === 'is_vetted'}
                     onChange={() => toggle('is_vetted')} />
              Vetted for publication
            </label>
            <div className="muted small" style={{ marginTop: 4 }}>
              Both have to be on before this member appears on ohiopride.org. They show as
              “{member.display_name || 'Anonymous'}”.
            </div>
            {!canWrite && <div className="muted small" style={{ marginTop: 6 }}>You have read access only.</div>}
          </div>
        </section>

        <section style={{ marginBottom: 14 }}>
          <h4 style={{ margin: '4px 0' }}>Gift</h4>
          <div className="detail-grid">
            <Cell label="Amount">
              {money(member.amount_cents)}{member.recurrence === 'monthly' ? '/mo' : ''}
            </Cell>
            <Cell label="Recurrence">{member.recurrence === 'monthly' ? 'Monthly' : 'One time'}</Cell>
            <Cell label="Contributed">{shortDate(member.contributed_at)}</Cell>
            <Cell label="Founding number">{member.founding_number != null ? `#${member.founding_number}` : null}</Cell>
          </div>
        </section>

        <section style={{ marginBottom: 14 }}>
          <h4 style={{ margin: '4px 0' }}>Person</h4>
          <div className="detail-grid">
            <Cell label="Full name">{member.full_name}</Cell>
            <Cell label="Public display name">{member.display_name}</Cell>
            <Cell label="Employer">{member.employer}</Cell>
            <Cell label="Occupation">{member.occupation}</Cell>
            <Cell label="City">{member.city}</Cell>
            <Cell label="County">{member.county ? `${member.county} County` : null}</Cell>
            <Cell label="State">{member.state}</Cell>
            <Cell label="Elected office">{member.elected_office}</Cell>
            <Cell label="Jurisdiction">{member.jurisdiction}</Cell>
          </div>
          {member.public_quote && (
            <div className="card" style={{ marginTop: 8 }}>
              <div className="lbl" style={{ fontSize: '.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--op-muted)' }}>
                Why I joined
              </div>
              <div className="small">“{member.public_quote}”</div>
            </div>
          )}
          {member.notes && (
            <div className="card" style={{ marginTop: 8 }}>
              <div className="lbl" style={{ fontSize: '.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--op-muted)' }}>
                Internal notes
              </div>
              <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{member.notes}</div>
            </div>
          )}
        </section>

        <section style={{ marginBottom: 14 }}>
          <h4 style={{ margin: '4px 0' }}>Contact record</h4>
          {member.contact_id ? (
            <>
              <a className="btn btn-primary" style={{ width: '100%' }} href={`/admin/contacts?id=${member.contact_id}`}>
                Open this person&rsquo;s full contact record
              </a>
              <div className="muted small" style={{ marginTop: 6 }}>
                Phone, address, giving history, volunteer and newsletter signups all live there.
                Edit those fields in Contacts so every module sees the change.
              </div>
            </>
          ) : (
            <div className="alert alert-warn">
              This member is not linked to a contact record yet, so their gift will not roll up into
              Contacts. The next ActBlue sync usually links it by email.
            </div>
          )}
        </section>

        <section>
          <h4 style={{ margin: '4px 0' }}>ActBlue</h4>
          <div className="detail-grid">
            <Cell label="Contribution ID">{member.actblue_contribution_id}</Cell>
            <Cell label="Receipt ID">{member.actblue_receipt_id}</Cell>
            <Cell label="Added">{shortDate(member.created_at)}</Cell>
            <Cell label="Last updated">{shortDate(member.updated_at)}</Cell>
          </div>
        </section>
      </div>
    </>
  );
}
