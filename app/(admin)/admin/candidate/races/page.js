'use client';
// Target races: the Ohio Pride Top 100 of 2027, editable. The scoreboard at
// the top is the Race to 100 count (races by tier, races with at least one
// applicant, filed, endorsed). Rows expand to edit the fields that change
// as seats are verified, and to show who has applied for the seat.
//
// Editing needs candidates:admin (the work order's rule for target_races);
// reading needs candidates:read.
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAdmin } from '../../../lib/permissions';
import {
  listRaces, updateRace, insertRace, listApplicationsByRace, scoreboard,
} from '../../../../../lib/db/candidates.mjs';
import {
  TIER_ORDER, TIER_LABEL, REGION_ORDER, RECRUIT_STATUS_ORDER, RECRUIT_STATUS_LABEL, STATUS_LABEL,
  RACE_LEVEL_OPTIONS, BALLOT_PATH_OPTIONS, BALLOT_PATH_LABEL, raceSlug, shortDate,
} from '../../../../../lib/candidates.mjs';
import { Gate, useToast } from '../shared';

const EMPTY_RACE = {
  rank: '', tier: 'pipeline', jurisdiction: '', office: '', county: '', region: 'Central', seats: 1,
  race_level: 'municipal', ballot_path: 'nonpartisan', incumbent_name: '', incumbent_is_out: false,
  is_open_seat: false, lean: '', filing_deadline: '', filing_deadline_note: '', rationale: '',
  needs_verification: true, verification_note: '', recruit_status: 'open', is_public: false, is_vetted: false,
  cycle_id: '',
};

function RaceRow({ race, apps, canEdit, onSaved, notify }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(race);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(race); }, [race]);

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    const patch = {
      recruit_status: draft.recruit_status,
      needs_verification: !!draft.needs_verification,
      verification_note: draft.verification_note?.trim() || null,
      filing_deadline: draft.filing_deadline || null,
      filing_deadline_note: draft.filing_deadline_note?.trim() || null,
      is_public: !!draft.is_public,
      is_vetted: !!draft.is_vetted,
      incumbent_name: draft.incumbent_name?.trim() || null,
      incumbent_is_out: !!draft.incumbent_is_out,
      is_open_seat: !!draft.is_open_seat,
      rationale: draft.rationale?.trim() || null,
      rank: Number(draft.rank) || race.rank,
      tier: draft.tier,
    };
    const { error } = await updateRace(supabase(), race.id, patch);
    setSaving(false);
    if (error) { notify(`Could not save: ${error.message}`); return; }
    notify(`${race.jurisdiction} saved.`);
    onSaved();
  }

  return (
    <div className="race-row">
      <div className="race-row-main">
        <span className="race-rank">#{race.rank}</span>
        <div>
          <div className="race-title">{race.jurisdiction}: {race.office}</div>
          <div className="race-meta">
            <span className="badge badge-muted">{TIER_LABEL[race.tier]}</span>
            <span className="badge badge-muted">{race.county ? `${race.county} County` : 'Statewide'} · {race.region}</span>
            <span className="badge badge-muted">{race.filing_deadline ? `File by ${shortDate(race.filing_deadline)}` : 'Filing date TBC'}</span>
            <span className={`badge ${race.recruit_status === 'endorsed' ? 'badge-ok' : race.recruit_status === 'filed' ? 'badge-founding' : 'badge-muted'}`}>
              {RECRUIT_STATUS_LABEL[race.recruit_status] || race.recruit_status}
            </span>
            {race.needs_verification && <span className="badge badge-review">Needs verification</span>}
            {!race.is_public && <span className="badge badge-bad">Hidden</span>}
            {race.is_public && !race.is_vetted && <span className="badge badge-review">Public but not vetted</span>}
            {apps.length > 0 && <span className="badge badge-founding">{apps.length} applicant{apps.length === 1 ? '' : 's'}</span>}
          </div>
        </div>
        <button type="button" className="btn btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Close' : canEdit ? 'Edit' : 'Details'}
        </button>
      </div>

      {open && (
        <>
          {race.rationale && <div className="muted small" style={{ marginTop: 6 }}>{race.rationale}</div>}
          {race.verification_note && <div className="small" style={{ marginTop: 4 }}>Verification: {race.verification_note}</div>}
          <div className="race-apps">
            <strong>Applications</strong>
            {!apps.length ? <span className="muted"> none yet</span> : (
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {apps.map((a) => (
                  <li key={a.id}>
                    <a href={`/admin/candidate/${a.id}`}>{[a.first_name, a.last_name].filter(Boolean).join(' ')}</a>
                    <span className="muted small"> · {STATUS_LABEL[a.status] || a.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {canEdit && (
            <form className="race-edit" onSubmit={save}>
              <label className="field"><span>Rank</span>
                <input className="input" type="number" min={1} value={draft.rank} onChange={(e) => set('rank', e.target.value)} /></label>
              <label className="field"><span>Tier</span>
                <select className="input" value={draft.tier} onChange={(e) => set('tier', e.target.value)}>
                  {TIER_ORDER.map((t) => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}
                </select></label>
              <label className="field"><span>Recruit status</span>
                <select className="input" value={draft.recruit_status} onChange={(e) => set('recruit_status', e.target.value)}>
                  {RECRUIT_STATUS_ORDER.map((s) => <option key={s} value={s}>{RECRUIT_STATUS_LABEL[s]}</option>)}
                </select></label>
              <label className="field"><span>Filing deadline</span>
                <input className="input" type="date" value={draft.filing_deadline || ''} onChange={(e) => set('filing_deadline', e.target.value)} /></label>
              <label className="field span-2"><span>Filing deadline note</span>
                <input className="input" value={draft.filing_deadline_note || ''} onChange={(e) => set('filing_deadline_note', e.target.value)} /></label>
              <label className="field"><span>Incumbent</span>
                <input className="input" value={draft.incumbent_name || ''} onChange={(e) => set('incumbent_name', e.target.value)} /></label>
              <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44 }}>
                <input type="checkbox" checked={!!draft.incumbent_is_out} onChange={(e) => set('incumbent_is_out', e.target.checked)} /> Incumbent is out
              </label>
              <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44 }}>
                <input type="checkbox" checked={!!draft.is_open_seat} onChange={(e) => set('is_open_seat', e.target.checked)} /> Open seat
              </label>
              <label className="field span-3"><span>Rationale (public, one sentence)</span>
                <input className="input" value={draft.rationale || ''} onChange={(e) => set('rationale', e.target.value)} /></label>
              <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44 }}>
                <input type="checkbox" checked={!!draft.needs_verification} onChange={(e) => set('needs_verification', e.target.checked)} /> Needs verification
              </label>
              <label className="field span-2"><span>Verification note (internal)</span>
                <input className="input" value={draft.verification_note || ''} onChange={(e) => set('verification_note', e.target.value)} /></label>
              <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44 }}>
                <input type="checkbox" checked={!!draft.is_public} onChange={(e) => set('is_public', e.target.checked)} /> Show on ohiopride.org
              </label>
              <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44 }}>
                <input type="checkbox" checked={!!draft.is_vetted} onChange={(e) => set('is_vetted', e.target.checked)} /> Vetted (public needs both)
              </label>
              <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving' : 'Save'}</button>
            </form>
          )}
        </>
      )}
    </div>
  );
}

