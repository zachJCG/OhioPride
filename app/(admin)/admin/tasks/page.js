'use client';
// Tasks: the team work breakdown. One row per task with a WBS code, an owner,
// status, priority, due date, and a comment and activity trail.
//
// Ported from the static console so it works on a phone: cards stack, the WBS
// outline indents in place of a wide table, and status changes are one tap.
// Reads public.tasks with the assignee and creator joins; comments and activity
// load in the detail sheet.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAdmin } from '../../lib/permissions';
import { TaskDetailDrawer, TaskFormDrawer } from './drawers';
import {
  STATUS_OPTIONS, STATUS_LABEL, PRIORITY_OPTIONS, PRIORITY_LABEL, PRIORITY_ORDER,
  compareWbs, fmtDueDate, initialsFor, isOpen, isOverdue, personName, snippet,
  todayISO, userLabel, wbsDepth,
} from './lib';
import './tasks.css';

const TASK_SELECT =
  'id, title, description, status, priority, wbs_code, parent_task_id, ' +
  'assignee_id, created_by, start_date, due_date, estimated_hours, tags, ' +
  'created_at, updated_at, completed_at, ' +
  'assignee:admin_users!tasks_assignee_id_fkey ( id, email, full_name, title ), ' +
  'creator:admin_users!tasks_created_by_fkey  ( id, email, full_name )';

const TABS = [
  { key: 'open', label: 'Open' },
  { key: 'mine', label: 'Assigned to me' },
  { key: 'all', label: 'All' },
  { key: 'done', label: 'Done' },
];

const SORTS = [
  { key: 'due_date', label: 'Due date' },
  { key: 'priority', label: 'Priority' },
  { key: 'title', label: 'Title' },
  { key: 'assignee_name', label: 'Assignee' },
  { key: 'status', label: 'Status' },
];

const CSV_COLS = ['created_at', 'wbs_code', 'title', 'assignee_name', 'status', 'priority', 'start_date', 'due_date', 'description'];

