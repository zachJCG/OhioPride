/* =============================================================================
   /admin/admin-responsive.js
   -----------------------------------------------------------------------------
   Progressive enhancement that opts every <table> rendered inside any
   .shell-widget / .shell-section into the mobile card-stack layout defined
   in /admin/admin-responsive.css.

   For each table:
     - sets data-stack-mobile="true" so the CSS picks it up.
     - copies the matching <th> text into a data-label on every <td>, so the
       stacked layout shows a column heading above each cell.

   Runs once on DOMContentLoaded, then again whenever a new <table> shows up
   (some admin pages render after async data loads). Safe to load on every
   /admin/* page — no-ops on pages with no tables.
   ============================================================================= */
(function () {
  'use strict';

  function enhanceTable(table) {
    if (table.dataset.stackMobile === 'true') return;
    table.dataset.stackMobile = 'true';

    var headers = [];
    var ths = table.querySelectorAll('thead th');
    for (var i = 0; i < ths.length; i++) headers.push(ths[i].textContent.trim());
    if (!headers.length) return; // nothing to label by

    var rows = table.querySelectorAll('tbody tr');
    for (var r = 0; r < rows.length; r++) {
      var tds = rows[r].children;
      for (var c = 0; c < tds.length && c < headers.length; c++) {
        if (!tds[c].hasAttribute('data-label')) {
          tds[c].setAttribute('data-label', headers[c]);
        }
      }
    }
  }

  function scanAll() {
    var tables = document.querySelectorAll('.shell-widget table, .shell-section table');
    for (var i = 0; i < tables.length; i++) enhanceTable(tables[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanAll);
  } else {
    scanAll();
  }

  // Re-scan when content gets injected after async loads.
  if (typeof MutationObserver !== 'undefined') {
    var obs = new MutationObserver(function (muts) {
      var needsScan = false;
      for (var i = 0; i < muts.length; i++) {
        for (var j = 0; j < muts[i].addedNodes.length; j++) {
          var n = muts[i].addedNodes[j];
          if (n.nodeType !== 1) continue;
          if (n.tagName === 'TABLE' || (n.querySelector && n.querySelector('table'))) {
            needsScan = true; break;
          }
        }
        if (needsScan) break;
      }
      if (needsScan) scanAll();
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }
})();
