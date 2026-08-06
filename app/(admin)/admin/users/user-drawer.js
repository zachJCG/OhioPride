'use client';
// Per-user drawer: profile fields, role checkboxes, active toggle (deactivate,
// never delete), invite / set-password / send-reset via /api/admin-user-manage,
// and an effective-permissions preview (the union of the user's role grants)
// so "what can Keara see?" is answerable at a glance.
import { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';

async function manageAuthUser(payload) {
  const { data: { session } } = await supabase().auth.getSession();
  const resp = await fetch('/api/admin-user-manage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok || !body.ok) throw new Error(body.error || `status ${resp.status}`);
  return body;
}

export default function UserDrawer({ user, userRoleSlugs, roles, perms, canManage, superAdminCount, selfEmail, notify, onClose }) {
  const isNew = !user;
  const [form, setForm] = useState({
    email: user?.email || '',
    full_name: user?.full_name || '',
    title: user?.title || '',
    is_active: user ? !!user.is_active : true,
    password: '',
  });
  const [roleSet, setRoleSet] = useState(new Set(userRoleSlugs));
  const [saving, setSaving] = useState(false);
  const changedRef = useState({ v: false })[0];

  const wasSuperAdmin = userRoleSlugs.includes('super_admin') && user?.is_active;
  const removingLastSuperAdmin = wasSuperAdmin && superAdminCount <= 1 &&
    (!roleSet.has('super_admin') || !form.is_active);

  const effective = useMemo(() => {
    const grants = {};
    for (const p of perms) {
      if (!roleSet.has(p.role_slug)) continue;
      (grants[p.module] ||= new Set()).add(p.action);
    }
    return Object.entries(grants).sort(([a], [b]) => a.localeCompare(b));
  }, [perms, roleSet]);

  function genPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    const arr = new Uint32Array(14);
    crypto.getRandomValues(arr);
    const pw = [...arr].map(n => chars[n % chars.length]).join('');
    setForm(f => ({ ...f, password: pw }));
    navigator.clipboard?.writeText(pw).then(() => notify('Password generated and copied.'), () => notify('Password generated.'));
  }

  async function sendReset() {
    try {
      await manageAuthUser({ action: 'send_password_reset', email: user.email });
      notify('Password reset email sent to ' + user.email + '.');
    } catch (e) {
      notify('Reset failed: ' + e.message);
    }
  }

  async function save() {
    const email = form.email.trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { notify('Enter a valid email.'); return; }
    if (removingLastSuperAdmin) { notify('Refusing: this would remove the last active super admin.'); return; }
    setSaving(true);
    const sb = supabase();
    try {
      // Email changes touch Supabase Auth first so sign-in follows the row.
      if (!isNew && email !== user.email) {
        await manageAuthUser({ action: 'update_email', email: user.email, new_email: email });
      }

      let userId = user?.id;
      const rowPatch = {
        email,
        full_name: form.full_name.trim() || null,
        title: form.title.trim() || null,
        is_active: form.is_active,
      };
      if (isNew) {
        const { data, error } = await sb.from('admin_users')
          .insert({ ...rowPatch, invited_by: selfEmail || null }).select('id').single();
        if (error) throw new Error(error.message);
        userId = data.id;
      } else {
        const { error } = await sb.from('admin_users').update(rowPatch).eq('id', user.id);
        if (error) throw new Error(error.message);
      }
      changedRef.v = true;

      // Role sync as a diff, additions FIRST: a delete-everything-then-
      // reinsert pass on your own account would drop the role that grants
      // users:manage_users and RLS would then refuse the re-insert,
      // locking you out mid-save.
      const wanted = [...roleSet];
      const toAdd = wanted.filter(slug => !userRoleSlugs.includes(slug));
      const toRemove = userRoleSlugs.filter(slug => !roleSet.has(slug));
      if (toAdd.length) {
        const { error: insErr } = await sb.from('admin_user_roles')
          .insert(toAdd.map(slug => ({ user_id: userId, role_slug: slug, assigned_by: selfEmail || null })));
        if (insErr) throw new Error(insErr.message);
      }
      if (toRemove.length) {
        const { error: delErr } = await sb.from('admin_user_roles')
          .delete().eq('user_id', userId).in('role_slug', toRemove);
        if (delErr) throw new Error(delErr.message);
      }

      // Auth account: explicit password, or an invite email for new users.
      if (form.password) {
        await manageAuthUser({ action: 'set_password', email, new_password: form.password });
      } else if (isNew) {
        try {
          await manageAuthUser({ action: 'invite', email, full_name: form.full_name.trim() });
          notify('Saved. Invite email sent.');
        } catch {
          notify('Saved, but the invite email failed. Use "Send password reset" instead.');
        }
      }

      changedRef.v = true;
      if (!isNew || form.password) notify('Saved.');
      onClose(true);
    } catch (e) {
      notify('Save failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  const ro = !canManage;

  return (
    <>
      <div className="drawer-scrim" onClick={() => onClose(changedRef.v)} />
      <div className="drawer" role="dialog" aria-modal="true" aria-label={isNew ? 'Add user' : (user.full_name || user.email)}>
        <div className="drawer-head">
          <h3>{isNew ? 'Add user' : (user.full_name || user.email)}</h3>
          <button className="btn btn-sm" onClick={() => onClose(changedRef.v)}>Close</button>
        </div>

        {!isNew && !user.last_seen_at && user.is_active && (
          <div className="alert alert-warn" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>Has never signed in.</span>
            {canManage && <button className="btn btn-sm" onClick={sendReset}>Send password reset</button>}
          </div>
        )}

        <label className="field"><span>Email</span>
          <input className="input" type="email" value={form.email} disabled={ro}
                 onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label className="field"><span>Full name</span>
            <input className="input" value={form.full_name} disabled={ro}
                   onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
          </label>
          <label className="field"><span>Title</span>
            <input className="input" value={form.title} disabled={ro}
                   onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </label>
        </div>

        <div className="field"><span>Roles</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {roles.map(r => (
              <label key={r.slug} className="small" style={{ display: 'flex', gap: 6, alignItems: 'center', minHeight: 34 }}>
                <input type="checkbox" disabled={ro} checked={roleSet.has(r.slug)}
                       onChange={e => setRoleSet(s => { const n = new Set(s); e.target.checked ? n.add(r.slug) : n.delete(r.slug); return n; })} />
                {r.label || r.slug}
              </label>
            ))}
          </div>
        </div>

        <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '4px 0 10px' }}>
          <input type="checkbox" disabled={ro} checked={form.is_active}
                 onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
          Active (deactivate instead of deleting; history and assignments stay intact)
        </label>

        {removingLastSuperAdmin && (
          <div className="alert alert-error">This is the last active super admin. Assign another super admin before removing this one.</div>
        )}

        {canManage && (
          <div className="field"><span>{isNew ? 'Password (blank = send an invite email)' : 'Set a new password (optional)'}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" value={form.password} placeholder="••••••••"
                     onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
              <button className="btn" type="button" onClick={genPassword}>Generate</button>
            </div>
          </div>
        )}

        {canManage && (
          <button className="btn btn-primary" style={{ width: '100%', margin: '6px 0 14px' }} disabled={saving || removingLastSuperAdmin} onClick={save}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}

        <section>
          <h4 style={{ margin: '4px 0' }}>Effective permissions</h4>
          <p className="muted small" style={{ margin: '0 0 6px' }}>Union of the checked roles. Super admin implies everything.</p>
          {roleSet.has('super_admin') ? (
            <div className="badge badge-founding">Super admin: all modules, all actions</div>
          ) : effective.length ? (
            <div>
              {effective.map(([module, actions]) => (
                <div key={module} style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--op-line)', fontSize: '.85rem' }}>
                  <span style={{ flex: 1 }}>{module.replace(/_/g, ' ')}</span>
                  {['read', 'write', 'admin', 'manage_users'].filter(a => actions.has(a)).map(a => (
                    <span key={a} className="badge badge-muted">{a.replace('_', ' ')}</span>
                  ))}
                </div>
              ))}
            </div>
          ) : <div className="muted small">No roles checked; this account can sign in but sees no modules.</div>}
        </section>
      </div>
    </>
  );
}
