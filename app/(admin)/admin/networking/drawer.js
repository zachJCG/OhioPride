'use client';
// Networking detail: bottom sheet on phones, side panel from 768px.
//
// Reads come from the network_contacts_directory view. Edits write
// network_contacts by id. Introduction paths are rows in network_introductions
// (one connector to one target, unique on that pair) and are read back through
// the network_intro_paths view. The timeline is network_activities, newest first.
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  REGIONS, WARMTH, WARMTH_LABEL, WARMTH_COLOR, TIERS, TIER_LABEL,
  PRIORITY, PRIORITY_LABEL, STATUSES, STATUS_LABEL,
  INTRO_STATUS, INTRO_STATUS_LABEL, ACTIVITY_TYPES, ACTIVITY_LABEL, ACTIVITY_ICON,
  todayISO, fmtDateTime, ownerLabel, trimOrNull, contactLabel,
} from './lib';

const TEXT_FIELDS = [
  ['title', 'Title'], ['organization', 'Organization'], ['sector', 'Sector'],
  ['email', 'Email'], ['phone', 'Phone'], ['linkedin_url', 'LinkedIn'],
  ['website', 'Website'], ['city', 'City'], ['county', 'County'],
];

function formFrom(r) {
  return {
    full_name: r.full_name || '',
    title: r.title || '',
    organization: r.organization || '',
    sector: r.sector || '',
    email: r.email || '',
    phone: r.phone || '',
    linkedin_url: r.linkedin_url || '',
    website: r.website || '',
    city: r.city || '',
    county: r.county || '',
    region: r.region || '',
    influence_tier: r.influence_tier || 'contact',
    warmth: r.warmth || 'cold',
    relationship_strength: r.relationship_strength == null ? '' : String(r.relationship_strength),
    priority: r.priority || 'medium',
    status: r.status || 'active',
    owner_id: r.owner_id || '',
    is_target: !!r.is_target,
    is_connector: !!r.is_connector,
    do_not_contact: !!r.do_not_contact,
    how_they_help: r.how_they_help || '',
    ask_context: r.ask_context || '',
    next_action: r.next_action || '',
    next_action_date: r.next_action_date || '',
    notes: r.notes || '',
    tags: (r.tags || []).join(', '),
  };
}

