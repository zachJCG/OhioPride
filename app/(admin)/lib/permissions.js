'use client';
// Session + permission context for the admin shell.
// Loads the caller's admin_users row + roles once; exposes can(module, action).
// Access truth is admin_users + admin_user_roles + role_permissions — the same
// tables has_permission() reads, so the UI and RLS agree.
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';

const AdminCtx = createContext(null);

export function AdminSessionProvider({ children }) {
  const [state, setState] = useState({
    loading: true, user: null, me: null, roles: [], perms: new Set(), superAdmin: false,
  });

  useEffect(() => {
    const sb = supabase();
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { setState(s => ({ ...s, loading: false })); return; }
      const { data: me } = await sb.from('admin_users')
        .select('id, email, full_name, title, is_active')
        .eq('email', (user.email || '').toLowerCase()).maybeSingle();
      if (!me || !me.is_active) {
        setState({ loading: false, user, me: null, roles: [], perms: new Set(), superAdmin: false });
        return;
      }
      const { data: roleRows } = await sb.from('admin_user_roles')
        .select('role_slug').eq('user_id', me.id);
      const roles = (roleRows || []).map(r => r.role_slug);
      const superAdmin = roles.includes('super_admin');
      let perms = new Set();
      if (!superAdmin && roles.length) {
        const { data: pr } = await sb.from('role_permissions')
          .select('module, action').in('role_slug', roles);
        perms = new Set((pr || []).map(p => `${p.module}:${p.action}`));
      }
      sb.rpc('touch_admin_last_seen').then(() => {}, () => {});
      setState({ loading: false, user, me, roles, perms, superAdmin });
    })();
  }, []);

  return <AdminCtx.Provider value={state}>{children}</AdminCtx.Provider>;
}

export function useAdmin() {
  const ctx = useContext(AdminCtx);
  const can = (module, action = 'read') =>
    !!ctx && !!ctx.me && (ctx.superAdmin || ctx.perms.has(`${module}:${action}`));
  const signOut = async () => {
    await supabase().auth.signOut();
    window.location.assign('/admin/login');
  };
  return { ...ctx, can, signOut };
}
