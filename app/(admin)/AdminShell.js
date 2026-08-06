'use client';
// Mobile-first admin shell: topbar + bottom tabs (<768px) / sidebar (>=768px).
// Nav items render only when the signed-in user has the module permission.
import { usePathname } from 'next/navigation';
import { AdminSessionProvider, useAdmin } from './lib/permissions';
import { NAV } from './nav.config';

function Chrome({ children }) {
  const path = usePathname();
  const { loading, me, can } = useAdmin();

  // The login page carries its own full-bleed layout; no shell chrome.
  if (path.startsWith('/admin/login')) return <>{children}</>;

  const visible = NAV.map(g => ({ ...g, items: g.items.filter(i => can(...i.permission)) }))
                     .filter(g => g.items.length);
  const tabs = visible.flatMap(g => g.items).filter(i => i.tab).slice(0, 4);
  const current = (href) => (path === href || path.startsWith(href + '/')) ? 'page' : undefined;

  return (
    <div className="shell">
      <header className="shell-topbar">
        <img src="/assets/logo/wordmark-mono-white-on-navy.svg" alt="Ohio Pride PAC" height="22" />
        <h1>Admin</h1>
      </header>
      {!loading && (
        <aside className="shell-side">
          <a className="shell-side-brand" href="/admin/dashboard">
            <img src="/assets/logo/wordmark-mono-white-on-navy.svg" alt="Ohio Pride PAC" height="26" />
          </a>
          {visible.map(g => (
            <div key={g.group}>
              <div className="grp">{g.group}</div>
              {g.items.map(i => (
                <a key={i.id} href={i.href} aria-current={current(i.href)}>{i.label}</a>
              ))}
            </div>
          ))}
          <div className="grp">{me?.full_name || ''}</div>
          <a href="/admin/menu" aria-current={current('/admin/menu')}>Account</a>
        </aside>
      )}
      <main className="shell-main" id="main">{children}</main>
      {!loading && (
        <nav className="shell-tabs" aria-label="Primary">
          {tabs.map(i => <a key={i.id} href={i.href} aria-current={current(i.href)}>{i.label}</a>)}
          <a href="/admin/menu" aria-current={current('/admin/menu')}>More</a>
        </nav>
      )}
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