function AddRaceDrawer({ cycles, nextRank, onClose, onSaved, notify }) {
  const [draft, setDraft] = useState({ ...EMPTY_RACE, rank: nextRank, cycle_id: cycles[0]?.id || '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const slug = raceSlug(draft.jurisdiction, draft.office);

  async function save(e) {
    e.preventDefault();
    setErr(null);
    if (!draft.jurisdiction.trim() || !draft.office.trim()) { setErr('Jurisdiction and office are required.'); return; }
    if (!draft.cycle_id) { setErr('Pick the election cycle.'); return; }
    setSaving(true);
    const row = {
      cycle_id: draft.cycle_id,
      election_year: 2027,
      rank: Number(draft.rank) || nextRank,
      tier: draft.tier,
      slug,
      jurisdiction: draft.jurisdiction.trim(),
      office: draft.office.trim(),
      county: draft.county.trim() || null,
      region: draft.region,
      seats: Number(draft.seats) || 1,
      race_level: draft.race_level || null,
      ballot_path: draft.ballot_path || null,
      incumbent_name: draft.incumbent_name.trim() || null,
      incumbent_is_out: !!draft.incumbent_is_out,
      is_open_seat: !!draft.is_open_seat,
      lean: draft.lean.trim() || null,
      filing_deadline: draft.filing_deadline || null,
      filing_deadline_note: draft.filing_deadline_note.trim() || null,
      rationale: draft.rationale.trim() || null,
      needs_verification: !!draft.needs_verification,
      verification_note: draft.verification_note.trim() || null,
      recruit_status: draft.recruit_status,
      is_public: !!draft.is_public,
      is_vetted: !!draft.is_vetted,
    };
    const { error } = await insertRace(supabase(), row);
    setSaving(false);
    if (error) { setErr(/slug/.test(error.message) ? 'A race with that jurisdiction and office already exists.' : error.message); return; }
    notify('Race added.');
    onSaved();
    onClose();
  }

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <form className="drawer" onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="add-race-title">
        <div className="drawer-head">
          <h3 id="add-race-title">Add a race</h3>
          <button type="button" className="btn btn-sm" onClick={onClose}>Close</button>
        </div>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
          <label className="field"><span>Rank</span><input className="input" type="number" min={1} value={draft.rank} onChange={(e) => set('rank', e.target.value)} /></label>
          <label className="field"><span>Tier</span>
            <select className="input" value={draft.tier} onChange={(e) => set('tier', e.target.value)}>{TIER_ORDER.map((t) => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}</select></label>
          <label className="field" style={{ gridColumn: '1 / -1' }}><span>Jurisdiction</span><input className="input" value={draft.jurisdiction} onChange={(e) => set('jurisdiction', e.target.value)} placeholder="Grove City" required /></label>
          <label className="field" style={{ gridColumn: '1 / -1' }}><span>Office</span><input className="input" value={draft.office} onChange={(e) => set('office', e.target.value)} placeholder="Council Ward 4" required /></label>
          <div className="muted small" style={{ gridColumn: '1 / -1' }}>Slug: {slug || 'type a jurisdiction and office'}</div>
          <label className="field"><span>County</span><input className="input" value={draft.county} onChange={(e) => set('county', e.target.value)} /></label>
          <label className="field"><span>Region</span>
            <select className="input" value={draft.region} onChange={(e) => set('region', e.target.value)}>{REGION_ORDER.map((r) => <option key={r} value={r}>{r}</option>)}</select></label>
          <label className="field"><span>Seats</span><input className="input" type="number" min={1} value={draft.seats} onChange={(e) => set('seats', e.target.value)} /></label>
          <label className="field"><span>Election cycle</span>
            <select className="input" value={draft.cycle_id} onChange={(e) => set('cycle_id', e.target.value)} required>
              <option value="">Choose</option>{cycles.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
          <label className="field"><span>Race level</span>
            <select className="input" value={draft.race_level} onChange={(e) => set('race_level', e.target.value)}>{RACE_LEVEL_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="field"><span>Ballot path</span>
            <select className="input" value={draft.ballot_path} onChange={(e) => set('ballot_path', e.target.value)}><option value="">Unknown</option>{BALLOT_PATH_OPTIONS.map(([k, l]) => <option key={k} value={k}>{BALLOT_PATH_LABEL[k] || l}</option>)}</select></label>
          <label className="field"><span>Incumbent</span><input className="input" value={draft.incumbent_name} onChange={(e) => set('incumbent_name', e.target.value)} /></label>
          <label className="field"><span>Lean</span><input className="input" value={draft.lean} onChange={(e) => set('lean', e.target.value)} placeholder="Purple" /></label>
          <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={draft.incumbent_is_out} onChange={(e) => set('incumbent_is_out', e.target.checked)} /> Incumbent is out</label>
          <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={draft.is_open_seat} onChange={(e) => set('is_open_seat', e.target.checked)} /> Open seat</label>
          <label className="field"><span>Filing deadline</span><input className="input" type="date" value={draft.filing_deadline} onChange={(e) => set('filing_deadline', e.target.value)} /></label>
          <label className="field"><span>Filing note</span><input className="input" value={draft.filing_deadline_note} onChange={(e) => set('filing_deadline_note', e.target.value)} /></label>
          <label className="field" style={{ gridColumn: '1 / -1' }}><span>Rationale (public)</span><input className="input" value={draft.rationale} onChange={(e) => set('rationale', e.target.value)} /></label>
          <label className="field"><span>Recruit status</span>
            <select className="input" value={draft.recruit_status} onChange={(e) => set('recruit_status', e.target.value)}>{RECRUIT_STATUS_ORDER.map((s) => <option key={s} value={s}>{RECRUIT_STATUS_LABEL[s]}</option>)}</select></label>
          <label className="field"><span>Verification note</span><input className="input" value={draft.verification_note} onChange={(e) => set('verification_note', e.target.value)} /></label>
          <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={draft.needs_verification} onChange={(e) => set('needs_verification', e.target.checked)} /> Needs verification</label>
          <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={draft.is_public} onChange={(e) => set('is_public', e.target.checked)} /> Public</label>
          <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={draft.is_vetted} onChange={(e) => set('is_vetted', e.target.checked)} /> Vetted</label>
        </div>
        {err && <div className="alert alert-error">{err}</div>}
        <button className="btn btn-primary" style={{ width: '100%', marginTop: 10 }} disabled={saving}>{saving ? 'Saving' : 'Add race'}</button>
      </form>
    </>
  );
}

export default function TargetRacesPage() {
  const { loading: authLoading, can } = useAdmin();
  const canEdit = can('candidates', 'admin');
  const [races, setRaces] = useState(null);
  const [apps, setApps] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [error, setError] = useState(null);
  const [toast, notify] = useToast();
  const [q, setQ] = useState('');
  const [tier, setTier] = useState('all');
  const [onlyUnverified, setOnlyUnverified] = useState(false);
  const [adding, setAdding] = useState(false);

  async function load() {
    const sb = supabase();
    const [r, a, c] = await Promise.all([
      listRaces(sb), listApplicationsByRace(sb),
      sb.from('election_cycles').select('id, slug, label').order('election_date', { ascending: true }),
    ]);
    if (r.error) { setError(`Could not load races: ${r.error.message}`); setRaces([]); return; }
    setRaces(r.data || []);
    setApps(a.data || []);
    setCycles((c.data || []).filter((x) => /^2027/.test(x.slug)));
  }
  useEffect(() => { load(); }, []);

  const board = useMemo(() => scoreboard(races, apps), [races, apps]);
  const appsByRace = useMemo(() => {
    const m = {};
    for (const a of apps) (m[a.target_race_id] ||= []).push(a);
    return m;
  }, [apps]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (races || []).filter((r) =>
      (tier === 'all' || r.tier === tier) &&
      (!onlyUnverified || r.needs_verification) &&
      (!term || [r.jurisdiction, r.office, r.county, r.region, r.incumbent_name].some((v) => String(v || '').toLowerCase().includes(term))));
  }, [races, q, tier, onlyUnverified]);

  const nextRank = (races || []).reduce((m, r) => Math.max(m, r.rank), 0) + 1;

  return (
    <Gate loading={authLoading} allowed={can('candidates', 'read')}>
      <div className="page-head">
        <a href="/admin/candidate" className="small muted" style={{ textDecoration: 'none' }}>&larr; Candidates</a>
        <h2 style={{ marginTop: 4 }}>Target races</h2>
        <p className="sub">The Ohio Pride Top 100 of 2027. A race is on ohiopride.org only when it is both public and vetted.</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {races && (
        <div className="kpi-grid" aria-label="Race to 100 scoreboard">
          <div className="kpi">
            <div className="num">{board.withApplicant}<span className="muted" style={{ fontSize: '.85rem' }}> / {board.total}</span></div>
            <div className="lbl">Races with a candidate</div>
            <div className="meter" style={{ marginTop: 6 }}><span style={{ width: `${Math.min(100, board.withApplicant * 100 / Math.max(1, board.total))}%` }} /></div>
          </div>
          <div className="kpi"><div className="num">{board.filed}</div><div className="lbl">Filed</div><div className="sub">recruit status</div></div>
          <div className="kpi"><div className="num">{board.endorsed}</div><div className="lbl">Endorsed</div><div className="sub">recruit status</div></div>
          <div className="kpi">
            <div className="num">{board.total}</div>
            <div className="lbl">Races by tier</div>
            <div className="sub">{TIER_ORDER.map((t) => `${TIER_LABEL[t]} ${board.byTier[t] || 0}`).join(' · ')}</div>
          </div>
        </div>
      )}

      <div className="sticky-tools">
        <input className="input" placeholder="Search jurisdiction, office, county, incumbent" value={q} onChange={(e) => setQ(e.target.value)} inputMode="search" aria-label="Search races" />
        <div className="chip-row" role="group" aria-label="Tier" style={{ paddingTop: 8, paddingBottom: 4 }}>
          {['all', ...TIER_ORDER].map((t) => (
            <button key={t} type="button" className="chip" aria-pressed={tier === t} onClick={() => setTier(t)}>
              {t === 'all' ? `All (${(races || []).length})` : `${TIER_LABEL[t]} (${board.byTier[t] || 0})`}
            </button>
          ))}
          <button type="button" className="chip" aria-pressed={onlyUnverified} onClick={() => setOnlyUnverified((v) => !v)}>
            Needs verification ({(races || []).filter((r) => r.needs_verification).length})
          </button>
        </div>
      </div>

      <div className="page-actions">
        {canEdit && <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>Add race</button>}
        <a className="btn btn-sm" href="/2027/races" target="_blank" rel="noreferrer">Public page</a>
      </div>

      {races == null ? <div className="card">Loading</div> : !visible.length ? <div className="card muted">No races match.</div> : (
        <div className="race-grid">
          {visible.map((r) => (
            <RaceRow key={r.id} race={r} apps={appsByRace[r.id] || []} canEdit={canEdit} onSaved={load} notify={notify} />
          ))}
        </div>
      )}

      {adding && <AddRaceDrawer cycles={cycles} nextRank={nextRank} onClose={() => setAdding(false)} onSaved={load} notify={notify} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </Gate>
  );
}
