'use client';
// ActBlue sync status for the Members page: when the last sync ran, what it
// did, and a "Sync now" button (donors:write) that calls the same handler the
// hourly cron uses. "Preview" runs it as a dry run: it reads ActBlue and
// reports what would change without writing anything.
//
// Reads public.actblue_sync_runs directly (RLS: donors:read), which is the
// same permission the roster itself needs.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { shortDate } from '../../lib/format';

const RUN_COLUMNS = 'id, started_at, finished_at, status, trigger, triggered_by, dry_run, range_start, range_end, ' +
  'rows_seen, founding_inserted, founding_updated, donors_inserted, donors_skipped, refunds_applied, ' +
  'cancellations_applied, contacts_created, contacts_enriched, error';

function relative(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(diff)) return '';
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return shortDate(iso);
}

const TRIGGER_LABEL = { cron: 'hourly cron', manual: 'Sync now', backfill: 'backfill' };

function summary(r) {
  if (!r) return '';
  if (r.status === 'running') return 'in progress';
  const parts = [];
  if (r.founding_inserted) parts.push(`${r.founding_inserted} new member${r.founding_inserted === 1 ? '' : 's'}`);
  if (r.donors_inserted) parts.push(`${r.donors_inserted} new gift${r.donors_inserted === 1 ? '' : 's'}`);
  if (r.founding_updated) parts.push(`${r.founding_updated} member${r.founding_updated === 1 ? '' : 's'} updated`);
  if (r.refunds_applied) parts.push(`${r.refunds_applied} refund${r.refunds_applied === 1 ? '' : 's'}`);
  if (r.cancellations_applied) parts.push(`${r.cancellations_applied} cancellation${r.cancellations_applied === 1 ? '' : 's'}`);
  if (r.contacts_created) parts.push(`${r.contacts_created} new contact${r.contacts_created === 1 ? '' : 's'}`);
  if (r.contacts_enriched) parts.push(`${r.contacts_enriched} contact${r.contacts_enriched === 1 ? '' : 's'} enriched`);
  if (!parts.length) return r.rows_seen ? `${r.rows_seen} contribution${r.rows_seen === 1 ? '' : 's'} checked, nothing new` : 'nothing new';
  return parts.join(', ');
}

