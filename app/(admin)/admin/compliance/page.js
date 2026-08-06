'use client';
// Compliance: the three CFOFS schedule ledgers (contributions 31-A, expenses
// 31-B, loans and debts 31-N/31-C) in one page, with the Ohio SOS upload file
// generated from the rows that pass validation.
//
// Ported from public/admin/compliance/compliance-app.js, which was three pages
// sharing one controller. The column model and every filing rule now live in
// ./cfofs.js so the ledger and the upload file are graded by the same code.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAdmin } from '../../lib/permissions';
import {
  SCHEDULES, SCHEDULE_TABS, runSchedule, toCsv, parseCsv, looksLikeHeader,
  importRowToPayload, entryName, usd, ledgerDate,
} from './cfofs';
import EntryDrawer from './entry-drawer';

const CFG_KEY = 'opCompliance.config';
const DEFAULT_CFG = { entity: '16372', report: 'PostPrimary2026', form: '4', stamp: true };

function sortRows(list, dateCol) {
  return [...list].sort((a, b) =>
    String(b[dateCol] || '').localeCompare(String(a[dateCol] || '')) ||
    String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

export default function CompliancePage() {
  const { loading: authLoading, can } = useAdmin();
  const canWrite = can('finance', 'write');

  const [schedKey, setSchedKey] = useState('contribution');
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);      // record object, or 'new'
  const [cfg, setCfg] = useState(DEFAULT_CFG);
  const [showSettings, setShowSettings] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [pending, setPending] = useState(null);      // { payloads, check, hadHeader }
  const [importMsg, setImportMsg] = useState(null);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const sched = SCHEDULES[schedKey];

  const notify = useCallback((m) => {
    setToast(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3600);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Filing settings live in sessionStorage. Read after mount, never during
  // render, so the server and client markup agree.
  useEffect(() => {
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(CFG_KEY) || 'null');
      if (saved) {
        setCfg({
          entity: saved.entity || DEFAULT_CFG.entity,
          report: saved.report || DEFAULT_CFG.report,
          form: saved.form || DEFAULT_CFG.form,
          stamp: saved.stamp !== false,
        });
      }
    } catch {
      // A malformed cached value is not worth surfacing; the defaults stand.
    }
  }, []);

  const saveCfg = useCallback((next) => {
    setCfg(next);
    try { window.sessionStorage.setItem(CFG_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  }, []);

  const engineCfg = useMemo(() => ({
    entity: cfg.entity.trim(),
    report: cfg.report.trim(),
    form_of_contribution_code: cfg.form,
    stamp_filer_pac_number: cfg.stamp ? 'true' : 'false',
  }), [cfg]);

  const load = useCallback(async (key) => {
    const s = SCHEDULES[key];
    setRows(null);
    setErr(null);
    const { data, error } = await supabase().from(s.table).select(s.colSelect);
    if (error) {
      setErr('Could not load the ' + s.titlePlural.toLowerCase() + ' ledger. ' + error.message);
      setRows([]);
      return;
    }
    setRows(sortRows(data || [], s.dateCol));
  }, []);

  useEffect(() => {
    setQ('');
    setPending(null);
    setImportMsg(null);
    setCsvText('');
    load(schedKey);
  }, [schedKey, load]);

  const check = useMemo(
    () => runSchedule(schedKey, rows || [], engineCfg),
    [schedKey, rows, engineCfg]);

  const resultById = useMemo(() => {
    const m = new Map();
    for (const r of check.rows) if (r.record) m.set(r.record.id, r);
    return m;
  }, [check]);

  const cleanRows = useMemo(
    () => (rows || []).filter((r) => !(resultById.get(r.id)?.errors.length)),
    [rows, resultById]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows || [];
    return (rows || []).filter((r) =>
      (entryName(r) + ' ' + (r.city || '') + ' ' + (r.purpose || '')).toLowerCase().includes(term));
  }, [rows, q]);

  function exportCsv() {
    if (!rows || !rows.length) { notify('There is nothing in this ledger yet.'); return; }
    if (!cleanRows.length) {
      notify('No rows are ready to export yet. Fix the flagged entries first.');
      return;
    }
    // Re-run over the clean rows only so CFOFS item numbers stay 1 to N.
    const out = runSchedule(schedKey, cleanRows, engineCfg);
    const blob = new Blob([toCsv(out.rows)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = out.filename;
    a.click();
    URL.revokeObjectURL(a.href);
    const held = rows.length - cleanRows.length;
    notify(`Exported ${out.rows.length} row${out.rows.length === 1 ? '' : 's'} to ${out.filename}` +
      (held ? `. ${held} row${held === 1 ? '' : 's'} held back, see the list below.` : '.'));
  }

  async function remove(rec) {
    if (!canWrite) return;
    if (!window.confirm('Delete this entry?\n\n' + entryName(rec))) return;
    const { error } = await supabase().from(sched.table).delete().eq('id', rec.id);
    if (error) { notify('Could not delete. ' + error.message); return; }
    setRows((list) => (list || []).filter((r) => r.id !== rec.id));
    notify('Entry deleted.');
  }

  function readPaste() {
    setImportMsg(null);
    setPending(null);
    const parsed = parseCsv(csvText);
    if (!parsed.length) { setImportMsg({ kind: 'error', text: 'Nothing to read. Paste the rows first.' }); return; }
    const hadHeader = looksLikeHeader(sched, parsed[0]);
    const body = hadHeader ? parsed.slice(1) : parsed;
    if (!body.length) {
      setImportMsg({ kind: 'error', text: 'That is only the header row. Paste the data rows underneath it.' });
      return;
    }
    const payloads = body.map((r) => importRowToPayload(sched, r));
    setPending({ payloads, check: runSchedule(schedKey, payloads, engineCfg), hadHeader });
  }

  async function runImport() {
    if (!pending || !canWrite) return;
    const n = pending.payloads.length;
    if (!window.confirm(`Import ${n} row${n === 1 ? '' : 's'} into the ${sched.titlePlural.toLowerCase()} ledger?`)) return;
    setImporting(true);
    const { data, error } = await supabase().from(sched.table)
      .insert(pending.payloads).select(sched.colSelect);
    setImporting(false);
    if (error) {
      setImportMsg({ kind: 'error', text: 'Import failed. ' + error.message + ' If this keeps happening, your account may not have finance write access.' });
      return;
    }
    setRows((list) => sortRows([...(data || []), ...(list || [])], sched.dateCol));
    setPending(null);
    setCsvText('');
    setImportMsg({ kind: 'ok', text: `Imported ${n} row${n === 1 ? '' : 's'}.` });
    notify(`Imported ${n} row${n === 1 ? '' : 's'}.`);
  }

  function copyHeaderRow() {
    const line = sched.headers.join(',');
    if (!navigator.clipboard) { notify('Copying is not available in this browser. Select the row and copy it.'); return; }
    navigator.clipboard.writeText(line)
      .then(() => notify('Header row copied.'))
      .catch(() => notify('Could not copy. Select the row and copy it.'));
  }

  if (!authLoading && !can('finance', 'read')) {
    return (
      <div className="alert alert-error">
        Compliance holds the campaign finance ledgers, so it is limited to the Director and the
        treasurer. Ask the Director to grant the finance role if you need it.
      </div>
    );
  }

  const blocking = check.blocking.length;
  const warned = check.warned.length;

  return (
    <>
      <div className="page-head">
        <h2>Compliance</h2>
        <p className="sub">
          The three CFOFS ledgers and the Ohio SOS upload file. Every row is graded against the
          filing rules before it can leave here.
        </p>
      </div>

      <div className="chip-row" role="tablist" aria-label="CFOFS schedules">
        {SCHEDULE_TABS.map((t) => (
          <button key={t.key} className="chip" role="tab" aria-pressed={schedKey === t.key}
                  onClick={() => setSchedKey(t.key)}>
            {t.label} ({t.code})
          </button>
        ))}
      </div>

      {err && <div className="alert alert-error">{err}</div>}

      <div className="kpi-grid">
        <div className="kpi">
          <div className="num">{rows == null ? '…' : rows.length}</div>
          <div className="lbl">Entries</div>
        </div>
        <div className="kpi">
          <div className="num">{usd(check.total)}</div>
          <div className="lbl">{sched.totalLabel}</div>
        </div>
        <div className="kpi">
          <div className="num">{rows == null ? '…' : cleanRows.length}</div>
          <div className="lbl">Ready to file</div>
        </div>
        <div className="kpi">
          <div className="num">{rows == null ? '…' : blocking}</div>
          <div className="lbl">Needs a fix</div>
          {warned > 0 && <div className="sub">{warned} with a warning</div>}
        </div>
      </div>

      <div className="page-actions">
        <button className="btn btn-primary" onClick={exportCsv} disabled={!rows || !rows.length}>
          Export CFOFS CSV
        </button>
        {canWrite && <button className="btn btn-accent" onClick={() => setEditing('new')}>
          Add {sched.title.toLowerCase()}
        </button>}
        {canWrite && <button className="btn btn-sm" onClick={() => setShowImport((v) => !v)}>
          {showImport ? 'Hide import' : 'Import pasted CSV'}
        </button>}
        <button className="btn btn-sm" onClick={() => setShowSettings((v) => !v)}>
          {showSettings ? 'Hide filing settings' : 'Filing settings'}
        </button>
      </div>

      <p className="muted small" style={{ margin: '0 0 12px' }}>
        The download is a CSV in the exact CFOFS column order with no header row, which is what the
        SOS uploader reads. It is not an Excel workbook: the workbook writer loaded a script from
        another site and this admin blocks outside scripts on purpose. Only rows that pass every
        check are written, and item numbers are renumbered 1 to N so the file stays contiguous.
      </p>

      {showSettings && (
        <div className="card" style={{ marginBottom: 12 }}>
          <strong>Filing settings</strong>
          <p className="muted small">
            Entity and report name the export file. They are never written into a PAC REGISTRATION
            NUMBER column. Verify the form of contribution code against CFOFS Data Download before
            you file. These stay on this device for the session only.
          </p>
          <label className="field">
            <span>Entity (PAC number)</span>
            <input className="input" value={cfg.entity} onChange={(e) => saveCfg({ ...cfg, entity: e.target.value })} />
          </label>
          <label className="field">
            <span>Report</span>
            <input className="input" value={cfg.report} onChange={(e) => saveCfg({ ...cfg, report: e.target.value })} />
          </label>
          <label className="field">
            <span>Default form of contribution</span>
            <select className="select" value={cfg.form} onChange={(e) => saveCfg({ ...cfg, form: e.target.value })}>
              <option value="1">Check (1)</option>
              <option value="2">Cash (2)</option>
              <option value="3">Credit card (3)</option>
              <option value="4">Electronic (4)</option>
            </select>
          </label>
          <label className="field" style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44 }}>
            <input type="checkbox" checked={cfg.stamp} style={{ width: 20, height: 20 }}
                   onChange={(e) => saveCfg({ ...cfg, stamp: e.target.checked })} />
            <span style={{ textTransform: 'none', letterSpacing: 0, fontSize: '.92rem' }}>
              Stamp the PAC number on every row that has none
            </span>
          </label>
        </div>
      )}

      {showImport && canWrite && (
        <div className="card" style={{ marginBottom: 12 }}>
          <strong>Import pasted CSV</strong>
          <p className="muted small">
            Copy the {sched.tab} rows out of your spreadsheet and paste them here. Columns must be in
            the official CFOFS order shown below. A header row is detected and skipped. Workbook
            files are not read here because that needed an outside script.
          </p>
          <div style={{ overflowX: 'auto', border: '1px solid var(--op-line)', borderRadius: 8, padding: '6px 8px', marginBottom: 8 }}>
            <code className="small" style={{ whiteSpace: 'nowrap' }}>{sched.headers.join(', ')}</code>
          </div>
          <button className="btn btn-sm" onClick={copyHeaderRow} style={{ marginBottom: 8 }}>Copy header row</button>
          <textarea className="textarea" rows={6} value={csvText} placeholder="Paste rows here"
                    onChange={(e) => { setCsvText(e.target.value); setPending(null); }} />
          {importMsg && (
            <div className={`alert ${importMsg.kind === 'error' ? 'alert-error' : 'alert-ok'}`}>{importMsg.text}</div>
          )}
          {pending && (
            <div className={`alert ${pending.check.blocking.length ? 'alert-warn' : 'alert-ok'}`}>
              {pending.payloads.length} row{pending.payloads.length === 1 ? '' : 's'} ready to import
              {pending.hadHeader ? ', header row skipped' : ''}.
              {pending.check.blocking.length
                ? ` ${pending.check.blocking.length} of them will still need a fix before filing.`
                : ' All of them pass every check.'}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" onClick={readPaste} disabled={!csvText.trim()}>Check rows</button>
            <button className="btn btn-primary" onClick={runImport} disabled={!pending || importing}>
              {importing ? 'Importing…' : pending ? `Import ${pending.payloads.length} row${pending.payloads.length === 1 ? '' : 's'}` : 'Import rows'}
            </button>
          </div>
        </div>
      )}

      {(blocking > 0 || warned > 0) && (
        <div className="card" style={{ marginBottom: 12 }}>
          <strong>{blocking > 0 ? `${blocking} row${blocking === 1 ? '' : 's'} cannot be filed yet` : 'Everything files, with notes'}</strong>
          <p className="muted small">
            Rows with a problem are left out of the export. Open one to fix it and it joins the next
            download automatically.
          </p>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {check.blocking.map((r) => (
              <div key={'e' + r.row} className="alert alert-error" style={{ margin: '6px 0' }}>
                <strong>{entryName(r.record)}</strong>
                {r.record ? <span className="muted"> {ledgerDate(r.record[sched.dateCol])}</span> : null}
                <div>{r.errors.join('. ')}.</div>
              </div>
            ))}
            {check.warned.map((r) => (
              <div key={'w' + r.row} className="alert alert-warn" style={{ margin: '6px 0' }}>
                <strong>{entryName(r.record)}</strong>
                {r.record ? <span className="muted"> {ledgerDate(r.record[sched.dateCol])}</span> : null}
                <div>{r.warnings.join('. ')}.</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="sticky-tools">
        <input className="input" inputMode="search" value={q} onChange={(e) => setQ(e.target.value)}
               aria-label={'Search ' + sched.titlePlural.toLowerCase()}
               placeholder={`Search ${sched.nameLabel.toLowerCase()}, city, purpose…`} />
      </div>

      <div className="muted small" style={{ margin: '2px 0 10px' }}>
        {rows == null ? 'Loading…'
          : visible.length === rows.length
            ? `${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}`
            : `${visible.length} of ${rows.length}`}
      </div>

      {rows == null ? <div className="card">Loading the ledger…</div> : visible.length === 0 ? (
        <div className="card">
          <strong>{rows.length ? 'Nothing matches that search' : `No ${sched.titlePlural.toLowerCase()} yet`}</strong>
          <p className="muted" style={{ marginBottom: 0 }}>
            {rows.length
              ? 'Clear the search to see the whole ledger.'
              : canWrite
                ? `Add one entry at a time, or paste a block of CSV rows in the same column order as the CFOFS ${sched.tab} tab.`
                : 'The treasurer adds entries here. Nothing has been recorded on this schedule yet.'}
          </p>
        </div>
      ) : (
        <div className="rowlist">
          {visible.map((r) => {
            const v = resultById.get(r.id);
            const bad = !!v?.errors.length;
            const warn = !bad && !!v?.warnings.length;
            return (
              <div key={r.id} className="row card">
                <div>
                  <strong>{entryName(r)}</strong>
                  {bad && <span className="badge badge-bad" style={{ marginLeft: 8 }}>Fix</span>}
                  {warn && <span className="badge badge-review" style={{ marginLeft: 8 }}>Check</span>}
                  <div className="muted small">{ledgerDate(r[sched.dateCol])}</div>
                </div>
                <div className="small">
                  {schedKey === 'contribution' && ([r.city, r.state].filter(Boolean).join(', ') || <span className="muted">No city on file</span>)}
                  {schedKey === 'expense' && (r.purpose || <span className="muted">No purpose on file</span>)}
                  {schedKey === 'loan' && <span className="badge badge-muted">{r.schedule_code || '31N'}</span>}
                </div>
                <div className="small">
                  <strong>
                    {schedKey === 'loan'
                      ? (r.outstanding_balance_cents == null ? 'Not set' : usd(r.outstanding_balance_cents))
                      : usd(r.amount_cents)}
                  </strong>
                  {schedKey === 'loan' && <span className="muted"> outstanding</span>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn btn-sm" onClick={() => setEditing(r)}>{canWrite ? 'Edit' : 'View'}</button>
                  {canWrite && <button className="btn btn-sm btn-danger" onClick={() => remove(r)}>Delete</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <EntryDrawer
          schedKey={schedKey}
          sched={sched}
          record={editing === 'new' ? null : editing}
          canWrite={canWrite}
          cfg={engineCfg}
          notify={notify}
          onClose={() => setEditing(null)}
          onSaved={(row, isNew) => {
            setEditing(null);
            setRows((list) => sortRows(
              isNew ? [row, ...(list || [])] : (list || []).map((r) => (r.id === row.id ? row : r)),
              sched.dateCol));
          }}
        />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
