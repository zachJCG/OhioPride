'use client';
// Intern application detail: bottom sheet on phones, side panel from 768px.
//
// The vocabularies below are the same values public.intern_applications stores,
// so they live here and the list page imports them rather than keeping a second
// copy that can drift. Status is the only field this module writes, and the
// select here calls the same handler the list rows use.
export const POSITION_LABEL = {
  chief_of_staff:         'Chief of Staff',
  legislative_internship: 'Legislative Internship',
  volunteer_internship:   'Volunteer Internship',
  digital_internship:     'Digital Internship',
  // Values retired in the 2026-05 rename. Kept so older rows still read right.
  graphics_social_media:  'Digital Internship',
  volunteer_coordinator:  'Volunteer Internship',
  legislative_director:   'Legislative Internship',
  policy_aide:            'Legislative Internship',
};

export const POSITION_OPTIONS = [
  'chief_of_staff',
  'legislative_internship',
  'volunteer_internship',
  'digital_internship',
];

export const TERM_LABEL = {
  summer_2026: 'Summer 2026',
  fall_2026:   'Fall 2026',
  either:      'Summer or Fall',
};

export const TERM_OPTIONS = ['summer_2026', 'fall_2026', 'either'];

export const STATUS_OPTIONS = [
  'new', 'contacted', 'interviewing', 'offered', 'hired', 'declined', 'withdrawn',
];

export const STATUS_LABEL = {
  new: 'New', contacted: 'Contacted', interviewing: 'Interviewing',
  offered: 'Offered', hired: 'Hired', declined: 'Declined', withdrawn: 'Withdrawn',
};

export const positionLabel = (p) => (p ? (POSITION_LABEL[p] || p) : '');
export const termLabel = (t) => (t ? (TERM_LABEL[t] || t) : '');
export const personName = (r) => `${r?.first_name || ''} ${r?.last_name || ''}`.trim();

function Detail({ label, value }) {
  return (
    <div>
      <div className="lbl">{label}</div>
      <div className="val">{value || <span className="muted">Not given</span>}</div>
    </div>
  );
}

function Prose({ heading, text }) {
  if (!text) return null;
  return (
    <section style={{ marginBottom: 14 }}>
      <h4 style={{ margin: '4px 0' }}>{heading}</h4>
      <div className="int-pre">{text}</div>
    </section>
  );
}

export default function InternDrawer({ row, canWrite, busy, onStatus, onClose }) {
  const title = personName(row) || 'Applicant';
  const submitted = row.created_at ? new Date(row.created_at).toLocaleString() : '';
  const status = row.status || 'new';
  const location = [row.city, row.county ? `${row.county} Co.` : '', row.zip]
    .filter(Boolean).join(', ');

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="drawer-head">
          <div>
            <div className="muted small" style={{ fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>
              {positionLabel(row.position) || 'Internship'}
            </div>
            <h3>{title}</h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              <span className="badge badge-muted">{termLabel(row.term) || 'No term given'}</span>
              {row.is_founding_member && <span className="badge badge-founding">Founding member</span>}
              {row.email_optin
                ? <span className="badge badge-ok">Email opt-in</span>
                : <span className="badge badge-muted">No email opt-in</span>}
            </div>
          </div>
          <button className="btn btn-sm" onClick={onClose}>Close</button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {row.email && <a className="btn btn-sm" href={`mailto:${row.email}`}>Email applicant</a>}
          {row.phone && <a className="btn btn-sm" href={`tel:${String(row.phone).replace(/[^\d+]/g, '')}`}>Call</a>}
          {row.resume_url && (
            <a className="btn btn-sm" href={row.resume_url} target="_blank" rel="noopener">Open resume</a>
          )}
          {row.portfolio_url && (
            <a className="btn btn-sm" href={row.portfolio_url} target="_blank" rel="noopener">Open portfolio</a>
          )}
        </div>

        <section style={{ marginBottom: 14 }}>
          <h4 style={{ margin: '4px 0' }}>Status</h4>
          {canWrite ? (
            <label className="field">
              <span>Where this applicant stands</span>
              <select className="select int-status" data-status={status} value={status}
                      disabled={busy} aria-label={`Status for ${title}`}
                      onChange={(e) => onStatus(row, e.target.value)}>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </label>
          ) : (
            <>
              <span className="badge badge-muted">{STATUS_LABEL[status] || status}</span>
              <div className="alert alert-warn">You have read access only, so status cannot be changed.</div>
            </>
          )}
        </section>

        <section style={{ marginBottom: 14 }}>
          <h4 style={{ margin: '4px 0' }}>Contact</h4>
          <div className="detail-grid">
            <Detail label="Email" value={row.email ? <a href={`mailto:${row.email}`}>{row.email}</a> : null} />
            <Detail label="Phone" value={row.phone ? <a href={`tel:${String(row.phone).replace(/[^\d+]/g, '')}`}>{row.phone}</a> : null} />
            <Detail label="Pronouns" value={row.pronouns} />
            <Detail label="Location" value={location} />
          </div>
        </section>

        <section style={{ marginBottom: 14 }}>
          <h4 style={{ margin: '4px 0' }}>Position</h4>
          <div className="detail-grid">
            <Detail label="Applied for" value={<strong>{positionLabel(row.position)}</strong>} />
            <Detail label="Term" value={termLabel(row.term)} />
            <Detail label="Earliest start" value={row.start_date_pref} />
            <Detail label="Hours per week" value={row.weekly_hours ? `${row.weekly_hours} hrs` : null} />
            <Detail label="Credit hours" value={row.credit_hours != null ? String(row.credit_hours) : null} />
          </div>
        </section>

        <section style={{ marginBottom: 14 }}>
          <h4 style={{ margin: '4px 0' }}>Academic</h4>
          <div className="detail-grid">
            <Detail label="Institution" value={row.institution} />
            <Detail label="Program or major" value={row.program_major} />
            <Detail label="Class year" value={row.class_year} />
            <Detail
              label="Faculty coordinator"
              value={row.faculty_sponsor_name ? (
                <>
                  {row.faculty_sponsor_name}
                  {row.faculty_sponsor_email && (
                    <>
                      {' · '}
                      <a href={`mailto:${row.faculty_sponsor_email}`}>{row.faculty_sponsor_email}</a>
                    </>
                  )}
                </>
              ) : null}
            />
          </div>
        </section>

        <section style={{ marginBottom: 14 }}>
          <h4 style={{ margin: '4px 0' }}>Statement of interest</h4>
          {row.statement_of_interest
            ? <div className="int-pre">{row.statement_of_interest}</div>
            : <p className="muted small" style={{ margin: 0 }}>No statement provided.</p>}
        </section>

        <Prose heading="Prior experience" text={row.prior_experience} />
        <Prose heading="Why Ohio Pride" text={row.why_ohio_pride} />

        <section style={{ marginBottom: 14 }}>
          <h4 style={{ margin: '4px 0' }}>Wrap-up</h4>
          <div className="detail-grid">
            <Detail label="Referral source" value={row.referral_source} />
            <Detail label="Founding member" value={row.is_founding_member ? 'Yes' : 'No'} />
            <Detail label="Email opt-in" value={row.email_optin ? 'Yes' : 'No'} />
            <Detail label="Submitted" value={submitted} />
          </div>
        </section>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </>
  );
}
