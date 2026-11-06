/* =============================================================================
 * season-banners.js: sitewide fundraising banners with a fixed calendar window.
 * -----------------------------------------------------------------------------
 * Two banners, each live for a few days a year:
 *
 *   Giving Tuesday   Dec 1, 2026, 12:00 a.m. to 11:59 p.m.         (New York)
 *   Year end         Dec 26, 2026, 12:00 a.m. to Dec 31, 11:59 p.m. (New York)
 *
 * Built on the same idea as the retired governor guide promo: self contained,
 * dated inside the file, and inert outside its window, so a forgotten deploy
 * never leaves a stale ask up. Both templates load it (site-template.js on the
 * static pages, the App Router layout on ported pages) and it slots the banner
 * directly under the sticky nav, which both templates render as `.ohp-nav`.
 * Styles live in /css/site-template.css next to the archive banner's.
 *
 * Ohio is on Eastern Standard Time all of December, so the windows are written
 * with a fixed -05:00 offset rather than a time zone lookup the oldest
 * browsers lack. The offsets are checked by tests/season-banners.test.mjs.
 *
 * Dismissal is per browser session (sessionStorage): a visitor who closes it
 * is left alone until they next open the site, when the ask is new again.
 *
 * The window is enforced while a page stays open, too. On App Router pages
 * the script runs once and the layout persists across client navigation, so
 * a check made only at load would leave "Today is Giving Tuesday" up on
 * December 2 in a tab opened the night before. A shown banner schedules its
 * own removal at the end of its window, and a page opened shortly before a
 * window schedules the check for when it opens.
 * ========================================================================== */

(function () {
  'use strict';

  var ACTBLUE = 'https://secure.actblue.com/donate/ohio-pride-pac';

  var BANNERS = [
    {
      id: 'givingtuesday-2026',
      start: '2026-12-01T00:00:00-05:00',
      end: '2026-12-01T23:59:59.999-05:00',
      text: "Today is Giving Tuesday. Help us back Ohio's next pro-equality leaders.",
      button: 'Give today',
      href: ACTBLUE + '?refcode=website_givingtuesday_2026',
    },
    {
      id: 'yearend-2026',
      start: '2026-12-26T00:00:00-05:00',
      end: '2026-12-31T23:59:59.999-05:00',
      text: 'Close out 2026 with us. Give before midnight on December 31.',
      button: 'Give now',
      href: ACTBLUE + '?refcode=website_yearend_2026',
    },
  ];

  // Never stack an ask on top of a page where somebody is already giving or
  // part way through a form, or on an internal surface. Matched as prefixes.
  var SKIP_PREFIXES = ['/donate', '/admin', '/board-retreat', '/endorsement/screening'];

  // setTimeout fires immediately for delays over 2^31 - 1 ms (about 24.8
  // days), so a check further out than this is simply not scheduled.
  var MAX_TIMER_MS = 2147483647;

  /** The next banner to open strictly after `now`, or null. */
  function nextBanner(now) {
    var t = now.getTime();
    var best = null;
    for (var i = 0; i < BANNERS.length; i++) {
      var start = new Date(BANNERS[i].start).getTime();
      if (isFinite(start) && start > t && (!best || start < new Date(best.start).getTime())) {
        best = BANNERS[i];
      }
    }
    return best;
  }

  /** The banner whose window contains `now` (a Date), or null. */
  function activeBanner(now) {
    var t = now.getTime();
    for (var i = 0; i < BANNERS.length; i++) {
      var b = BANNERS[i];
      var start = new Date(b.start).getTime();
      var end = new Date(b.end).getTime();
      if (isFinite(start) && isFinite(end) && t >= start && t <= end) return b;
    }
    return null;
  }

  function storageKey(banner) {
    return 'ohp-banner-' + banner.id;
  }

  function dismissed(banner) {
    try {
      return window.sessionStorage.getItem(storageKey(banner)) === 'dismissed';
    } catch (e) {
      // Blocked storage: showing on every page is worse than not showing.
      return true;
    }
  }

  function remember(banner) {
    try {
      window.sessionStorage.setItem(storageKey(banner), 'dismissed');
    } catch (e) {
      /* nothing to do, and nothing that should break the page */
    }
  }

  function onSkippedPage() {
    var path = (window.location.pathname.replace(/\/+$/, '') || '/').toLowerCase();
    for (var i = 0; i < SKIP_PREFIXES.length; i++) {
      var p = SKIP_PREFIXES[i].toLowerCase();
      if (path === p || path.indexOf(p + '/') === 0) return true;
    }
    return false;
  }

  function build(banner) {
    var el = document.createElement('div');
    el.className = 'ohp-banner ohp-banner--promo';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Fundraising');
    el.setAttribute('data-banner', banner.id);
    el.innerHTML = [
      '<div class="ohp-banner-inner">',
      '  <span class="ohp-banner-text"></span>',
      '  <a class="ohp-banner-cta" target="_blank" rel="noopener"></a>',
      '  <button type="button" class="ohp-banner-close" aria-label="Dismiss">&times;</button>',
      '</div>',
    ].join('');
    el.querySelector('.ohp-banner-text').textContent = banner.text;
    var cta = el.querySelector('.ohp-banner-cta');
    cta.textContent = banner.button;
    cta.setAttribute('href', banner.href);
    el.querySelector('.ohp-banner-close').addEventListener('click', function () {
      remember(banner);
      // The button being removed has focus. Hand focus to the page content so
      // a keyboard or screen reader user is not thrown back to the top.
      var main = document.getElementById('main');
      if (main) {
        if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
        main.focus({ preventScroll: true });
      }
      remove(el);
    });
    return el;
  }

  function remove(el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function show(banner) {
    if (document.querySelector('.ohp-banner--promo')) return;
    var el = build(banner);
    // Under the archive banner if there is one, otherwise right under the nav;
    // on a page with neither, after the skip link so it stays the first stop.
    var anchor = document.querySelector('.ohp-banner--archive') ||
      document.querySelector('.ohp-nav') ||
      document.querySelector('.ohp-skip-link');
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(el, anchor.nextSibling);
    } else {
      document.body.insertBefore(el, document.body.firstChild);
    }
    // Take it down at the end of its window, then look for the next one.
    var left = new Date(banner.end).getTime() - Date.now() + 1;
    if (left > 0 && left <= MAX_TIMER_MS) {
      window.setTimeout(function () {
        remove(el);
        start();
      }, left);
    }
  }

  function start() {
    var now = new Date();
    var banner = activeBanner(now);
    if (banner && !dismissed(banner) && !onSkippedPage()) {
      show(banner);
      return;
    }
    // Nothing to show now. If a window opens while this page could still be
    // open, check again the moment it does.
    var next = nextBanner(now);
    if (!next) return;
    var wait = new Date(next.start).getTime() - now.getTime() + 1;
    if (wait > 0 && wait <= MAX_TIMER_MS) window.setTimeout(start, wait);
  }

  // Exposed for tests and for checking a window by hand from the console:
  // OhioPride.seasonBanners.activeBanner(new Date('2026-12-01T12:00:00-05:00'))
  window.OhioPride = window.OhioPride || {};
  window.OhioPride.seasonBanners = { BANNERS: BANNERS, activeBanner: activeBanner, nextBanner: nextBanner };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
