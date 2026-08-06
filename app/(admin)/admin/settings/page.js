'use client';
// Settings: the account you are signed in as, the module access your roles
// give you, and a plain description of where this console gets its data.
// Everything here is read-only on purpose. Access changes happen in
// Users & Access, which writes admin_user_roles and role_permissions.
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAdmin } from '../../lib/permissions';

const pretty = (s) => {
  const t = String(s || '').replace(/_/g, ' ').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
};

const ROW_STYLE = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' };
const BADGE_ROW_STYLE = { display: 'flex', gap: 6, flexWrap: 'wrap' };
const H3_STYLE = { font: '700 1rem var(--op-font-head)', color: 'var(--op-navy)', margin: '0 0 6px' };

export default function SettingsPage() {
  const { loading: authLoading, me, roles, perms, superAdmin, can, signOut } = useAdmin();

  const [roleLabels, setRoleLabels] = useState({});
  const [roleErr, setRoleErr] = useState(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const { data, error } = await supabase().from('admin_roles').select('slug, label');
      if (!live) return;
      if (error) { setRoleErr(error.message); return; }
      const map = {};
      for (const r of data || []) map[r.slug] = r.label;
      setRoleLabels(map);
    })();
    return () => { live = false; };
  }, []);

  // Effective access comes straight from the permission context, which is the
  // same role_permissions data RLS checks server side.
  const access = useMemo(() => {
    const byModule = new Map();
    for (const key of perms || []) {
      const i = key.indexOf(':');
      if (i < 0) continue;
      const mod = key.slice(0, i);
      const action = key.slice(i + 1);
      if (!byModule.has(mod)) byModule.set(mod, []);
      byModule.get(mod).push(action);
    }
    return [...byModule.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([mod, actions]) => ({ mod, actions: [...new Set(actions)].sort() }));
  }, [perms]);

  if (!authLoading && !can('settings', 'read')) {
    return <div className="alert alert-error">The settings module is limited by role. Ask the Director if you need it.</div>;
  }

  if (authLoading) return <div className="card">Loading your account…</div>;

  return (
    <>
      <div className="page-head">
        <h2>Settings</h2>
        <p className="sub">Your account, the access your roles give you, and how this console is wired.</p>
      </div>

      {roleErr && (
        <div className="alert alert-warn">
          Could not load the role names: {roleErr}. Your roles are shown by their internal slug below.
        </div>
      )}

      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={H3_STYLE}>Signed in as</h3>
        {me ? (
          <>
            <div style={ROW_STYLE}>
              <div style={{ minWidth: 0 }}>
                <strong style={{ fontSize: '1.05rem' }}>{me.full_name || me.email}</strong>
                <div className="muted small" style={{ overflowWrap: 'anywhere' }}>{me.email}</div>
                {me.title && <div className="muted small">{me.title}</div>}
              </div>
              <button className="btn btn-sm" onClick={signOut}>Sign out</button>
            </div>

            <div style={{ ...BADGE_ROW_STYLE, marginTop: 10 }}>
              {superAdmin && <span className="badge badge-founding">Super admin</span>}
              {(roles || []).map(r => (
                <span key={r} className={`badge ${r === 'super_admin' ? 'badge-founding' : 'badge-muted'}`}>
                  {roleLabels[r] || pretty(r)}
                </span>
              ))}
              {!(roles || []).length && <span className="badge badge-review">No roles assigned</span>}
            </div>

            <p className="muted small" style={{ margin: '10px 0 0' }}>
              Your name, email, and title come from your admin account record. Ask the Director to change
              any of them, since editing accounts is a Users &amp; Access job.
            </p>
          </>
        ) : (
          <div className="alert alert-error" style={{ margin: 0 }}>
            You are signed in, but there is no active admin account for this email address. Ask the Director
            to add you in Users &amp; Access.
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={H3_STYLE}>What you can reach</h3>
        {superAdmin ? (
          <p className="small" style={{ margin: 0 }}>
            You hold super admin, so every module is open to you, including Users &amp; Access and this page.
            That also means you are one of the few people who can lock someone out by mistake, so change roles
            carefully.
          </p>
        ) : access.length ? (
          <>
            <p className="muted small" style={{ margin: '0 0 8px' }}>
              This is the exact list the database checks, so if a module is missing here it will also refuse
              to load its data.
            </p>
            <div className="stack">
              {access.map(a => (
                <div key={a.mod} className="item">
                  <strong>{pretty(a.mod)}</strong>
                  <span style={BADGE_ROW_STYLE}>
                    {a.actions.map(act => (
                      <span key={act} className={`badge ${act === 'read' ? 'badge-muted' : 'badge-ok'}`}>{pretty(act)}</span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="small" style={{ margin: 0 }}>
            Your roles do not grant any module access yet. The menu will fill in as soon as a role is added
            to your account.
          </p>
        )}
      </div>

      {can('users', 'read') && (
        <div className="card" style={{ marginBottom: 12 }}>
          <h3 style={H3_STYLE}>Access management</h3>
          <p className="small" style={{ margin: '0 0 10px' }}>
            Accounts, roles, and the grid of which role reaches which module all live in one place.
          </p>
          <div className="page-actions" style={{ margin: 0 }}>
            <a className="btn btn-primary" href="/admin/users">Open Users &amp; Access</a>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={H3_STYLE}>About this console</h3>
        <div className="stack">
          <div className="item" style={{ display: 'block' }}>
            <strong>Contacts is the spine</strong>
            <div className="muted small">
              Every donor, member, volunteer, subscriber, and prospect is one row in the contacts directory.
              Members, Prospects, Volunteers, and Networking are different views of that same person record,
              so fixing an email in one place fixes it everywhere.
            </div>
          </div>
          <div className="item" style={{ display: 'block' }}>
            <strong>Members come from ActBlue</strong>
            <div className="muted small">
              The founding member roster is pulled from ActBlue on a schedule and written into the member
              records. Gifts land here on their own, so nobody has to retype a contribution.
            </div>
          </div>
          <div className="item" style={{ display: 'block' }}>
            <strong>Module access is controlled by role</strong>
            <div className="muted small">
              Your roles decide which modules show up in the menu and what you can change inside them. The
              same rules are enforced by the database, not just the menu, so a link you were not granted will
              not hand over data.
            </div>
          </div>
          <div className="item" style={{ display: 'block' }}>
            <strong>Public pages read the same data</strong>
            <div className="muted small">
              The board roster, the founding member list, and the donation tiers on ohiopride.org read the
              same tables this console shows. What you see here is what visitors see.
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={H3_STYLE}>Preferences</h3>
        <p className="small" style={{ margin: 0 }}>
          There are no personal preferences to set yet. When notification and dashboard options are built,
          they will show up on this page. We would rather show you nothing than a switch that does not do
          anything.
        </p>
      </div>
    </>
  );
}
