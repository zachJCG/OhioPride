'use client';
// The rapid runner: one card per person. Copy the number, copy the message,
// send it yourself in Messages, mark it, advance. Nothing here dispatches
// anything and no carrier API is involved.
import { useEffect, useRef, useState } from 'react';
import {
  FLAG_LABEL, areaCode, copyText, mailtoHref, prettyPhone,
  renderMessage, segmentInfo, smsHref,
} from './lib';

function CopyButton({ label, value, onFail, className = 'btn btn-accent' }) {
  const [done, setDone] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      className={className}
      style={done ? { background: 'var(--op-ok)', borderColor: 'var(--op-ok)', color: '#fff' } : undefined}
      onClick={async () => {
        try {
          await copyText(value);
          setDone(true);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setDone(false), 1400);
        } catch {
          onFail();
        }
      }}
    >
      {done ? 'Copied' : label}
    </button>
  );
}

export function PersonCard({ row, blast, canWrite, notify, onSaveOverride, onStatus, onBack }) {
  const template = blast.template;
  const [draft, setDraft] = useState(() => renderMessage(row, template));
  const saveTimer = useRef(null);

  // Reset the draft whenever the card changes person, or the shared template
  // changes for someone with no per-person edit.
  useEffect(() => {
    setDraft(renderMessage(row, template));
  }, [row.id, row.message_override, template]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const info = segmentInfo(draft);
  const flags = row.flags || [];
  const isEmail = row.channel === 'email' || !row.phone_e164;
  const govBlocked = blast.is_fundraising && flags.includes('gov_email');

  function onDraftChange(value) {
    setDraft(value);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      // Typing back to exactly the template clears the override rather than
      // storing a duplicate of it.
      const base = renderMessage({ first_name: row.first_name, message_override: null }, template);
      onSaveOverride(row, value === base ? null : value);
    }, 700);
  }

  const sub = [row.city, row.county, row.region].filter(Boolean).join(' · ');

  return (
    <div className={`tx-card is-${row.status}`}>
      <div className="tx-person-name">{row.full_name || 'Unnamed'}</div>
      <div className="tx-person-sub">
        {sub}{row.email ? `${sub ? ' · ' : ''}${row.email}` : ''}
      </div>

      {(row.sms_optin || flags.length > 0) && (
        <div className="tx-badges">
          {row.sms_optin && <span className="tx-badge tx-badge-ok">SMS opt-in</span>}
          {flags.map(f => FLAG_LABEL[f] ? (
            <span key={f} className={`tx-badge tx-badge-${FLAG_LABEL[f].kind}`}>{FLAG_LABEL[f].text}</span>
          ) : null)}
        </div>
      )}

      {flags.includes('firewall') && (
        <div className="tx-warn tx-warn-alert">
          <strong>Firewall name.</strong> Event logistics or a thank you only. Nothing that reads as
          campaign coordination or express advocacy.
        </div>
      )}
      {flags.includes('gov_email') && (
        <div className={`tx-warn${govBlocked ? ' tx-warn-alert' : ''}`}>
          <strong>Government address on file.</strong>{' '}
          {govBlocked
            ? 'This blast asks for money, so the email branch is blocked for this person. Text only, and keep it non-fundraising.'
            : 'Keep anything fundraising off this address. Check for a personal address before emailing.'}
        </div>
      )}
      {flags.includes('out_of_state') && (
        <div className="tx-warn">
          <strong>Out-of-state area code.</strong> Area code {areaCode(row.phone_e164)} is not an Ohio
          code. Still fine to text, just worth knowing.
        </div>
      )}
      {flags.includes('email_typo') && (
        <div className="tx-warn">
          <strong>Email looks like a typo.</strong> {row.email}. Fix it in Contacts rather than here.
        </div>
      )}

      <div className="tx-phone-row">
        {isEmail ? (
          <div className="tx-phone-big" style={{ fontSize: '1rem', overflowWrap: 'anywhere' }}>
            {row.email || 'No contact method'}
          </div>
        ) : (
          <>
            <div className="tx-phone-big">{prettyPhone(row.phone_e164)}</div>
            <div className="tx-phone-raw">{row.phone_e164}</div>
          </>
        )}
      </div>

      <textarea
        className="tx-msg"
        spellCheck="true"
        value={draft}
        onChange={e => onDraftChange(e.target.value)}
        aria-label="Message to send"
      />
      <div className="tx-msg-meta">
        <span>{info.chars} characters · {info.segments} segment{info.segments === 1 ? '' : 's'}{info.unicode ? ' · unicode, shorter segments' : ''}</span>
        {row.message_override ? <span className="tx-edited">Edited for this person</span> : <span />}
      </div>

      <div className="tx-actions">
        {isEmail ? (
          <>
            <CopyButton label="Copy message" value={draft}
                        onFail={() => notify('Could not copy. Select the text instead.')} />
            {row.email && !govBlocked && (
              <a className="btn" href={mailtoHref(row.email, 'A quick note from Ohio Pride PAC', draft)}
                 target="_blank" rel="noopener noreferrer">Open email</a>
            )}
          </>
        ) : (
          <>
            <CopyButton label="Copy number" value={row.phone_e164}
                        onFail={() => notify('Could not copy. Long-press the number instead.')} />
            <CopyButton label="Copy message" value={draft}
                        onFail={() => notify('Could not copy. Select the text instead.')} />
          </>
        )}
      </div>

      {!isEmail && (
        <div className="tx-minor">
          {/* Built from the live draft, so an edit made just now is what sends. */}
          <a className="btn" href={smsHref(row.phone_e164, draft)} target="_blank" rel="noopener noreferrer">
            Open Messages
          </a>
          {row.message_override && (
            <button className="btn" onClick={() => onSaveOverride(row, null)}>Reset text</button>
          )}
        </div>
      )}

      <button className="btn tx-next" disabled={!canWrite} onClick={() => onStatus(row, 'sent')}>
        {row.status === 'sent' ? 'Already sent. Next person' : 'Sent. Next person'}
      </button>
      <div className="tx-minor">
        <button className="btn" onClick={onBack}>Back</button>
        <button className="btn" disabled={!canWrite} onClick={() => onStatus(row, 'skipped')}>Skip</button>
      </div>
    </div>
  );
}

