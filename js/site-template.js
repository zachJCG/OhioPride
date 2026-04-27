/* ==========================================================================
   OHIO PRIDE PAC — Shared Site Header & Footer Template (v2)
   ------------------------------------------------------
   Updated from the Round 0 version to work alongside the Supabase-backed
   leadership table. Two things changed:

   1. The footer's "Leadership" block now carries the attribute
      [data-ohp-directors] [data-ohp-entity="pac"]. The Round 2
      OhioPride.loadSiteLeadership() helper populates this element on page
      load from /.netlify/functions/site-leadership, so officer changes
      propagate site-wide from a single database row.

   2. The "Paid for by" disclaimer at the bottom carries
      [data-ohp-disclaimer] [data-ohp-entity="pac"] for the same reason.
      It starts with a hardcoded fallback string so the disclaimer is
      still legally complete if the JS never runs (e.g. script-blocking
      browser, slow network before first paint).

   The animated Progress-Pride banner continues to live in
   /js/enhancements.js, not here.

   Pages opt in by:
     1. <link rel="stylesheet" href="/css/site-template.css">
     2. <div id="site-header"></div>  and  <div id="site-footer"></div>
     3. <script src="/js/site-template.js" defer></script>
     4. <script src="/js/ohiopride-data.js" defer></script>
        (so the leadership loader is available)
   ========================================================================== */

(function () {
  'use strict';

  // -------------------------------------------------------------------------
  // HEADER (primary nav). Unchanged from v1.
  // -------------------------------------------------------------------------
  var HEADER_HTML = [
    '<nav class="ohp-nav" aria-label="Primary">',
    '  <div class="ohp-nav-inner">',
    '    <a href="/" class="ohp-nav-logo" aria-label="Ohio Pride PAC home">',
    '      <span class="ohp-logo-ohio">Ohio</span>',
    '      <span class="ohp-logo-pride">Pride</span>',
    '      <span class="ohp-logo-pac">PAC</span>',
    '    </a>',
    '    <button class="ohp-menu-toggle" id="ohpMenuToggle" aria-label="Toggle navigation" aria-expanded="false">&#9776;</button>',
    '    <ul class="ohp-nav-links" id="ohpNavLinks">',
    '      <li><a href="/issues">Issues</a></li>',
    '      <li><a href="/scorecard">Scorecard</a></li>',
    '      <li><a href="/about">About</a></li>',
    '      <li><a href="/founding-members">Founding Members</a></li>',
    '      <li><a href="/contact">Contact</a></li>',
    '      <li><a href="/donate" class="ohp-btn-donate">Donate</a></li>',
    '    </ul>',
    '  </div>',
    '</nav>',
  ].join('\n');

  // -------------------------------------------------------------------------
  // FOOTER
  // -------------------------------------------------------------------------
  // The Leadership block and the disclaimer line now carry data-attributes
  // so the Supabase-backed loader can swap their contents. The hardcoded
  // values that remain here are the fallbacks — what visitors see if the
  // leadership fetch fails or runs late.
  //
  // Keep the hardcoded fallback in sync with the seeded values in
  // migration 20260422000000_configuration_tables.sql (site_leadership seed).
  // -------------------------------------------------------------------------
  var FOOTER_HTML = [
    '<footer class="ohp-footer">',
    '  <div class="ohp-footer-inner">',
    '    <div class="ohp-footer-col">',
    '      <h4>Organization</h4>',
    '      <ul>',
    '        <li><a href="/issues">Issues</a></li>',
    '        <li><a href="/scorecard">Scorecard</a></li>',
    '        <li><a href="/about">About</a></li>',
    '        <li><a href="/board">Board</a></li>',
    '        <li><a href="/founding-members">Founding Members</a></li>',
    '        <li><a href="/contact">Contact</a></li>',
    '      </ul>',
    '    </div>',
    '    <div class="ohp-footer-col">',
    '      <h4>Get Involved</h4>',
    '      <ul>',
    '        <li><a href="/donate">Donate</a></li>',
    '        <li><a href="/donate/founding-member">Founding Membership</a></li>',
    '        <li><a href="/launch-day">Launch Day RSVP</a></li>',
    '        <li><a href="/connect">Volunteer</a></li>',
    '      </ul>',
    '    </div>',
    '    <div class="ohp-footer-col">',
    '      <h4>Connect with Us</h4>',
    '      <ul>',
    '        <li><a href="/connect#schedule">Schedule a Call</a></li>',
    '        <li><a href="/connect#message">Send a Message</a></li>',
    '        <li><a href="mailto:press@ohiopride.org">Press Inquiries</a></li>',
    '      </ul>',
    '    </div>',
    '    <div class="ohp-footer-col">',
    '      <h4>Legal</h4>',
    '      <ul>',
    '        <li><a href="/privacy">Privacy Policy</a></li>',
    '        <li><a href="/terms">Terms of Use</a></li>',
    '      </ul>',
    '    </div>',
    '    <div class="ohp-footer-col">',
    '      <h4>Leadership</h4>',
    '      <div class="ohp-directors" data-ohp-directors data-ohp-entity="pac">',
    // Hardcoded fallback (matches site_leadership seed). The loader replaces
    // this innerHTML on page load with the current database values.
    '        <strong>Director:</strong> Zachary R. Joseph<br>',
    '        <strong>Treasurer:</strong> David Donofrio',
    '      </div>',
    '    </div>',
    '  </div>',
    '  <div class="ohp-footer-bottom">',
    '    <div>&copy; 2026 Ohio Pride PAC. All rights reserved.</div>',
    '    <div class="ohp-disclaimer" data-ohp-disclaimer data-ohp-entity="pac">',
    // Hardcoded fallback. Must be a legally complete disclaimer on its own.
    '      Paid for by Ohio Pride PAC. Not authorized by any candidate or candidate\'s committee.',
    '    </div>',
    '  </div>',
    '</footer>',
  ].join('\n');

  // -------------------------------------------------------------------------
  // Injection + behavior wiring. Unchanged from v1 except for the call to
  // loadSiteLeadership at the end, which populates the two data-attributed
  // elements above from Supabase.
  // -------------------------------------------------------------------------
  function injectInto(id, html) {
    var target = document.getElementById(id);
    if (!target) return;
    target.outerHTML = html;
  }

  function markActiveLink() {
    var links = document.querySelectorAll('.ohp-nav-links a');
    if (!links.length) return;
    var path = window.location.pathname.replace(/\/+$/, '') || '/';
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute('href');
      if (!href) continue;
      var normalized = href.replace(/\/+$/, '') || '/';
      if (
        normalized === path ||
        (normalized !== '/' && path.indexOf(normalized + '/') === 0)
      ) {
        links[i].classList.add('active');
      }
    }
  }

  function wireMenuToggle() {
    var toggle = document.getElementById('ohpMenuToggle');
    var links = document.getElementById('ohpNavLinks');
    if (!toggle || !links) return;

    toggle.addEventListener('click', function () {
      var isOpen = links.classList.toggle('active');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    links.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        links.classList.remove('active');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  function render() {
    injectInto('site-header', HEADER_HTML);
    injectInto('site-footer', FOOTER_HTML);
    markActiveLink();
    wireMenuToggle();

    // Populate the leadership-driven parts of the footer if the data helper
    // is available. Guard with a typeof check so pages that forget to load
    // ohiopride-data.js do not error — they just keep the hardcoded
    // fallback text.
    if (typeof window.OhioPride !== 'undefined' &&
        typeof window.OhioPride.loadSiteLeadership === 'function') {
      window.OhioPride.loadSiteLeadership({ entity: 'pac' });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
