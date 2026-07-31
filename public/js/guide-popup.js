/* =============================================================================
 * guide-popup.js — two day promotion for /governor-guide.
 * -----------------------------------------------------------------------------
 * A temporary campaign asset. It is deliberately self contained (its own
 * markup, its own styles, no dependencies) so that removing it is deleting
 * this file and the two lines that load it.
 *
 * It expires on its own. After CAMPAIGN_END passes the script returns before
 * touching the DOM, so a forgotten deploy does not leave a stale popup running
 * against visitors. Nothing has to be cleaned up on a deadline.
 *
 * Behaviour:
 *   - waits SHOW_DELAY_MS so it never lands on top of a page still painting
 *   - shows once per visitor: any dismissal is remembered for the whole
 *     campaign, because two days is too short to be worth asking twice
 *   - never shows on the pages listed in SKIP_PREFIXES, which are either the
 *     guide itself or a page where somebody is part way through a task
 *   - is a real dialog: labelled, focus trapped, Escape closes, focus returns
 *     to wherever it was
 * ========================================================================== */

(function () {
  'use strict';

  // Ohio is on EDT in July and August, so this is local end of day. Set to run
  // the weekend out: it goes live Friday July 31 and stops after Sunday
  // August 2. Moving this date is the only thing needed to extend or end the
  // run early; nothing else reads it.
  var CAMPAIGN_END = '2026-08-02T23:59:59-04:00';
  var SHOW_DELAY_MS = 5000;
  var STORAGE_KEY = 'ohp-guide-popup-v1';

  // Never interrupt the guide it is advertising, an internal surface, or
  // somebody filling in a form. Matched as path prefixes.
  var SKIP_PREFIXES = [
    '/governor-guide',
    '/admin',
    '/board-retreat',
    '/PRTraining',
    '/donate',
    '/volunteer',
    '/signup',
    '/endorsement',
    '/connect',
    '/contact',
    '/launch-day',
    '/pride/signup',
  ];

  function campaignOver() {
    var end = new Date(CAMPAIGN_END).getTime();
    return !isFinite(end) || Date.now() > end;
  }

  function alreadyDismissed() {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === 'dismissed';
    } catch (e) {
      // Private mode or blocked storage. Showing once per page load is worse
      // than not showing at all, so treat it as dismissed.
      return true;
    }
  }

  function remember() {
    try {
      window.localStorage.setItem(STORAGE_KEY, 'dismissed');
    } catch (e) {
      /* nothing we can do, and nothing that should break the page */
    }
  }

  function onSkippedPage() {
    var path = window.location.pathname.replace(/\/+$/, '') || '/';
    for (var i = 0; i < SKIP_PREFIXES.length; i++) {
      var p = SKIP_PREFIXES[i];
      if (path === p || path.toLowerCase().indexOf(p.toLowerCase() + '/') === 0) return true;
      if (path.toLowerCase() === p.toLowerCase()) return true;
    }
    return false;
  }

  var STYLES = [
    '.ohp-gp-backdrop{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;',
    'justify-content:center;padding:20px;background:rgba(8,16,26,.72);opacity:0;',
    'transition:opacity .25s ease}',
    '.ohp-gp-backdrop.is-open{opacity:1}',
    '.ohp-gp{position:relative;width:100%;max-width:460px;border-radius:16px;overflow:hidden;',
    'background:var(--brand-navy,#152233);border:1px solid rgba(255,255,255,.14);',
    'box-shadow:0 24px 60px rgba(0,0,0,.5);transform:translateY(12px);',
    'transition:transform .25s ease;font-family:"Roboto Slab",Georgia,serif}',
    '.ohp-gp-backdrop.is-open .ohp-gp{transform:none}',
    '.ohp-gp__rule{height:5px;background:var(--brand-pride-gradient-h,linear-gradient(90deg,',
    '#e40303 0%,#ffbc00 20%,#ffed00 40%,#008026 60%,#004dff 80%,#750787 100%))}',
    '.ohp-gp__body{padding:26px 26px 22px}',
    '.ohp-gp__eyebrow{font-family:Montserrat,system-ui,sans-serif;font-weight:700;font-size:11px;',
    'letter-spacing:.18em;text-transform:uppercase;color:var(--brand-light-blue,#70D6EC);margin:0 0 10px}',
    '.ohp-gp__title{font-family:Montserrat,system-ui,sans-serif;font-weight:800;font-size:22px;',
    'line-height:1.2;color:#fff;margin:0 0 10px}',
    '.ohp-gp__text{font-size:14.5px;line-height:1.65;color:rgba(255,255,255,.78);margin:0 0 18px}',
    '.ohp-gp__actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center}',
    '.ohp-gp__cta{display:inline-block;font-family:Montserrat,system-ui,sans-serif;font-weight:800;',
    'font-size:14px;padding:11px 18px;border-radius:999px;text-decoration:none;',
    'background:var(--brand-light-blue,#70D6EC);color:var(--brand-navy-footer,#0d1726)}',
    '.ohp-gp__cta:hover{filter:brightness(1.07)}',
    '.ohp-gp__later{margin-left:auto;background:none;border:0;cursor:pointer;',
    'font-family:Montserrat,system-ui,sans-serif;font-size:12.5px;color:rgba(255,255,255,.55)}',
    '.ohp-gp__later:hover{color:#fff}',
    '.ohp-gp__close{position:absolute;top:12px;right:12px;width:32px;height:32px;border-radius:50%;',
    'border:0;cursor:pointer;background:rgba(255,255,255,.1);color:#fff;font-size:17px;line-height:1}',
    '.ohp-gp__close:hover{background:rgba(255,255,255,.2)}',
    '.ohp-gp :focus-visible{outline:2px solid var(--brand-light-blue,#70D6EC);outline-offset:2px}',
    '@media (max-width:420px){.ohp-gp__body{padding:22px 18px 18px}.ohp-gp__title{font-size:20px}}',
    '@media (prefers-reduced-motion:reduce){.ohp-gp-backdrop,.ohp-gp{transition:none}}',
  ].join('');

  function build() {
    var style = document.createElement('style');
    style.textContent = STYLES;
    document.head.appendChild(style);

    var backdrop = document.createElement('div');
    backdrop.className = 'ohp-gp-backdrop';
    backdrop.innerHTML = [
      '<div class="ohp-gp" role="dialog" aria-modal="true" aria-labelledby="ohpGpTitle">',
      '  <div class="ohp-gp__rule" aria-hidden="true"></div>',
      '  <button type="button" class="ohp-gp__close" aria-label="Close">&times;</button>',
      '  <div class="ohp-gp__body">',
      '    <p class="ohp-gp__eyebrow">November 3, 2026</p>',
      '    <h2 class="ohp-gp__title" id="ohpGpTitle">Ohio votes for governor. Know the records.</h2>',
      '    <p class="ohp-gp__text">',
      '      We put the candidates side by side on the issues that decide daily life',
      '      for LGBTQ+ Ohioans. Every line dated, sourced, and linked. No grades,',
      '      no endorsement, and where a candidate has said nothing, we say so.',
      '    </p>',
      '    <div class="ohp-gp__actions">',
      '      <a class="ohp-gp__cta" href="/governor-guide">Read the Governor Guide</a>',
      '      <button type="button" class="ohp-gp__later">Not now</button>',
      '    </div>',
      '  </div>',
      '</div>',
    ].join('\n');

    return backdrop;
  }

  function show() {
    if (document.querySelector('.ohp-gp-backdrop')) return;

    var backdrop = build();
    var previouslyFocused = document.activeElement;
    document.body.appendChild(backdrop);

    var dialog = backdrop.querySelector('.ohp-gp');
    var closeBtn = backdrop.querySelector('.ohp-gp__close');

    function close() {
      remember();
      document.removeEventListener('keydown', onKeydown, true);
      backdrop.classList.remove('is-open');
      window.setTimeout(function () {
        if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
          previouslyFocused.focus();
        }
      }, 250);
    }

    function focusables() {
      return dialog.querySelectorAll('a[href], button:not([disabled])');
    }

    function onKeydown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== 'Tab') return;
      // Keep tabbing inside the dialog while it is open.
      var items = focusables();
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    closeBtn.addEventListener('click', close);
    backdrop.querySelector('.ohp-gp__later').addEventListener('click', close);
    // Following either link counts as answering the popup, so do not ask again.
    Array.prototype.forEach.call(dialog.querySelectorAll('a[href]'), function (a) {
      a.addEventListener('click', remember);
    });
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) close();
    });
    document.addEventListener('keydown', onKeydown, true);

    // Next frame, so the opening transition actually runs.
    window.requestAnimationFrame(function () {
      backdrop.classList.add('is-open');
      closeBtn.focus();
    });
  }

  function start() {
    if (campaignOver() || alreadyDismissed() || onSkippedPage()) return;
    window.setTimeout(show, SHOW_DELAY_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
