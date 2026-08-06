'use client';
// Roles & modules matrix: rows = modules, columns = roles, cells = read/write
// checkboxes writing role_permissions. Custom roles can be created or
// duplicated (admin_roles.is_system = false). Guards: the super_admin column
// is display-only, and the users/settings rows need a super_admin caller.
import { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';

const GUARDED_MODULES = ['users', 'settings'];

export default function RolesMatrix({ roles, perms, canManage, superAdmin, notify, onChanged }) {
  const [busyCell, setBusyCell] = useState(null);

  const modules = useMemo(() =>
    [...new Set(perms.map(p => p.module))].sort((a, b) => a.localeCompare(b)),
  [perms]);

  const permSet = useMemo(() =>
    new Set(perms.map(p => `${p.role_slug}|${p.module}|${p.action}`)),
  [perms]);

  const editableRoles = roles.filter(r => r.slug !== 'super_admin');

  async function toggle(roleSlug, module, action) {
    if (!canManage) return;
    if (GUARDED_MODULES.includes(module) && !superAdmin) {
      notify('Only a super admin can change access to ' + module + '.');
      return;
    }
    const key = `${roleSlug}|${module}|${action}`;
    setBusyCell(key);
    const sb = supabase();
    const has = permSet.has(key);
    const { error } = has
      ? await sb.from('role_permissions').delete().match({ role_slug: roleSlug, module, action })
      : await sb.from('role_permissions').insert({ role_slug: roleSlug, module, action });
    setBusyCell(null);
    if (error) { notify('Change failed: ' + error.message); return; }
    onChanged();
  }

  async function createRole(duplicateOf) {
    const label = window.prompt(duplicateOf
      ? `Name for the copy of "${duplicateOf.label || duplicateOf.slug}":`
      : 'Name for the new role:');
    if (!label?.trim()) return;
    const slug = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!slug) { notify('That name does not reduce to a valid slug.'); return; }
    if (roles.some(r => r.slug === slug)) { notify('A role with that slug already exists.'); return; }
    const sb = supabase();
    const { error } = await sb.from('admin_roles').insert({
      slug, label: label.trim(), is_system: false,
      sort_order: Math.max(0, ...roles.map(r => r.sort_order || 0)) + 1,
      description: duplicateOf ? `Copy of ${duplicateOf.label || duplicateOf.slug}` : null,
    });
    if (error) { notify('Create failed: ' + error.message); return; }
    if (duplicateOf) {
      const copies = perms.filter(p => p.role_slug === duplicateOf.slug)
        .map(p => ({ role_slug: slug, module: p.module, action: p.action }));
      if (copies.length) {
        const { error: cpErr } = await sb.from('role_permissions').insert(copies);
        if (cpErr) notify('Role created, but copying grants failed: ' + cpErr.message);
      }
    }
    notify('Role created.');
    onChanged();
  }

  return (
    <>
      {canManage && (
        <div className="page-actions">
          <button className="btn btn-sm" onClick={() => createRole(null)}>New role</button>
        </div>
      )}

      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', border: '1px solid var(--op-line)', borderRadius: 'var(--op-radius)', background: '#fff' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: '.82rem', minWidth: 560 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '10px 12px', position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>Module</th>
              {roles.map(r => (
                <th key={r.slug} style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>
                  <div>{r.label || r.slug}</div>
                  {r.slug === 'super_admin'
                    ? <div className="muted" style={{ fontWeight: 400, fontSize: '.68rem' }}>everything</div>
                    : canManage && (
                      <button className="btn btn-sm" style={{ minHeight: 24, padding: '0 8px', fontSize: '.68rem', marginTop: 2 }}
                              onClick={() => createRole(r)}>Duplicate</button>
                    )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modules.map(module => (
              <tr key={module} style={{ borderTop: '1px solid var(--op-line)' }}>
                <td style={{ padding: '8px 12px', fontWeight: 600, position: 'sticky', left: 0, background: '#fff', whiteSpace: 'nowrap' }}>
                  {module.replace(/_/g, ' ')}
                  {GUARDED_MODULES.includes(module) && <span className="muted" title="super admin only" style={{ marginLeft: 4 }}>*</span>}
                </td>
                {roles.map(r => {
                  if (r.slug === 'super_admin') {
                    return <td key={r.slug} style={{ textAlign: 'center', padding: '8px' }} className="muted">✓</td>;
                  }
                  const locked = !canManage || (GUARDED_MODULES.includes(module) && !superAdmin);
                  return (
                    <td key={r.slug} style={{ textAlign: 'center', padding: '6px 8px', whiteSpace: 'nowrap' }}>
                      {['read', 'write'].map(action => {
                        const key = `${r.slug}|${module}|${action}`;
                        return (
                          <label key={action} className="small" style={{ display: 'inline-flex', gap: 3, alignItems: 'center', margin: '0 5px', opacity: locked ? .55 : 1 }}>
                            <input type="checkbox"
                                   checked={permSet.has(key)}
                                   disabled={locked || busyCell === key}
                                   onChange={() => toggle(r.slug, module, action)} />
                            <span className="muted">{action === 'read' ? 'R' : 'W'}</span>
                          </label>
                        );
                      })}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="muted small" style={{ marginTop: 10 }}>
        R = read, W = write. Rows marked * (users, settings) can only be changed by a super admin,
        and the super_admin column is fixed. Some grants also carry admin / manage users actions
        managed outside this matrix. To trim blanket super_admin from non-officers, run
        <code> docs/db/optional/role-rightsizing.sql</code> when the Director signs off.
      </p>
    </>
  );
}
