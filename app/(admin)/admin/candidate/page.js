'use client';
// Candidates: the Race to 100 recruitment queue. New applications first, then
// newest. Table from 768px, cards on a phone. Bulk assign, bulk status, CSV.
//
// Gated by the `candidates` module: read to see it, write to change anything.
// RLS on candidate_applications is is_admin(), so the UI gate is the finer
// one; the database still refuses non-admins outright.
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAdmin } from '../../lib/permissions';
import {
  listApplications, listActiveAdmins, insertActivity, listRaces,
} from '../../../../lib/db/candidates.mjs';
import {
  STATUS_ORDER, STATUS_LABEL, TIER_ORDER, TIER_LABEL, REGION_ORDER, HELP_LABEL, IS_OUT_LABEL,
  applicationRaceLabel,
} from '../../../../lib/candidates.mjs';
import { toCsv } from '../../../../lib/csv.mjs';
import { Gate, HelpChips, StatusPill, fullName, useToast, when } from './shared';

const STATUS_RANK = Object.fromEntries(STATUS_ORDER.map((s, i) => [s, i]));

export default function CandidatesPage() {
  const { loading: authLoading, me, can } = useAdmin();
  const canWrite = can('candidates', 'write');
  const [apps, setApps] = useState(null);
  const [admins, setAdmins] = useState([]);
  const [raceCount, setRaceCount] = useState(null);
  const [error, setError] = useState(null);
  const [toast, notify] = useToast();

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [tier, setTier] = useState('all');
  const [region, setRegion] = useState('all');
  const [county, setCounty] = useState('all');
  const [assignee, setAssignee] = useState('all');
  const [unassigned, setUnassigned] = useState(false);
  const [needsMentor, setNeedsMentor] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  async function load() {
    const sb = supabase();
    const [a, ad, r] = await Promise.all([listApplications(sb), listActiveAdmins(sb), listRaces(sb)]);
    if (a.error) { setError(`Could not load applications: ${a.error.message}`); setApps([]); return; }
    setApps(a.data || []);
    setAdmins(ad.data || []);
    setRaceCount(r.data ? r.data.length : null);
  }
  useEffect(() => { load(); }, []);

  const counties = useMemo(() => [...new Set((apps || []).map((a) => a.county || a.target_race?.county).filter(Boolean))].sort(), [apps]);

  const visible = useMemo(() => {
    if (!apps) return [];
    const term = q.trim().toLowerCase();
    return apps
      .filter((a) =>
        (status === 'all' || a.status === status) &&
        (tier === 'all' || a.target_race?.tier === tier) &&
        (region === 'all' || a.target_race?.region === region) &&
        (county === 'all' || (a.county || a.target_race?.county) === county) &&
        (assignee === 'all' || a.assigned_to === assignee) &&
        (!unassigned || !a.assigned_to) &&
        (!needsMentor || (!a.mentor_name && !a.mentor_network_contact_id && (a.help_needed || []).includes('mentor'))) &&
        (!term || [fullName(a), a.email, a.jurisdiction, a.office_sought, a.race_other, a.target_race?.jurisdiction, a.target_race?.office]
          .some((v) => String(v || '').toLowerCase().includes(term))))
      .sort((x, y) => {
        // New first; everything else keeps newest-first order from the query.
        const nx = x.status === 'new' ? 0 : 1;
        const ny = y.status === 'new' ? 0 : 1;
        if (nx !== ny) return nx - ny;
        return new Date(y.created_at) - new Date(x.created_at);
      });
  }, [apps, q, status, tier, region, county, assignee, unassigned, needsMentor]);

  const counts = useMemo(() => {
    const c = { all: (apps || []).length };
    for (const s of STATUS_ORDER) c[s] = (apps || []).filter((a) => a.status === s).length;
    return c;
  }, [apps]);

  const allVisibleSelected = visible.length > 0 && visible.every((a) => selected.has(a.id));
  function toggleAll() {
    setSelected(allVisibleSelected ? new Set() : new Set(visible.map((a) => a.id)));
  }
  function toggle(id) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function bulk(patch, describe, kind) {
    if (!selected.size) return;
    setBulkBusy(true);
    const sb = supabase();
    const ids = [...selected];
    const { error: err } = await sb.from('candidate_applications').update(patch).in('id', ids);
    if (err) { notify(`Could not update: ${err.message}`); setBulkBusy(false); return; }
    await Promise.all(ids.map((id) => insertActivity(sb, { applicationId: id, kind, body: describe, actorEmail: me?.email })));
    setBulkBusy(false);
    setSelected(new Set());
    notify(`${ids.length} application${ids.length === 1 ? '' : 's'} updated.`);
    load();
  }

  function exportCsv() {
    const rows = selected.size ? visible.filter((a) => selected.has(a.id)) : visible;
    const csv = toCsv(rows, [
      ['First name', 'first_name'], ['Last name', 'last_name'], ['Pronouns', 'pronouns'],
      ['Email', 'email'], ['Phone', 'phone'], ['City', 'city'], ['County', (a) => a.county || a.target_race?.county || ''],
      ['ZIP', 'zip'], ['LGBTQ+', (a) => IS_OUT_LABEL[a.is_out] || ''], ['Party', 'party'],
      ['Race', applicationRaceLabel], ['Tier', (a) => TIER_LABEL[a.target_race?.tier] || ''],
      ['Region', (a) => a.target_race?.region || ''], ['Filed', (a) => a.has_filed == null ? 'Not sure' : a.has_filed ? 'Yes' : 'No'],
      ['Status', (a) => STATUS_LABEL[a.status] || a.status], ['Priority', 'priority'],
      ['Help needed', (a) => (a.help_needed || []).map((k) => HELP_LABEL[k] || k).join('; ')],
      ['Assigned to', (a) => a.assignee?.full_name || ''], ['Mentor', 'mentor_name'],
      ['Next action', 'next_action'], ['Next action date', 'next_action_date'],
      ['Submitted', 'created_at'], ['Why running', 'why_running'],
    ]);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `candidate-applications-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Gate loading={authLoading} allowed={can('candidates', 'read')}>
      <div className="page-head">
        <h2>Candidates</h2>
        <p className="sub">
          {counts.new
            ? `${counts.new} new application${counts.new === 1 ? '' : 's'} waiting for a call.`
            : 'Race to 100 recruitment: who has raised a hand, who is helping them, and what happens next.'}
        </p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="page-actions">
        <a className="btn btn-sm" href="/admin/candidate/races">Target races{raceCount != null ? ` (${raceCount})` : ''}</a>
        <a className="btn btn-sm" href="/2027/races" target="_blank" rel="noreferrer">Public page</a>
        <button className="btn btn-sm" onClick={exportCsv} disabled={!visible.length}>
          Export CSV{selected.size ? ` (${selected.size})` : ''}
        </button>
      </div>

      <div className="sticky-tools">
        <input className="input" placeholder="Search name, email, jurisdiction, office" value={q}
               onChange={(e) => setQ(e.target.value)} inputMode="search" aria-label="Search applications" />
        <div className="chip-row" role="group" aria-label="Status" style={{ paddingTop: 8, paddingBottom: 4 }}>
          {['all', ...STATUS_ORDER].map((s) => (
            <button key={s} type="button" className="chip" aria-pressed={status === s} onClick={() => setStatus(s)}>
              {s === 'all' ? 'All' : STATUS_LABEL[s]} ({counts[s] ?? 0})
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 6, marginTop: 4 }}>
          <select className="input" value={tier} onChange={(e) => setTier(e.target.value)} aria-label="Tier">
            <option value="all">Every tier</option>
            {TIER_ORDER.map((t) => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}
          </select>
          <select className="input" value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Region">
            <option value="all">Every region</option>
            {REGION_ORDER.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select className="input" value={county} onChange={(e) => setCounty(e.target.value)} aria-label="County">
            <option value="all">Every county</option>
            {counties.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Assigned to">
            <option value="all">Anyone</option>
            {admins.map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', margin: '8px 0 4px' }}>
          <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={unassigned} onChange={(e) => setUnassigned(e.target.checked)} /> Unassigned only
          </label>
          <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={needsMentor} onChange={(e) => setNeedsMentor(e.target.checked)} /> Needs mentor
          </label>
        </div>
      </div>

      {canWrite && selected.size > 0 && (
        <div className="card" style={{ marginBottom: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <strong className="small">{selected.size} selected</strong>
          <select className="input" style={{ width: 'auto', minHeight: 36 }} defaultValue="" disabled={bulkBusy}
                  aria-label="Assign selected to"
                  onChange={(e) => {
                    const id = e.target.value; if (!id) return;
                    const who = admins.find((u) => u.id === id);
                    bulk({ assigned_to: id }, `Assigned to ${who?.full_name || who?.email || 'an admin'}`, 'assignment');
                    e.target.value = '';
                  }}>
            <option value="">Assign to</option>
            {admins.map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
          </select>
          <select className="input" style={{ width: 'auto', minHeight: 36 }} defaultValue="" disabled={bulkBusy}
                  aria-label="Set status of selected"
                  onChange={(e) => {
                    const s = e.target.value; if (!s) return;
                    bulk({ status: s }, `Status set to ${STATUS_LABEL[s]} (bulk)`, 'status_change');
                    e.target.value = '';
                  }}>
            <option value="">Set status</option>
            {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <button className="btn btn-sm" onClick={exportCsv}>Export selected</button>
          <button className="btn btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {apps == null ? <div className="card">Loading</div> : !visible.length ? (
        <div className="card muted">
          {apps.length ? 'No applications match.' : 'No applications yet. They arrive from /candidate-apply.'}
        </div>
      ) : (
        <div className="cand-list">
          <div className="cand-head" aria-hidden="true">
            <span><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} aria-label="Select all" /></span>
            <span>Name</span><span>Race</span><span>County</span><span>Status</span><span>Help needed</span>
            <span>Assigned</span><span>Mentor</span><span>Submitted</span><span>Next action</span>
          </div>
          {visible.map((a) => {
            const race = a.target_race;
            return (
              <div key={a.id} className={`cand-row${a.status === 'new' ? ' is-new' : ''}`}>
                <span className="cand-check">
                  <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)} aria-label={`Select ${fullName(a)}`} />
                </span>
                <span className="cand-name">
                  <a href={`/admin/candidate/${a.id}`}><strong>{fullName(a)}</strong></a>
                  {a.pronouns && <span className="muted small"> {a.pronouns}</span>}
                  {a.priority && a.priority !== 'normal' && <span className="badge badge-review" style={{ marginLeft: 6 }}>{a.priority}</span>}
                </span>
                <span className="cand-race">
                  <span className="cand-lbl">Race</span>
                  {applicationRaceLabel(a)}
                  {race?.tier && <span className="muted small"> · {TIER_LABEL[race.tier]}</span>}
                </span>
                <span><span className="cand-lbl">County</span>{a.county || race?.county || ''}</span>
                <span><span className="cand-lbl">Status</span><StatusPill status={a.status} /></span>
                <span><span className="cand-lbl">Help</span><HelpChips help={a.help_needed} /></span>
                <span><span className="cand-lbl">Assigned</span>{a.assignee?.full_name || <span className="muted">Unassigned</span>}</span>
                <span><span className="cand-lbl">Mentor</span>{a.mentor_name || <span className="muted">None</span>}</span>
                <span><span className="cand-lbl">Submitted</span>{when(a.created_at)}</span>
                <span><span className="cand-lbl">Next</span>{a.next_action_date ? when(a.next_action_date) : <span className="muted">None</span>}</span>
              </div>
            );
          })}
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </Gate>
  );
}
