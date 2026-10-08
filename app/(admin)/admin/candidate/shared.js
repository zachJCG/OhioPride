'use client';
// Shared bits for the Candidates module (Race to 100). The vocabulary itself
// lives in lib/candidates.mjs so the public page and this console agree; this
// file holds the small React pieces the three pages share.
import { useCallback, useEffect, useRef, useState } from 'react';
import { STATUS_LABEL, HELP_LABEL, shortDate } from '../../../../lib/candidates.mjs';

export const STATUS_BADGE = {
  new: 'badge-review',
  contacted: 'badge-muted',
  matched: 'badge-founding',
  in_program: 'badge-founding',
  referred_to_endorsement: 'badge-ok',
  closed: 'badge-muted',
};

export function StatusPill({ status }) {
  return <span className={`badge ${STATUS_BADGE[status] || 'badge-muted'}`}>{STATUS_LABEL[status] || status}</span>;
}

/** The first two help chips and a "+n" for the rest. */
export function HelpChips({ help, max = 2 }) {
  const list = Array.isArray(help) ? help : [];
  if (!list.length) return <span className="muted small">None listed</span>;
  const shown = list.slice(0, max);
  const rest = list.length - shown.length;
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
      {shown.map((k) => <span key={k} className="badge badge-muted">{HELP_LABEL[k] || k}</span>)}
      {rest > 0 && <span className="badge badge-muted" title={list.slice(max).map((k) => HELP_LABEL[k] || k).join(', ')}>+{rest}</span>}
    </span>
  );
}

export const fullName = (a) => [a?.first_name, a?.last_name].filter(Boolean).join(' ') || a?.email || 'Unnamed';

export const when = (v) => shortDate(v) || '';

/** Toast state with the 3 second auto clear every admin page uses. */
export function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const notify = useCallback((msg) => {
    setToast(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [toast, notify];
}

/** Debounced value, for autosaving a textarea without a save button. */
export function useDebounced(value, ms = 800) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function Gate({ loading, allowed, children }) {
  if (!loading && !allowed) {
    return <div className="alert alert-error">The Candidates module is limited by role. Ask the Director if you need it.</div>;
  }
  return children;
}