export function StickyHeader({ recipients, rows, filter, setFilter, mode, setMode, index }) {
  const total = recipients.length;
  const sent = recipients.filter(r => r.status === 'sent').length;
  const skipped = recipients.filter(r => r.status === 'skipped').length;
  const queued = total - sent - skipped;
  const pct = total ? Math.round(((sent + skipped) / total) * 100) : 0;

  const position = mode === 'rapid' && rows.length
    ? `${Math.min(index + 1, rows.length)} of ${rows.length} in queue`
    : `${rows.length} ${rows.length === 1 ? 'person' : 'people'}`;

  const chips = [
    ['queued', `Not reached ${queued}`],
    ['sent', `Sent ${sent}`],
    ['skipped', `Skipped ${skipped}`],
    ['all', `Everyone ${total}`],
  ];

  return (
    <div className="tx-sticky">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span className="tx-queue-count">{position}</span>
        <span style={{ flex: 1 }} />
        <button className="chip" aria-pressed={mode === 'list'}
                onClick={() => setMode(mode === 'rapid' ? 'list' : 'rapid')}>
          {mode === 'rapid' ? 'Full list' : 'Rapid mode'}
        </button>
      </div>
      <div className="tx-queue-sub">{sent} sent · {skipped} skipped · {queued} left</div>
      <div className="tx-meter"><span className="tx-meter-fill" style={{ width: `${pct}%` }} /></div>
      <div className="chip-row" style={{ paddingBottom: 0, marginTop: 8 }}>
        {chips.map(([key, label]) => (
          <button key={key} className="chip" aria-pressed={filter === key} onClick={() => setFilter(key)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ListRows({ rows, onPick }) {
  return (
    <>
      {rows.map((r, i) => (
        <button key={r.id} className="tx-row" onClick={() => onPick(i)}>
          <span className={`tx-row-dot is-${r.status}`} />
          <span className="tx-row-main">
            <span className="tx-row-name" style={{ display: 'block' }}>{r.full_name || 'Unnamed'}</span>
            <span className="tx-row-sub" style={{ display: 'block' }}>
              {r.phone_e164 ? prettyPhone(r.phone_e164) : 'Email only'}
              {r.city ? ` · ${r.city}` : ''}
              {r.status !== 'queued' ? ` · ${r.status}` : ''}
            </span>
          </span>
          <span className="tx-row-idx">{i + 1}</span>
        </button>
      ))}
    </>
  );
}