export default function TasksPage() {
  const { loading: authLoading, me, can } = useAdmin();
  const canWrite = can('tasks', 'write');
  const myId = me?.id || null;

  const [rows, setRows] = useState(null);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const [warn, setWarn] = useState(null);

  const [tab, setTab] = useState('open');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [assignee, setAssignee] = useState('');
  const [priority, setPriority] = useState('');
  const [nest, setNest] = useState(true);
  const [sortKey, setSortKey] = useState('due_date');
  const [sortDir, setSortDir] = useState('asc');

  const [activeId, setActiveId] = useState(null);
  const [formFor, setFormFor] = useState(null);   // 'new' or a task row
  const [toast, setToast] = useState(null);

  const toastTimer = useRef(null);
  const deepLinkId = useRef(null);
  const deepLinkDone = useRef(false);

  const notify = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3600);
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [q]);

  const loadTasks = useCallback(async () => {
    const { data, error: err } = await supabase().from('tasks').select(TASK_SELECT)
      .order('created_at', { ascending: false });
    if (err) {
      setRows([]);
      setError(`Could not load tasks. ${err.message}`);
      return;
    }
    setError(null);
    setRows((data || []).map((r) => ({ ...r, assignee_name: personName(r.assignee) })));
  }, []);

  const loadUsers = useCallback(async () => {
    const { data, error: err } = await supabase().from('admin_users')
      .select('id, email, full_name, title, is_active')
      .eq('is_active', true)
      .order('full_name', { ascending: true });
    if (err) {
      setUsers([]);
      setWarn(`Could not load the team list, so the assignee picker is empty. ${err.message}`);
      return;
    }
    setUsers(data || []);
  }, []);

  useEffect(() => { loadTasks(); loadUsers(); }, [loadTasks, loadUsers]);

  // Capture the deep link before anything rewrites the address bar. Reading the
  // URL during render would make the server and client markup disagree.
  useEffect(() => {
    deepLinkId.current = new URLSearchParams(window.location.search).get('id');
  }, []);

  useEffect(() => {
    if (deepLinkDone.current || rows == null) return;
    deepLinkDone.current = true;
    const id = deepLinkId.current;
    if (!id) return;
    if (rows.some((r) => r.id === id)) setActiveId(id);
    else notify('That task link does not match anything here.');
  }, [rows, notify]);

  // Keep the address bar in step so an open task can be shared by link.
  useEffect(() => {
    if (!deepLinkDone.current) return;
    window.history.replaceState({}, '', activeId ? `/admin/tasks?id=${activeId}` : '/admin/tasks');
  }, [activeId]);

  const today = todayISO();

  const stats = useMemo(() => {
    const c = { total: 0, open: 0, in_progress: 0, overdue: 0, mine: 0, done: 0 };
    for (const r of rows || []) {
      c.total += 1;
      const open = isOpen(r);
      if (open) c.open += 1;
      if (r.status === 'in_progress') c.in_progress += 1;
      if (r.status === 'done') c.done += 1;
      if (open && r.due_date && r.due_date < today) c.overdue += 1;
      if (myId && r.assignee_id === myId && open) c.mine += 1;
    }
    return c;
  }, [rows, myId, today]);

  const tabCount = { open: stats.open, mine: stats.mine, all: stats.total, done: stats.done };

  const filtered = useMemo(() => {
    const list = (rows || []).filter((r) => {
      if (tab === 'open' && !isOpen(r)) return false;
      if (tab === 'done' && r.status !== 'done') return false;
      if (tab === 'mine' && r.assignee_id !== myId) return false;

      if (assignee === '__unassigned' && r.assignee_id) return false;
      if (assignee && assignee !== '__unassigned' && r.assignee_id !== assignee) return false;
      if (priority && r.priority !== priority) return false;
      if (debouncedQ) {
        const hay = `${r.title || ''} ${r.wbs_code || ''} ${r.description || ''} ${r.assignee_name || ''}`.toLowerCase();
        if (!hay.includes(debouncedQ)) return false;
      }
      return true;
    });

    const byTitle = (a, b) =>
      String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' });

    if (nest) {
      // Outline order: children fall directly under their parent (1, 1.1, 1.1.1,
      // 1.2, 2). Tasks with no WBS code sort to the bottom, by title.
      list.sort((a, b) => compareWbs(a.wbs_code, b.wbs_code) || byTitle(a, b));
      return list;
    }

    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (sortKey === 'priority') {
        return ((PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9)) * dir;
      }
      if (sortKey === 'due_date') {
        const av = a.due_date;
        const bv = b.due_date;
        if (!av && !bv) return byTitle(a, b);
        if (!av) return 1;   // no due date always sits at the bottom
        if (!bv) return -1;
        return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
      }
      return String(a[sortKey] || '').localeCompare(String(b[sortKey] || ''), undefined, { sensitivity: 'base' }) * dir;
    });
    return list;
  }, [rows, tab, myId, assignee, priority, debouncedQ, nest, sortKey, sortDir]);

  function patchRow(id, patch) {
    setRows((list) => (list || []).map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function logActivity(taskId, action, detail) {
    if (!myId) return;
    const { error: err } = await supabase().from('task_activity')
      .insert({ task_id: taskId, actor_id: myId, action, detail: detail || {} });
    if (err) notify('Saved. The activity trail did not record that change.');
  }

  async function setStatus(row, next) {
    if (!canWrite) { notify('You have read access only.'); return; }
    const prev = row.status;
    if (next === prev) return;
    patchRow(row.id, { status: next });
    const { error: err } = await supabase().from('tasks').update({ status: next }).eq('id', row.id);
    if (err) {
      patchRow(row.id, { status: prev });
      notify(`Could not update the status. ${err.message}`);
      return;
    }
    notify(`Status set to ${STATUS_LABEL[next]}.`);
    logActivity(row.id, 'status_change', { from: prev, to: next });
  }

  function exportCsv() {
    if (!filtered.length) { notify('Nothing to export with these filters.'); return; }
    const esc = (v) => {
      const s = v == null ? '' : Array.isArray(v) ? v.join('; ') : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [CSV_COLS.join(','), ...filtered.map((r) => CSV_COLS.map((c) => esc(r[c])).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `ohio-pride-tasks-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    notify(`Exported ${filtered.length} ${filtered.length === 1 ? 'task' : 'tasks'}.`);
  }

  if (!authLoading && !can('tasks', 'read')) {
    return <div className="alert alert-error">The tasks module is limited by role. Ask the Director if you need it.</div>;
  }

  const active = (rows || []).find((r) => r.id === activeId) || null;
  const parentTitle = active?.parent_task_id
    ? (rows || []).find((r) => r.id === active.parent_task_id)?.title || null
    : null;

  return (
    <>
      <div className="page-head">
        <h2>Tasks</h2>
        <p className="sub">The team work breakdown. Create it, assign it, and track what everyone is carrying.</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {warn && <div className="alert alert-warn">{warn}</div>}

      <div className="page-actions">
        {canWrite && <button className="btn btn-primary" onClick={() => setFormFor('new')}>New task</button>}
        <button className="btn" onClick={exportCsv}>Export CSV</button>
      </div>

      <div className="kpi-grid tk-kpi">
        <div className="kpi"><div className="num tk-num">{stats.total.toLocaleString()}</div><div className="lbl">Total</div></div>
        <div className="kpi"><div className="num tk-num">{stats.open.toLocaleString()}</div><div className="lbl">Open</div></div>
        <div className="kpi"><div className="num tk-num">{stats.in_progress.toLocaleString()}</div><div className="lbl">In progress</div></div>
        <div className="kpi"><div className="num tk-num">{stats.overdue.toLocaleString()}</div><div className="lbl">Overdue</div></div>
        <div className="kpi"><div className="num tk-num">{stats.mine.toLocaleString()}</div><div className="lbl">Mine</div></div>
      </div>

      <div className="sticky-tools">
        <input className="input" placeholder="Search title, WBS, description" value={q} inputMode="search"
               aria-label="Search tasks" onChange={(e) => setQ(e.target.value)} />
        <div className="chip-row" role="tablist" aria-label="Task views">
          {TABS.map((t) => (
            <button key={t.key} className="chip" aria-pressed={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label} ({tabCount[t.key] ?? 0})
            </button>
          ))}
        </div>
      </div>

      <div className="tk-filters">
        <label className="field">
          <span>Assignee</span>
          <select className="select" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">All assignees</option>
            <option value="__unassigned">Unassigned</option>
            {users.map((u) => <option key={u.id} value={u.id}>{userLabel(u)}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Priority</span>
          <select className="select" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">All priorities</option>
            {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </select>
        </label>
      </div>

      <div className="tk-tools">
        <button className="chip" aria-pressed={nest} onClick={() => setNest((v) => !v)}
                title="Order and indent tasks by their WBS code, so 1.1 nests under 1">
          Nest by WBS
        </button>
        <span className="muted small tk-num">
          {filtered.length === (rows || []).length
            ? `${filtered.length.toLocaleString()} total`
            : `${filtered.length.toLocaleString()} of ${(rows || []).length.toLocaleString()}`}
        </span>
        <span style={{ flex: 1 }} />
        <label className="muted small" htmlFor="tkSort">Sort</label>
        <select id="tkSort" className="select tk-sort" value={sortKey}
                onChange={(e) => { setNest(false); setSortKey(e.target.value); }}>
          {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <button className="btn btn-sm" onClick={() => { setNest(false); setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); }}
                aria-label={sortDir === 'asc' ? 'Sorting ascending, switch to descending' : 'Sorting descending, switch to ascending'}>
          {sortDir === 'asc' ? 'Asc' : 'Desc'}
        </button>
      </div>
      {nest && (
        <p className="muted small" style={{ margin: '-4px 0 10px' }}>
          Nesting orders everything by WBS code. Picking a sort turns it off.
        </p>
      )}

      {rows == null ? <div className="card">Loading tasks…</div> : (
        <div className="rowlist">
          {filtered.map((r) => {
            const depth = nest ? Math.min(wbsDepth(r.wbs_code), 4) : 0;
            const overdue = isOverdue(r, today);
            return (
              <div key={r.id} className="row card tk-row"
                   onClick={(e) => {
                     // The status select and its own buttons keep their taps.
                     if (e.target.closest && e.target.closest('select, button, a')) return;
                     setActiveId(r.id);
                   }}>
                <button className="tk-open" style={depth ? { paddingLeft: depth * 14 } : undefined}
                        onClick={() => setActiveId(r.id)}>
                  {r.wbs_code && <span className="tk-wbs">WBS {r.wbs_code}</span>}
                  <span className="tk-title">
                    {depth > 0 && <span className="tk-rail" aria-hidden="true">└─</span>}
                    {r.title || 'Untitled task'}
                  </span>
                  {r.description && <span className="tk-snippet">{snippet(r.description, 90)}</span>}
                </button>

                <div className="tk-who">
                  {r.assignee ? (
                    <>
                      <span className="tk-avatar" aria-hidden="true">
                        {initialsFor(r.assignee.full_name, r.assignee.email)}
                      </span>
                      <span>{r.assignee_name}</span>
                    </>
                  ) : <span className="muted small">Unassigned</span>}
                </div>

                <div className="small">
                  <span className={`tk-pill tk-pri-${r.priority}`}>{PRIORITY_LABEL[r.priority] || r.priority}</span>
                  <div style={{ marginTop: 4 }}>
                    {r.due_date
                      ? <span className={overdue ? 'tk-due-late' : 'muted'}>{fmtDueDate(r.due_date)}</span>
                      : <span className="muted">No due date</span>}
                  </div>
                </div>

                <select className="select tk-status" data-status={r.status} value={r.status}
                        disabled={!canWrite} aria-label={`Status for ${r.title || 'this task'}`}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setStatus(r, e.target.value)}>
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              </div>
            );
          })}

          {!filtered.length && !error && (
            <div className="card muted">
              {(rows || []).length === 0
                ? 'No tasks yet. Use New task to capture the first piece of work.'
                : 'No tasks match these filters.'}
            </div>
          )}
        </div>
      )}

      {active && (
        <TaskDetailDrawer
          key={active.id}
          row={active}
          parentTitle={parentTitle}
          canWrite={canWrite}
          meId={myId}
          notify={notify}
          onEdit={(row) => { setActiveId(null); setFormFor(row); }}
          onDeleted={() => { setActiveId(null); loadTasks(); }}
          onClose={() => setActiveId(null)}
        />
      )}

      {formFor && (
        <TaskFormDrawer
          key={formFor === 'new' ? 'new' : formFor.id}
          task={formFor === 'new' ? null : formFor}
          users={users}
          meId={myId}
          canWrite={canWrite}
          notify={notify}
          onSaved={(savedId) => {
            const wasEdit = formFor !== 'new';
            setFormFor(null);
            loadTasks();
            if (wasEdit && savedId) setActiveId(savedId);
          }}
          onClose={() => setFormFor(null)}
        />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
