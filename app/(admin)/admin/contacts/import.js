'use client';
// Import ActBlue CSV (donor rollup or contribution-level export).
// Reconciliation runs server-side with the service role: match by email,
// fill-never-overwrite, create missing contacts, flag conflicts, and dedupe
// contribution rows on email + receipt ID.
import { useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function ImportCsv({ notify, onClose }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);

  async function run(e) {
    e.preventDefault();
    const file = e.target.elements.file.files?.[0];
    if (!file) { setErr('Choose a CSV file first.'); return; }
    if (file.size > 8 * 1024 * 1024) { setErr('That file is over 8 MB. Split the export and import in parts.'); return; }
    setBusy(true); setErr(null); setResult(null);
    try {
      const csv = await file.text();
      const { data: { session } } = await supabase().auth.getSession();
      const resp = await fetch('/api/admin-contacts-import', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv, filename: file.name }),
      });
      const body = await resp.json();
      if (!resp.ok || !body.ok) throw new Error(body.error || `status ${resp.status}`);
      setResult(body);
      notify('Import finished.');
    } catch (ex) {
      setErr(ex.message || 'Import failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="drawer-scrim" onClick={() => onClose(!!result)} />
      <div className="drawer" role="dialog" aria-modal="true" aria-label="Import ActBlue CSV">
        <div className="drawer-head">
          <h3>Import ActBlue CSV</h3>
          <button className="btn btn-sm" onClick={() => onClose(!!result)}>Close</button>
        </div>
        <p className="muted small" style={{ marginTop: 0 }}>
          Accepts a donor rollup (one row per donor) or a contribution export (one row per gift).
          Matching is by email. Existing values are never overwritten; blanks are filled, new
          contacts are created, and disagreements are reported below instead of applied.
        </p>
        <form onSubmit={run}>
          <input className="input" type="file" name="file" accept=".csv,text/csv" style={{ padding: 10, minHeight: 0 }} />
          <button className="btn btn-primary" style={{ width: '100%', marginTop: 10 }} disabled={busy}>
            {busy ? 'Importing…' : 'Run import'}
          </button>
        </form>
        {err && <div className="alert alert-error">{err}</div>}
        {result && (
          <div style={{ marginTop: 12 }}>
            <div className="alert alert-ok">
              Processed {result.rows_total} rows as a {result.file_kind === 'contributions' ? 'contribution export' : 'donor rollup'}.
            </div>
            <div className="detail-grid">
              <div><div className="lbl">Contacts created</div><div className="val">{result.contacts_created}</div></div>
              <div><div className="lbl">Contacts enriched</div><div className="val">{result.contacts_updated}</div></div>
              <div><div className="lbl">Fields filled</div><div className="val">{result.fields_filled}</div></div>
              {result.file_kind === 'contributions' && (
                <>
                  <div><div className="lbl">Gifts inserted</div><div className="val">{result.donors_inserted}</div></div>
                  <div><div className="lbl">Duplicates skipped</div><div className="val">{result.donors_skipped}</div></div>
                </>
              )}
              <div><div className="lbl">Rows without email</div><div className="val">{result.rows_no_email}</div></div>
              {result.rows_skipped_bad_money > 0 && (
                <div><div className="lbl">Rows with bad amount/receipt</div><div className="val">{result.rows_skipped_bad_money}</div></div>
              )}
            </div>
            {result.conflicts?.length > 0 && (
              <>
                <h4 style={{ margin: '10px 0 4px' }}>Conflicts (not applied)</h4>
                {result.conflicts.map((c, i) => (
                  <div key={i} className="small" style={{ padding: '5px 0', borderBottom: '1px solid var(--op-line)', overflowWrap: 'anywhere' }}>
                    <strong>{c.email}</strong> · {c.field}: has “{c.existing}”, file says “{c.incoming}”
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
