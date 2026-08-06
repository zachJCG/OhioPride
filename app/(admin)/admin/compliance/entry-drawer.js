'use client';
// Add or edit one ledger entry. The fields, their order, and the payload the
// drawer writes are the CFOFS template columns for the schedule, so the row
// exports without a translation step. The same CFOFS rules that grade the
// export run live here, which is why a row can be saved while it is still
// incomplete: the treasurer sees exactly what filing will need.
import { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { parseCents, runSchedule } from './cfofs';

function initialValues(sched, record) {
  const v = {};
  for (const fd of sched.fields) {
    const raw = record ? record[fd.col] : null;
    if (fd.type === 'bool') { v[fd.id] = !!raw; continue; }
    if (fd.type === 'money') { v[fd.id] = raw == null ? '' : (raw / 100).toFixed(2); continue; }
    if (raw != null && raw !== '') { v[fd.id] = String(raw); continue; }
    if (!record && fd.id === 'state') { v[fd.id] = 'OH'; continue; }
    if (!record && fd.id === 'schedule_code') { v[fd.id] = '31N'; continue; }
    v[fd.id] = '';
  }
  return v;
}

// Mirrors the collect step of the static page: money as integer cents, empty
// text as null, and schedule_code never null because the column is NOT NULL.
function collect(sched, values) {
  const payload = {};
  const errors = [];
  for (const fd of sched.fields) {
    if (fd.type === 'bool') { payload[fd.col] = !!values[fd.id]; continue; }
    const raw = values[fd.id];
    if (fd.type === 'money') {
      if (raw == null || String(raw).trim() === '') {
        if (fd.required) errors.push(fd.label + ' is required');
        payload[fd.col] = fd.required ? 0 : null;
      } else {
        const c = parseCents(raw);
        if (Number.isNaN(c)) errors.push(fd.label + ' is not a valid amount');
        else payload[fd.col] = c;
      }
      continue;
    }
    const t = (raw == null ? '' : String(raw)).trim();
    if (fd.required && !t) errors.push(fd.label + ' is required');
    payload[fd.col] = t || (fd.id === 'schedule_code' ? '31N' : null);
  }
  return { payload, errors };
}

export default function EntryDrawer({ schedKey, sched, record, canWrite, cfg, notify, onClose, onSaved }) {
  const [values, setValues] = useState(() => initialValues(sched, record));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const set = (id, val) => setValues((v) => ({ ...v, [id]: val }));

  // Live CFOFS grading of whatever is typed so far.
  const check = useMemo(() => {
    const { payload } = collect(sched, values);
    return runSchedule(schedKey, [payload], cfg).rows[0] || null;
  }, [sched, values, schedKey, cfg]);

  async function save(e) {
    e.preventDefault();
    if (!canWrite) return;
    const { payload, errors } = collect(sched, values);
    if (errors.length) { setErr(errors[0]); return; }
    setErr(null);
    setSaving(true);
    const sb = supabase();
    const q = record
      ? sb.from(sched.table).update(payload).eq('id', record.id).select(sched.colSelect)
      : sb.from(sched.table).insert(payload).select(sched.colSelect);
    const { data, error } = await q;
    setSaving(false);
    if (error) {
      setErr('Could not save. ' + error.message + ' If this keeps happening, your account may not have finance write access.');
      return;
    }
    const row = (data && data[0]) || null;
    if (!row) {
      setErr('The save went through but the row did not come back. Reload to see it.');
      return;
    }
    notify(record ? 'Entry updated.' : 'Entry added.');
    onSaved(row, !record);
  }

  const title = record ? 'Edit ' + sched.title.toLowerCase() : 'Add a ' + sched.title.toLowerCase();

  return (
    <>
      <div className="drawer-scrim" onClick={() => onClose(false)} />
      <div className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="drawer-head">
          <div>
            <h3>{title}</h3>
            <div className="muted small">{sched.sub}</div>
          </div>
          <button className="btn btn-sm" onClick={() => onClose(false)}>Close</button>
        </div>

        {!canWrite && (
          <div className="alert alert-warn">
            You have read access to finance. Ask the Director for finance write access to change entries.
          </div>
        )}
        {err && <div className="alert alert-error">{err}</div>}

        {check && check.errors.length > 0 && (
          <div className="alert alert-error">
            <strong>Not ready to file.</strong> {check.errors.join('. ')}.
          </div>
        )}
        {check && !check.errors.length && check.warnings.length > 0 && (
          <div className="alert alert-warn">
            <strong>Worth a look.</strong> {check.warnings.join('. ')}.
          </div>
        )}
        {check && !check.errors.length && !check.warnings.length && (
          <div className="alert alert-ok">This row passes every CFOFS check.</div>
        )}

        <form onSubmit={save}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0 10px' }}>
            {sched.fields.map((fd) => {
              if (fd.type === 'bool') {
                return (
                  <label key={fd.id} className="field"
                         style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, marginBottom: 6 }}>
                    <input type="checkbox" checked={!!values[fd.id]} disabled={!canWrite}
                           style={{ width: 20, height: 20 }}
                           onChange={(e) => set(fd.id, e.target.checked)} />
                    <span style={{ textTransform: 'none', letterSpacing: 0, fontSize: '.92rem' }}>{fd.label}</span>
                  </label>
                );
              }
              const style = fd.wide ? { gridColumn: '1 / -1' } : undefined;
              return (
                <label key={fd.id} className="field" style={style}>
                  <span>{fd.label}{fd.required ? ' (required)' : ''}</span>
                  {fd.type === 'select' ? (
                    <select className="select" value={values[fd.id] ?? ''} disabled={!canWrite}
                            onChange={(e) => set(fd.id, e.target.value)}>
                      {fd.options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                  ) : fd.type === 'date' ? (
                    <input className="input" type="date" value={values[fd.id] ?? ''} disabled={!canWrite}
                           onChange={(e) => set(fd.id, e.target.value)} />
                  ) : fd.type === 'money' ? (
                    <input className="input" inputMode="decimal" placeholder="0.00" value={values[fd.id] ?? ''}
                           disabled={!canWrite} onChange={(e) => set(fd.id, e.target.value)} />
                  ) : (
                    <input className="input" type="text" value={values[fd.id] ?? ''} disabled={!canWrite}
                           onChange={(e) => set(fd.id, e.target.value)} />
                  )}
                </label>
              );
            })}
          </div>

          {canWrite && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} disabled={saving}>
                {saving ? 'Saving…' : record ? 'Save changes' : 'Add entry'}
              </button>
              <button type="button" className="btn" onClick={() => onClose(false)}>Cancel</button>
            </div>
          )}
        </form>
      </div>
    </>
  );
}
