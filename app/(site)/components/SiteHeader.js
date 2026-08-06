'use client';

/* Primary navigation.
 *
 * A faithful port of the HEADER_HTML block and its wiring in
 * public/js/site-template.js: same element structure, same class names, same
 * ARIA. That is deliberate, because public/css/site-template.css styles these
 * classes and is shared with the pages that have not been ported yet. Change
 * the markup here and you change it for the static pages too, so keep the two
 * in step until public/js/site-template.js can be deleted.
 *
 * Client component because the menu, the dropdown, and the active-link state
 * are interactive. The static version marked the active link by reading
 * window.location; here it comes from usePathname, so it is correct on the
 * first paint instead of after a script runs.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

function Wordmark() {
  return (
    <Link href="/" className="ohp-nav-logo" aria-label="Ohio Pride PAC home">
      <span className="ohp-logo-row">
        <span className="ohp-logo-ohio">OHIO</span>
        <span className="ohp-logo-pride">PRIDE</span>
      </span>
      <span className="ohp-logo-pac">PAC</span>
    </Link>
  );
}

// Keep in step with HEADER_HTML in public/js/site-template.js, which serves
// the pages that have not been ported yet. The Governor Guide entry was held
// back while the page was gated and is restored now that it is public.
const INFO_LINKS = [
  { href: '/about', label: 'About' },
  { href: '/board', label: 'Board' },
  { href: '/events', label: 'Events' },
  { href: '/volunteer', label: 'Volunteer' },
  { href: '/endorsements', label: 'Endorsements' },
  { href: '/governor-guide', label: 'Governor Guide 2026' },
  { href: '/elected-resources', label: 'Officials Toolkit' },
];

const MAIN_LINKS = [
  { href: '/issues', label: 'Issues' },
  { href: '/scorecard', label: 'Scorecard' },
];

const TAIL_LINKS = [
  { href: '/founding-members', label: 'Founding Members' },
  { href: '/contact', label: 'Contact' },
];

export default function SiteHeader() {
  const pathname = usePathname() || '/';
  const [menuOpen, setMenuOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const groupRef = useRef(null);

  // Same rule the static script used: exact match, or a parent of the current
  // section, so /issues stays lit on /issues/hb96.
  const isActive = (href) => {
    const path = pathname.replace(/\/+$/, '') || '/';
    const target = href.replace(/\/+$/, '') || '/';
    return target === path || (target !== '/' && path.startsWith(target + '/'));
  };

  const infoActive = INFO_LINKS.some((l) => isActive(l.href));

  useEffect(() => {
    if (!infoOpen) return undefined;
    const onPointer = (e) => {
      if (groupRef.current && !groupRef.current.contains(e.target)) setInfoOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setInfoOpen(false);
    };
    document.addEventListener('click', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [infoOpen]);

  // Navigating with the mobile menu open would otherwise leave it open on the
  // next page, covering the content.
  useEffect(() => {
    setMenuOpen(false);
    setInfoOpen(false);
  }, [pathname]);

  const linkProps = (href) =>
    isActive(href) ? { className: 'active', 'aria-current': 'page' } : {};

  return (
    <>
      <a className="ohp-skip-link" href="#main">
        Skip to main content
      </a>
      <nav className="ohp-nav" aria-label="Primary">
        <div className="ohp-nav-inner">
          <Wordmark />
          <button
            className="ohp-menu-toggle"
            id="ohpMenuToggle"
            type="button"
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={menuOpen}
            aria-controls="ohpNavLinks"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="ohp-menu-toggle-icon" aria-hidden="true" />
          </button>
          <ul className={`ohp-nav-links${menuOpen ? ' open' : ''}`} id="ohpNavLinks">
            {MAIN_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} {...linkProps(l.href)}>
                  {l.label}
                </Link>
              </li>
            ))}

            <li
              className={`ohp-nav-group${infoActive ? ' active' : ''}`}
              data-ohp-group="info"
              ref={groupRef}
            >
              <button
                type="button"
                className="ohp-nav-group-toggle"
                aria-expanded={infoOpen}
                aria-haspopup="true"
                aria-controls="ohpNavInfoMenu"
                {...(infoActive ? { 'aria-current': 'true' } : {})}
                onClick={(e) => {
                  e.stopPropagation();
                  setInfoOpen((open) => !open);
                }}
              >
                Info
                <span className="ohp-nav-group-caret" aria-hidden="true" />
              </button>
              <ul
                className={`ohp-nav-submenu${infoOpen ? ' open' : ''}`}
                id="ohpNavInfoMenu"
                role="menu"
              >
                {INFO_LINKS.map((l) => (
                  <li role="none" key={l.href}>
                    <Link role="menuitem" href={l.href} {...linkProps(l.href)}>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>

            {TAIL_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} {...linkProps(l.href)}>
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/donate" className="ohp-btn-donate">
                Donate
              </Link>
            </li>
          </ul>
        </div>
      </nav>
    </>
  );
}
