'use client';
// Scorecard: the roster of sitting legislators with the grade our math says
// they earn (draft) next to the grade the public site is showing (published).
// Editing votes, exceptions, and sponsorships writes to the draft tables only.
// /scorecard changes when someone publishes, which is why publishing has a
// confirm step.
//
// Ported from the static console at public/admin/legislators/index.html. Table
// names, column lists, RPC names, and every write payload are unchanged.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAdmin } from '../../lib/permissions';
import LegislatorDrawer from './drawer';
import {
  GRADE_RANK, GRADE_SCALE, PUBLISH_BADGE, PUBLISH_LABEL, PUBLISH_STATES,
  gradeClass, partyName, publishStateOf, titleCase,
} from './lib';
import './legislators.css';

const CHAMBERS = [
  { key: '', label: 'Both chambers' },
  { key: 'house', label: 'House' },
  { key: 'senate', label: 'Senate' },
];

const GRADES = ['A', 'B', 'C', 'D', 'F'];

const SORTS = [
  { key: 'score', label: 'Score' },
  { key: 'grade', label: 'Grade' },
  { key: 'full_name', label: 'Name' },
  { key: 'district', label: 'District' },
  { key: 'chamber', label: 'Chamber' },
  { key: 'party', label: 'Party' },
];

// One compute RPC per legislator is how this console has always worked. Six at
// a time keeps a phone from opening a socket for every member of the roster.
const COMPUTE_BATCH = 6;

