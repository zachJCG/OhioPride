/* ==========================================================================
   OHIO PRIDE PAC — Shared Site Header & Footer Template
   ------------------------------------------------------
   This file is the single source of truth for the site-wide nav and
   footer. To update navigation links, footer columns, or leadership
   listings across the ENTIRE site, edit the HTML constants below — every
   page that includes this script will pick up the change automatically.

   The animated Progress-Pride banner that sits immediately below the nav
   is owned by /js/enhancements.js, not this file.

   Pages opt in by:
     1. Linking the stylesheet:
          <link rel="stylesheet" href="/css/site-template.css">
     2. Adding placeholder elements where the header and footer should go:
          <div id="site-header"></div>
          ... page content ...
          <div id="site-footer"></div>
     3. Including this script (defer is fine):
          <script src="/js/site-template.js" defer></script>
   ========================================================================== */

(function () {
  'use strict';

  // -------------------------------------------------------------------------
  // HEADER (primary nav)
  // The animated pride-flag banner is injected by /js/enhancements.js and
  // positioned immediately BELOW the nav, so we do not render one here.
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
    '      <li><a href="/about">About</a></li>',
    '      <li><a href="/founding-members">Founding Members</a></li>',
    '      <li><a href="/contact">Contact</a></li>',
    '      <li><a href="/donate" class="ohp-btn-donate">Donate</a></li>',
    '    </ul>',
    '  </div>',
    '</nav>'
  ].join('\n');

  // -------------------------------------------------------------------------
  // FOOTER (columns, legal, leadership, disclaimers)
  // -------------------------------------------------------------------------
  var FOOTER_HTML = [
    '<footer class="ohp-footer">',
    '  <div class="ohp-footer-inner">',
    '    <div class="ohp-footer-col">',
    '      <h4>Organization</h4>',
    '      <ul>',
    '        <li><a href="/issues">Issues</a></li>',
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
    '        <li><a href="/contact">Volunteer</a></li>',
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
    '      <div class="ohp-directors">',
    '        <strong>Director:</strong> Zachary R. Joseph<br>',
    '        <strong>Treasurer:</strong> David Donofrio',
    '      </div>',
    '    </div>',
    '  </div>',
    '  <div class="ohp-footer-bottom">',
    '    <div>&copy; 2026 Ohio Pride PAC. All rights reserved.</div>',
    '    <div class="ohp-disclaimer">Paid for by Ohio Pride PAC. Not authorized by any candidate or candidate\'s committee.</div>',
    '  </div>',
    '</footer>'
  ].join('\n');

  // -------------------------------------------------------------------------
  // Injection + behavior wiring
  // -------------------------------------------------------------------------
  // We replace the placeholder element entirely (outerHTML) rather than
  // populating it with innerHTML. If the placeholder stays in the tree as a
  // short-height wrapper, it becomes the containing block for the sticky
  // <nav> inside it — and the nav unsticks as soon as that wrapper scrolls
  // out of view. Replacing the placeholder makes the <nav> a direct child of
  // <body>, so sticky positioning works for the full length of the page.
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
