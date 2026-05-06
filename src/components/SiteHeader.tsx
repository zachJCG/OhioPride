'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

const NAV_LINKS = [
  { href: '/issues',           label: 'Issues' },
  { href: '/scorecard',        label: 'Scorecard' },
  { href: '/about',            label: 'About' },
  { href: '/founding-members', label: 'Founding Members' },
  { href: '/contact',          label: 'Contact' },
];

function isActive(pathname: string, href: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  const norm = href.replace(/\/+$/, '') || '/';
  if (norm === path) return true;
  if (norm !== '/' && path.indexOf(norm + '/') === 0) return true;
  return false;
}

export function SiteHeader() {
  const pathname = usePathname() || '/';
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <nav className="ohp-nav" aria-label="Primary">
      <div className="ohp-nav-inner">
        <Link href="/" className="ohp-nav-logo" aria-label="Ohio Pride PAC home">
          <span className="ohp-logo-ohio">Ohio</span>
          <span className="ohp-logo-pride">Pride</span>
          <span className="ohp-logo-pac">PAC</span>
        </Link>
        <button
          className="ohp-menu-toggle"
          aria-label="Toggle navigation"
          aria-expanded={open}
          onClick={() => setOpen(v => !v)}
        >
          ☰
        </button>
        <ul className={`ohp-nav-links${open ? ' active' : ''}`}>
          {NAV_LINKS.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                className={isActive(pathname, href) ? 'active' : undefined}
              >
                {label}
              </Link>
            </li>
          ))}
          <li>
            <Link
              href="/donate"
              className={`ohp-btn-donate${isActive(pathname, '/donate') ? ' active' : ''}`}
            >
              Donate
            </Link>
          </li>
        </ul>
      </div>
    </nav>
  );
}
