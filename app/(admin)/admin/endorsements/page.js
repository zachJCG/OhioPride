'use client';
// Endorsements queue: cards grouped by status, built for board members
// reviewing on their phones. Tap a card for the candidate page + vote bar.
// Copy stays descriptive throughout (board firewall policy: deliberation
// records describe candidates; they never carry advocacy language).
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAdmin } from '../../lib/permissions';
import { exportPdf } from './pdf-client';
import {
  STATUS_ORDER, STATUS_LABEL, PATH_LABEL, VOTE_LABEL, tallyOf,
  RACE_LEVEL_ORDER, RACE_LEVEL_LABEL,
} from './shared';
import { RaceLine } from './race-line';
import {
  cycleYearOf, currentCycleYear, isFutureCycle, daysInStage, daysInStageLabel,
} from '../../../../lib/endorsement-race.mjs';

const isOpen = (a) => a.status === 'submitted' || a.status === 'under_review';

// An open application that has sat in one status this long gets a warmer
// badge. Two weeks is roughly one board cycle.
const STALE_DAYS = 14;

export default function EndorsementsQueue() {
  const { loading: authLoading, me, can } = useAdmin();
  const [apps, setApps] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [q, setQ] = useState('');
  const [seg, setSeg] = useState('mine');
  const [level, setLevel] = useState('all');
  const [cycles, setCycles] = useState([]);
  const [cycleId, setCycleId] = useState('all');
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    // Old deep links: /admin/endorsements?id=<uuid> -> the candidate page.
    const id = new URLSearchParams(window.location.search).get('id');
    if (id) { window.location.replace(`/admin/endorsements/${id}`); return; }
    const sb = supabase();
    (async () => {
      const [a, r, c] = await Promise.all([
        sb.from('endorsement_applications')
          .select('id, candidate_name, first_name, last_name, office_sought, district, county, jurisdiction, party, election_year, is_special_election, status, endorsement_path, race_level, ballot_path, descriptive_only, is_incumbent, submitted_by_kind, photo_path, status_changed_at, created_at, cycle_id, submitted_at, was_late')
          .order('created_at', { ascending: false }),
        sb.from('endorsement_reviews').select('application_id, reviewer_email, vote'),
        sb.from('admin_election_cycles')
          .select('id, slug, label, is_open, application_count')
          .order('election_date', { ascending: true }),
      ]);
      setApps(a.data || []);
      setReviews(r.data || []);
      setCycles(c.data || []);
      // /admin/endorsements/cycles links here with the cycle it wants shown.
      const wanted = new URLSearchParams(window.location.search).get('cycle');
      if (wanted) {
        const match = (c.data || []).find(x => x.slug === wanted);
        if (match) setCycleId(match.id);
      }
    })();
  }, []);

  const myEmail = (me?.email || '').toLowerCase();
  const cycle = currentCycleYear();

  /* Applications for an election after the one in front of us. They get their
   * own tab rather than sitting in this year's queue, and they move into the
   * current queue on their own the morning after the general election, because
   * "current" is computed from the date, not stored on the row. */
  const future = useMemo(() => (apps || []).filter(a => isFutureCycle(a)), [apps]);
  const current = useMemo(() => (apps || []).filter(a => !isFutureCycle(a)), [apps]);

  /* An open, current-cycle application this member has not voted on. This is
   * the whole reason a board member opens the module, so it is the default
   * view and its count is the first thing on the page. */
  const needsMyVote = useMemo(() => {
    if (!myEmail) return [];
    return current.filter(a => isOpen(a) && !reviews.some(
      r => r.application_id === a.id && String(r.reviewer_email || '').toLowerCase() === myEmail,
    ));
  }, [current, reviews, myEmail]);

  /* Land on the queue that has something in it: your votes if you owe any,
   * otherwise everything still open. Runs once, so it never yanks the view out
   * from under someone who has picked a tab. */
  const segChosen = useRef(false);
  useEffect(() => {
    if (segChosen.current || !apps || !me) return;
    segChosen.current = true;
    if (!needsMyVote.length) setSeg(current.some(isOpen) ? 'open' : 'all');
  }, [apps, me, needsMyVote, current]);

  const counts = useMemo(() => ({
    mine: needsMyVote.length,
    open: current.filter(isOpen).length,
    future: future.length,
    all: (apps || []).length,
  }), [apps, current, future, needsMyVote]);

  /* Only offer a level filter once there is more than one level to filter by;
   * the chip row is dead weight on a queue that is all General Assembly. */
  const levelsPresent = useMemo(() => {
    const seen = new Set((apps || []).map(a => a.race_level).filter(Boolean));
    return RACE_LEVEL_ORDER.filter(l => seen.has(l));
  }, [apps]);

  const grouped = useMemo(() => {
    if (!apps) return null;
    const term = q.trim().toLowerCase();
    const inSeg = seg === 'mine' ? needsMyVote
                : seg === 'open' ? current.filter(isOpen)
                : seg === 'future' ? future
                : apps;
    let filtered = level === 'all' ? inSeg : inSeg.filter(a => a.race_level === level);
    if (cycleId !== 'all') filtered = filtered.filter(a => a.cycle_id === cycleId);
    if (term) {
      filtered = filtered.filter(a => [a.candidate_name, a.office_sought, a.district, a.county, a.jurisdiction, a.party, a.election_year]
        .some(v => String(v || '').toLowerCase().includes(term)));
    }
    if (seg === 'future') {
      // Next cycle groups by election year first: the point of the tab is to
      // see what 2027 looks like, then what 2028 looks like.
      const years = [...new Set(filtered.map(cycleYearOf))].sort((x, y) => x - y);
      return years.flatMap(year => STATUS_ORDER.map(s => ({
        key: `${year}-${s}`,
        label: `${year} · ${STATUS_LABEL[s]}`,
        items: filtered.filter(a => a.status === s && cycleYearOf(a) === year),
      }))).filter(g => g.items.length);
    }
    return STATUS_ORDER.map(s => ({ key: s, label: STATUS_LABEL[s], items: filtered.filter(a => a.status === s) }))
                       .filter(g => g.items.length);
  }, [apps, q, seg, level, needsMyVote, current, future, cycleId]);

  const SEGMENTS = [
    ['mine', 'Needs your vote'],
    ['open', 'Open'],
    ['future', 'Next cycle'],
    ['all', 'All'],
  ];

  async function exportAll() {
    setExporting(true);
    const err = await exportPdf('all=open');
    setExporting(false);
    if (err) { setToast(err); setTimeout(() => setToast(null), 3200); }
  }

  if (!authLoading && !can('endorsements', 'read')) {
    return <div className="alert alert-error">The endorsements module is limited by role. Ask the Director if you need it.</div>;
  }

  const emptyCopy = q.trim() || level !== 'all' ? 'No applications match.'
    : seg === 'mine' ? `You have voted on every open ${cycle} application. Nothing is waiting on you.`
    : seg === 'future' ? `No applications for an election after ${cycle} yet. Anything filed for ${cycle + 1} or later lands here, and moves into the ${cycle} queue's place once this November is over.`
    : 'No applications match.';

  return (
    <>
      <div className="page-head">
        <h2>Endorsements</h2>
        <p className="sub">
          {counts.mine
            ? `${counts.mine} application${counts.mine === 1 ? '' : 's'} waiting on your vote.`
            : 'Applications, review against the public record, board vote. No candidate interviews.'}
        </p>
      </div>

      <div className="sticky-tools">
        {/* Four views, not four lists: a card belongs to exactly one of the
            first three, and All is the union, so nothing is shown twice. */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }} role="group" aria-label="Which applications">
          {SEGMENTS.map(([key, label]) => (
            <button key={key} className={`btn btn-sm ${seg === key ? 'btn-primary' : ''}`}
                    style={{ flex: 1, padding: '0 4px' }}
                    aria-pressed={seg === key} onClick={() => setSeg(key)}>
              {label} ({counts[key]})
            </button>
          ))}
        </div>
        <input className="input" placeholder="Search candidate, office, district, county, jurisdiction…" value={q}
               onChange={e => setQ(e.target.value)} inputMode="search" aria-label="Search applications" />
        {cycles.length > 1 && (
          <select
            className="input"
            style={{ marginTop: 8 }}
            value={cycleId}
            onChange={e => setCycleId(e.target.value)}
            aria-label="Filter by election"
          >
            <option value="all">Every election</option>
            {cycles.map(c => (
              <option key={c.id} value={c.id}>
                {c.label}{c.is_open ? ' · open' : ''} · {c.application_count}
              </option>
            ))}
          </select>
        )}
        {levelsPresent.length > 1 && (
          <div className="chip-row" role="group" aria-label="Race level" style={{ paddingTop: 8, paddingBottom: 4 }}>
            {['all', ...levelsPresent].map(l => (
              <button key={l} type="button" className="chip" aria-pressed={level === l} onClick={() => setLevel(l)}>
                {l === 'all' ? 'All races' : RACE_LEVEL_LABEL[l] || l}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="page-actions">
        <a className="btn btn-sm" href="/admin/endorsements/cycles">Election cycles</a>
        <button className="btn btn-sm" disabled={exporting} onClick={exportAll}>
          {exporting ? 'Building packet…' : 'Export board packet (open applications)'}
        </button>
      </div>

      {apps == null ? <div className="card">Loading…</div> : !grouped.length ? (
        <div className="card muted">{emptyCopy}</div>
      ) : grouped.map(g => (
        <section key={g.key} style={{ marginBottom: 16 }}>
          <h3 style={{ font: '700 .8rem var(--op-font-head)', textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--op-muted)', margin: '0 0 8px' }}>
            {g.label} ({g.items.length})
          </h3>
          <div className="stack">
            {g.items.map(a => {
              const rs = reviews.filter(r => r.application_id === a.id);
              const mine = rs.find(r => String(r.reviewer_email || '').toLowerCase() === myEmail);
              const t = tallyOf(rs);
              const open = isOpen(a);
              const days = daysInStage(a);
              const stale = open && days != null && days >= STALE_DAYS;
              return (
                <a key={a.id} className="item" href={`/admin/endorsements/${a.id}`} style={{ display: 'block' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                    <strong>
                      {a.candidate_name || [a.first_name, a.last_name].filter(Boolean).join(' ')}
                      {/* Staff accepted this one after its cycle closed. The
                          board minutes should show that, so the queue does. */}
                      {a.was_late && <span className="badge badge-review" style={{ marginLeft: 6 }}>Late</span>}
                    </strong>
                    {/* Measured from status_changed_at, which the database stamps
                        only when the status moves. It used to read updated_at
                        and reset whenever anyone saved a note. */}
                    <span className={`small ${stale ? 'badge badge-review' : 'muted'}`} style={{ whiteSpace: 'nowrap' }}
                          title={`In ${STATUS_LABEL[a.status] || a.status} since ${new Date(a.status_changed_at || a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}>
                      {daysInStageLabel(a)} in stage
                    </span>
                  </div>
                  <RaceLine app={a} />
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* descriptive_only is computed by the database from
                        race_level, so this badge cannot drift from the rule the
                        Board actually applies. */}
                    {a.descriptive_only && (
                      <span className="badge badge-review" title="Reviewed under the descriptive-only standard: no pledges on matters that may come before them">
                        Descriptive only
                      </span>
                    )}
                    {a.race_level
                      ? <span className="badge badge-muted">{RACE_LEVEL_LABEL[a.race_level] || a.race_level}</span>
                      : a.endorsement_path
                        ? <span className="badge badge-muted">{PATH_LABEL[a.endorsement_path] || a.endorsement_path}</span>
                        : null}
                    {a.is_incumbent && <span className="badge badge-muted">Incumbent</span>}
                    {a.submitted_by_kind && a.submitted_by_kind !== 'candidate' && (
                      <span className="badge badge-muted" title="Filled in on the candidate's behalf">
                        {a.submitted_by_kind === 'pac_staff' ? 'Filed by PAC staff' : 'Filed by campaign'}
                      </span>
                    )}
                    {a.photo_path && <span className="badge badge-muted" title="A photo was submitted">Photo</span>}
                    {rs.length > 0 && (
                      <span className="small muted">
                        {t.endorse} endorse · {t.decline} decline{t.abstain ? ` · ${t.abstain} abstain` : ''}
                      </span>
                    )}
                    <span style={{ flex: 1 }} />
                    {mine
                      ? <span className="badge badge-ok">Your vote: {VOTE_LABEL[mine.vote] || mine.vote}</span>
                      : open ? <span className="badge badge-review">Vote needed</span> : null}
                  </div>
                </a>
              );
            })}
          </div>
        </section>
      ))}

      {/* A board member on their own queue should still know next cycle's
          applications exist; they are one tap away, not hidden. */}
      {apps != null && seg !== 'future' && seg !== 'all' && counts.future > 0 && !q.trim() && (
        <p className="muted small" style={{ margin: '4px 0 12px' }}>
          {counts.future} application{counts.future === 1 ? '' : 's'} for a later election {counts.future === 1 ? 'is' : 'are'} under{' '}
          <button type="button" className="btn btn-sm" style={{ minHeight: 26, padding: '0 8px' }} onClick={() => setSeg('future')}>Next cycle</button>.
        </p>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
