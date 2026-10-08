'use client';
// Admin shell: a hamburger-driven left drawer everywhere.
//
// On phones the drawer slides in over a scrim; on desktop it is a persistent
// sidebar the same hamburger collapses to an icon rail. There is no bottom tab
// bar: one navigation model on every screen size means one mental model, and
// the drawer holds the full module list instead of five slots plus a More page.
import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AdminSessionProvider, useAdmin } from './lib/permissions';
import { supabase } from './lib/supabase';
import { NAV } from './nav.config';

const COLLAPSE_KEY = 'opAdminNavCollapsed';

/* Counters a nav item can show. Each loads once per page view, only when the
 * caller can see the item it belongs to. Keep these to cheap head counts. */
const BADGES = {
  candidates_new: async (sb) => {
    const { count } = await sb.from('candidate_applications')
      .select('id', { count: 'exact', head: true }).eq('status', 'new');
    return count || 0;
  },
};

function Icon({ name }) {
  const paths = {
    menu: 'M4 7h16M4 12h16M4 17h16',
    close: 'M6 6l12 12M6 18L18 6',
  };
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

function Chrome({ children }) {
  const path = usePathname();
  const { loading, me, roles, can, signOut } = useAdmin();
  const [open, setOpen] = useState(false);        // mobile drawer
  const [collapsed, setCollapsed] = useState(false); // desktop rail
  const [badges, setBadges] = useState({});

  useEffect(() => {
    try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1'); } catch { /* ignore */ }
  }, []);

  // Close the mobile drawer on navigation and on Escape.
  useEffect(() => { setOpen(false); }, [path]);

  // Nav badges, refreshed on every navigation so a handled application drops
  // off the count without a reload.
  useEffect(() => {
    if (loading || !me) return;
    let alive = true;
    const sb = supabase();
    const wanted = NAV.flatMap(g => g.items).filter(i => i.badge && BADGES[i.badge] && can(...i.permission));
    Promise.all(wanted.map(async i => [i.badge, await BADGES[i.badge](sb).catch(() => 0)]))
      .then(pairs => { if (alive) setBadges(Object.fromEntries(pairs)); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, me, path]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggle = useCallback(() => {
    if (window.matchMedia('(min-width: 768px)').matches) {
      setCollapsed(c => {
        const next = !c;
        try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
        return next;
      });
    } else {
      setOpen(o => !o);
    }
  }, []);

  // The login page carries its own full-bleed layout; no shell chrome.
  if (path.startsWith('/admin/login')) return <>{children}</>;

  const visible = NAV.map(g => ({ ...g, items: g.items.filter(i => can(...i.permission)) }))
                     .filter(g => g.items.length);
  const current = (href) => (path === href || path.startsWith(href + '/')) ? 'page' : undefined;
  const activeLabel = visible.flatMap(g => g.items).find(i => current(i.href))?.label || 'Admin';

  return (
    <div className={`shell${collapsed ? ' is-collapsed' : ''}${open ? ' is-open' : ''}`}>
      <header className="shell-topbar">
        <button className="shell-burger" onClick={toggle}
                aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}>
          <Icon name={open ? 'close' : 'menu'} />
        </button>
        <h1>{activeLabel}</h1>
      </header>

      {open && <div className="shell-scrim" onClick={() => setOpen(false)} />}

      <aside className="shell-side" aria-label="Admin navigation">
        <div className="shell-side-head">
          <a className="shell-side-brand" href="/admin/dashboard">
            <img src="/assets/logo/wordmark-mono-white-on-navy.svg" alt="Ohio Pride PAC" height="24" />
          </a>
          <button className="shell-burger shell-burger-desk" onClick={toggle}
                  aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}>
            <Icon name="menu" />
          </button>
        </div>

        {!loading && (
          <nav className="shell-nav">
            {visible.map(g => (
              <div key={g.group} className="shell-nav-group">
                <div className="grp">{g.group}</div>
                {g.items.map(i => (
                  <a key={i.id} href={i.href} aria-current={current(i.href)} title={i.label}>
                    <span className="dot" aria-hidden="true" />
                    <span className="lbl">{i.label}</span>
                    {i.badge && badges[i.badge] > 0 && (
                      <span className="nav-badge" aria-label={`${badges[i.badge]} new`}>{badges[i.badge]}</span>
                    )}
                  </a>
                ))}
              </div>
            ))}
          </nav>
        )}

        {!loading && me && (
          <div className="shell-side-foot">
            <div className="who">
              <strong>{me.full_name || me.email}</strong>
              <span>{roles.map(r => r.replace(/_/g, ' ')).join(', ')}</span>
            </div>
            <button className="btn btn-sm" onClick={signOut}>Sign out</button>
          </div>
        )}
      </aside>

      <main className="shell-main" id="main">{children}</main>
    </div>
  );
}

export default function AdminShell({ children }) {
  return (
    <AdminSessionProvider>
      <Chrome>{children}</Chrome>
    </AdminSessionProvider>
  );
}