export default function NetworkDrawer({
  row, owners, ownersById, allContacts, canWrite, actorEmail, notify, onClose,
}) {
  const [f, setF] = useState(() => formFrom(row));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const [paths, setPaths] = useState(null);
  const [pathsErr, setPathsErr] = useState(null);
  const [acts, setActs] = useState(null);
  const [actsErr, setActsErr] = useState(null);

  const [introDir, setIntroDir] = useState('out');
  const [introQ, setIntroQ] = useState('');
  const [introOther, setIntroOther] = useState('');
  const [introLabel, setIntroLabel] = useState('');
  const [introStrength, setIntroStrength] = useState('3');
  const [introStatus, setIntroStatus] = useState('potential');
  const [addingIntro, setAddingIntro] = useState(false);

  const [actType, setActType] = useState('note');
  const [actDate, setActDate] = useState(todayISO());
  const [actSubject, setActSubject] = useState('');
  const [actBody, setActBody] = useState('');
  const [logging, setLogging] = useState(false);

  const changed = useRef(false);
  const set = (k, v) => setF((cur) => ({ ...cur, [k]: v }));

  async function loadPaths() {
    const sb = supabase();
    const [inbound, outbound] = await Promise.all([
      sb.from('network_intro_paths').select('*').eq('target_id', row.id),
      sb.from('network_intro_paths').select('*').eq('connector_id', row.id),
    ]);
    if (inbound.error || outbound.error) {
      setPathsErr('Could not load introduction paths. ' + (inbound.error || outbound.error).message);
      setPaths([]);
      return;
    }
    setPathsErr(null);
    setPaths([
      ...(inbound.data || []).map((p) => ({ ...p, dir: 'in' })),
      ...(outbound.data || []).map((p) => ({ ...p, dir: 'out' })),
    ]);
  }

  async function loadActivities() {
    const { data, error } = await supabase().from('network_activities')
      .select('*').eq('contact_id', row.id).order('occurred_at', { ascending: false });
    if (error) { setActsErr('Could not load activity. ' + error.message); setActs([]); return; }
    setActsErr(null);
    setActs(data || []);
  }

  useEffect(() => {
    loadPaths();
    loadActivities();
  }, [row.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const introOptions = useMemo(() => {
    const term = introQ.trim().toLowerCase();
    const list = allContacts.filter((c) => c.id !== row.id);
    const hits = term
      ? list.filter((c) => contactLabel(c).toLowerCase().includes(term))
      : list;
    return hits.slice(0, 200);
  }, [allContacts, introQ, row.id]);

  // Keep the picked contact valid when the search narrows the option list.
  useEffect(() => {
    if (introOther && !introOptions.some((c) => c.id === introOther)) setIntroOther('');
  }, [introOptions, introOther]);

  const ownerMissing = row.owner_id && !ownersById[row.owner_id];

  async function save() {
    if (!canWrite) return;
    const patch = {
      full_name: trimOrNull(f.full_name),
      title: trimOrNull(f.title),
      organization: trimOrNull(f.organization),
      sector: trimOrNull(f.sector),
      email: trimOrNull(f.email),
      phone: trimOrNull(f.phone),
      linkedin_url: trimOrNull(f.linkedin_url),
      website: trimOrNull(f.website),
      city: trimOrNull(f.city),
      county: trimOrNull(f.county),
      region: trimOrNull(f.region),
      influence_tier: f.influence_tier || 'contact',
      warmth: f.warmth || 'cold',
      relationship_strength: f.relationship_strength === '' ? null : Number(f.relationship_strength),
      priority: f.priority || 'medium',
      status: f.status || 'active',
      owner_id: f.owner_id || null,
      is_target: f.is_target === true,
      is_connector: f.is_connector === true,
      do_not_contact: f.do_not_contact === true,
      how_they_help: trimOrNull(f.how_they_help),
      ask_context: trimOrNull(f.ask_context),
      next_action: trimOrNull(f.next_action),
      next_action_date: trimOrNull(f.next_action_date),
      notes: trimOrNull(f.notes),
      tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean),
    };
    if (!patch.full_name) { setErr('Full name is required.'); return; }
    setSaving(true);
    setErr(null);
    const { error } = await supabase().from('network_contacts').update(patch).eq('id', row.id);
    setSaving(false);
    if (error) { setErr('Could not save these changes. ' + error.message); return; }
    notify('Contact saved.');
    onClose(true);
  }

  async function addIntroduction() {
    if (!canWrite) return;
    if (!introOther) { setErr('Pick the other contact first.'); return; }
    // out: this contact is the connector reaching the other person.
    // in:  the other person is the connector reaching this contact.
    const payload = {
      connector_id: introDir === 'out' ? row.id : introOther,
      target_id: introDir === 'out' ? introOther : row.id,
      relationship_label: introLabel.trim() || null,
      strength: Number(introStrength) || 3,
      status: introStatus || 'potential',
      confidence: 'medium',
    };
    setAddingIntro(true);
    setErr(null);
    const { error } = await supabase().from('network_introductions').insert(payload);
    setAddingIntro(false);
    if (error) {
      setErr(error.code === '23505'
        ? 'That path from the connector to the target already exists.'
        : 'Could not add the introduction. ' + error.message);
      return;
    }
    changed.current = true;
    setIntroLabel('');
    setIntroOther('');
    setIntroQ('');
    notify('Introduction path added.');
    loadPaths();
  }

  async function logActivity(forcedType) {
    if (!canWrite) return;
    const type = forcedType || actType;
    const subject = actSubject.trim();
    const body = actBody.trim();
    if (!subject && !body) { setErr('Add a subject or some detail first.'); return; }
    const payload = {
      contact_id: row.id,
      activity_type: type,
      subject: subject || null,
      body: body || null,
      occurred_at: actDate ? new Date(actDate + 'T12:00:00').toISOString() : new Date().toISOString(),
      actor_email: actorEmail || null,
    };
    setLogging(true);
    setErr(null);
    const { error } = await supabase().from('network_activities').insert(payload);
    setLogging(false);
    if (error) { setErr('Could not log that activity. ' + error.message); return; }
    changed.current = true;
    setActSubject('');
    setActBody('');
    notify('Activity logged.');
    loadActivities();
  }

  return (
    <>
      <div className="drawer-scrim" onClick={() => onClose(changed.current)} />
      <div className="drawer" role="dialog" aria-modal="true" aria-label={row.full_name || 'Contact'}>
        <div className="drawer-head">
          <div>
            <div className="muted small" style={{ fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>
              {row.region || 'No region set'}
            </div>
            <h3>{row.full_name || 'Contact'}</h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {row.is_target && <span className="badge badge-warn">Target</span>}
              {row.is_connector && <span className="badge badge-ok">Connector</span>}
              {row.warmth && (
                <span className="nw-pill" style={{ background: WARMTH_COLOR[row.warmth] || '#64748B' }}>
                  {WARMTH_LABEL[row.warmth] || row.warmth}
                </span>
              )}
              {row.do_not_contact && <span className="badge badge-bad">Do not contact</span>}
            </div>
          </div>
          <button className="btn btn-sm" onClick={() => onClose(changed.current)}>Close</button>
        </div>

        {err && <div className="alert alert-error">{err}</div>}
        {!canWrite && <div className="alert alert-warn">You have read access only.</div>}

        {row.contact_id ? (
          <a className="btn btn-sm" style={{ marginBottom: 10 }} href={`/admin/contacts?id=${row.contact_id}`}>
            Open the contact record
          </a>
        ) : (
          <p className="muted small" style={{ margin: '0 0 10px' }}>
            Not linked to a contact record yet. Adding an email links it automatically.
          </p>
        )}

        <section style={{ marginBottom: 14 }}>
          <h4 style={{ margin: '4px 0' }}>Networking</h4>
          <div className="nw-form">
            <label className="field">
              <span>Region</span>
              <select className="select" value={f.region} disabled={!canWrite} onChange={(e) => set('region', e.target.value)}>
                <option value="">Unspecified</option>
                {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Influence tier</span>
              <select className="select" value={f.influence_tier} disabled={!canWrite} onChange={(e) => set('influence_tier', e.target.value)}>
                {TIERS.map((t) => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Warmth</span>
              <select className="select" value={f.warmth} disabled={!canWrite} onChange={(e) => set('warmth', e.target.value)}>
                {WARMTH.map((w) => <option key={w} value={w}>{WARMTH_LABEL[w]}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Closeness, 1 to 5</span>
              <input className="input" type="number" min="1" max="5" inputMode="numeric"
                     value={f.relationship_strength} disabled={!canWrite}
                     onChange={(e) => set('relationship_strength', e.target.value)} />
            </label>
            <label className="field">
              <span>Priority</span>
              <select className="select" value={f.priority} disabled={!canWrite} onChange={(e) => set('priority', e.target.value)}>
                {PRIORITY.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Status</span>
              <select className="select" value={f.status} disabled={!canWrite} onChange={(e) => set('status', e.target.value)}>
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Owner</span>
              <select className="select" value={f.owner_id} disabled={!canWrite} onChange={(e) => set('owner_id', e.target.value)}>
                <option value="">Unassigned</option>
                {owners.map((u) => <option key={u.id} value={u.id}>{ownerLabel(u)}</option>)}
                {ownerMissing && <option value={row.owner_id}>Former admin</option>}
              </select>
            </label>
            <label className="field">
              <span>Tags, comma separated</span>
              <input className="input" value={f.tags} disabled={!canWrite} onChange={(e) => set('tags', e.target.value)} />
            </label>
            <label className="field nw-span2">
              <span>How they help</span>
              <textarea className="textarea" value={f.how_they_help} disabled={!canWrite}
                        onChange={(e) => set('how_they_help', e.target.value)} />
            </label>
            <label className="field nw-span2">
              <span>The ask and context</span>
              <textarea className="textarea" value={f.ask_context} disabled={!canWrite}
                        onChange={(e) => set('ask_context', e.target.value)} />
            </label>
          </div>
          <label className="nw-check">
            <input type="checkbox" checked={f.is_target} disabled={!canWrite}
                   onChange={(e) => set('is_target', e.target.checked)} />
            Target, someone we want to reach
          </label>
          <label className="nw-check">
            <input type="checkbox" checked={f.is_connector} disabled={!canWrite}
                   onChange={(e) => set('is_connector', e.target.checked)} />
            Connector, someone who opens doors
          </label>
          <label className="nw-check">
            <input type="checkbox" checked={f.do_not_contact} disabled={!canWrite}
                   onChange={(e) => set('do_not_contact', e.target.checked)} />
            Do not contact
          </label>
        </section>

        <section style={{ marginBottom: 14 }}>
          <h4 style={{ margin: '4px 0' }}>Contact</h4>
          <div className="nw-form">
            <label className="field nw-span2">
              <span>Full name</span>
              <input className="input" value={f.full_name} disabled={!canWrite}
                     onChange={(e) => set('full_name', e.target.value)} />
            </label>
            {TEXT_FIELDS.map(([k, label]) => (
              <label key={k} className="field">
                <span>{label}</span>
                <input className="input" value={f[k]} disabled={!canWrite}
                       type={k === 'email' ? 'email' : 'text'}
                       inputMode={k === 'phone' ? 'tel' : undefined}
                       onChange={(e) => set(k, e.target.value)} />
              </label>
            ))}
          </div>
        </section>

        <section style={{ marginBottom: 14 }}>
          <h4 style={{ margin: '4px 0' }}>Workflow</h4>
          <div className="nw-form">
            <label className="field nw-span2">
              <span>Next action</span>
              <input className="input" value={f.next_action} disabled={!canWrite}
                     placeholder="Call, coffee, follow up"
                     onChange={(e) => set('next_action', e.target.value)} />
            </label>
            <label className="field">
              <span>Next action date</span>
              <input className="input" type="date" value={f.next_action_date} disabled={!canWrite}
                     onChange={(e) => set('next_action_date', e.target.value)} />
            </label>
            <label className="field">
              <span>Source</span>
              <input className="input" value={row.source || ''} disabled readOnly />
            </label>
            <label className="field nw-span2">
              <span>Notes</span>
              <textarea className="textarea" value={f.notes} disabled={!canWrite}
                        onChange={(e) => set('notes', e.target.value)} />
            </label>
          </div>
        </section>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {row.email && <a className="btn" href={`mailto:${row.email}`}>Email</a>}
          {row.phone && <a className="btn" href={`tel:${String(row.phone).replace(/[^\d+]/g, '')}`}>Call</a>}
          {canWrite && (
            <button className="btn btn-primary" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          )}
        </div>

        <section style={{ marginBottom: 14 }}>
          <h4 style={{ margin: '4px 0' }}>Introduction paths</h4>
          {pathsErr && <div className="alert alert-error">{pathsErr}</div>}
          {paths == null ? <div className="muted small">Loading paths…</div> : paths.length ? (
            <ul className="nw-paths">
              {paths.map((p) => (
                <li key={`${p.dir}-${p.id}`}>
                  {p.dir === 'in'
                    ? <><strong>{p.connector_name}</strong> can reach them</>
                    : <>Can introduce us to <strong>{p.target_name}</strong></>}
                  <span className="muted small" style={{ marginLeft: 6 }}>
                    {[
                      INTRO_STATUS_LABEL[p.status] || p.status,
                      `${Number(p.strength) || 0} of 5`,
                      p.relationship_label,
                    ].filter(Boolean).join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          ) : <div className="muted small">No introduction paths yet.</div>}

          {canWrite && (
            <div style={{ marginTop: 10 }}>
              <div className="nw-form">
                <label className="field nw-span2">
                  <span>Direction</span>
                  <select className="select" value={introDir} onChange={(e) => setIntroDir(e.target.value)}>
                    <option value="out">This person can introduce us to someone</option>
                    <option value="in">Someone can introduce us to this person</option>
                  </select>
                </label>
                <label className="field nw-span2">
                  <span>Find the other contact</span>
                  <input className="input" value={introQ} inputMode="search" placeholder="Type a name or organization"
                         onChange={(e) => setIntroQ(e.target.value)} />
                </label>
                <label className="field nw-span2">
                  <span>Other contact</span>
                  <select className="select" value={introOther} onChange={(e) => setIntroOther(e.target.value)}>
                    <option value="">Pick a contact</option>
                    {introOptions.map((c) => <option key={c.id} value={c.id}>{contactLabel(c)}</option>)}
                  </select>
                </label>
                <label className="field nw-span2">
                  <span>Relationship</span>
                  <input className="input" value={introLabel} placeholder="Former colleague, church, board"
                         onChange={(e) => setIntroLabel(e.target.value)} />
                </label>
                <label className="field">
                  <span>Strength</span>
                  <select className="select" value={introStrength} onChange={(e) => setIntroStrength(e.target.value)}>
                    {['1', '2', '3', '4', '5'].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Status</span>
                  <select className="select" value={introStatus} onChange={(e) => setIntroStatus(e.target.value)}>
                    {INTRO_STATUS.map((s) => <option key={s} value={s}>{INTRO_STATUS_LABEL[s]}</option>)}
                  </select>
                </label>
              </div>
              <button className="btn" disabled={addingIntro} onClick={addIntroduction}>
                {addingIntro ? 'Adding…' : 'Add introduction path'}
              </button>
              {introQ && introOptions.length === 200 && (
                <p className="muted small" style={{ margin: '6px 0 0' }}>
                  Showing the first 200 matches. Keep typing to narrow it down.
                </p>
              )}
            </div>
          )}
        </section>

        <section style={{ marginBottom: 8 }}>
          <h4 style={{ margin: '4px 0' }}>Activity</h4>
          {actsErr && <div className="alert alert-error">{actsErr}</div>}

          {canWrite && (
            <div style={{ marginBottom: 10 }}>
              <div className="nw-form">
                <label className="field">
                  <span>Type</span>
                  <select className="select" value={actType} onChange={(e) => setActType(e.target.value)}>
                    {ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{ACTIVITY_LABEL[t]}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Date</span>
                  <input className="input" type="date" value={actDate} onChange={(e) => setActDate(e.target.value)} />
                </label>
                <label className="field nw-span2">
                  <span>Subject</span>
                  <input className="input" value={actSubject} placeholder="One line summary"
                         onChange={(e) => setActSubject(e.target.value)} />
                </label>
                <label className="field nw-span2">
                  <span>Detail</span>
                  <textarea className="textarea" value={actBody} placeholder="Optional detail"
                            onChange={(e) => setActBody(e.target.value)} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn" disabled={logging} onClick={() => logActivity('note')}>
                  {logging ? 'Saving…' : 'Add note'}
                </button>
                <button className="btn btn-accent" disabled={logging} onClick={() => logActivity(null)}>
                  {logging ? 'Saving…' : 'Log activity'}
                </button>
              </div>
            </div>
          )}

          {acts == null ? <div className="muted small">Loading activity…</div> : acts.length ? (
            <ul className="nw-timeline">
              {acts.map((a) => (
                <li key={a.id} className="nw-act">
                  <span className="nw-act-dot" aria-hidden="true">{ACTIVITY_ICON[a.activity_type] || '•'}</span>
                  <div className="nw-act-subject">
                    {a.subject || ACTIVITY_LABEL[a.activity_type] || a.activity_type}
                  </div>
                  {a.body && <div className="nw-act-body">{a.body}</div>}
                  <div className="nw-act-meta">
                    <span className="nw-act-type">{ACTIVITY_LABEL[a.activity_type] || a.activity_type}</span>
                    {a.actor_email ? ` · ${a.actor_email}` : ''}
                    {` · ${fmtDateTime(a.occurred_at)}`}
                  </div>
                </li>
              ))}
            </ul>
          ) : <div className="muted small">No activity yet.</div>}
        </section>
      </div>
    </>
  );
}

// Add contact: the same vocabulary as the detail drawer, trimmed to what is
// worth typing on a phone. Writes network_contacts with source 'manual'.
export function CreateDrawer({ owners, notify, onClose }) {
  const [f, setF] = useState({
    full_name: '', title: '', organization: '', email: '', phone: '', city: '', county: '',
    region: '', influence_tier: 'contact', warmth: 'cold', priority: 'medium', owner_id: '',
    tags: '', is_target: false, is_connector: false, how_they_help: '', ask_context: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF((cur) => ({ ...cur, [k]: v }));

  async function create() {
    const full = f.full_name.trim();
    if (!full) { setErr('Full name is required.'); return; }
    const payload = {
      full_name: full,
      title: trimOrNull(f.title),
      organization: trimOrNull(f.organization),
      email: trimOrNull(f.email),
      phone: trimOrNull(f.phone),
      city: trimOrNull(f.city),
      county: trimOrNull(f.county),
      region: trimOrNull(f.region),
      influence_tier: f.influence_tier || 'contact',
      warmth: f.warmth || 'cold',
      priority: f.priority || 'medium',
      owner_id: f.owner_id || null,
      tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean),
      is_target: f.is_target === true,
      is_connector: f.is_connector === true,
      how_they_help: trimOrNull(f.how_they_help),
      ask_context: trimOrNull(f.ask_context),
      notes: trimOrNull(f.notes),
      source: 'manual',
    };
    setSaving(true);
    setErr(null);
    const { data, error } = await supabase().from('network_contacts').insert(payload).select().single();
    setSaving(false);
    if (error) { setErr('Could not create this contact. ' + error.message); return; }
    notify('Contact added.');
    onClose(data);
  }

  return (
    <>
      <div className="drawer-scrim" onClick={() => onClose(null)} />
      <div className="drawer" role="dialog" aria-modal="true" aria-label="Add contact">
        <div className="drawer-head">
          <div>
            <div className="muted small" style={{ fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>
              New contact
            </div>
            <h3>Add contact</h3>
          </div>
          <button className="btn btn-sm" onClick={() => onClose(null)}>Cancel</button>
        </div>

        {err && <div className="alert alert-error">{err}</div>}

        <section style={{ marginBottom: 14 }}>
          <h4 style={{ margin: '4px 0' }}>Identity</h4>
          <div className="nw-form">
            <label className="field nw-span2">
              <span>Full name</span>
              <input className="input" value={f.full_name} onChange={(e) => set('full_name', e.target.value)} />
            </label>
            <label className="field"><span>Title</span>
              <input className="input" value={f.title} onChange={(e) => set('title', e.target.value)} /></label>
            <label className="field"><span>Organization</span>
              <input className="input" value={f.organization} onChange={(e) => set('organization', e.target.value)} /></label>
            <label className="field"><span>Email</span>
              <input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></label>
            <label className="field"><span>Phone</span>
              <input className="input" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></label>
            <label className="field"><span>City</span>
              <input className="input" value={f.city} onChange={(e) => set('city', e.target.value)} /></label>
            <label className="field"><span>County</span>
              <input className="input" value={f.county} onChange={(e) => set('county', e.target.value)} /></label>
          </div>
        </section>

        <section style={{ marginBottom: 14 }}>
          <h4 style={{ margin: '4px 0' }}>Networking</h4>
          <div className="nw-form">
            <label className="field">
              <span>Region</span>
              <select className="select" value={f.region} onChange={(e) => set('region', e.target.value)}>
                <option value="">Unspecified</option>
                {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Influence tier</span>
              <select className="select" value={f.influence_tier} onChange={(e) => set('influence_tier', e.target.value)}>
                {TIERS.map((t) => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Warmth</span>
              <select className="select" value={f.warmth} onChange={(e) => set('warmth', e.target.value)}>
                {WARMTH.map((w) => <option key={w} value={w}>{WARMTH_LABEL[w]}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Priority</span>
              <select className="select" value={f.priority} onChange={(e) => set('priority', e.target.value)}>
                {PRIORITY.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Owner</span>
              <select className="select" value={f.owner_id} onChange={(e) => set('owner_id', e.target.value)}>
                <option value="">Unassigned</option>
                {owners.map((u) => <option key={u.id} value={u.id}>{ownerLabel(u)}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Tags, comma separated</span>
              <input className="input" value={f.tags} onChange={(e) => set('tags', e.target.value)} />
            </label>
          </div>
          <label className="nw-check">
            <input type="checkbox" checked={f.is_target} onChange={(e) => set('is_target', e.target.checked)} />
            Target
          </label>
          <label className="nw-check">
            <input type="checkbox" checked={f.is_connector} onChange={(e) => set('is_connector', e.target.checked)} />
            Connector
          </label>
        </section>

        <section style={{ marginBottom: 14 }}>
          <h4 style={{ margin: '4px 0' }}>Context</h4>
          <label className="field"><span>How they help</span>
            <textarea className="textarea" value={f.how_they_help} onChange={(e) => set('how_they_help', e.target.value)} /></label>
          <label className="field"><span>The ask and context</span>
            <textarea className="textarea" value={f.ask_context} onChange={(e) => set('ask_context', e.target.value)} /></label>
          <label className="field"><span>Notes</span>
            <textarea className="textarea" value={f.notes} onChange={(e) => set('notes', e.target.value)} /></label>
        </section>

        <button className="btn btn-primary" style={{ width: '100%' }} disabled={saving} onClick={create}>
          {saving ? 'Creating…' : 'Create contact'}
        </button>
      </div>
    </>
  );
}
