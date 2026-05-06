/* =============================================================================
 * /js/scorecard-data-supabase.js
 * -----------------------------------------------------------------------------
 * Drop-in upgrade for /scorecard. Refreshes HOUSE_MEMBERS + SENATE_MEMBERS +
 * SCORECARD_UPDATED from /.netlify/functions/scorecard, then re-runs the
 * page renderer. Falls back silently if the fetch fails.
 *
 * Load order on /scorecard.html:
 *   <script src="/js/bill-data.js"></script>
 *   <script src="/js/scorecard-data.js"></script>
 *   <script src="/js/voting-records.js"></script>
 *   <script src="/js/scorecard-data-supabase.js"></script>   <!-- new -->
 *   <script src="/js/bill-data-supabase.js"></script>        <!-- new -->
 *   <script>...page render code...</script>
 * ============================================================================= */

(function () {
  'use strict';

  function refreshUI() {
    if (typeof window.OhioPrideRefreshScorecard === 'function') {
      window.OhioPrideRefreshScorecard();
    } else if (typeof window.applyFilters === 'function') {
      window.applyFilters();
    } else if (typeof window.renderAll === 'function') {
      window.renderAll();
    }
  }

  fetch('/.netlify/functions/scorecard', {
    credentials: 'omit',
    headers: { accept: 'application/json' },
  })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      if (!data || !data.ok || !Array.isArray(data.legislators)) return;

      // Re-shape into the { d, name, party, v, s, n, notes } structure that
      // /js/scorecard-data.js exposes via HOUSE_MEMBERS / SENATE_MEMBERS.
      var house  = [];
      var senate = [];
      data.legislators.forEach(function (l) {
        var row = {
          d:        l.district,
          name:     l.full_name,
          party:    l.party,
          v:        l.floor_subscore,         // legacy "v" = floor (Vf)
          vc:       l.committee_subscore,     // newer "vc" = committee (Vc)
          s:        l.sponsorship_subscore,
          n:        0,                        // news subscore retired in v6
          notes:    l.notes || '',
          chamber:  l.chamber,
          counties: l.counties,
          score:    l.composite_score,
          grade:    l.grade,
        };
        if (l.chamber === 'house') house.push(row);
        else if (l.chamber === 'senate') senate.push(row);
      });

      if (Array.isArray(window.HOUSE_MEMBERS)) {
        window.HOUSE_MEMBERS.length = 0;
        Array.prototype.push.apply(window.HOUSE_MEMBERS, house);
      } else {
        window.HOUSE_MEMBERS = house;
      }

      if (Array.isArray(window.SENATE_MEMBERS)) {
        window.SENATE_MEMBERS.length = 0;
        Array.prototype.push.apply(window.SENATE_MEMBERS, senate);
      } else {
        window.SENATE_MEMBERS = senate;
      }

      // Sponsorships map: { 'h-1': [{ slug, role }], ... }
      var spons = {};
      data.legislators.forEach(function (l) {
        var key = (l.chamber === 'house' ? 'h-' : 's-') + l.district;
        spons[key] = l.sponsorships || [];
      });
      window.LEGISLATOR_SPONSORSHIPS = spons;

      // Roll calls
      if (Array.isArray(data.roll_calls)) {
        window.ROLL_CALLS = data.roll_calls.slice();
      }
      if (Array.isArray(data.exceptions)) {
        window.LEGISLATOR_VOTE_EXCEPTIONS = data.exceptions.slice();
      }

      // Updated stamp (date + time)
      if (data.last_updated) {
        var d = new Date(data.last_updated);
        window.SCORECARD_UPDATED = {
          date: d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }),
          time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }),
        };
      }

      refreshUI();
    })
    .catch(function () { /* fail open: static data already rendered */ });
})();