export default function LegislatorsPage() {
  const { loading: authLoading, can } = useAdmin();
  const canWrite = can('legislators', 'write');

  const [rows, setRows] = useState(null);
  const [bills, setBills] = useState([]);
  const [rollCalls, setRollCalls] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [sponsorships, setSponsorships] = useState([]);
  const [computed, setComputed] = useState({});
  const [published, setPublished] = useState({});
  const [loadError, setLoadError] = useState(null);
  const [partialError, setPartialError] = useState(null);
  const [computing, setComputing] = useState(false);

  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [chamber, setChamber] = useState('');
  const [party, setParty] = useState('');
  const [grade, setGrade] = useState('');
  const [pubFilter, setPubFilter] = useState('');
  const [sortKey, setSortKey] = useState('score');
  const [sortDir, setSortDir] = useState('desc');

  const [activeId, setActiveId] = useState(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [publishingAll, setPublishingAll] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const alive = useRef(true);

  const notify = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => () => { alive.current = false; clearTimeout(toastTimer.current); }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 200);
    return () => clearTimeout(t);
  }, [q]);

  // Refreshes one draft scorecard after an edit. The write already landed by
  // the time this runs, so a failure here reports as a stale score, never as a
  // failed save.
  const refreshDraft = useCallback(async (legislatorId) => {
    const { data, error } = await supabase()
      .rpc('compute_legislator_scorecard', { p_legislator_id: legislatorId });
    if (error) return error.message;
    const row = (data || [])[0];
    if (row) setComputed((prev) => ({ ...prev, [legislatorId]: row }));
    return null;
  }, []);

  const recomputeAll = useCallback(async (ids) => {
    setComputing(true);
    const sb = supabase();
    for (let i = 0; i < ids.length; i += COMPUTE_BATCH) {
      const chunk = ids.slice(i, i + COMPUTE_BATCH);
      const results = await Promise.all(chunk.map((id) =>
        sb.rpc('compute_legislator_scorecard', { p_legislator_id: id })
          .then((r) => (r.error ? null : ((r.data || [])[0] || null)))
          .catch(() => null)));
      if (!alive.current) return;
      const patch = {};
      chunk.forEach((id, n) => { if (results[n]) patch[id] = results[n]; });
      if (Object.keys(patch).length) setComputed((prev) => ({ ...prev, ...patch }));
    }
    setComputing(false);
  }, []);

  const load = useCallback(async () => {
    const sb = supabase();
    const [legs, bl, rc, ex, sp, snaps] = await Promise.all([
      sb.from('legislators').select('*')
        .order('chamber', { ascending: true }).order('district', { ascending: true }),
      sb.from('bills').select('id, slug, label, title, stance, ga, status, summary, display_order, is_active'),
      sb.from('roll_calls').select('id, roll_call_slug, bill_id, bill_slug, bill_label, bill_title, chamber, stage, label, vote_date, result, yeas, nays, stance, ga, notes'),
      sb.from('legislator_vote_exceptions').select('*'),
      sb.from('legislator_sponsorships').select('legislator_id, bill_slug, role'),
      sb.from('score_snapshots').select('*').eq('is_current', true),
    ]);

    if (legs.error) {
      setLoadError('Could not load the roster. ' + legs.error.message);
      setRows([]);
      return;
    }

    // A partial failure has to be visible: an empty vote list that is really a
    // permission error must not read as "no votes recorded".
    const failed = [
      ['bills', bl.error], ['roll calls', rc.error], ['vote exceptions', ex.error],
      ['sponsorships', sp.error], ['published snapshots', snaps.error],
    ].filter(([, e]) => e);
    setPartialError(failed.length
      ? 'Some data did not load: ' + failed.map(([n, e]) => `${n} (${e.message})`).join('; ')
      : null);

    setLoadError(null);
    setRows(legs.data || []);
    setBills((bl.data || []).filter((b) => b.is_active !== false));
    setRollCalls(rc.data || []);
    setExceptions(ex.data || []);
    setSponsorships(sp.data || []);
    const map = {};
    (snaps.data || []).forEach((s) => { map[s.legislator_id] = s; });
    setPublished(map);

    await recomputeAll((legs.data || []).map((r) => r.id));
  }, [recomputeAll]);

  useEffect(() => { load(); }, [load]);

  // ------------------------------------------------------------------ writes
  const setVote = useCallback(async (legislator, rollCallId, voteValue) => {
    const rc = rollCalls.find((x) => x.id === rollCallId);
    if (!rc) throw new Error('roll call not found');
    const sb = supabase();

    if (!voteValue) {
      const { error } = await sb.from('legislator_vote_exceptions').delete()
        .eq('roll_call_id', rollCallId)
        .eq('chamber', legislator.chamber)
        .eq('district', legislator.district);
      if (error) throw error;
      setExceptions((list) => list.filter((e) => !(
        e.roll_call_id === rollCallId && e.chamber === legislator.chamber
        && Number(e.district) === Number(legislator.district))));
    } else {
      const { data, error } = await sb.from('legislator_vote_exceptions').upsert({
        roll_call_id: rollCallId,
        roll_call_slug: rc.roll_call_slug,
        chamber: legislator.chamber,
        district: legislator.district,
        vote: voteValue,
      }, { onConflict: 'chamber,district,roll_call_id' }).select().single();
      if (error) throw error;
      setExceptions((list) => {
        const i = list.findIndex((e) => e.roll_call_id === rollCallId
          && e.chamber === legislator.chamber
          && Number(e.district) === Number(legislator.district));
        if (i === -1) return [...list, data];
        const next = list.slice();
        next[i] = data;
        return next;
      });
    }

    const stale = await refreshDraft(legislator.id);
    notify(stale
      ? 'Saved, but the draft score did not refresh. ' + stale
      : voteValue
        ? `Recorded ${voteValue} for ${legislator.full_name}`
        : 'Back to the party line default');
  }, [rollCalls, refreshDraft, notify]);

  const setSponsorship = useCallback(async (legislator, billSlug, role) => {
    const sb = supabase();
    if (!role) {
      const { error } = await sb.from('legislator_sponsorships').delete()
        .eq('legislator_id', legislator.id)
        .eq('bill_slug', billSlug);
      if (error) throw error;
      setSponsorships((list) => list.filter((s) =>
        !(s.legislator_id === legislator.id && s.bill_slug === billSlug)));
    } else {
      const { data, error } = await sb.from('legislator_sponsorships').upsert(
        { legislator_id: legislator.id, bill_slug: billSlug, role },
        { onConflict: 'legislator_id,bill_slug' },
      ).select().single();
      if (error) throw error;
      setSponsorships((list) => {
        const i = list.findIndex((s) => s.legislator_id === legislator.id && s.bill_slug === billSlug);
        if (i === -1) return [...list, data];
        const next = list.slice();
        next[i] = data;
        return next;
      });
    }

    const stale = await refreshDraft(legislator.id);
    notify(stale
      ? 'Saved, but the draft score did not refresh. ' + stale
      : role ? 'Saved sponsorship' : 'Removed sponsorship');
  }, [refreshDraft, notify]);

  const addRollCall = useCallback(async (payload, memberVote, memberNote, legislator) => {
    const chamberLetter = payload.chamber === 'house' ? 'h' : 's';
    let slug = payload.bill_slug + '-' + chamberLetter + '-' + payload.stage;
    if (rollCalls.some((rc) => rc.roll_call_slug === slug)) slug = slug + '-' + Date.now();

    const bill = bills.find((b) => b.slug === payload.bill_slug);
    if (!bill) throw new Error('bill not found');

    const sb = supabase();
    const { data, error } = await sb.from('roll_calls').insert({
      roll_call_slug: slug,
      bill_id: bill.id,
      bill_slug: bill.slug,
      bill_label: bill.label,
      bill_title: bill.title,
      chamber: payload.chamber,
      stage: payload.stage,
      label: payload.label,
      vote_date: payload.vote_date,
      result: payload.result,
      yeas: Number(payload.yeas) || 0,
      nays: Number(payload.nays) || 0,
      stance: bill.stance,
      ga: bill.ga,
      notes: payload.notes || null,
    }).select().single();
    if (error) throw error;
    setRollCalls((list) => [...list, data]);

    if (memberVote) {
      const exc = await sb.from('legislator_vote_exceptions').insert({
        roll_call_id: data.id,
        roll_call_slug: data.roll_call_slug,
        chamber: legislator.chamber,
        district: legislator.district,
        vote: memberVote,
        notes: memberNote || null,
      }).select().single();
      if (exc.error) throw exc.error;
      setExceptions((list) => [...list, exc.data]);
    }

    const stale = await refreshDraft(legislator.id);
    notify(stale
      ? 'Saved the roll call, but the draft score did not refresh. ' + stale
      : 'Saved roll call');
  }, [rollCalls, bills, refreshDraft, notify]);

  const publishOne = useCallback(async (legislatorId) => {
    const { data, error } = await supabase()
      .rpc('publish_scorecard', { p_legislator_id: legislatorId });
    if (error) throw error;
    const snap = Array.isArray(data) ? data[0] : data;
    if (snap) setPublished((prev) => ({ ...prev, [legislatorId]: snap }));
    await refreshDraft(legislatorId);
    return snap;
  }, [refreshDraft]);

  async function publishEveryone() {
    setPublishingAll(true);
    const sb = supabase();
    const { data, error } = await sb.rpc('publish_scorecard_all', {});
    if (error) {
      setPublishingAll(false);
      notify('Publish failed: ' + error.message);
      return;
    }
    // Re-read the snapshots so the list reflects what the public site now shows.
    const snaps = await sb.from('score_snapshots').select('*').eq('is_current', true);
    if (!snaps.error) {
      const map = {};
      (snaps.data || []).forEach((s) => { map[s.legislator_id] = s; });
      setPublished(map);
    }
    setPublishingAll(false);
    setConfirmAll(false);
    notify(`Published ${data == null ? 'all' : data} legislators`);
  }

  // ----------------------------------------------------------------- derived
  const decorated = useMemo(() => (rows || []).map((r) => {
    const draft = computed[r.id];
    const snap = published[r.id];
    const g = (snap && snap.grade) || (draft && draft.grade) || r.grade || '';
    const score = (snap && snap.total_score) != null
      ? snap.total_score
      : (draft && draft.total_score) != null ? draft.total_score : null;
    return { ...r, grade: g || null, score, pubState: publishStateOf(draft, snap) };
  }), [rows, computed, published]);

  const parties = useMemo(
    () => Array.from(new Set(decorated.map((r) => r.party).filter(Boolean))).sort(),
    [decorated]);

  const filtered = useMemo(() => {
    const term = debouncedQ.trim().toLowerCase();
    const list = decorated.filter((r) => {
      if (chamber && r.chamber !== chamber) return false;
      if (party && r.party !== party) return false;
      if (grade === 'NA' && r.grade) return false;
      if (grade && grade !== 'NA') {
        if ((r.grade || '').charAt(0).toUpperCase() !== grade) return false;
      }
      if (pubFilter && r.pubState !== pubFilter) return false;
      if (term) {
        const hay = [
          r.full_name, r.first_name, r.last_name,
          'district ' + (r.district == null ? '' : r.district),
          r.leadership_role,
        ].filter(Boolean).join(' ').toLowerCase();
        if (hay.indexOf(term) === -1) return false;
      }
      return true;
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    return list.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (sortKey === 'district' || sortKey === 'score') {
        const an = av == null || av === '' ? -Infinity : Number(av);
        const bn = bv == null || bv === '' ? -Infinity : Number(bv);
        return (an - bn) * dir;
      }
      if (sortKey === 'grade') return ((GRADE_RANK[av] || 0) - (GRADE_RANK[bv] || 0)) * dir;
      return String(av || '').localeCompare(String(bv || ''), undefined, { sensitivity: 'base' }) * dir;
    });
  }, [decorated, debouncedQ, chamber, party, grade, pubFilter, sortKey, sortDir]);

  const stats = useMemo(() => ({
    total: decorated.length,
    house: decorated.filter((r) => r.chamber === 'house').length,
    senate: decorated.filter((r) => r.chamber === 'senate').length,
    graded: decorated.filter((r) => r.grade).length,
    pending: decorated.filter((r) => r.pubState === 'dirty' || r.pubState === 'unpub').length,
  }), [decorated]);

  const active = activeId ? decorated.find((r) => r.id === activeId) : null;

  if (!authLoading && !can('legislators', 'read')) {
    return (
      <div className="alert alert-error">
        The scorecard module is limited by role. Ask the Director if you need it.
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <h2>Scorecard</h2>
        <p className="sub">
          Roll calls, sponsorships, and equality grades. Publishing pushes a grade to the public
          page at ohiopride.org/scorecard.
        </p>
      </div>

      {loadError && <div className="alert alert-error">{loadError}</div>}
      {partialError && <div className="alert alert-warn">{partialError}</div>}
      {!authLoading && !canWrite && (
        <div className="alert alert-warn">
          Read only access. Ask the Director for the legislative lead role to record votes and publish.
        </div>
      )}

      <div className="kpi-grid">
        <div className="kpi"><div className="num lg-num">{stats.total.toLocaleString()}</div><div className="lbl">Members</div></div>
        <div className="kpi"><div className="num lg-num">{stats.house}</div><div className="lbl">House</div></div>
        <div className="kpi"><div className="num lg-num">{stats.senate}</div><div className="lbl">Senate</div></div>
        <div className="kpi"><div className="num lg-num">{stats.graded}</div><div className="lbl">Graded</div></div>
        <div className="kpi">
          <div className="num lg-num">{computing ? '…' : stats.pending}</div>
          <div className="lbl">Not published</div>
          <div className="sub">{computing ? 'Checking drafts' : 'Draft or never published'}</div>
        </div>
      </div>

      {canWrite && !computing && stats.pending > 0 && (
        <div className="card lg-banner">
          <div>
            <strong>{stats.pending} {stats.pending === 1 ? 'legislator has' : 'legislators have'} a grade the public site is not showing.</strong>
            <div className="muted small">Publishing rewrites every grade on ohiopride.org/scorecard.</div>
          </div>
          <div className="lg-banner-actions">
            {confirmAll ? (
              <>
                <span className="small">Publish the whole roster now?</span>
                <button className="btn btn-sm btn-primary" disabled={publishingAll} onClick={publishEveryone}>
                  {publishingAll ? 'Publishing…' : 'Yes, publish all'}
                </button>
                <button className="btn btn-sm" disabled={publishingAll} onClick={() => setConfirmAll(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button className="btn btn-sm btn-accent" onClick={() => setConfirmAll(true)}>
                Publish all changes
              </button>
            )}
          </div>
        </div>
      )}

      <details className="card lg-method">
        <summary>How floor, committee, and sponsorship roll up to a grade</summary>
        <div style={{ marginTop: 10 }}>
          <p className="small" style={{ marginTop: 0 }}>
            Three editorial subscores, each clamped to the range -5 to +5, feed one composite.
            The composite is clamped to 0 through 100 and the letter grade comes from a fixed table.
            The baseline is the same for every member regardless of party, chamber, or caucus.
          </p>
          <div className="lg-formula">score = clamp(0, 100, round(50 + (Vf × 4) + (Vc × 4) + (S × 2)))</div>
          <p className="muted small">
            Vf is floor votes, Vc is committee votes, S is sponsorship. Floor and committee weigh
            4 times; sponsorship weighs 2 times, because a sponsorship is a public commitment and
            not a recorded vote.
          </p>
          <div className="lg-scale">
            {GRADE_SCALE.map((g) => (
              <div className="lg-scale-row" key={g.grade}>
                <span className={`lg-grade ${gradeClass(g.grade)}`}>{g.grade}</span>
                <span className="lg-range">{g.range}</span>
                <span className="lg-meaning">{g.label}</span>
              </div>
            ))}
          </div>
          <p className="muted small" style={{ marginBottom: 0 }}>
            Full source is the public methodology page. These thresholds match it and the
            compute_legislator_score() function in the database exactly.
          </p>
        </div>
      </details>

      <div className="sticky-tools">
        <input className="input" placeholder="Search name, district, leadership role" value={q}
               onChange={(e) => setQ(e.target.value)} inputMode="search" aria-label="Search legislators" />
        <div className="chip-row" role="tablist" aria-label="Chamber">
          {CHAMBERS.map((c) => (
            <button key={c.key || 'all'} className="chip" aria-pressed={chamber === c.key}
                    onClick={() => setChamber(c.key)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="lg-filters">
        <label className="field" style={{ margin: 0 }}>
          <span>Party</span>
          <select className="select" value={party} onChange={(e) => setParty(e.target.value)}>
            <option value="">All parties</option>
            {parties.map((p) => <option key={p} value={p}>{partyName(p)}</option>)}
          </select>
        </label>
        <label className="field" style={{ margin: 0 }}>
          <span>Grade</span>
          <select className="select" value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="">All grades</option>
            {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            <option value="NA">Ungraded</option>
          </select>
        </label>
        <label className="field" style={{ margin: 0 }}>
          <span>Publish state</span>
          <select className="select" value={pubFilter} onChange={(e) => setPubFilter(e.target.value)}>
            {PUBLISH_STATES.map((s) => <option key={s.key || 'all'} value={s.key}>{s.label}</option>)}
          </select>
        </label>
        <label className="field" style={{ margin: 0 }}>
          <span>Sort</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <select className="select" value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <button className="btn" style={{ flex: '0 0 auto', padding: '0 12px' }}
                    onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                    aria-label={sortDir === 'asc' ? 'Sorted low to high' : 'Sorted high to low'}>
              {sortDir === 'asc' ? 'Low first' : 'High first'}
            </button>
          </div>
        </label>
      </div>

      <div className="muted small" style={{ margin: '0 0 8px' }}>
        {rows == null ? 'Loading…'
          : filtered.length === decorated.length
            ? `${decorated.length} total`
            : `${filtered.length} of ${decorated.length}`}
        {computing && rows != null ? ' · still checking draft grades' : ''}
      </div>

      {rows == null ? <div className="card">Loading legislators…</div> : (
        <div className="rowlist">
          {filtered.map((r) => (
            <button key={r.id} className="row card" onClick={() => setActiveId(r.id)}
                    style={{ cursor: 'pointer', textAlign: 'left', font: 'inherit', width: '100%' }}>
              <div>
                <strong>{r.full_name}</strong>
                <div className="muted small">
                  {[r.party ? partyName(r.party) : null, r.leadership_role].filter(Boolean).join(' · ') || 'No party on file'}
                </div>
              </div>
              <div className="small">
                {titleCase(r.chamber)} district <span className="lg-num">{r.district}</span>
              </div>
              <div className="small" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`lg-grade ${gradeClass(r.grade)}`}>{r.grade || 'NA'}</span>
                <span className="muted lg-num">{r.score == null ? 'no score' : r.score}</span>
              </div>
              <div className="small">
                <span className={PUBLISH_BADGE[r.pubState]}>{PUBLISH_LABEL[r.pubState]}</span>
              </div>
            </button>
          ))}
          {!filtered.length && (
            <div className="card muted">
              {decorated.length ? 'No legislators match these filters.' : 'No legislators found.'}
            </div>
          )}
        </div>
      )}

      {active && (
        <LegislatorDrawer
          key={active.id}
          legislator={active}
          bills={bills}
          rollCalls={rollCalls}
          exceptions={exceptions}
          sponsorships={sponsorships}
          draft={computed[active.id] || null}
          snapshot={published[active.id] || null}
          canWrite={canWrite}
          notify={notify}
          onSetVote={setVote}
          onSetSponsorship={setSponsorship}
          onAddRollCall={addRollCall}
          onPublish={publishOne}
          onClose={() => setActiveId(null)}
        />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
