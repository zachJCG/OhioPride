'use client';
// Budget: the running net position. Revenue is read only and comes from
// public.founding_members (fed hourly by the ActBlue sync). Expenses are the
// money-out side, read and written against public.expenses.
//
// Ported from the static console page so it runs inside the mobile-first admin
// shell and behind the same useAdmin permission gate as every other module.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAdmin } from '../../../lib/permissions';
import { money, shortDate } from '../../../lib/format';
import './budget.css';

const EXPENSE_COLS =
  'id, incurred_on, vendor, description, category, amount_cents, ' +
  'payment_method, reference, notes, created_by, created_at';

const CATEGORIES = [
  'Vendor / Booth', 'Printing', 'Travel', 'Software', 'Events',
  'Supplies', 'Advertising', 'Professional Fees', 'Bank / Processing', 'General',
];

// Ledger amounts always show cents; money() from lib/format drops them on
// whole dollars, which is right for KPI cards but wrong for a line item.
const exact = (c) => ((c || 0) / 100).toLocaleString('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
});

// incurred_on is a date, not a timestamp: formatting it in local time would
// slide it a day backwards west of UTC.
const dayLabel = (v) => {
  if (!v) return '';
  const s = String(v);
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T00:00:00Z' : s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};

const monthKey = (v) => {
  if (!v) return '';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 7);
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? ''
    : `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1))
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

const todayLocal = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

function parseCents(str) {
  if (str == null) return NaN;
  const n = parseFloat(String(str).replace(/[^0-9.\-]/g, ''));
  if (Number.isNaN(n) || n < 0) return NaN;
  return Math.round(n * 100);
}

const sortExpenses = (list) => [...list].sort((a, b) =>
  String(b.incurred_on).localeCompare(String(a.incurred_on)) ||
  String(b.created_at).localeCompare(String(a.created_at)));

export default function BudgetPage() {
  const { loading: authLoading, can } = useAdmin();
  const canRead = can('finance', 'read');
  const canWrite = can('finance', 'write');

  const [tab, setTab] = useState('revenue');
  const [revenue, setRevenue] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [revError, setRevError] = useState(null);
  const [expError, setExpError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [revQ, setRevQ] = useState('');
  const [expQ, setExpQ] = useState('');
  const [editing, setEditing] = useState(null); // 'new' or an expense row
  const [toast, setToast] = useState(null);
  const [nowKey, setNowKey] = useState(null); // set after mount so the server and client agree
  const toastTimer = useRef(null);

  const notify = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Read ?tab= after mount, never during render: seeding state from the URL
  // makes the server and client markup disagree and blanks the page.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t === 'expenses' || t === 'expense') setTab('expenses');
    const d = new Date();
    setNowKey(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }, []);

  function switchTab(next) {
    setTab(next);
    window.history.replaceState({}, '', `/admin/finance/budget?tab=${next}`);
  }

  useEffect(() => {
    if (authLoading || !canRead) return;
    let cancelled = false;
    (async () => {
      const sb = supabase();
      const [rev, exp] = await Promise.all([
        sb.from('founding_members')
          .select('id, full_name, display_name, amount_cents, recurrence, contributed_at, city, county')
          .order('contributed_at', { ascending: false, nullsFirst: false }),
        sb.from('expenses').select(EXPENSE_COLS)
          .order('incurred_on', { ascending: false })
          .order('created_at', { ascending: false }),
      ]);
      if (cancelled) return;
      if (rev.error) setRevError('Could not load donor revenue. ' + rev.error.message);
      else setRevenue(rev.data || []);
      if (exp.error) setExpError('Could not load expenses. ' + exp.error.message);
      else setExpenses(exp.data || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [authLoading, canRead]);

  const totals = useMemo(() => {
    const rev = revenue.reduce((s, r) => s + (r.amount_cents || 0), 0);
    const exp = expenses.reduce((s, e) => s + (e.amount_cents || 0), 0);
    const mRev = nowKey ? revenue.reduce((s, r) => monthKey(r.contributed_at) === nowKey ? s + (r.amount_cents || 0) : s, 0) : 0;
    const mExp = nowKey ? expenses.reduce((s, e) => monthKey(e.incurred_on) === nowKey ? s + (e.amount_cents || 0) : s, 0) : 0;
    return { rev, exp, net: rev - exp, monthNet: mRev - mExp };
  }, [revenue, expenses, nowKey]);

  const months = useMemo(() => {
    const map = new Map();
    const bucket = (k) => {
      if (!map.has(k)) map.set(k, { key: k, gifts: 0, rev: 0, exp: 0 });
      return map.get(k);
    };
    revenue.forEach((r) => {
      const k = monthKey(r.contributed_at);
      if (!k) return;
      const b = bucket(k);
      b.gifts += 1;
      b.rev += r.amount_cents || 0;
    });
    expenses.forEach((e) => {
      const k = monthKey(e.incurred_on);
      if (!k) return;
      bucket(k).exp += e.amount_cents || 0;
    });
    return [...map.values()].sort((a, b) => b.key.localeCompare(a.key));
  }, [revenue, expenses]);

  const revRows = useMemo(() => {
    const term = revQ.trim().toLowerCase();
    if (!term) return revenue;
    return revenue.filter((r) => [r.full_name, r.display_name, r.city, r.county]
      .some((v) => String(v || '').toLowerCase().includes(term)));
  }, [revenue, revQ]);

  const expRows = useMemo(() => {
    const term = expQ.trim().toLowerCase();
    if (!term) return expenses;
    return expenses.filter((e) => [e.vendor, e.description, e.category, e.reference, e.payment_method]
      .some((v) => String(v || '').toLowerCase().includes(term)));
  }, [expenses, expQ]);

  function onSaved(row, wasEdit) {
    setExpenses((list) => sortExpenses(wasEdit
      ? list.map((e) => (e.id === row.id ? row : e))
      : [row, ...list]));
    setEditing(null);
    notify(wasEdit ? 'Expense updated.' : 'Expense added.');
  }

  function onDeleted(id) {
    setExpenses((list) => list.filter((e) => e.id !== id));
    setEditing(null);
    notify('Expense deleted.');
  }

  if (!authLoading && !canRead) {
    return (
      <div className="alert alert-error">
        The finance module is limited by role. Ask the Director if you need it.
      </div>
    );
  }

  const netClass = totals.net < 0 ? 'fin-neg' : 'fin-pos';
  const monthClass = totals.monthNet < 0 ? 'fin-neg' : 'fin-pos';

  return (
    <>
      <div className="page-head">
        <h2>Budget</h2>
        <p className="sub">Money in from donors, money out to vendors, and where that leaves us.</p>
      </div>

      {revError && <div className="alert alert-error">{revError}</div>}
      {expError && <div className="alert alert-error">{expError}</div>}

      <div className="kpi-grid">
        <div className="kpi">
          <div className="num">{money(totals.rev)}</div>
          <div className="lbl">Total revenue</div>
          <div className="sub">{revenue.length.toLocaleString()} contribution{revenue.length === 1 ? '' : 's'}</div>
        </div>
        <div className="kpi">
          <div className="num">{money(totals.exp)}</div>
          <div className="lbl">Total expenses</div>
          <div className="sub">{expenses.length.toLocaleString()} logged</div>
        </div>
        <div className="kpi">
          <div className={`num ${netClass}`}>{money(totals.net)}</div>
          <div className="lbl">Net position</div>
          <div className="sub">Revenue minus expenses</div>
        </div>
        <div className="kpi">
          <div className={`num ${monthClass}`}>{money(totals.monthNet)}</div>
          <div className="lbl">{nowKey ? monthLabel(nowKey) : 'This month'}</div>
          <div className="sub">Net this month</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <strong style={{ font: '700 .95rem var(--op-font-head)' }}>Month by month</strong>
        {loading ? (
          <p className="muted small" style={{ margin: '8px 0 0' }}>Loading the ledger…</p>
        ) : months.length === 0 ? (
          <p className="muted small" style={{ margin: '8px 0 0' }}>
            Nothing recorded yet. Contributions land here from the hourly ActBlue sync, and expenses
            show up as soon as you add one.
          </p>
        ) : (
          <div className="fin-scroll" style={{ marginTop: 10 }}>
            <table className="fin-table">
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col" className="fin-num">Gifts</th>
                  <th scope="col" className="fin-num">Revenue</th>
                  <th scope="col" className="fin-num">Expenses</th>
                  <th scope="col" className="fin-num">Net</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => {
                  const net = m.rev - m.exp;
                  return (
                    <tr key={m.key}>
                      <td>{monthLabel(m.key)}</td>
                      <td className="fin-num">{m.gifts.toLocaleString()}</td>
                      <td className="fin-num">{exact(m.rev)}</td>
                      <td className="fin-num">{m.exp ? exact(m.exp) : <span className="muted">none</span>}</td>
                      <td className={`fin-num ${net < 0 ? 'fin-neg' : 'fin-pos'}`}>{exact(net)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>All time</td>
                  <td className="fin-num">{revenue.length.toLocaleString()}</td>
                  <td className="fin-num">{exact(totals.rev)}</td>
                  <td className="fin-num">{exact(totals.exp)}</td>
                  <td className={`fin-num ${netClass}`}>{exact(totals.net)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <div className="chip-row" role="tablist" aria-label="Ledger side">
        <button className="chip" aria-pressed={tab === 'revenue'} onClick={() => switchTab('revenue')}>
          Revenue ({revenue.length.toLocaleString()})
        </button>
        <button className="chip" aria-pressed={tab === 'expenses'} onClick={() => switchTab('expenses')}>
          Expenses ({expenses.length.toLocaleString()})
        </button>
      </div>

      {tab === 'revenue' ? (
        <>
          <div className="sticky-tools">
            <input className="input" placeholder="Search donor, city, county…" value={revQ}
                   onChange={(e) => setRevQ(e.target.value)} inputMode="search" aria-label="Search revenue" />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0 10px', flexWrap: 'wrap' }}>
            <span className="muted small">
              {revRows.length === revenue.length
                ? `${revenue.length.toLocaleString()} contribution${revenue.length === 1 ? '' : 's'}`
                : `${revRows.length.toLocaleString()} of ${revenue.length.toLocaleString()}`}
            </span>
            <span style={{ flex: 1 }} />
            <a className="btn btn-sm" href="/admin/contacts?seg=founding">Manage donors</a>
          </div>

          {loading ? <div className="card">Loading donor revenue…</div> : (
            <div className="rowlist">
              {revRows.map((r) => (
                <div key={r.id} className="row card">
                  <div>
                    <strong>{r.full_name || r.display_name || 'Unnamed donor'}</strong>
                    <div className="muted small">{[r.city, r.county].filter(Boolean).join(', ') || 'Location not on file'}</div>
                  </div>
                  <div className="muted small">{shortDate(r.contributed_at)}</div>
                  <div className="small">
                    {r.recurrence === 'monthly'
                      ? <span className="badge badge-founding">Monthly</span>
                      : <span className="muted">One time</span>}
                  </div>
                  <div className="fin-num"><strong>{exact(r.amount_cents)}</strong></div>
                </div>
              ))}
              {!revRows.length && !revError && (
                <div className="card muted">
                  {revenue.length
                    ? 'No contributions match your search.'
                    : 'No donor revenue yet. The ActBlue sync fills this in hourly.'}
                </div>
              )}
            </div>
          )}

          <p className="muted small" style={{ marginTop: 10 }}>
            Revenue is read only here. It comes straight from the founding member records that the
            hourly ActBlue sync writes.
          </p>
        </>
      ) : (
        <>
          <div className="sticky-tools">
            <input className="input" placeholder="Search vendor, description, category, reference…" value={expQ}
                   onChange={(e) => setExpQ(e.target.value)} inputMode="search" aria-label="Search expenses" />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0 10px', flexWrap: 'wrap' }}>
            <span className="muted small">
              {expRows.length === expenses.length
                ? `${expenses.length.toLocaleString()} expense${expenses.length === 1 ? '' : 's'}`
                : `${expRows.length.toLocaleString()} of ${expenses.length.toLocaleString()}`}
            </span>
            <span style={{ flex: 1 }} />
            {canWrite && (
              <button className="btn btn-sm btn-primary" onClick={() => setEditing('new')}>Add expense</button>
            )}
          </div>

          {loading ? <div className="card">Loading expenses…</div> : (
            <div className="rowlist">
              {expRows.map((e) => (
                <button key={e.id} className="row card" onClick={() => setEditing(e)}
                        style={{ cursor: 'pointer', textAlign: 'left', font: 'inherit', width: '100%' }}>
                  <div>
                    <strong>{e.vendor}</strong>
                    <div className="muted small">
                      {e.description || 'No description'}
                      {e.reference ? ` · Ref ${e.reference}` : ''}
                    </div>
                  </div>
                  <div className="small"><span className="badge badge-muted">{e.category || 'General'}</span></div>
                  <div className="muted small">
                    {dayLabel(e.incurred_on)}{e.payment_method ? ` · ${e.payment_method}` : ''}
                  </div>
                  <div className="fin-num"><strong>{exact(e.amount_cents)}</strong></div>
                </button>
              ))}
              {!expRows.length && !expError && (
                <div className="card muted">
                  {expenses.length
                    ? 'No expenses match your search.'
                    : 'No expenses yet. Add the first one to start tracking money out.'}
                </div>
              )}
            </div>
          )}

          <p className="muted small" style={{ marginTop: 10 }}>
            Every expense is stamped with the email you signed in with. Tap a row to edit or delete it.
          </p>
        </>
      )}

      {editing && (
        <ExpenseDrawer
          key={editing === 'new' ? 'new' : editing.id}
          expense={editing === 'new' ? null : editing}
          canWrite={canWrite}
          onSaved={onSaved}
          onDeleted={onDeleted}
          onClose={() => setEditing(null)}
        />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

function ExpenseDrawer({ expense, canWrite, onSaved, onDeleted, onClose }) {
  const [form, setForm] = useState(() => ({
    incurred_on: (expense?.incurred_on || '').slice(0, 10) || todayLocal(),
    vendor: expense?.vendor || '',
    description: expense?.description || '',
    category: expense?.category || '',
    amount: expense ? ((expense.amount_cents || 0) / 100).toFixed(2) : '',
    payment_method: expense?.payment_method || '',
    reference: expense?.reference || '',
    notes: expense?.notes || '',
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = (k) => (ev) => setForm((f) => ({ ...f, [k]: ev.target.value }));

  async function save(ev) {
    ev.preventDefault();
    if (!canWrite) return;
    const vendor = form.vendor.trim();
    const cents = parseCents(form.amount);
    if (!vendor) { setError('Vendor is required.'); return; }
    if (Number.isNaN(cents)) { setError('Enter a valid amount, like 250.00'); return; }

    const payload = {
      incurred_on: form.incurred_on || todayLocal(),
      vendor,
      description: form.description.trim() || null,
      category: form.category.trim() || 'General',
      amount_cents: cents,
      payment_method: form.payment_method.trim() || null,
      reference: form.reference.trim() || null,
      notes: form.notes.trim() || null,
    };

    setBusy(true);
    setError(null);
    const sb = supabase();
    const { data, error: err } = expense
      ? await sb.from('expenses').update(payload).eq('id', expense.id).select(EXPENSE_COLS)
      : await sb.from('expenses').insert(payload).select(EXPENSE_COLS);
    setBusy(false);

    if (err) { setError('Could not save. ' + err.message); return; }
    const row = (data && data[0]) || null;
    if (!row) { setError('Saved, but the row did not come back. Reload to see it.'); return; }
    onSaved(row, Boolean(expense));
  }

  async function remove() {
    if (!canWrite || !expense) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase().from('expenses').delete().eq('id', expense.id);
    setBusy(false);
    if (err) { setError('Could not delete. ' + err.message); return; }
    onDeleted(expense.id);
  }

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer" role="dialog" aria-modal="true"
           aria-label={expense ? 'Edit expense' : 'Add expense'}>
        <div className="drawer-head">
          <div>
            <h3>{expense ? 'Edit expense' : 'Add expense'}</h3>
            {expense?.created_by && (
              <div className="muted small">Added by {expense.created_by}</div>
            )}
          </div>
          <button className="btn btn-sm" onClick={onClose}>Close</button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {!canWrite && (
          <div className="alert alert-warn">
            You have read access to finance. Ask the Director for write access to change expenses.
          </div>
        )}

        <form className="fin-form" onSubmit={save}>
          <label className="field">
            <span>Date</span>
            <input className="input" type="date" value={form.incurred_on}
                   onChange={set('incurred_on')} disabled={!canWrite} required />
          </label>

          <label className="field">
            <span>Amount</span>
            <input className="input" inputMode="decimal" placeholder="250.00" value={form.amount}
                   onChange={set('amount')} disabled={!canWrite} required />
          </label>

          <label className="field fin-wide">
            <span>Vendor or payee</span>
            <input className="input" placeholder="Akron Pride Festival" value={form.vendor}
                   onChange={set('vendor')} disabled={!canWrite} required />
          </label>

          <label className="field fin-wide">
            <span>Description</span>
            <input className="input" placeholder="Non profit vendor space" value={form.description}
                   onChange={set('description')} disabled={!canWrite} />
          </label>

          <label className="field">
            <span>Category</span>
            <input className="input" list="budgetCategories" placeholder="Vendor / Booth"
                   value={form.category} onChange={set('category')} disabled={!canWrite} />
            <datalist id="budgetCategories">
              {CATEGORIES.map((c) => <option key={c} value={c} />)}
            </datalist>
          </label>

          <label className="field">
            <span>Payment method</span>
            <input className="input" placeholder="Apple Pay (Stripe)" value={form.payment_method}
                   onChange={set('payment_method')} disabled={!canWrite} />
          </label>

          <label className="field fin-wide">
            <span>Reference</span>
            <input className="input" placeholder="Receipt or order number" value={form.reference}
                   onChange={set('reference')} disabled={!canWrite} />
          </label>

          <label className="field fin-wide">
            <span>Notes</span>
            <textarea className="textarea" rows={3} value={form.notes}
                      onChange={set('notes')} disabled={!canWrite} />
          </label>

          {canWrite && (
            <div className="fin-form-actions">
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? 'Saving…' : expense ? 'Save changes' : 'Add expense'}
              </button>
              <button className="btn" type="button" onClick={onClose} disabled={busy}>Cancel</button>
              {expense && !confirmDelete && (
                <button className="btn btn-danger" type="button" disabled={busy}
                        onClick={() => setConfirmDelete(true)}>Delete</button>
              )}
            </div>
          )}
        </form>

        {canWrite && expense && confirmDelete && (
          <div className="alert alert-warn" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span>Delete {expense.vendor} for {exact(expense.amount_cents)}?</span>
            <span style={{ flex: 1 }} />
            <button className="btn btn-sm btn-danger" onClick={remove} disabled={busy}>
              {busy ? 'Deleting…' : 'Yes, delete'}
            </button>
            <button className="btn btn-sm" onClick={() => setConfirmDelete(false)} disabled={busy}>Keep it</button>
          </div>
        )}
      </div>
    </>
  );
}
