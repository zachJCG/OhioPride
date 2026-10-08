'use client';
/* The five-step candidate application.
 *
 *   1 Info  2 The race  3 Experience  4 What you need  5 Consent and submit
 *
 * One step per screen on a phone, a progress bar across the top, and the
 * draft saved to sessionStorage on every change so a dropped connection or a
 * tab switch costs nothing. ?race=<slug> pre-selects a race from /2027/races
 * and shows its card above the select.
 *
 * Anti-spam is a honeypot field and a two second minimum fill time, both
 * checked by the API. No CAPTCHA.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BALLOT_PATH_OPTIONS, HELP_OPTIONS, IS_OUT_OPTIONS, PARTY_OPTIONS, RACE_LEVEL_OPTIONS,
  RACE_RESULT_OPTIONS, REGION_ORDER, SIGNATURE_OPTIONS, filingLine, raceOptionLabel, shortDate,
} from '../../../lib/candidates.mjs';
import { OHIO_COUNTIES } from '../../../lib/ohio-counties.mjs';
import KeyDates from '../components/KeyDates';

const STORAGE_KEY = 'ohp-candidate-apply-v1';
const NOT_LISTED = '__other__';
const MAX_RACES = 6;
const WHY_MAX = 1000;

const STEPS = ['Info', 'The race', 'Experience', 'What you need', 'Submit'];

const EMPTY = {
  first_name: '', last_name: '', pronouns: '', email: '', phone: '',
  city: '', county: '', zip: '', is_out: '', party: '',
  race_choice: '', office_sought: '', jurisdiction: '', race_level: '', ballot_path: '',
  has_filed: '',
  previous_offices: '', never_ran: false,
  previous_races: [],
  signature_experience: '', signature_experience_note: '',
  help_needed: [], help_other: '', why_running: '', anything_else: '',
  consent_contact: false, consent_share_with_mentors: true,
};

const EMPTY_RACE = { office: '', year: '', result: '', vote_share: '', notes: '' };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** (614) 555-0100 as the person types. Digits only underneath. */
function formatPhone(raw) {
  const d = String(raw || '').replace(/\D/g, '').replace(/^1(?=\d{10})/, '').slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

function readDraft() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch { return null; }
}

