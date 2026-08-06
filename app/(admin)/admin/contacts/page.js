'use client';
// The ONE streamlined Contacts + Donors module, reading public.contacts_directory
// (canonical contact + giving rollup + membership flags). Replaces the old
// /admin/contacts, /admin/donors, and /admin/fundraising/donors pages.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAdmin } from '../../lib/permissions';
import { money } from '../../lib/format';
import PersonDrawer from './person';
import ReviewQueue from './review';
import ImportCsv from './import';

const SEGMENTS = [
  { key: 'all',        label: 'All' },
  { key: 'donors',     label: 'Donors' },
  { key: 'founding',   label: 'Founding' },
  { key: 'volunteers', label: 'Volunteers' },
  { key: 'network',    label: 'Network' },
  { key: 'newsletter', label: 'Newsletter' },
  { key: 'review',     label: 'Needs Review' },
];

const SORTS = [
  { key: 'last_gift', label: 'Last gift' },
  { key: 'total',     label: 'Total given' },
  { key: 'name',      label: 'Name' },
];

const PAGE_SIZE = 60;

function applySegment(query, seg) {
  if (seg === 'donors')     return query.gt('gifts', 0);
  if (seg === 'founding')   return query.eq('is_founding_member', true);
  if (seg === 'volunteers') return query.eq('is_volunteer', true);
  if (seg === 'network')    return query.eq('is_network', true);
  if (seg === 'newsletter') return query.eq('is_newsletter', true);
  if (seg === 'review')     return query.eq('needs_review', true);
  return query;
}

