'use client';
// Review queue: one contact at a time, phone-first. Shows the flagged contact,
// why it was flagged, and the linked bounce / signup-sheet context, then four
// actions: Confirm / Fix email / Merge into existing / Discard.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { money } from '../../lib/format';

export default function ReviewQueue({ canWrite, notify, onExit, toast }) {
  const [queue, setQueue] = useState(null);
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState(0);
  const [context, setContext] = useState({});
  const [mode, setMode] = useState(null); // null | 'email' | 'merge'
  const [mergeQ, setMergeQ] = useState('');
  const [mergeHits, setMergeHits] = useState([]);

  const current = queue?.[idx] || null;

  useEffect(() => {
    supabase().from('contacts_directory').select('*')
      .eq('needs_review', true)
      .order('updated_at', { ascending: true })
      .limit(400)
      .then(({ data }) => setQueue(data || []));
  }, []);

  useEffect(() => {
    setMode(null); setMergeQ(''); setMergeHits([]);
    if (!current) return;
    const sb = supabase();
    (async () => {
      const [bounce, sheets, dupes] = await Promise.all([
        current.email
          ? sb.from('email_bounce_review').select('bounce_type, bounced_at, campaign, corrected_email, notes').ilike('email', current.email).limit(3)
          : Promise.resolve({ data: [] }),
        sb.from('signup_sheet_imports').select('source_file, page_no, row_no, raw_name, raw_email, raw_phone, raw_zip, confidence').eq('contact_id', current.id).limit(3),
        sb.rpc('contacts_possible_duplicates', { p_id: current.id }),
      ]);
      setContext({
        bounce: bounce.data || [],
        sheets: sheets.data || [],
        dupes: (dupes.data || []).filter(d => d.id !== current.id).slice(0, 5),
      });
    })();
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const advance = useCallback(() => {
    setDone(d => d + 1);
    setQueue(q => q.filter((_, i) => i !== idx));
  }, [idx]);

  async function confirm() {
    const { error } = await supabase().from('contacts')
      .update({ needs_review: false, review_reason: null }).eq('id', current.id);
    if (error) { notify('Update failed: ' + error.message); return; }
    notify('Confirmed.');
    advance();
  }

  async function fixEmail(e) {
    e.preventDefault();
    const email = String(new FormData(e.target).get('email') || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { notify('That does not look like an email address.'); return; }
    const { error } = await supabase().from('contacts')
      .update({ email, needs_review: false, review_reason: null }).eq('id', current.id);
    if (error) {
      notify(error.code === '23505'
        ? 'A contact with that email already exists. Use "Merge into existing" instead.'
        : 'Update failed: ' + error.message);
      return;
    }
    notify('Email fixed.');
    advance();
  }

  async function searchMerge(q) {
    setMergeQ(q);
    const term = q.trim().replace(/[,()]/g, ' ');
    if (term.length < 2) { setMergeHits([]); return; }
    const { data } = await supabase().from('contacts_directory')
      .select('id, full_name, email, phone, total_cents, gifts')
      .or(`full_name.ilike.%${term}%,email.ilike.%${term}%`)
      .neq('id', current.id)
      .limit(8);
    setMergeHits(data || []);
  }

  async function mergeInto(target) {
    if (!window.confirm(`Merge "${current.full_name || current.email || 'this contact'}" INTO "${target.full_name || target.email}"?\n\nHistory moves to the existing record; this flagged record is tombstoned.`)) return;
    const { error } = await supabase().rpc('merge_contacts', { p_winner: target.id, p_loser: current.id });
    if (error) { notify('Merge failed: ' + error.message); return; }
    notify('Merged.');
    advance();
  }

  async function discard() {
    if (!window.confirm('Discard this record? It stays in the database but is marked do-not-contact and leaves the review queue.')) return;
    const { error } = await supabase().from('contacts')
      .update({
        needs_review: false, review_reason: null, do_not_contact: true,
        tags: [...new Set([...(current.tags || []), 'discarded-from-review'])],
      }).eq('id', current.id);
    if (error) { notify('Update failed: ' + error.message); return; }
    notify('Discarded.');
    advance();
  }

  if (queue == null) return <div className="card">Loading the review queue…</div>;

  return (
    <>
      <div className="page-head" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="btn btn-sm" onClick={onExit}>← Contacts</button>
        <h2 style={{ font: '800 1.2rem var(--op-font-head)', margin: 0 }}>Review queue</h2>
        <span className="muted small">{queue.length} left{done ? ` · ${done} done this session` : ''}</span>
      </div>

      {!current ? (
        <div className="card">
          <strong>Queue clear.</strong>
          <p className="muted" style={{ margin: '6px 0 10px' }}>Every flagged contact has been reviewed.</p>
          <button className="btn btn-primary" onClick={onExit}>Back to contacts</button>
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 10 }}>
            <strong style={{ fontSize: '1.05rem' }}>{current.full_name || current.email || 'Unnamed contact'}</strong>
            <div className="muted small" style={{ overflowWrap: 'anywhere' }}>{current.email || 'no email on file'}{current.phone ? ` · ${current.phone}` : ''}</div>
            <div className="muted small">{[current.city, current.county && `${current.county} County`, current.zip].filter(Boolean).join(' · ')}</div>
            {current.gifts > 0 && <div className="small" style={{ marginTop: 4 }}><strong>{money(current.total_cents)}</strong> lifetime · {current.gifts} gift{current.gifts > 1 ? 's' : ''}</div>}
            <div className="alert alert-warn" style={{ marginTop: 8 }}>{current.review_reason || 'Flagged for review'}</div>

            {context.bounce?.length > 0 && (
              <div className="small" style={{ marginTop: 6 }}>
                <strong>Bounce history</strong>
                {context.bounce.map((b, i) => (
                  <div key={i} className="muted">{[b.bounce_type, b.campaign, b.bounced_at && new Date(b.bounced_at).toLocaleDateString()].filter(Boolean).join(' · ')}{b.corrected_email ? ` · suggested: ${b.corrected_email}` : ''}</div>
                ))}
              </div>
            )}
            {context.sheets?.length > 0 && (
              <div className="small" style={{ marginTop: 6 }}>
                <strong>Signup sheet OCR</strong>
                {context.sheets.map((s, i) => (
                  <div key={i} className="muted" style={{ overflowWrap: 'anywhere' }}>
                    {s.source_file}{s.page_no != null ? ` p${s.page_no}` : ''}{s.row_no != null ? ` row ${s.row_no}` : ''} · read “{[s.raw_name, s.raw_email, s.raw_phone, s.raw_zip].filter(Boolean).join(' / ')}”{s.confidence ? ` · ${s.confidence} confidence` : ''}
                  </div>
                ))}
              </div>
            )}
          </div>

          {canWrite && mode === null && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button className="btn btn-primary" onClick={confirm}>Looks right — confirm</button>
              <button className="btn" onClick={() => setMode('email')}>Fix email</button>
              <button className="btn" onClick={() => setMode('merge')}>Merge into existing</button>
              <button className="btn btn-danger" onClick={discard}>Discard</button>
              <button className="btn" style={{ gridColumn: '1 / -1' }} onClick={() => setQueue(q => [...q.slice(0, idx), ...q.slice(idx + 1), q[idx]])}>Skip for now</button>
            </div>
          )}

          {canWrite && mode === 'email' && (
            <form className="card" onSubmit={fixEmail}>
              <label className="field"><span>Corrected email</span>
                <input className="input" name="email" type="email" inputMode="email" autoFocus
                       defaultValue={context.bounce?.[0]?.corrected_email || current.email || ''} required />
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" style={{ flex: 1 }}>Save email + confirm</button>
                <button className="btn" type="button" onClick={() => setMode(null)}>Cancel</button>
              </div>
            </form>
          )}

          {canWrite && mode === 'merge' && (
            <div className="card">
              <label className="field"><span>Find the existing contact to keep</span>
                <input className="input" value={mergeQ} onChange={e => searchMerge(e.target.value)} placeholder="Search name or email…" autoFocus />
              </label>
              {context.dupes?.length > 0 && !mergeHits.length && (
                <div className="small muted" style={{ marginBottom: 6 }}>Likely matches:</div>
              )}
              {(mergeHits.length ? mergeHits : (context.dupes || []).map(d => ({ id: d.id, full_name: d.name, email: d.email, phone: d.phone }))).map(t => (
                <button key={t.id} className="item" style={{ width: '100%', font: 'inherit', cursor: 'pointer', marginBottom: 6, border: '1px solid var(--op-line)' }} onClick={() => mergeInto(t)}>
                  <span style={{ textAlign: 'left' }}>
                    <strong>{t.full_name || t.email || 'Unnamed'}</strong>
                    <span className="muted small" style={{ display: 'block' }}>{[t.email, t.gifts > 0 ? `${money(t.total_cents)} given` : null].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="muted">Keep →</span>
                </button>
              ))}
              <button className="btn" type="button" onClick={() => setMode(null)}>Cancel</button>
            </div>
          )}

          {!canWrite && <div className="alert alert-warn">You have read-only access to contacts; ask the Director for write access to work the queue.</div>}
        </>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