function Field({ label, hint, required, children, error, id }) {
  return (
    <div className={`capply-field${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>
        {label}{required && <span className="capply-req" aria-hidden="true"> *</span>}
      </label>
      {hint && <p className="capply-hint" id={`${id}-hint`}>{hint}</p>}
      {children}
      {error && <p className="capply-error" id={`${id}-error`} role="alert">{error}</p>}
    </div>
  );
}

function RadioList({ name, value, options, onChange, legend }) {
  return (
    <fieldset className="capply-fieldset">
      <legend>{legend}</legend>
      {options.map(([key, label]) => (
        <label key={key} className="capply-choice">
          <input type="radio" name={name} value={key} checked={value === key} onChange={() => onChange(key)} />
          <span>{label}</span>
        </label>
      ))}
    </fieldset>
  );
}

export default function CandidateApplyForm({ races, cycles, endorsementPath, racesPath }) {
  const [form, setForm] = useState(EMPTY);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [done, setDone] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const startedAt = useRef(Date.now());
  const topRef = useRef(null);
  const hpRef = useRef(null);

  const bySlug = useMemo(() => Object.fromEntries(races.map((r) => [r.slug, r])), [races]);
  const byId = useMemo(() => Object.fromEntries(races.map((r) => [r.id, r])), [races]);

  /* Restore the draft, then let ?race= win over whatever race the draft held:
   * a person who taps "Apply for this race" means that race. The query string
   * is read from window rather than useSearchParams so the page stays a
   * static, revalidating render with the race select already populated. */
  useEffect(() => {
    const wantedSlug = new URLSearchParams(window.location.search).get('race') || '';
    const draft = readDraft();
    const next = { ...EMPTY, ...(draft?.form || {}) };
    if (draft?.startedAt) startedAt.current = draft.startedAt;
    if (wantedSlug && bySlug[wantedSlug]) {
      next.race_choice = bySlug[wantedSlug].id;
      if (draft?.step == null) setStep(0);
    } else if (typeof draft?.step === 'number') {
      setStep(Math.min(Math.max(draft.step, 0), STEPS.length - 1));
    }
    setForm(next);
    setHydrated(true);
  }, [bySlug]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ form, step, startedAt: startedAt.current }));
    } catch { /* storage full or blocked; the form still works */ }
  }, [form, step, hydrated]);

  const set = useCallback((key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  }, []);

  const selectedRace = form.race_choice && form.race_choice !== NOT_LISTED ? byId[form.race_choice] : null;
  const notListed = form.race_choice === NOT_LISTED;

  /* Grouped by region for the select; within a region by rank. */
  const groups = useMemo(() => REGION_ORDER
    .map((g) => ({ region: g, items: races.filter((r) => r.region === g) }))
    .filter((g) => g.items.length), [races]);

  function validate(which) {
    const e = {};
    if (which === 0) {
      if (!form.first_name.trim()) e.first_name = 'Enter your first name.';
      if (!form.last_name.trim()) e.last_name = 'Enter your last name.';
      if (!EMAIL_RE.test(form.email.trim())) e.email = 'Enter a valid email address.';
      if (form.phone.replace(/\D/g, '').length !== 10) e.phone = 'Enter a 10 digit mobile number.';
      if (form.zip && !/^\d{5}(-\d{4})?$/.test(form.zip.trim())) e.zip = 'Enter a 5 digit ZIP code.';
    }
    if (which === 1) {
      if (!form.race_choice) e.race_choice = 'Pick a race, or choose "My race is not on this list".';
      if (notListed) {
        if (!form.office_sought.trim()) e.office_sought = 'Tell us the office you are seeking.';
        if (!form.jurisdiction.trim()) e.jurisdiction = 'Tell us the city, township, district, or county.';
      }
      if (!form.has_filed) e.has_filed = 'Let us know whether you have filed.';
    }
    if (which === 2) {
      if (!form.signature_experience) e.signature_experience = 'Pick the option closest to your experience.';
      form.previous_races.forEach((r, i) => {
        if (!r.office.trim()) e[`race_${i}`] = 'Each race needs an office.';
        else if (r.year && !/^\d{4}$/.test(String(r.year))) e[`race_${i}`] = 'Year should be four digits.';
        else if (r.vote_share !== '' && (Number(r.vote_share) < 0 || Number(r.vote_share) > 100)) e[`race_${i}`] = 'Vote share is a percent between 0 and 100.';
      });
    }
    if (which === 3) {
      if (!form.help_needed.length) e.help_needed = 'Pick at least one thing we can help with.';
      if (form.help_needed.includes('other') && !form.help_other.trim()) e.help_other = 'Tell us what else you need.';
      if (!form.why_running.trim()) e.why_running = 'A sentence or two is plenty.';
      if (form.why_running.length > WHY_MAX) e.why_running = `Keep this under ${WHY_MAX} characters.`;
    }
    if (which === 4) {
      if (!form.consent_contact) e.consent_contact = 'We need your permission to follow up.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function scrollTop() {
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function next() {
    if (!validate(step)) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    scrollTop();
  }
  function back() {
    setErrors({});
    setStep((s) => Math.max(s - 1, 0));
    scrollTop();
  }

  function toggleHelp(key) {
    const has = form.help_needed.includes(key);
    set('help_needed', has ? form.help_needed.filter((k) => k !== key) : [...form.help_needed, key]);
  }

  function updateRace(i, key, value) {
    const rows = form.previous_races.map((r, idx) => (idx === i ? { ...r, [key]: value } : r));
    set('previous_races', rows);
    setErrors((e) => (e[`race_${i}`] ? { ...e, [`race_${i}`]: undefined } : e));
  }

  async function submit(e) {
    e.preventDefault();
    if (!validate(4)) return;
    setSubmitting(true);
    setSubmitError(null);

    const payload = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      pronouns: form.pronouns.trim() || null,
      email: form.email.trim().toLowerCase(),
      phone: form.phone.replace(/\D/g, ''),
      city: form.city.trim() || null,
      county: form.county || null,
      zip: form.zip.trim() || null,
      is_out: form.is_out || null,
      party: form.party || null,
      target_race_id: selectedRace ? selectedRace.id : null,
      race_other: notListed ? [form.jurisdiction.trim(), form.office_sought.trim()].filter(Boolean).join(': ') : null,
      office_sought: notListed ? form.office_sought.trim() : selectedRace?.office || null,
      jurisdiction: notListed ? form.jurisdiction.trim() : selectedRace?.jurisdiction || null,
      race_level: notListed ? form.race_level || null : selectedRace?.race_level || null,
      ballot_path: notListed ? form.ballot_path || null : selectedRace?.ballot_path || null,
      has_filed: form.has_filed === 'yes' ? true : form.has_filed === 'no' ? false : null,
      previous_offices: form.previous_offices.trim() || null,
      previous_races: form.never_ran ? [] : form.previous_races.map((r) => ({
        office: r.office.trim(),
        year: r.year ? Number(r.year) : null,
        result: r.result || null,
        vote_share: r.vote_share === '' ? null : Number(r.vote_share),
        notes: r.notes.trim(),
      })),
      signature_experience: form.signature_experience,
      signature_experience_note: form.signature_experience_note.trim() || null,
      help_needed: form.help_needed,
      help_other: form.help_needed.includes('other') ? form.help_other.trim() : null,
      why_running: form.why_running.trim(),
      anything_else: form.anything_else.trim() || null,
      consent_contact: !!form.consent_contact,
      consent_share_with_mentors: !!form.consent_share_with_mentors,
      started_at: startedAt.current,
      website: hpRef.current?.value || '', // honeypot: a bot that fills every field fills this one
    };

    try {
      const res = await fetch('/api/candidate-apply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        throw new Error(body.message || 'Something went wrong. Please try again in a moment.');
      }
      try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      setDone({ id: body.id, first_name: payload.first_name });
      scrollTop();
    } catch (err) {
      setSubmitError(err.message || 'Something went wrong. Please try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="capply-shell" ref={topRef}>
        <section className="capply-done" aria-labelledby="done-title">
          <p className="capply-kicker">Application received</p>
          <h1 id="done-title">Thanks, {done.first_name}.</h1>
          <p className="capply-lede">
            A member of our team will reach out within 5 business days. In the meantime, here are
            the 2027 key dates.
          </p>
          <KeyDates cycles={cycles} compact />
          <p className="capply-done-links">
            <Link href={racesPath} className="capply-btn">Back to the 2027 races</Link>
          </p>
        </section>
      </div>
    );
  }

  const pct = Math.round(((step + 1) / STEPS.length) * 100);

  return (
    <div className="capply-shell" ref={topRef}>
      <header className="capply-head">
        <p className="capply-kicker">Race to 100</p>
        <h1>Apply to Run in 2027</h1>
        <p className="capply-lede">
          Thinking about running in 2027? Tell us about yourself and the seat. Our board and our
          network of more than 46 members currently serving in elected office will help you plan,
          petition, and win. This is a recruitment pathway. Endorsement is a separate process and
          is not guaranteed.
        </p>
      </header>

      <div className="capply-progress" role="group" aria-label="Progress">
        <div className="capply-progress-bar" role="progressbar" aria-label="Application progress" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-valuetext={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <ol className="capply-steps">
          {STEPS.map((label, i) => (
            <li key={label} className={i === step ? 'is-current' : i < step ? 'is-done' : ''} aria-current={i === step ? 'step' : undefined}>
              <span className="capply-step-num">{i + 1}</span>
              <span className="capply-step-label">{label}</span>
            </li>
          ))}
        </ol>
      </div>

      <form className="capply-form" onSubmit={submit} noValidate>
        {step === 0 && (
          <section className="capply-card" aria-labelledby="s1">
            <h2 id="s1">About you</h2>
            <div className="capply-row">
              <Field label="First name" required id="first_name" error={errors.first_name}>
                <input id="first_name" className="capply-input" autoComplete="given-name" value={form.first_name} onChange={(e) => set('first_name', e.target.value)} required />
              </Field>
              <Field label="Last name" required id="last_name" error={errors.last_name}>
                <input id="last_name" className="capply-input" autoComplete="family-name" value={form.last_name} onChange={(e) => set('last_name', e.target.value)} required />
              </Field>
            </div>
            <Field label="Pronouns" id="pronouns" hint="Optional. For example she/her, he/him, they/them.">
              <input id="pronouns" className="capply-input" value={form.pronouns} onChange={(e) => set('pronouns', e.target.value)} />
            </Field>
            <div className="capply-row">
              <Field label="Email" required id="email" error={errors.email}>
                <input id="email" type="email" className="capply-input" autoComplete="email" inputMode="email" value={form.email} onChange={(e) => set('email', e.target.value)} required />
              </Field>
              <Field label="Mobile phone" required id="phone" error={errors.phone}>
                <input id="phone" type="tel" className="capply-input" autoComplete="tel" inputMode="tel" value={form.phone} onChange={(e) => set('phone', formatPhone(e.target.value))} required />
              </Field>
            </div>
            <div className="capply-row three">
              <Field label="City" id="city">
                <input id="city" className="capply-input" autoComplete="address-level2" value={form.city} onChange={(e) => set('city', e.target.value)} />
              </Field>
              <Field label="County" id="county">
                <select id="county" className="capply-input" value={form.county} onChange={(e) => set('county', e.target.value)}>
                  <option value="">Choose a county</option>
                  {OHIO_COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="ZIP" id="zip" error={errors.zip}>
                <input id="zip" className="capply-input" autoComplete="postal-code" inputMode="numeric" value={form.zip} onChange={(e) => set('zip', e.target.value)} />
              </Field>
            </div>
            <RadioList name="is_out" legend="Do you identify as LGBTQ+?" value={form.is_out} options={IS_OUT_OPTIONS} onChange={(v) => set('is_out', v)} />
            <Field label="Party affiliation" id="party" hint="Optional. Many of these races are nonpartisan.">
              <select id="party" className="capply-input" value={form.party} onChange={(e) => set('party', e.target.value)}>
                <option value="">Choose one</option>
                {PARTY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
          </section>
        )}

        {step === 1 && (
          <section className="capply-card" aria-labelledby="s2">
            <h2 id="s2">The race</h2>
            {selectedRace && (
              <aside className="capply-race-card" aria-label="Selected race">
                <strong>{selectedRace.jurisdiction}</strong>
                <span className="capply-race-office">{selectedRace.office}</span>
                <span className="capply-race-meta">
                  {selectedRace.county ? `${selectedRace.county} County · ` : ''}{selectedRace.region} Ohio · {filingLine(selectedRace)}
                </span>
                {selectedRace.rationale && <span className="capply-race-why">{selectedRace.rationale}</span>}
              </aside>
            )}
            <Field label="Which race?" required id="race_choice" error={errors.race_choice} hint="Grouped by region. Each option shows its petition filing date.">
              <select id="race_choice" className="capply-input" value={form.race_choice} onChange={(e) => set('race_choice', e.target.value)} required>
                <option value="">Choose a race</option>
                {groups.map((g) => (
                  <optgroup key={g.region} label={`${g.region} Ohio`}>
                    {g.items.map((r) => <option key={r.id} value={r.id}>{raceOptionLabel(r)}</option>)}
                  </optgroup>
                ))}
                <optgroup label="Not listed">
                  <option value={NOT_LISTED}>My race is not on this list</option>
                </optgroup>
              </select>
            </Field>

            {notListed && (
              <div className="capply-subcard">
                <Field label="Office sought" required id="office_sought" error={errors.office_sought} hint="For example City Council Ward 2, Board of Education, Township Trustee.">
                  <input id="office_sought" className="capply-input" value={form.office_sought} onChange={(e) => set('office_sought', e.target.value)} />
                </Field>
                <Field label="Jurisdiction" required id="jurisdiction" error={errors.jurisdiction} hint="The city, village, township, school district, or county.">
                  <input id="jurisdiction" className="capply-input" value={form.jurisdiction} onChange={(e) => set('jurisdiction', e.target.value)} />
                </Field>
                <div className="capply-row">
                  <Field label="Race type" id="race_level">
                    <select id="race_level" className="capply-input" value={form.race_level} onChange={(e) => set('race_level', e.target.value)}>
                      <option value="">Choose one</option>
                      {RACE_LEVEL_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  </Field>
                  <Field label="Ballot path" id="ballot_path">
                    <select id="ballot_path" className="capply-input" value={form.ballot_path} onChange={(e) => set('ballot_path', e.target.value)}>
                      <option value="">Not sure yet</option>
                      {BALLOT_PATH_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  </Field>
                </div>
              </div>
            )}

            <RadioList name="has_filed" legend="Have you already filed petitions?" value={form.has_filed}
              options={[['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']]} onChange={(v) => set('has_filed', v)} />
            {errors.has_filed && <p className="capply-error" role="alert">{errors.has_filed}</p>}
          </section>
        )}

        {step === 2 && (
          <section className="capply-card" aria-labelledby="s3">
            <h2 id="s3">Your experience</h2>
            <Field label="Previous offices held" id="previous_offices" hint="Elected or appointed. It is fine to write none.">
              <textarea id="previous_offices" className="capply-input capply-textarea" rows={3}
                placeholder="City council, school board, party central committee, precinct captain, none"
                value={form.previous_offices} onChange={(e) => set('previous_offices', e.target.value)} />
            </Field>

            <fieldset className="capply-fieldset">
              <legend>Previous races run</legend>
              <label className="capply-choice">
                <input type="checkbox" checked={form.never_ran} onChange={(e) => {
                  set('never_ran', e.target.checked);
                  if (e.target.checked) set('previous_races', []);
                }} />
                <span>I have never run before</span>
              </label>
              {!form.never_ran && form.previous_races.map((r, i) => (
                <div key={i} className={`capply-subcard${errors[`race_${i}`] ? ' has-error' : ''}`}>
                  <div className="capply-subcard-head">
                    <strong>Race {i + 1}</strong>
                    <button type="button" className="capply-link" onClick={() => set('previous_races', form.previous_races.filter((_, idx) => idx !== i))}>Remove</button>
                  </div>
                  <div className="capply-row">
                    <Field label="Office" id={`race_office_${i}`}>
                      <input id={`race_office_${i}`} className="capply-input" value={r.office} onChange={(e) => updateRace(i, 'office', e.target.value)} />
                    </Field>
                    <Field label="Year" id={`race_year_${i}`}>
                      <input id={`race_year_${i}`} className="capply-input" inputMode="numeric" maxLength={4} value={r.year} onChange={(e) => updateRace(i, 'year', e.target.value.replace(/\D/g, ''))} />
                    </Field>
                  </div>
                  <div className="capply-row">
                    <Field label="Result" id={`race_result_${i}`}>
                      <select id={`race_result_${i}`} className="capply-input" value={r.result} onChange={(e) => updateRace(i, 'result', e.target.value)}>
                        <option value="">Choose one</option>
                        {RACE_RESULT_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    </Field>
                    <Field label="Vote share (percent)" id={`race_share_${i}`}>
                      <input id={`race_share_${i}`} className="capply-input" inputMode="decimal" value={r.vote_share} onChange={(e) => updateRace(i, 'vote_share', e.target.value.replace(/[^\d.]/g, ''))} />
                    </Field>
                  </div>
                  <Field label="Notes" id={`race_notes_${i}`}>
                    <input id={`race_notes_${i}`} className="capply-input" value={r.notes} onChange={(e) => updateRace(i, 'notes', e.target.value)} />
                  </Field>
                  {errors[`race_${i}`] && <p className="capply-error" role="alert">{errors[`race_${i}`]}</p>}
                </div>
              ))}
              {!form.never_ran && form.previous_races.length < MAX_RACES && (
                <button type="button" className="capply-btn ghost" onClick={() => set('previous_races', [...form.previous_races, { ...EMPTY_RACE }])}>
                  {form.previous_races.length ? 'Add another race' : 'Add a race'}
                </button>
              )}
            </fieldset>

            <RadioList name="signature_experience" legend="Experience collecting petition signatures" value={form.signature_experience}
              options={SIGNATURE_OPTIONS} onChange={(v) => set('signature_experience', v)} />
            {errors.signature_experience && <p className="capply-error" role="alert">{errors.signature_experience}</p>}
            <Field label="Anything to add about petitions?" id="signature_experience_note" hint="Optional.">
              <input id="signature_experience_note" className="capply-input" value={form.signature_experience_note} onChange={(e) => set('signature_experience_note', e.target.value)} />
            </Field>
          </section>
        )}

        {step === 3 && (
          <section className="capply-card" aria-labelledby="s4">
            <h2 id="s4">What you need</h2>
            <fieldset className={`capply-fieldset${errors.help_needed ? ' has-error' : ''}`}>
              <legend>What do you need help with? <span className="capply-req" aria-hidden="true">*</span></legend>
              <p className="capply-hint">Pick everything that applies.</p>
              {HELP_OPTIONS.map(([key, label]) => (
                <label key={key} className="capply-choice">
                  <input type="checkbox" checked={form.help_needed.includes(key)} onChange={() => toggleHelp(key)} />
                  <span>{label}</span>
                </label>
              ))}
              {errors.help_needed && <p className="capply-error" role="alert">{errors.help_needed}</p>}
            </fieldset>
            {form.help_needed.includes('other') && (
              <Field label="What else?" required id="help_other" error={errors.help_other}>
                <input id="help_other" className="capply-input" value={form.help_other} onChange={(e) => set('help_other', e.target.value)} />
              </Field>
            )}
            <Field label="Why are you running?" required id="why_running" error={errors.why_running} hint={`${form.why_running.length} of ${WHY_MAX} characters.`}>
              <textarea id="why_running" className="capply-input capply-textarea" rows={6} maxLength={WHY_MAX} value={form.why_running} onChange={(e) => set('why_running', e.target.value)} required />
            </Field>
            <Field label="Anything else we should know?" id="anything_else" hint="Optional.">
              <textarea id="anything_else" className="capply-input capply-textarea" rows={4} value={form.anything_else} onChange={(e) => set('anything_else', e.target.value)} />
            </Field>
          </section>
        )}

        {step === 4 && (
          <section className="capply-card" aria-labelledby="s5">
            <h2 id="s5">Consent and submit</h2>
            <label className={`capply-choice capply-consent${errors.consent_contact ? ' has-error' : ''}`}>
              <input type="checkbox" checked={form.consent_contact} onChange={(e) => set('consent_contact', e.target.checked)} required />
              <span>Ohio Pride may contact me by email, text, or phone about running for office. <span className="capply-req" aria-hidden="true">*</span></span>
            </label>
            {errors.consent_contact && <p className="capply-error" role="alert">{errors.consent_contact}</p>}
            <label className="capply-choice capply-consent">
              <input type="checkbox" checked={form.consent_share_with_mentors} onChange={(e) => set('consent_share_with_mentors', e.target.checked)} />
              <span>Ohio Pride may share my application with board members and serving elected officials in its mentor network.</span>
            </label>

            {/* Honeypot. Hidden from people, filled by bots. */}
            <div className="capply-hp" aria-hidden="true">
              <label htmlFor="website">Website</label>
              <input id="website" name="website" ref={hpRef} tabIndex={-1} autoComplete="off" defaultValue="" />
            </div>

            {submitError && <p className="capply-error capply-error-block" role="alert">{submitError}</p>}

            <button type="submit" className="capply-btn primary wide" disabled={submitting}>
              {submitting ? 'Sending' : 'Send My Application'}
            </button>
            <p className="capply-fine">
              Submitting this form does not request or guarantee an endorsement. To seek an
              endorsement, use the <Link href={endorsementPath}>endorsement application</Link>.
            </p>
          </section>
        )}

        <div className="capply-nav">
          {step > 0 ? <button type="button" className="capply-btn ghost" onClick={back}>Back</button> : <span />}
          {step < STEPS.length - 1 && (
            <button type="button" className="capply-btn primary" onClick={next}>Continue</button>
          )}
        </div>
      </form>

      <p className="capply-sidefoot">
        Looking at the seats first? See <Link href={racesPath}>the 2027 target races</Link>.
        {selectedRace && <> Filing deadline for your race: {shortDate(selectedRace.filing_deadline) || 'to be confirmed'}.</>}
      </p>
    </div>
  );
}