function applySearch(query, q) {
  const term = q.trim().replace(/[,()]/g, ' ').replace(/\s+/g, ' ');
  if (!term) return query;
  return query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,employer.ilike.%${term}%`);
}

function applySort(query, sort) {
  if (sort === 'total') return query.order('total_cents', { ascending: false, nullsFirst: false }).order('full_name');
  if (sort === 'name')  return query.order('full_name', { ascending: true, nullsFirst: false });
  return query.order('last_gift_at', { ascending: false, nullsFirst: false }).order('updated_at', { ascending: false });
}

export default function ContactsPage() {
  const { loading: authLoading, can } = useAdmin();
  const canWrite = can('contacts', 'write');

  const initial = useMemo(() => {
    if (typeof window === 'undefined') return {};
    const p = new URLSearchParams(window.location.search);
    return { seg: p.get('seg') || 'all', q: p.get('q') || '', id: p.get('id') || null, view: p.get('view') || 'list' };
  }, []);

  const [view, setView] = useState(initial.view === 'review' ? 'review' : 'list');
  const [seg, setSeg] = useState(SEGMENTS.some(s => s.key === initial.seg) ? initial.seg : 'all');
  const [q, setQ] = useState(initial.q || '');
  const [debouncedQ, setDebouncedQ] = useState(q);
  const [sort, setSort] = useState('last_gift');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [reviewCount, setReviewCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(initial.id);
  const [showImport, setShowImport] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const notify = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async (offset = 0) => {
    setLoading(true);
    let query = supabase().from('contacts_directory').select('*', { count: 'exact' });
    query = applySegment(query, seg);
    query = applySearch(query, debouncedQ);
    query = applySort(query, sort).range(offset, offset + PAGE_SIZE - 1);
    const { data, count, error } = await query;
    if (!error) {
      setRows(prev => offset === 0 ? (data || []) : [...prev, ...(data || [])]);
      setTotal(count || 0);
    }
    setLoading(false);
  }, [seg, debouncedQ, sort]);

  useEffect(() => { load(0); }, [load]);

  useEffect(() => {
    supabase().from('contacts_directory')
      .select('id', { count: 'exact', head: true }).eq('needs_review', true)
      .then(({ count }) => setReviewCount(count ?? null));
  }, [view]);

  async function exportCsv() {
    let query = supabase().from('contacts_directory').select('*').limit(10000);
    query = applySegment(query, seg);
    query = applySearch(query, debouncedQ);
    query = applySort(query, sort);
    const { data, error } = await query;
    if (error || !data) { notify('Export failed.'); return; }
    const cols = ['full_name','email','phone','employer','occupation','address1','city','county','region','state','zip','total_cents','gifts','first_gift_at','last_gift_at','is_founding_member','founding_number','is_volunteer','is_network','is_newsletter','do_not_contact','needs_review','tags'];
    const esc = (v) => { const s = v == null ? '' : Array.isArray(v) ? v.join('; ') : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const csv = [cols.join(','), ...data.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `contacts-${seg}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!authLoading && !can('contacts', 'read')) {
    return <div className="alert alert-error">The contacts module is limited by role. Ask the Director if you need it.</div>;
  }

  if (view === 'review') {
    return (
      <ReviewQueue
        canWrite={canWrite}
        notify={notify}
        onExit={() => { setView('list'); load(0); }}
        toast={toast}
      />
    );
  }

  const activeRow = rows.find(r => r.id === activeId) || null;

  return (
    <>
      <div className="page-head">
        <h2>Contacts</h2>
        <p className="sub">Every donor, founding member, volunteer, and subscriber in one place.</p>
      </div>

      {reviewCount > 0 && (
        <button className="card" style={{ width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit', background: '#FDF3E7', borderColor: '#F2DFC5', marginBottom: 10 }}
                onClick={() => setView('review')}>
          <strong>{reviewCount} contact{reviewCount === 1 ? '' : 's'} need review</strong>
          <span className="muted small" style={{ display: 'block' }}>Bounced emails, OCR imports, and no-email check donors. Work the queue one at a time.</span>
        </button>
      )}

      <div className="sticky-tools">
        <input className="input" placeholder="Search name, email, employer…" value={q}
               onChange={e => setQ(e.target.value)} inputMode="search" aria-label="Search contacts" />
        <div className="chip-row" role="tablist" aria-label="Segments">
          {SEGMENTS.map(s => (
            <button key={s.key} className="chip" aria-pressed={seg === s.key} onClick={() => setSeg(s.key)}>
              {s.label}{s.key === 'review' && reviewCount > 0 ? ` (${reviewCount})` : ''}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0 10px', flexWrap: 'wrap' }}>
        <span className="muted small">{total.toLocaleString()} contact{total === 1 ? '' : 's'}</span>
        <span style={{ flex: 1 }} />
        <label className="muted small" htmlFor="sortSel">Sort</label>
        <select id="sortSel" className="select" style={{ width: 'auto', minHeight: 34 }} value={sort} onChange={e => setSort(e.target.value)}>
          {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <button className="btn btn-sm" onClick={exportCsv}>Export CSV</button>
        {canWrite && <button className="btn btn-sm btn-accent" onClick={() => setShowImport(true)}>Import ActBlue CSV</button>}
      </div>

      {loading && rows.length === 0 ? <div className="card">Loading…</div> : (
        <div className="rowlist">
          {rows.map(r => (
            <button key={r.id} className="row card" onClick={() => setActiveId(r.id)}
                    style={{ cursor: 'pointer', textAlign: 'left', font: 'inherit', width: '100%' }}>
              <div>
                <strong>{r.full_name || r.email}</strong>
                {r.is_founding_member && <span className="badge badge-founding" style={{ marginLeft: 8 }}>Founding{r.founding_number ? ` #${r.founding_number}` : ''}</span>}
                {r.needs_review && <span className="badge badge-review" style={{ marginLeft: 8 }}>Review</span>}
                {r.do_not_contact && <span className="badge badge-bad" style={{ marginLeft: 8 }}>DNC</span>}
                <div className="muted small">{r.email}</div>
              </div>
              <div className="small">{[r.occupation, r.employer].filter(Boolean).join(' · ')}</div>
              <div className="small">
                {r.gifts > 0 ? <><strong>{money(r.total_cents)}</strong> · {r.gifts} gift{r.gifts > 1 ? 's' : ''}</> : <span className="muted">No gifts</span>}
              </div>
              <div className="muted small">{[r.city, r.county].filter(Boolean).join(', ')}</div>
            </button>
          ))}
          {!loading && !rows.length && <div className="card muted">No contacts match.</div>}
        </div>
      )}

      {rows.length < total && (
        <button className="btn" style={{ width: '100%', marginTop: 10 }} disabled={loading} onClick={() => load(rows.length)}>
          {loading ? 'Loading…' : `Load more (${rows.length} of ${total.toLocaleString()})`}
        </button>
      )}

      {activeId && (
        <PersonDrawer
          contactId={activeId}
          seedRow={activeRow}
          canWrite={canWrite}
          notify={notify}
          onClose={(changed) => { setActiveId(null); if (changed) load(0); }}
        />
      )}

      {showImport && (
        <ImportCsv notify={notify} onClose={(changed) => { setShowImport(false); if (changed) load(0); }} />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
