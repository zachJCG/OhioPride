'use client';
// Two sheets for the Tasks module: the create/edit form and the task detail with
// its comment thread and activity trail. Bottom sheet on phones, side panel from
// 768px, both from the shared .drawer classes.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  STATUS_OPTIONS, STATUS_LABEL, PRIORITY_OPTIONS, PRIORITY_LABEL,
  activityLabel, fmtStamp, fmtWhen, personName, userLabel,
} from './lib';

function Detail({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <div>
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------- create / edit
export function TaskFormDrawer({ task, users, meId, canWrite, notify, onSaved, onClose }) {
  const editing = !!task;
  const [title, setTitle] = useState(task?.title || '');
  const [wbs, setWbs] = useState(task?.wbs_code || '');
  const [priority, setPriority] = useState(task?.priority || 'normal');
  const [assigneeId, setAssigneeId] = useState(task?.assignee_id || '');
  const [status, setStatus] = useState(task?.status || 'not_started');
  const [startDate, setStartDate] = useState(task?.start_date || '');
  const [dueDate, setDueDate] = useState(task?.due_date || '');
  const [description, setDescription] = useState(task?.description || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  // An assignee who has since been deactivated is not in the picker, so keep
  // their id selectable instead of silently clearing the field on save.
  const assigneeMissing = !!task?.assignee_id && !users.some((u) => u.id === task.assignee_id);

  async function save(e) {
    e.preventDefault();
    if (!canWrite || saving) return;

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      wbs_code: wbs.trim() || null,
      priority,
      status,
      assignee_id: assigneeId || null,
      start_date: startDate || null,
      due_date: dueDate || null,
    };
    if (!payload.title) { setErr('Give the task a title so the team knows what it is.'); return; }

    setSaving(true);
    setErr(null);
    const sb = supabase();

    let savedId = task?.id || null;
    if (editing) {
      const { data, error } = await sb.from('tasks').update(payload).eq('id', task.id).select('id').single();
      if (error) { setSaving(false); setErr(`Could not save this task. ${error.message}`); return; }
      savedId = data.id;
    } else {
      const insert = { ...payload };
      if (meId) insert.created_by = meId;
      const { data, error } = await sb.from('tasks').insert(insert).select('id').single();
      if (error) { setSaving(false); setErr(`Could not create this task. ${error.message}`); return; }
      savedId = data.id;
    }

    const events = [];
    if (!editing) {
      events.push({ action: 'created', detail: { title: payload.title } });
    } else {
      if (task.status !== payload.status) {
        events.push({ action: 'status_change', detail: { from: task.status, to: payload.status } });
      }
      if ((task.assignee_id || null) !== payload.assignee_id) {
        events.push({ action: 'assign', detail: { to: payload.assignee_id } });
      }
    }
    if (meId && events.length) {
      const { error: logErr } = await sb.from('task_activity').insert(
        events.map((ev) => ({ task_id: savedId, actor_id: meId, action: ev.action, detail: ev.detail })),
      );
      if (logErr) notify('Saved. The activity trail did not record that change.');
    }

    setSaving(false);
    notify(editing ? 'Task updated.' : 'Task created.');
    onSaved(savedId);
  }

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer" role="dialog" aria-modal="true" aria-label={editing ? 'Edit task' : 'New task'}>
        <div className="drawer-head">
          <h3>{editing ? 'Edit task' : 'New task'}</h3>
          <button className="btn btn-sm" onClick={onClose}>Close</button>
        </div>

        {err && <div className="alert alert-error">{err}</div>}
        {!canWrite && <div className="alert alert-warn">You have read access only, so this form cannot be saved.</div>}

        <form onSubmit={save}>
          <div className="tk-form">
            <label className="field tk-span2">
              <span>Title</span>
              <input className="input" value={title} maxLength={200} required disabled={!canWrite}
                     onChange={(e) => setTitle(e.target.value)} placeholder="What needs to happen" />
            </label>

            <label className="field">
              <span>WBS code</span>
              <input className="input" value={wbs} maxLength={40} disabled={!canWrite}
                     onChange={(e) => setWbs(e.target.value)} placeholder="2.3.1" inputMode="decimal" />
            </label>

            <label className="field">
              <span>Priority</span>
              <select className="select" value={priority} disabled={!canWrite}
                      onChange={(e) => setPriority(e.target.value)}>
                {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </select>
            </label>

            <label className="field tk-span2">
              <span>Assignee</span>
              <select className="select" value={assigneeId} disabled={!canWrite}
                      onChange={(e) => setAssigneeId(e.target.value)}>
                <option value="">Unassigned</option>
                {users.map((u) => <option key={u.id} value={u.id}>{userLabel(u)}</option>)}
                {assigneeMissing && <option value={task.assignee_id}>Former admin</option>}
              </select>
            </label>

            <label className="field">
              <span>Status</span>
              <select className="select" value={status} disabled={!canWrite}
                      onChange={(e) => setStatus(e.target.value)}>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </label>

            <label className="field">
              <span>Start date</span>
              <input className="input" type="date" value={startDate} disabled={!canWrite}
                     onChange={(e) => setStartDate(e.target.value)} />
            </label>

            <label className="field">
              <span>Due date</span>
              <input className="input" type="date" value={dueDate} disabled={!canWrite}
                     onChange={(e) => setDueDate(e.target.value)} />
            </label>

            <label className="field tk-span2">
              <span>Description</span>
              <textarea className="textarea" rows={4} value={description} disabled={!canWrite}
                        onChange={(e) => setDescription(e.target.value)} placeholder="Detail, links, what done looks like" />
            </label>
          </div>

          <p className="muted small" style={{ margin: '0 0 10px' }}>
            A WBS code is optional. Use one when the task rolls up to a bigger piece of work, so 2.3.1 nests under 2.3.
          </p>

          <div className="tk-drawer-foot">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <span style={{ flex: 1 }} />
            <button type="submit" className="btn btn-primary" disabled={!canWrite || saving}>
              {saving ? 'Saving…' : 'Save task'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

// --------------------------------------------------------------------- detail
export function TaskDetailDrawer({ row, parentTitle, canWrite, meId, notify, onEdit, onDeleted, onClose }) {
  const [detail, setDetail] = useState(null);
  const [detailErr, setDetailErr] = useState(null);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const taskId = row.id;

  const loadDetail = useCallback(async () => {
    const sb = supabase();
    const [c, a] = await Promise.all([
      sb.from('task_comments')
        .select('id, body, created_at, author:admin_users!task_comments_author_id_fkey ( id, email, full_name )')
        .eq('task_id', taskId).order('created_at', { ascending: true }),
      sb.from('task_activity')
        .select('id, action, detail, created_at, actor:admin_users!task_activity_actor_id_fkey ( id, email, full_name )')
        .eq('task_id', taskId).order('created_at', { ascending: false }).limit(20),
    ]);
    const failed = c.error || a.error;
    setDetailErr(failed ? `Could not load the comments and activity. ${failed.message}` : null);
    setDetail({ comments: c.data || [], activity: a.data || [] });
  }, [taskId]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  async function postComment(e) {
    e.preventDefault();
    const text = body.trim();
    if (!text || !canWrite || posting) return;
    setPosting(true);
    const sb = supabase();
    const payload = { task_id: taskId, body: text };
    if (meId) payload.author_id = meId;
    const { error } = await sb.from('task_comments').insert(payload).select('id').single();
    if (error) { setPosting(false); notify(`Could not post that comment. ${error.message}`); return; }
    if (meId) {
      const { error: logErr } = await sb.from('task_activity').insert({
        task_id: taskId, actor_id: meId, action: 'comment', detail: { preview: text.slice(0, 60) },
      });
      if (logErr) notify('Comment posted. The activity trail did not record it.');
    }
    setBody('');
    await loadDetail();
    setPosting(false);
    notify('Comment added.');
  }

  async function remove() {
    if (!canWrite || deleting) return;
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    const { error } = await supabase().from('tasks').delete().eq('id', taskId);
    if (error) {
      setDeleting(false);
      setConfirmDelete(false);
      notify(`Could not delete this task. ${error.message}`);
      return;
    }
    notify('Task deleted.');
    onDeleted();
  }

  const assignee = personName(row.assignee);
  const creator = personName(row.creator);
  const tags = Array.isArray(row.tags) ? row.tags.filter(Boolean) : [];

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer" role="dialog" aria-modal="true" aria-label={row.title || 'Task'}>
        <div className="drawer-head">
          <div>
            <div className="muted small" style={{ fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>
              {row.wbs_code ? `WBS ${row.wbs_code}` : 'Task'}
            </div>
            <h3>{row.title || 'Untitled task'}</h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              <span className={`tk-pill tk-st-${row.status}`}>{STATUS_LABEL[row.status] || row.status}</span>
              <span className={`tk-pill tk-pri-${row.priority}`}>{PRIORITY_LABEL[row.priority] || row.priority}</span>
            </div>
          </div>
          <button className="btn btn-sm" onClick={onClose}>Close</button>
        </div>

        {detailErr && <div className="alert alert-error">{detailErr}</div>}

        {row.description && (
          <section style={{ marginBottom: 14 }}>
            <h4 style={{ margin: '4px 0' }}>Description</h4>
            <p className="tk-desc">{row.description}</p>
          </section>
        )}

        <section style={{ marginBottom: 14 }}>
          <h4 style={{ margin: '4px 0' }}>Details</h4>
          <div className="detail-grid">
            {row.wbs_code && <Detail label="WBS code" value={<code className="tk-code">{row.wbs_code}</code>} />}
            {parentTitle && <Detail label="Parent task" value={parentTitle} />}
            <Detail label="Assignee" value={assignee || <span className="muted">Unassigned</span>} />
            <Detail label="Created by" value={creator} />
            <Detail label="Start" value={row.start_date} />
            <Detail label="Due" value={row.due_date} />
            <Detail label="Estimated" value={row.estimated_hours != null ? `${row.estimated_hours} hrs` : null} />
            <Detail label="Created" value={fmtStamp(row.created_at)} />
            <Detail label="Updated" value={fmtStamp(row.updated_at)} />
            {row.completed_at && <Detail label="Completed" value={fmtStamp(row.completed_at)} />}
          </div>
          {tags.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {tags.map((t) => <span key={t} className="badge badge-muted">{t}</span>)}
            </div>
          )}
        </section>

        <section style={{ marginBottom: 14 }}>
          <h4 style={{ margin: '4px 0' }}>Comments</h4>
          {detail == null ? <p className="muted small">Loading the thread…</p> : detail.comments.length === 0 ? (
            <p className="muted small">No comments yet.</p>
          ) : detail.comments.map((c) => (
            <div key={c.id} className="tk-comment">
              <div className="tk-comment-head">
                <span className="tk-comment-who">{personName(c.author) || 'Unknown'}</span>
                <span className="muted small">{fmtWhen(c.created_at)}</span>
              </div>
              <div className="tk-comment-body">{c.body}</div>
            </div>
          ))}

          {canWrite && (
            <form onSubmit={postComment} style={{ marginTop: 10 }}>
              <label className="field">
                <span>Add a comment</span>
                <textarea className="textarea" value={body} onChange={(e) => setBody(e.target.value)}
                          placeholder="What happened, what is next" required />
              </label>
              <button type="submit" className="btn btn-primary" disabled={posting || !body.trim()}>
                {posting ? 'Posting…' : 'Post comment'}
              </button>
            </form>
          )}
        </section>

        <section style={{ marginBottom: 14 }}>
          <h4 style={{ margin: '4px 0' }}>Activity</h4>
          {detail == null ? <p className="muted small">Loading…</p> : detail.activity.length === 0 ? (
            <p className="muted small">No activity yet.</p>
          ) : detail.activity.map((a) => (
            <div key={a.id} className="tk-activity">
              <span className="dot" aria-hidden="true" />
              <div>
                <strong>{personName(a.actor) || 'Someone'}</strong> {activityLabel(a)}
                <span className="muted"> · {fmtWhen(a.created_at)}</span>
              </div>
            </div>
          ))}
        </section>

        <div className="tk-drawer-foot">
          {canWrite && (
            <button className={`btn btn-sm ${confirmDelete ? 'btn-danger' : ''}`} disabled={deleting} onClick={remove}>
              {deleting ? 'Deleting…' : confirmDelete ? 'Tap again to delete' : 'Delete'}
            </button>
          )}
          {confirmDelete && !deleting && (
            <button className="btn btn-sm" onClick={() => setConfirmDelete(false)}>Keep it</button>
          )}
          <span style={{ flex: 1 }} />
          {canWrite ? (
            <button className="btn btn-primary" onClick={() => onEdit(row)}>Edit task</button>
          ) : (
            <span className="muted small">You have read access only.</span>
          )}
        </div>

        {row.assignee?.email && (
          <p className="muted small" style={{ margin: '10px 0 0' }}>
            Assigned to {assignee}{row.assignee.title ? `, ${row.assignee.title}` : ''}.{' '}
            <a href={`mailto:${row.assignee.email}`}>{row.assignee.email}</a>
          </p>
        )}
      </div>
    </>
  );
}
