'use client';
// Text Blast: person-to-person texting. One card per person, copy and paste
// into Messages. Nothing sends automatically and no carrier API is involved.
//
// Ported from the static console so it runs inside the mobile-first admin
// shell, because the whole point of the module is working through a queue
// one-handed on a phone.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAdmin } from '../../lib/permissions';
import { fmtDate } from './lib';
import { PersonCard, StickyHeader, ListRows } from './runner';
import BuildDrawer, { TemplateDrawer } from './build-drawer';
import './texting.css';

export default function TextingPage() {
  const { loading: authLoading, me, can } = useAdmin();
  const canWrite = can('texting', 'write');

  const [view, setView] = useState('list');           // 'list' | 'run'
  const [blasts, setBlasts] = useState(null);
  const [progress, setProgress] = useState({});
  const [blast, setBlast] = useState(null);
  const [recipients, setRecipients] = useState([]);
  const [filter, setFilter] = useState('queued');
  const [mode, setMode] = useState('rapid');
  const [index, setIndex] = useState(0);
  const [undo, setUndo] = useState(null);             // { row, prev, advanced }
  const [showBuild, setShowBuild] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState(null);
  const toastTimer = useRef(null);
  const undoTimer = useRef(null);

  const notify = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => () => { clearTimeout(toastTimer.current); clearTimeout(undoTimer.current); }, []);

  const loadList = useCallback(async () => {
    setBlast(null);
    setRecipients([]);
    setView('list');
    const sb = supabase();
    const [b, p] = await Promise.all([
      sb.from('text_blasts')
        .select('id, name, audience_label, template, is_fundraising, status, created_by, created_at')
        .order('created_at', { ascending: false }).limit(100),
      sb.from('text_blast_progress').select('*'),
    ]);
    if (b.error) { setError('Could not load blasts. ' + b.error.message); return; }
    setBlasts(b.data || []);
    setProgress(Object.fromEntries((p.data || []).map(r => [r.blast_id, r])));
  }, []);

  const openBlast = useCallback(async (id) => {
    setMode('rapid'); setFilter('queued'); setIndex(0); setView('run');
    const sb = supabase();
    const [b, r] = await Promise.all([
      sb.from('text_blasts').select('*').eq('id', id).single(),
      sb.from('text_blast_recipients').select('*').eq('blast_id', id).order('queue_order', { ascending: true }),
    ]);
    if (b.error) { setError('Could not load that blast. ' + b.error.message); return; }
    setBlast(b.data);
    setRecipients(r.data || []);
    window.history.replaceState({}, '', `/admin/texting?blast=${id}`);
  }, []);

  // Read ?blast= after mount, never during render: initializing state from the
  // URL makes the server and client disagree and breaks hydration.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('blast');
    if (id) openBlast(id); else loadList();
  }, [openBlast, loadList]);

  const rows = useMemo(
    () => filter === 'all' ? recipients : recipients.filter(r => r.status === filter),
    [recipients, filter]);

  function patchRow(id, patch) {
    setRecipients(list => list.map(r => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function saveOverride(row, value) {
    if (!canWrite) { notify('You have read access only'); return; }
    const prev = row.message_override;
    patchRow(row.id, { message_override: value });
    const { error: err } = await supabase().from('text_blast_recipients')
      .update({ message_override: value }).eq('id', row.id);
    if (err) {
      patchRow(row.id, { message_override: prev });
      notify('Could not save that edit');
    }
  }

  async function setStatus(row, status) {
    if (!canWrite) { notify('You have read access only'); return; }
    const prev = row.status;
    patchRow(row.id, { status, sent_by: status === 'sent' ? me?.email ?? null : null });

    // The filtered list shrinks under us when the filter is "Not reached", so
    // staying on the same index is what moves to the next person.
    const advanced = filter === 'all' || filter === status;
    if (advanced) setIndex(i => i + 1);

    setUndo({ row, prev, advanced, status });
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 4000);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const patch = { status };
    if (status === 'sent') patch.sent_by = me?.email ?? null;
    const { error: err } = await supabase().from('text_blast_recipients').update(patch).eq('id', row.id);
    if (err) {
      patchRow(row.id, { status: prev });
      if (advanced) setIndex(i => Math.max(0, i - 1));
      setUndo(null);
      notify('Could not save: ' + err.message);
    }
  }

  async function undoLast() {
    if (!undo) return;
    const { row, prev, advanced } = undo;
    setUndo(null);
    clearTimeout(undoTimer.current);
    patchRow(row.id, { status: prev, sent_by: null });
    // Only step back if marking actually advanced us.
    if (advanced) setIndex(i => Math.max(0, i - 1));
    const { error: err } = await supabase().from('text_blast_recipients')
      .update({ status: prev, sent_by: null }).eq('id', row.id);
    if (err) {
      patchRow(row.id, { status: row.status });
      notify('Undo failed');
    }
  }

  if (!authLoading && !can('texting', 'read')) {
    return (
      <div className="alert alert-error">
        The texting module reaches personal cell numbers, so it is limited to the Director, comms lead,
        and volunteer lead. Ask the Director if you need access.
      </div>
    );
  }
  if (error) return <div className="alert alert-error">{error}</div>;

  // ---------------------------------------------------------------- list view
  if (view === 'list') {
    return (
      <>
        <div className="page-head">
          <h2>Text Blast</h2>
          <p className="sub">Person-to-person texting. One card per person, copy and paste into Messages. Nothing sends automatically.</p>
        </div>
        <div className="tx-gradient" aria-hidden="true" />

        {canWrite && (
          <div className="page-actions">
            <button className="btn btn-primary" onClick={() => setShowBuild(true)}>New blast</button>
          </div>
        )}

        {blasts == null ? <div className="card">Loading blasts…</div> : blasts.length === 0 ? (
          <div className="card">
            <strong>No text blasts built</strong>
            <p className="muted" style={{ marginBottom: 0 }}>
              Pick a segment, write the message once, and this builds a queue you work through one card
              at a time. You press send in Messages every time.
            </p>
          </div>
        ) : blasts.map(b => {
          const p = progress[b.id] || { total: 0, sent: 0, skipped: 0 };
          const pct = p.total ? Math.round(((p.sent + p.skipped) / p.total) * 100) : 0;
          return (
            <button key={b.id} className="tx-blast-card" onClick={() => openBlast(b.id)}>
              <div className="tx-blast-name">{b.name}</div>
              <div className="tx-blast-meta">
                {b.audience_label} · built {fmtDate(b.created_at)}
                {b.status === 'archived' ? ' · archived' : ''}
                {b.is_fundraising ? ' · fundraising' : ''}
              </div>
              <div className="tx-blast-count">{p.sent} sent / {p.total}</div>
              <div className="tx-meter"><span className="tx-meter-fill" style={{ width: `${pct}%` }} /></div>
            </button>
          );
        })}

        <div className="card" style={{ marginTop: 16 }}>
          <strong>How this works.</strong>
          <p className="muted small" style={{ marginBottom: 0 }}>
            Every message is sent by you, from your phone, in Messages. Nothing here dispatches anything
            and no carrier API is involved. Most of these contacts have a phone on file but never checked
            the SMS box, which is exactly why this is person to person and not a bulk gateway. Names and
            numbers stay inside the admin: do not paste a queue anywhere public.
          </p>
        </div>

        {showBuild && (
          <BuildDrawer canWrite={canWrite} actorEmail={me?.email} notify={notify}
                       onClose={() => setShowBuild(false)}
                       onBuilt={(id) => { setShowBuild(false); openBlast(id); }} />
        )}
        {toast && <div className="toast" role="status">{toast}</div>}
      </>
    );
  }

  // -------------------------------------------------------------- runner view
  if (!blast) return <div className="card">Loading queue…</div>;

  const current = rows[Math.min(index, Math.max(0, rows.length - 1))];
  const overrideCount = recipients.filter(r => r.message_override).length;

  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '2px 0 6px', flexWrap: 'wrap' }}>
        <button className="btn btn-sm" onClick={() => {
          window.history.replaceState({}, '', '/admin/texting');
          loadList();
        }}>← All blasts</button>
        <span style={{ flex: 1 }} />
        {canWrite && <button className="btn btn-sm" onClick={() => setShowTemplate(true)}>Edit message</button>}
      </div>

      <div className="page-head" style={{ margin: '0 0 6px' }}>
        <h2 style={{ fontSize: '1.15rem' }}>{blast.name}</h2>
        <p className="sub">{blast.audience_label}{blast.is_fundraising ? ' · fundraising' : ''}</p>
      </div>

      <StickyHeader recipients={recipients} rows={rows} filter={filter} setFilter={(f) => { setFilter(f); setIndex(0); }}
                    mode={mode} setMode={(m) => { setMode(m); setIndex(0); }} index={index} />

      {rows.length === 0 ? (
        filter === 'queued' ? (
          <div className="card">
            <strong>Queue drained</strong>
            <p className="muted">Everyone in this blast has been sent or skipped. Nice work.</p>
            <button className="btn" onClick={() => { setFilter('all'); setIndex(0); }}>Show everyone</button>
          </div>
        ) : (
          <div className="card muted">No one matches this filter.</div>
        )
      ) : mode === 'list' ? (
        <ListRows rows={rows} onPick={(i) => { setIndex(i); setMode('rapid'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
      ) : current ? (
        <PersonCard key={current.id} row={current} blast={blast} canWrite={canWrite} notify={notify}
                    onSaveOverride={saveOverride} onStatus={setStatus}
                    onBack={() => {
                      if (index > 0) setIndex(i => i - 1);
                      else notify('Already at the first person');
                    }} />
      ) : null}

      {undo && (
        <div className="tx-undo" role="status">
          <span>
            {undo.row.first_name || undo.row.full_name || 'That person'} marked {undo.status}.
          </span>
          <button onClick={undoLast}>Undo</button>
        </div>
      )}

      {showTemplate && (
        <TemplateDrawer blast={blast} overrideCount={overrideCount} notify={notify}
                        onClose={() => setShowTemplate(false)}
                        onSaved={(tpl) => { setBlast(b => ({ ...b, template: tpl })); setShowTemplate(false); }} />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
