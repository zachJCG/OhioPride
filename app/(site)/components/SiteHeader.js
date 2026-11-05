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
 * Client component because the menu and the active-link state are
 * interactive. The static version marked the active link by reading
 * window.location; here it comes from usePathname, so it is correct on the
 * first paint instead of after a script runs.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

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
// the pages that have not been ported yet. Post-election (2026-11) the nav is
// five items: the three jobs the site has now (apply, score, give) plus the
// endorsements list and About. `activeFor` is the path a short link lands on,
// so Apply lights up on the form rather than on the 301.
const MAIN_LINKS = [
  { href: '/endorsements', label: 'Endorsements' },
  { href: '/apply', label: 'Apply', activeFor: '/endorsement/screening' },
  { href: '/scorecard', label: 'Scorecard' },
  { href: '/about', label: 'About' },
];

export default function SiteHeader() {
  const pathname = usePathname() || '/';
  const [menuOpen, setMenuOpen] = useState(false);

  // Same rule the static script used: exact match, or a parent of the current
  // section, so /issues stays lit on /issues/hb96.
  const isActive = (href) => {
    const path = pathname.replace(/\/+$/, '') || '/';
    const target = href.replace(/\/+$/, '') || '/';
    return target === path || (target !== '/' && path.startsWith(target + '/'));
  };

  // Navigating with the mobile menu open would otherwise leave it open on the
  // next page, covering the content.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const linkProps = (link) =>
    isActive(link.activeFor || link.href) ? { className: 'active', 'aria-current': 'page' } : {};

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
          <ul className={`ohp-nav-links${menuOpen ? ' active' : ''}`} id="ohpNavLinks">
            {MAIN_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} {...linkProps(l)}>
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
