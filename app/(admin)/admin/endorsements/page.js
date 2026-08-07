'use client';
// Endorsements queue: cards grouped by status, built for board members
// reviewing on their phones. Tap a card for the candidate page + vote bar.
// Copy stays descriptive throughout (board firewall policy: deliberation
// records describe candidates; they never carry advocacy language).
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAdmin } from '../../lib/permissions';
import { exportPdf } from './pdf-client';
import { STATUS_ORDER, STATUS_LABEL, PATH_LABEL, VOTE_LABEL, tallyOf } from './shared';

const daysIn = (ts) => {
  const d = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
  return d <= 0 ? 'today' : d === 1 ? '1 day' : `${d} days`;
};

export default function EndorsementsQueue() {
  const { loading: authLoading, me, can } = useAdmin();
  const [apps, setApps] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [q, setQ] = useState('');
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    // Old deep links: /admin/endorsements?id=<uuid> -> the candidate page.
    const id = new URLSearchParams(window.location.search).get('id');
    if (id) { window.location.replace(`/admin/endorsements/${id}`); return; }
    const sb = supabase();
    (async () => {
      const [a, r] = await Promise.all([
        sb.from('endorsement_applications')
          .select('id, candidate_name, first_name, last_name, office_sought, district, party, election_year, status, endorsement_path, is_incumbent, created_at, updated_at')
          .order('created_at', { ascending: false }),
        sb.from('endorsement_reviews').select('application_id, reviewer_email, vote'),
      ]);
      setApps(a.data || []);
      setReviews(r.data || []);
    })();
  }, []);

  const grouped = useMemo(() => {
    if (!apps) return null;
    const term = q.trim().toLowerCase();
    const filtered = term
      ? apps.filter(a => [a.candidate_name, a.office_sought, a.district, a.party]
          .some(v => String(v || '').toLowerCase().includes(term)))
      : apps;
    return STATUS_ORDER.map(s => ({ status: s, items: filtered.filter(a => a.status === s) }))
                       .filter(g => g.items.length);
  }, [apps, q]);

  async function exportAll() {
    setExporting(true);
    const err = await exportPdf('all=open');
    setExporting(false);
    if (err) { setToast(err); setTimeout(() => setToast(null), 3200); }
  }

  if (!authLoading && !can('endorsements', 'read')) {
    return <div className="alert alert-error">The endorsements module is limited by role. Ask the Director if you need it.</div>;
  }

  const myEmail = (me?.email || '').toLowerCase();

  return (
    <>
      <div className="page-head">
        <h2>Endorsements</h2>
        <p className="sub">Candidate applications, board review, and votes.</p>
      </div>

      <div className="sticky-tools">
        <input className="input" placeholder="Search candidate, office, district…" value={q}
               onChange={e => setQ(e.target.value)} inputMode="search" aria-label="Search applications" />
      </div>

      <div className="page-actions">
        <button className="btn btn-sm" disabled={exporting} onClick={exportAll}>
          {exporting ? 'Building packet…' : 'Export board packet (open applications)'}
        </button>
      </div>

      {apps == null ? <div className="card">Loading…</div> : !grouped.length ? (
        <div className="card muted">No applications match.</div>
      ) : grouped.map(g => (
        <section key={g.status} style={{ marginBottom: 16 }}>
          <h3 style={{ font: '700 .8rem var(--op-font-head)', textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--op-muted)', margin: '0 0 8px' }}>
            {STATUS_LABEL[g.status]} ({g.items.length})
          </h3>
          <div className="stack">
            {g.items.map(a => {
              const rs = reviews.filter(r => r.application_id === a.id);
              const mine = rs.find(r => String(r.reviewer_email || '').toLowerCase() === myEmail);
              const t = tallyOf(rs);
              return (
                <a key={a.id} className="item" href={`/admin/endorsements/${a.id}`} style={{ display: 'block' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                    <strong>{a.candidate_name || [a.first_name, a.last_name].filter(Boolean).join(' ')}</strong>
                    <span className="muted small" style={{ whiteSpace: 'nowrap' }}>{daysIn(a.updated_at || a.created_at)} in stage</span>
                  </div>
                  <div className="muted small">
                    {[a.office_sought, a.district && `District ${a.district}`, a.party, a.election_year].filter(Boolean).join(' · ')}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {a.endorsement_path && <span className="badge badge-muted">{PATH_LABEL[a.endorsement_path] || a.endorsement_path}</span>}
                    {a.is_incumbent && <span className="badge badge-muted">Incumbent</span>}
                    {rs.length > 0 && (
                      <span className="small muted">
                        {t.yes} yes · {t.no} no{t.abstain ? ` · ${t.abstain} abstain` : ''}
                      </span>
                    )}
                    <span style={{ flex: 1 }} />
                    {mine
                      ? <span className="badge badge-ok">Your vote: {VOTE_LABEL[mine.vote] || mine.vote}</span>
                      : (g.status === 'submitted' || g.status === 'under_review')
                        ? <span className="badge badge-review">Vote needed</span> : null}
                  </div>
                </a>
              );
            })}
          </div>
        </section>
      ))}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
