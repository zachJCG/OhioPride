/* =============================================================================
 * /js/bill-data-supabase.js
 * -----------------------------------------------------------------------------
 * Drop-in upgrade for /issues + /issues/<slug> pages: refreshes the global
 * `BILLS` array (defined in /js/bill-data.js) from /.netlify/functions/bills,
 * then re-runs whatever the page set up to render BILLS.
 *
 * Pattern: load /js/bill-data.js (static seed) AND this file. The static seed
 * gets the page rendered on first paint; this file then quietly upgrades the
 * data with the latest from Supabase. If the fetch fails, the static array
 * stays in place (fail open).
 *
 * Required globals: window.BILLS, window.LAST_UPDATED (both exist after
 * bill-data.js runs).
 *
 * The page is expected to expose a callable named one of:
 *   window.OhioPrideRefreshBills()
 *   window.applyFilters()
 * If either exists this script calls it after upgrading BILLS so the
 * filtered render pass uses the new data.
 * ============================================================================= */

(function () {
  'use strict';

  function refreshUI() {
    if (typeof window.OhioPrideRefreshBills === 'function') {
      window.OhioPrideRefreshBills();
    } else if (typeof window.applyFilters === 'function') {
      window.applyFilters();
    }
    // Best-effort: refresh "Last Updated" card on /issues
    if (window.LAST_UPDATED) {
      var dateEl = document.getElementById('lastUpdatedDate');
      var timeEl = document.getElementById('lastUpdatedTime');
      if (dateEl) dateEl.textContent = window.LAST_UPDATED.date;
      if (timeEl) timeEl.textContent = window.LAST_UPDATED.time;
    }
  }

  fetch('/.netlify/functions/bills', {
    credentials: 'omit',
    headers: { accept: 'application/json' },
  })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      if (!data || !data.ok || !Array.isArray(data.bills)) return;

      // Replace the array contents in place so any code holding a reference
      // to the original BILLS still sees the new data.
      if (Array.isArray(window.BILLS)) {
        window.BILLS.length = 0;
        Array.prototype.push.apply(window.BILLS, data.bills);
      } else {
        window.BILLS = data.bills.slice();
      }

      if (data.last_updated) {
        window.LAST_UPDATED = {
          date: data.last_updated.date,
          time: data.last_updated.time,
        };
      }

      refreshUI();
    })
    .catch(function () { /* fail open: static BILLS already rendered */ });
})();
