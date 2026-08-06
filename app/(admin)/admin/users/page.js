'use client';
// Users & access: who can sign in, what roles they hold, and what each role
// can reach. Two tabs — Users (accounts) and Roles & modules (the permission
// matrix writing role_permissions). RLS enforces users:manage_users on every
// write; the UI additionally guards the two footguns (editing users/settings
// grants without super_admin, and removing the last super_admin).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAdmin } from '../../lib/permissions';
import UserDrawer from './user-drawer';
import RolesMatrix from './roles-matrix';

export default function UsersPage() {
  const { loading: authLoading, me, can, superAdmin } = useAdmin();
  const canManage = can('users', 'manage_users');

  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState(null);
  const [userRoles, setUserRoles] = useState([]);
  const [roles, setRoles] = useState([]);
  const [perms, setPerms] = useState([]);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(null); // user open in drawer; 'new' for add
  const [toast, setToast] = useState(null);

  const notify = useCallback((m) => { setToast(m); setTimeout(() => setToast(null), 3200); }, []);

  const load = useCallback(async () => {
    const sb = supabase();
    const [u, ur, r, rp] = await Promise.all([
      sb.from('admin_users').select('id, email, full_name, title, is_active, created_at, last_seen_at, invited_by, notes').order('full_name'),
      sb.from('admin_user_roles').select('user_id, role_slug'),
      sb.from('admin_roles').select('slug, label, description, sort_order, is_system').order('sort_order'),
      sb.from('role_permissions').select('role_slug, module, action'),
    ]);
    setUsers(u.data || []);
    setUserRoles(ur.data || []);
    setRoles(r.data || []);
    setPerms(rp.data || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const rolesByUser = useMemo(() => {
    const m = {};
    for (const r of userRoles) (m[r.user_id] ||= []).push(r.role_slug);
    return m;
  }, [userRoles]);

  const superAdminCount = useMemo(() =>
    (users || []).filter(u => u.is_active && (rolesByUser[u.id] || []).includes('super_admin')).length,
  [users, rolesByUser]);

  const filtered = useMemo(() => {
    if (!users) return [];
    const term = q.trim().toLowerCase();
    if (!term) return users;
    return users.filter(u => [u.full_name, u.email, u.title, ...(rolesByUser[u.id] || [])]
      .some(v => String(v || '').toLowerCase().includes(term)));
  }, [users, q, rolesByUser]);

  const lastSeen = (u) => {
    if (!u.last_seen_at) return null;
    const days = Math.floor((Date.now() - new Date(u.last_seen_at).getTime()) / 86400000);
    return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days}d ago`;
  };

  if (!authLoading && !can('users', 'read')) {
    return <div className="alert alert-error">The users module is limited by role. Ask the Director if you need it.</div>;
  }

  return (
    <>
      <div className="page-head">
        <h2>Users &amp; access</h2>
        <p className="sub">Admin accounts, their roles, and what each role can reach.</p>
      </div>

      <div className="chip-row" role="tablist">
        <button className="chip" aria-pressed={tab === 'users'} onClick={() => setTab('users')}>Users</button>
        <button className="chip" aria-pressed={tab === 'roles'} onClick={() => setTab('roles')}>Roles &amp; modules</button>
      </div>

      {tab === 'users' && (
        <>
          <div style={{ display: 'flex', gap: 8, margin: '4px 0 10px' }}>
            <input className="input" placeholder="Search name, email, role…" value={q} onChange={e => setQ(e.target.value)} inputMode="search" />
            {canManage && <button className="btn btn-primary" onClick={() => setActive('new')}>Add</button>}
          </div>

          {users == null ? <div className="card">Loading…</div> : (
            <div className="stack">
              {filtered.map(u => (
                <button key={u.id} className="item" style={{ font: 'inherit', cursor: 'pointer', display: 'block', textAlign: 'left' }} onClick={() => setActive(u)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                    <strong>{u.full_name || u.email}</strong>
                    <span className="muted small" style={{ whiteSpace: 'nowrap' }}>
                      {u.last_seen_at ? `seen ${lastSeen(u)}` : 'never signed in'}
                    </span>
                  </div>
                  <div className="muted small">{u.email}{u.title ? ` · ${u.title}` : ''}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    {!u.is_active && <span className="badge badge-bad">Inactive</span>}
                    {!u.last_seen_at && u.is_active && <span className="badge badge-review">Never signed in</span>}
                    {(rolesByUser[u.id] || []).map(r => (
                      <span key={r} className={`badge ${r === 'super_admin' ? 'badge-founding' : 'badge-muted'}`}>
                        {(roles.find(x => x.slug === r)?.label) || r.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
              {!filtered.length && <div className="card muted">No users match.</div>}
            </div>
          )}
        </>
      )}

      {tab === 'roles' && (
        <RolesMatrix
          roles={roles} perms={perms} canManage={canManage} superAdmin={superAdmin}
          notify={notify} onChanged={load}
        />
      )}

      {active && (
        <UserDrawer
          user={active === 'new' ? null : active}
          userRoleSlugs={active === 'new' ? [] : (rolesByUser[active.id] || [])}
          roles={roles} perms={perms}
          canManage={canManage}
          superAdminCount={superAdminCount}
          selfEmail={me?.email}
          notify={notify}
          onClose={(changed) => { setActive(null); if (changed) load(); }}
        />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