export default function SyncPanel({ canWrite, notify, onSynced }) {
  const [runs, setRuns] = useState(null);
  const [busy, setBusy] = useState(null);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const [showRuns, setShowRuns] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase().from('actblue_sync_runs')
      .select(RUN_COLUMNS).order('started_at', { ascending: false }).limit(8);
    if (error) { setErr('Could not load sync history: ' + error.message); setRuns([]); return; }
    setRuns(data || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function run(dryRun) {
    if (busy) return;
    setBusy(dryRun ? 'preview' : 'sync');
    setErr(null);
    setResult(null);
    try {
      const { data: { session } } = await supabase().auth.getSession();
      if (!session) throw new Error('Your session has expired. Sign in again.');
      const resp = await fetch('/api/actblue-sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: dryRun }),
      });
      const body = await resp.json().catch(() => ({}));
      if (resp.status === 409) throw new Error('A sync is already running. Wait for it to finish; a run that dies is released after 15 minutes.');
      if (resp.status === 403) throw new Error('Your role cannot run the sync.');
      if (body.error === 'missing_env') {
        throw new Error(`The server is missing ${(body.missing || []).join(', ')}. Add them in Vercel and redeploy.`);
      }
      if (!body.run_id) throw new Error(body.message || body.error || `status ${resp.status}`);
      setResult(body);
      if (body.ok) {
        notify(dryRun ? 'Preview finished. Nothing was written.' : 'Sync finished.');
        if (!dryRun) onSynced?.();
      } else {
        setErr(body.error || 'The sync reported a problem.');
      }
    } catch (ex) {
      setErr(ex.message || 'The sync failed.');
    } finally {
      setBusy(null);
      load();
    }
  }

  const real = (runs || []).filter(r => !r.dry_run);
  const last = real[0] || null;
  const lastOk = real.find(r => r.status === 'ok') || null;

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <strong style={{ font: '700 .95rem var(--op-font-head)' }}>ActBlue sync</strong>
          {runs == null ? (
            <div className="muted small">Checking…</div>
          ) : !last ? (
            <div className="muted small">
              Never run. The hourly cron starts once the ActBlue credentials are set in Vercel, or run it now.
            </div>
          ) : (
            <div className="small" style={{ overflowWrap: 'anywhere' }}>
              {last.status === 'running' ? (
                <>Running since {relative(last.started_at)}…</>
              ) : last.status === 'ok' ? (
                <>Synced {relative(last.finished_at || last.started_at)} ({TRIGGER_LABEL[last.trigger] || last.trigger}): {summary(last)}.</>
              ) : (
                <>
                  <span className="badge badge-bad" style={{ marginRight: 6 }}>Failed</span>
                  {relative(last.finished_at || last.started_at)} ({TRIGGER_LABEL[last.trigger] || last.trigger}): {last.error || 'unknown error'}
                  {lastOk && <span className="muted"> · last good sync {relative(lastOk.finished_at)}</span>}
                </>
              )}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {canWrite && (
            <button className="btn btn-sm" onClick={() => run(true)} disabled={!!busy} title="Read ActBlue and report what would change, without writing">
              {busy === 'preview' ? 'Previewing…' : 'Preview'}
            </button>
          )}
          {canWrite && (
            <button className="btn btn-sm btn-primary" onClick={() => run(false)} disabled={!!busy}>
              {busy === 'sync' ? 'Syncing…' : 'Sync now'}
            </button>
          )}
          {runs?.length > 0 && (
            <button className="btn btn-sm" onClick={() => setShowRuns(s => !s)} aria-expanded={showRuns}>
              {showRuns ? 'Hide history' : 'History'}
            </button>
          )}
        </div>
      </div>

      {busy && (
        <div className="muted small" style={{ marginTop: 8 }}>
          ActBlue builds the export on its side, so this can take a minute. You can keep using the page.
        </div>
      )}

      {err && <div className="alert alert-error" style={{ marginTop: 10, marginBottom: 0 }}>{err}</div>}

      {result && (
        <div className={`alert ${result.ok ? 'alert-ok' : 'alert-warn'}`} style={{ marginTop: 10, marginBottom: 0 }}>
          {result.dry_run ? 'Preview' : 'Sync'} of {shortDate(result.range_start)} to {shortDate(result.range_end)}:{' '}
          {result.rows_seen} contribution{result.rows_seen === 1 ? '' : 's'} read;{' '}
          {result.dry_run ? 'would add' : 'added'} {result.founding_inserted} member{result.founding_inserted === 1 ? '' : 's'} and{' '}
          {result.donors_inserted} gift{result.donors_inserted === 1 ? '' : 's'}
          {result.refunds_applied ? `, ${result.refunds_applied} refund${result.refunds_applied === 1 ? '' : 's'}` : ''}
          {result.cancellations_applied ? `, ${result.cancellations_applied} cancellation${result.cancellations_applied === 1 ? '' : 's'}` : ''}
          {result.contacts_enriched ? `, ${result.contacts_enriched} contact${result.contacts_enriched === 1 ? '' : 's'} enriched` : ''}.
          {result.detail?.warnings?.length > 0 && (
            <div className="small" style={{ marginTop: 4 }}>{result.detail.warnings.join(' ')}</div>
          )}
          {result.detail?.problems?.length > 0 && (
            <div className="small" style={{ marginTop: 4 }}>
              {result.detail.problems.length} row{result.detail.problems.length === 1 ? '' : 's'} could not be written; see the run history.
            </div>
          )}
        </div>
      )}

      {showRuns && runs?.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {runs.map(r => (
            <div key={r.id} className="small" style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderTop: '1px solid var(--op-line)' }}>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                <span className={`badge ${r.status === 'ok' ? 'badge-ok' : r.status === 'running' ? 'badge-muted' : 'badge-bad'}`} style={{ marginRight: 6 }}>
                  {r.status === 'ok' ? 'OK' : r.status === 'running' ? 'Running' : 'Failed'}
                </span>
                {r.dry_run && <span className="badge badge-muted" style={{ marginRight: 6 }}>Preview</span>}
                {TRIGGER_LABEL[r.trigger] || r.trigger}{r.triggered_by ? ` by ${r.triggered_by}` : ''} ·{' '}
                {shortDate(r.range_start)} to {shortDate(r.range_end)} · {r.status === 'error' ? (r.error || 'error') : summary(r)}
              </span>
              <span className="muted" style={{ whiteSpace: 'nowrap' }}>{relative(r.started_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
