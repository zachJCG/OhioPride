// Shared vocabulary and small helpers for the Tasks module.
// status and priority are Postgres enums (task_status, task_priority), so these
// lists have to stay in step with the database.

export const STATUS_OPTIONS = ['not_started', 'in_progress', 'blocked', 'in_review', 'done', 'cancelled'];

export const STATUS_LABEL = {
  not_started: 'Not started',
  in_progress: 'In progress',
  blocked: 'Blocked',
  in_review: 'In review',
  done: 'Done',
  cancelled: 'Cancelled',
};

export const PRIORITY_OPTIONS = ['low', 'normal', 'high', 'urgent'];

export const PRIORITY_LABEL = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' };

export const PRIORITY_ORDER = { urgent: 0, high: 1, normal: 2, low: 3 };

// Open means still on someone's plate. Done and cancelled are off the board.
export const isOpen = (r) => r.status !== 'done' && r.status !== 'cancelled';

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const isOverdue = (r, today) => !!r.due_date && r.due_date < today && isOpen(r);

// A due date reads better as "Tomorrow" or "3d late" than as a calendar date.
export function fmtDueDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 0 && diff < 7) return `In ${diff}d`;
  if (diff < 0 && diff > -30) return `${Math.abs(diff)}d late`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Relative time for comments and activity.
export function fmtWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtStamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

export function initialsFor(name, email) {
  const src = String(name || email || '').replace(/[^\p{Letter}\s]/gu, ' ').trim();
  if (!src) return '?';
  return src.split(/\s+/).slice(0, 2).map((p) => (p[0] ? p[0].toUpperCase() : '')).join('') || '?';
}

export const personName = (p) => (p ? p.full_name || p.email : null);

export const userLabel = (u) => `${u.full_name || u.email}${u.title ? ` · ${u.title}` : ''}`;

export function snippet(s, n) {
  const t = String(s || '');
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

export function activityLabel(a) {
  switch (a.action) {
    case 'created': return 'created the task';
    case 'status_change': {
      const to = (a.detail || {}).to;
      return `changed status to ${STATUS_LABEL[to] || to || 'something else'}`;
    }
    case 'assign': return 'updated the assignee';
    case 'edit': return 'edited the task';
    case 'comment': return 'added a comment';
    default: return a.action;
  }
}

// Split a WBS code ("1.2.10") into its dotted segments. Blank codes return null
// so they can be sorted to the bottom.
export function wbsSegments(code) {
  if (code == null) return null;
  const trimmed = String(code).trim();
  if (!trimmed) return null;
  return trimmed.split('.').map((s) => s.trim());
}

// Nesting depth: "1" -> 0, "1.1" -> 1, "1.1.2" -> 2.
export function wbsDepth(code) {
  const segs = wbsSegments(code);
  return segs ? segs.length - 1 : 0;
}

// Order WBS codes the way an outline reads: parents before children, segments
// compared numerically when they are numbers ("1.2" before "1.10"), lexically
// otherwise. Blank codes sort last.
export function compareWbs(a, b) {
  const as = wbsSegments(a);
  const bs = wbsSegments(b);
  if (!as && !bs) return 0;
  if (!as) return 1;
  if (!bs) return -1;
  const n = Math.max(as.length, bs.length);
  for (let i = 0; i < n; i += 1) {
    if (i >= as.length) return -1; // "1" comes before "1.1"
    if (i >= bs.length) return 1;
    const x = as[i];
    const y = bs[i];
    const nx = parseFloat(x);
    const ny = parseFloat(y);
    if (!Number.isNaN(nx) && !Number.isNaN(ny) && String(nx) === x && String(ny) === y) {
      if (nx !== ny) return nx < ny ? -1 : 1;
    } else {
      const c = x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' });
      if (c !== 0) return c;
    }
  }
  return 0;
}
