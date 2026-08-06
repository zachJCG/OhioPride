'use client';
// Capture card: snap a business card on a phone, drop it in the inbox, and
// promote it to a real contact later.
//
// Images go to the private 'network-cards' storage bucket, so thumbnails need a
// signed URL. Rows live in network_business_cards; promoting one inserts a
// network_contacts row and marks the card processed with a link back to it.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAdmin } from '../../../lib/permissions';
import { REGIONS, fmtDateTime } from '../lib';
import '../networking.css';

const BUCKET = 'network-cards';
const PARSED_PLACEHOLDER =
  '{"full_name":"","title":"","organization":"","email":"","phone":""}';

export default function CaptureCardPage() {
  const { loading: authLoading, can } = useAdmin();
  const canWrite = can('networking', 'write');

  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [rawNotes, setRawNotes] = useState('');
  const [eventContext, setEventContext] = useState('');
  const [location, setLocation] = useState('');
  const [region, setRegion] = useState('');
  const [county, setCounty] = useState('');
  const [parsedJson, setParsedJson] = useState('');
  const [saving, setSaving] = useState(false);

  const [cards, setCards] = useState(null);
  const [thumbs, setThumbs] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const fileInput = useRef(null);
  const toastTimer = useRef(null);

  const notify = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Revoking on change as well as on unmount keeps one blob URL alive at a time.
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const loadInbox = useCallback(async () => {
    const sb = supabase();
    const { data, error: err } = await sb.from('network_business_cards')
      .select('*').eq('status', 'inbox').order('created_at', { ascending: false });
    if (err) { setError('Could not load the inbox. ' + err.message); setCards([]); return; }
    setError(null);
    const list = data || [];
    setCards(list);

    const signed = await Promise.all(list.filter((c) => c.image_path).map(async (c) => {
      const { data: s } = await sb.storage.from(BUCKET).createSignedUrl(c.image_path, 3600);
      return [c.id, s?.signedUrl || null];
    }));
    setThumbs(Object.fromEntries(signed.filter(([, url]) => url)));
  }, []);

  useEffect(() => { loadInbox(); }, [loadInbox]);

  function pickFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  }

  function resetForm() {
    setFile(null);
    setPreviewUrl(null);
    setRawNotes(''); setEventContext(''); setLocation(''); setRegion(''); setCounty(''); setParsedJson('');
    if (fileInput.current) fileInput.current.value = '';
  }

  async function saveCard() {
    if (!canWrite) return;
    const notes = rawNotes.trim();
    if (!file && !notes) { setError('Add a photo or a note first.'); return; }
    setSaving(true);
    setError(null);
    const sb = supabase();

    let imagePath = null;
    if (file) {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      imagePath = `cards/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
      const { error: upErr } = await sb.storage.from(BUCKET)
        .upload(imagePath, file, { contentType: file.type || 'image/jpeg', upsert: false });
      if (upErr) { setSaving(false); setError('The photo did not upload. ' + upErr.message); return; }
    }

    let parsed = {};
    let parseWarning = null;
    const raw = parsedJson.trim();
    if (raw) {
      try {
        const obj = JSON.parse(raw);
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) parsed = obj;
        else parseWarning = 'Parsed fields need to be a JSON object, so the card saved without them.';
      } catch {
        parseWarning = 'Parsed fields are not valid JSON, so the card saved without them.';
      }
    }

    const { error: insErr } = await sb.from('network_business_cards').insert({
      image_path: imagePath,
      raw_notes: notes || null,
      parsed,
      event_context: eventContext.trim() || null,
      location: location.trim() || null,
      region: region || null,
      county: county.trim() || null,
    });
    setSaving(false);
    if (insErr) { setError('Could not save this card. ' + insErr.message); return; }
    if (parseWarning) setError(parseWarning);
    notify('Card saved to the inbox.');
    resetForm();
    loadInbox();
  }

  async function promoteCard(cardId) {
    if (!canWrite) return;
    setBusyId(cardId);
    setError(null);
    const sb = supabase();

    const { data: card, error: readErr } = await sb.from('network_business_cards')
      .select('*').eq('id', cardId).single();
    if (readErr || !card) {
      setBusyId(null);
      setError('Could not read that card. ' + (readErr ? readErr.message : 'It may have been removed.'));
      return;
    }

    const p = card.parsed || {};
    const { data: created, error: insErr } = await sb.from('network_contacts').insert({
      full_name: p.full_name || p.name || 'Unnamed contact',
      title: p.title || null,
      organization: p.organization || p.company || null,
      email: p.email || null,
      phone: p.phone || null,
      region: card.region,
      county: card.county,
      source: card.event_context ? `Card capture: ${card.event_context}` : 'Card capture',
      card_image_path: card.image_path,
      notes: card.raw_notes,
    }).select('id').single();
    if (insErr || !created) {
      setBusyId(null);
      setError('Could not create the contact. ' + (insErr ? insErr.message : 'No row came back.'));
      return;
    }

    const { error: updErr } = await sb.from('network_business_cards')
      .update({ status: 'processed', contact_id: created.id }).eq('id', cardId);
    setBusyId(null);
    if (updErr) {
      setError('The contact was created but the card is still in the inbox. ' + updErr.message);
      loadInbox();
      return;
    }
    notify('Card promoted to a contact.');
    loadInbox();
  }

  async function discardCard(cardId) {
    if (!canWrite) return;
    setBusyId(cardId);
    setError(null);
    const { error: err } = await supabase().from('network_business_cards')
      .update({ status: 'discarded' }).eq('id', cardId);
    setBusyId(null);
    if (err) { setError('Could not discard that card. ' + err.message); return; }
    notify('Card discarded.');
    loadInbox();
  }

  if (!authLoading && !can('networking', 'read')) {
    return (
      <div className="alert alert-error">
        Networking holds relationship notes on named people, so it is limited by role.
        Ask the Director if you need it.
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <h2>Capture card</h2>
        <p className="sub">Snap a business card, jot a note, and drop it in the inbox. Promote it to a full contact later.</p>
      </div>

      <div className="page-actions">
        <a className="btn" href="/admin/networking">Back to networking</a>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="nw-cap">
        <div className="card">
          <h3 style={{ margin: '0 0 8px', font: '800 1rem var(--op-font-head)', color: 'var(--op-navy)' }}>New card</h3>

          {canWrite ? (
            <>
              <button type="button" className="nw-drop" onClick={() => fileInput.current?.click()}>
                <span style={{ display: 'block', fontWeight: 700 }}>
                  {file ? 'Choose a different photo' : 'Tap to photograph or choose a card image'}
                </span>
                <span className="muted small" style={{ display: 'block', marginTop: 4 }}>
                  JPG, PNG, or HEIC. It uploads to a private bucket.
                </span>
                {previewUrl && <img className="nw-preview" src={previewUrl} alt="Card preview" />}
              </button>
              <input ref={fileInput} type="file" accept="image/*" capture="environment"
                     style={{ display: 'none' }} onChange={pickFile} />

              <div className="nw-form" style={{ marginTop: 12 }}>
                <label className="field nw-span2">
                  <span>Quick note</span>
                  <textarea className="textarea" value={rawNotes} placeholder="Where you met, what they can unlock"
                            onChange={(e) => setRawNotes(e.target.value)} />
                </label>
                <label className="field">
                  <span>Event or context</span>
                  <input className="input" value={eventContext} placeholder="Stonewall gala"
                         onChange={(e) => setEventContext(e.target.value)} />
                </label>
                <label className="field">
                  <span>Location</span>
                  <input className="input" value={location} placeholder="City or venue"
                         onChange={(e) => setLocation(e.target.value)} />
                </label>
                <label className="field">
                  <span>Region</span>
                  <select className="select" value={region} onChange={(e) => setRegion(e.target.value)}>
                    <option value="">Pick a region</option>
                    {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>County</span>
                  <input className="input" value={county} onChange={(e) => setCounty(e.target.value)} />
                </label>
                <label className="field nw-span2">
                  <span>Parsed fields, optional JSON</span>
                  <textarea className="textarea" value={parsedJson} placeholder={PARSED_PLACEHOLDER}
                            onChange={(e) => setParsedJson(e.target.value)} />
                </label>
              </div>
              <p className="muted small" style={{ margin: '0 0 10px' }}>
                Tip: on your phone, ask Claude to read the card photo and hand back that JSON, then paste it here.
                Whatever you fill in becomes the new contact when you promote the card.
              </p>
              <button className="btn btn-primary" style={{ width: '100%' }} disabled={saving} onClick={saveCard}>
                {saving ? 'Saving…' : 'Save to inbox'}
              </button>
            </>
          ) : (
            <p className="muted small" style={{ margin: 0 }}>
              You have read access only, so cards can be viewed but not captured.
            </p>
          )}
        </div>

        <div className="card">
          <h3 style={{ margin: '0 0 8px', font: '800 1rem var(--op-font-head)', color: 'var(--op-navy)' }}>Inbox</h3>
          {cards == null ? <div className="muted small">Loading inbox…</div> : cards.length ? cards.map((c) => {
            const p = c.parsed || {};
            const sub = [
              p.title, p.organization || p.company, c.event_context, c.region,
              fmtDateTime(c.created_at),
            ].filter(Boolean).join(' · ');
            return (
              <div key={c.id} className="nw-cardtile">
                {thumbs[c.id]
                  ? <img className="nw-thumb" src={thumbs[c.id]} alt="Business card" />
                  : <span className="nw-thumb" aria-hidden="true" />}
                <div className="nw-cardtile-meta">
                  <strong>{p.full_name || p.name || 'Card with no parsed name'}</strong>
                  <div className="muted small">{sub}</div>
                  {c.raw_notes && <div className="nw-cardtile-notes">{c.raw_notes}</div>}
                  {canWrite && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                      <button className="btn btn-sm btn-primary" disabled={busyId === c.id}
                              onClick={() => promoteCard(c.id)}>
                        {busyId === c.id ? 'Working…' : 'Promote to contact'}
                      </button>
                      <button className="btn btn-sm btn-danger" disabled={busyId === c.id}
                              onClick={() => discardCard(c.id)}>
                        Discard
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          }) : <div className="muted small">The inbox is empty. Captured cards land here.</div>}
        </div>
      </div>

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
