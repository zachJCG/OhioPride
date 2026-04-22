/* =============================================================================
 * Ohio Pride PAC — Data Client (consolidated through Round 2)
 * -----------------------------------------------------------------------------
 * Thin client-side helper for fetching dynamic data from Netlify functions
 * that sit in front of Supabase. This single file covers every Supabase-
 * backed surface on the public website as of Round 2:
 *
 *   OhioPride.loadProgress(fillSel, textSel)
 *       Fills the founding-member progress bar and the count label.
 *       Replaces the inline <script> at the bottom of /founding-members.html.
 *
 *   OhioPride.loadBoard(gridSel)
 *       Renders the board grid from Supabase. Replaces the hardcoded
 *       `boardMembers` array in /board.html.
 *
 *   OhioPride.loadFoundingMemberTiers(gridSel)
 *       Renders the five tier-legend cards at the top of /founding-members.
 *       Replaces the hardcoded .tier-legend-card block.
 *
 *   OhioPride.loadPublicMembers(listSel)
 *       Renders the tier-grouped member list at the bottom of
 *       /founding-members (Nicole Green, Zachary Smith, Jesse Shepherd today).
 *
 *   OhioPride.loadSiteLeadership(options)
 *       Fills a disclaimer element with the current officer block. Can be
 *       called from site-template.js so the footer disclaimer is always
 *       current.
 *
 * Design principles (same as Round 1):
 *   - No framework. Just plain fetch + DOM.
 *   - Fail open. If a fetch errors, whatever the server-rendered HTML
 *     already contained stays visible. No broken states on network hiccups.
 *   - Keep animations consistent with the existing IntersectionObserver
 *     patterns elsewhere on the site.
 * ============================================================================= */

(function () {
  'use strict';

  // -----------------------------------------------------------------------
  // Endpoint registry. Every loader reads from here, so if the functions
  // are ever renamed or moved, there is exactly one line to change.
  // -----------------------------------------------------------------------
  var ENDPOINTS = {
    progress:               '/.netlify/functions/founding-members-progress',
    board:                  '/.netlify/functions/board-members',
    foundingMemberTiers:    '/.netlify/functions/founding-member-tiers',
    publicMembers:          '/.netlify/functions/public-members',
    siteLeadership:         '/.netlify/functions/site-leadership',
    bills:                  '/.netlify/functions/bills',
    scorecard:              '/.netlify/functions/scorecard',
  };

  // -----------------------------------------------------------------------
  // Utility helpers
  // -----------------------------------------------------------------------
  function getJson(url) {
    return fetch(url, {
      credentials: 'omit',
      headers: { accept: 'application/json' },
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  var escapeAttr = escapeHtml;

  // -----------------------------------------------------------------------
  // Progress bar (Round 1)
  // -----------------------------------------------------------------------
  function loadProgress(fillSelector, textSelector) {
    var bar  = document.querySelector(fillSelector);
    var text = textSelector ? document.querySelector(textSelector) : null;
    if (!bar) return;

    getJson(ENDPOINTS.progress)
      .then(function (data) {
        if (!data || !data.ok) return;
        var pct = Math.min(data.percent_to_goal, 100);

        var observer = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              bar.style.transition = 'width 1.5s cubic-bezier(0.4, 0, 0.2, 1)';
              bar.style.width = pct + '%';
              observer.unobserve(entry.target);
            }
          });
        }, { threshold: 0.3 });

        observer.observe(bar.parentElement || bar);

        if (text) {
          text.textContent = data.member_count.toLocaleString() +
            ' of ' + data.goal.toLocaleString() + ' Founding Members';
        }
      })
      .catch(function () { /* fail open */ });
  }

  // -----------------------------------------------------------------------
  // Board grid (Round 1)
  // Preserves the live /board layout: avatar with gradient overlay + chip,
  // name-strip marquee above the grid, and expand/collapse bio panels
  // driven by .board-card-toggle.
  // -----------------------------------------------------------------------
  function loadBoard(gridSelector) {
    var grid = document.querySelector(gridSelector);
    if (!grid) return;

    var chipLabelByClass = {
      'is-director':  'Director',
      'is-treasurer': 'Treasurer',
      'is-secretary': 'Secretary',
      'is-comms':     'Comms Director',
    };

    getJson(ENDPOINTS.board)
      .then(function (data) {
        if (!data || !data.ok || !Array.isArray(data.members)) return;
        var members = data.members;

        // Name-strip marquee. Two copies back-to-back produce the seamless loop.
        var strip = document.getElementById('nameStripTrack');
        if (strip) {
          var buildStrip = function () {
            var html = '';
            members.forEach(function (m, i) {
              html += '<span class="name-strip-item">' +
                      escapeHtml(String(m.name).replace(/,.*$/, '')) +
                      '</span>';
              if (i < members.length - 1) {
                html += '<span class="name-strip-item name-strip-dot">◆</span>';
              }
            });
            return html + '<span class="name-strip-item name-strip-dot">◆</span>';
          };
          strip.innerHTML = buildStrip() + buildStrip();
        }

        grid.innerHTML = '';

        members.forEach(function (m, i) {
          var card = document.createElement('article');
          card.className = 'board-card reveal';
          card.style.transitionDelay = (Math.min(i, 6) * 0.05) + 's';

          var chipHtml = '';
          if (m.chip && chipLabelByClass[m.chip]) {
            chipHtml = '<span class="board-card-chip ' + m.chip + '">' +
                       escapeHtml(chipLabelByClass[m.chip]) + '</span>';
          }

          var bioParagraphs = Array.isArray(m.bio) ? m.bio : [];
          var bioHtml = bioParagraphs
            .map(function (p) { return '<p>' + escapeHtml(p) + '</p>'; })
            .join('');
          var bioId = 'bio-' + i;

          card.innerHTML =
            '<div class="board-card-avatar">' +
              '<img src="' + escapeAttr(m.img_path || '') + '" alt="' + escapeAttr(m.name) + '" loading="lazy" onerror="this.style.display=\'none\'">' +
              '<div class="avatar-gradient"></div>' +
              chipHtml +
            '</div>' +
            '<div class="board-card-info">' +
              '<div class="board-card-name">' + escapeHtml(m.name) + '</div>' +
              '<div class="board-card-role">' + escapeHtml(m.role || 'Board Member') + '</div>' +
            '</div>' +
            '<button type="button" class="board-card-toggle" aria-expanded="false" aria-controls="' + bioId + '">' +
              '<span class="toggle-label">Read bio</span>' +
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>' +
            '</button>' +
            '<div class="board-card-bio" id="' + bioId + '">' + bioHtml + '</div>';

          grid.appendChild(card);
        });

        // Toggle bio panels. Delegated so it works for the freshly rendered
        // cards without needing to rebind on every fetch.
        if (!grid.dataset.ohpBoardWired) {
          grid.addEventListener('click', function (e) {
            var btn = e.target.closest('.board-card-toggle');
            if (!btn) return;
            var card = btn.closest('.board-card');
            if (!card) return;
            var label = btn.querySelector('.toggle-label');
            var isOpen = card.classList.toggle('is-open');
            btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            if (label) label.textContent = isOpen ? 'Hide bio' : 'Read bio';
          });
          grid.dataset.ohpBoardWired = '1';
        }

        // Re-run the reveal observer on the new cards so they animate in
        // on scroll, matching the behavior of the pre-Supabase inline script.
        requestAnimationFrame(function () {
          var reveals = grid.querySelectorAll('.reveal');
          if (window.IntersectionObserver) {
            var obs = new IntersectionObserver(function (entries) {
              entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                  entry.target.classList.add('visible');
                  obs.unobserve(entry.target);
                }
              });
            }, { threshold: 0.08 });
            reveals.forEach(function (el) { obs.observe(el); });
          } else {
            reveals.forEach(function (el) { el.classList.add('visible'); });
          }
        });
      })
      .catch(function () { /* fail open */ });
  }

  // -----------------------------------------------------------------------
  // Founding-member tier cards (Round 2)
  // Replaces the five hardcoded .tier-legend-card divs inside .tier-grid on
  // /founding-members.
  // -----------------------------------------------------------------------
  function loadFoundingMemberTiers(gridSelector) {
    var grid = document.querySelector(gridSelector);
    if (!grid) return;

    getJson(ENDPOINTS.foundingMemberTiers)
      .then(function (data) {
        if (!data || !data.ok || !Array.isArray(data.tiers)) return;

        grid.innerHTML = data.tiers.map(function (t) {
          return (
            '<div class="tier-legend-card" data-slug="' + escapeAttr(t.slug) + '">' +
              '<div class="tier-name">' + escapeHtml(t.name) + '</div>' +
              '<div class="tier-price">' + escapeHtml(t.amount_display) + '</div>' +
            '</div>'
          );
        }).join('');
      })
      .catch(function () { /* fail open */ });
  }

  // -----------------------------------------------------------------------
  // Public member list grouped by tier (Round 2)
  // Replaces the hardcoded .tier-group blocks at the bottom of
  // /founding-members.
  // -----------------------------------------------------------------------
  function loadPublicMembers(listSelector) {
    var list = document.querySelector(listSelector);
    if (!list) return;

    getJson(ENDPOINTS.publicMembers)
      .then(function (data) {
        if (!data || !data.ok || !Array.isArray(data.groups)) return;

        // Hide the whole list cleanly when nobody is public yet, rather than
        // rendering a "Public Members" header with nothing under it.
        if (data.groups.length === 0) {
          list.style.display = 'none';
          return;
        }
        list.style.display = '';

        list.innerHTML = data.groups.map(function (group) {
          var rows = group.members.map(function (m) {
            return (
              '<div class="member-row">' +
                '<div class="member-name">' + escapeHtml(m.display_name) + '</div>' +
              '</div>'
            );
          }).join('');

          return (
            '<div class="tier-group">' +
              '<div class="tier-group-header">' +
                '<div class="tier-group-title">' + escapeHtml(group.tier) + '</div>' +
              '</div>' +
              rows +
            '</div>'
          );
        }).join('');
      })
      .catch(function () { /* fail open */ });
  }

  // -----------------------------------------------------------------------
  // Site leadership / footer disclaimer (Round 2)
  //
  // Usage patterns:
  //   OhioPride.loadSiteLeadership();
  //       Fills any element with [data-ohp-disclaimer] with the assembled
  //       disclaimer string, and any [data-ohp-directors] with a
  //       "Director: X / Treasurer: Y" block mirroring the current footer.
  //
  //   OhioPride.loadSiteLeadership({ entity: 'c4' });
  //       Same but for the c(4) entity (Ohio Pride Action).
  // -----------------------------------------------------------------------
  function loadSiteLeadership(options) {
    options = options || {};
    var entity = options.entity || 'pac';

    getJson(ENDPOINTS.siteLeadership + '?entity=' + encodeURIComponent(entity))
      .then(function (data) {
        if (!data || !data.ok) return;

        // Populate the pre-assembled disclaimer wherever an element opts in.
        document.querySelectorAll('[data-ohp-disclaimer]').forEach(function (el) {
          // Respect a filter so a page with multiple disclaimers (PAC footer
          // + c4 footer) can each target their own entity.
          var wantedEntity = el.getAttribute('data-ohp-entity') || 'pac';
          if (wantedEntity === entity) {
            el.textContent = data.disclaimer;
          }
        });

        // Populate a "Director: ... / Treasurer: ..." block if present. This
        // is the markup the current site-template.js emits as ohp-directors.
        document.querySelectorAll('[data-ohp-directors]').forEach(function (el) {
          var wantedEntity = el.getAttribute('data-ohp-entity') || 'pac';
          if (wantedEntity !== entity) return;

          var html = data.officers.map(function (o) {
            return '<strong>' + escapeHtml(o.title) + ':</strong> ' + escapeHtml(o.full_name);
          }).join('<br>');
          el.innerHTML = html;
        });
      })
      .catch(function () { /* fail open */ });
  }

  // -----------------------------------------------------------------------
  // Donate page tier cards (Round 2)
  // Updates the name and amount shown on each /donate/founding-member tier
  // card from Supabase. Marketing copy and ActBlue button URLs stay
  // hardcoded in the HTML because refcode routing is tightly coupled to
  // campaign configuration in ActBlue; we only keep the customer-visible
  // price and name in sync.
  //
  // Expected HTML hook:
  //   <div class="tier-card" data-ohp-tier-slug="stonewall-sustainer">
  //     <div class="tier-card-name"   data-ohp-field="name">...</div>
  //     <div class="tier-card-amount" data-ohp-field="amount-html">...</div>
  //   </div>
  // -----------------------------------------------------------------------
  function formatDonateAmountHtml(tier) {
    var cents    = Number(tier.amount_cents || 0);
    var dollars  = cents / 100;
    var hasCents = cents % 100 !== 0;
    var display  = hasCents
      ? dollars.toFixed(2)
      : dollars.toLocaleString('en-US');
    var plus     = tier.match_mode === 'at_least' ? '+' : '';
    var suffix   = tier.recurrence === 'monthly'
      ? '<span style="font-size: 14px; font-weight: 400">/mo</span>'
      : '';
    return '$' + display + plus + suffix;
  }

  function loadDonatePageTiers(gridSelector) {
    var grid = document.querySelector(gridSelector || '.tiers-grid');
    if (!grid) return;

    getJson(ENDPOINTS.foundingMemberTiers)
      .then(function (data) {
        if (!data || !data.ok || !Array.isArray(data.tiers)) return;

        data.tiers.forEach(function (tier) {
          var card = grid.querySelector('[data-ohp-tier-slug="' + tier.slug + '"]');
          if (!card) return;

          var nameEl = card.querySelector('[data-ohp-field="name"]');
          if (nameEl) nameEl.textContent = tier.name;

          var amountEl = card.querySelector('[data-ohp-field="amount-html"]');
          if (amountEl) amountEl.innerHTML = formatDonateAmountHtml(tier);
        });
      })
      .catch(function () { /* fail open */ });
  }

  // -----------------------------------------------------------------------
  // Issues page (/issues) — Round 3
  //
  // Replaces the BILLS + LAST_UPDATED globals that used to live in
  // js/bill-data.js. Populates the same DOM the old inline script drove, so
  // the existing filter buttons / sort / renderBills path keeps working
  // unchanged.
  // -----------------------------------------------------------------------
  function loadIssuesPage(options) {
    options = options || {};

    getJson(ENDPOINTS.bills)
      .then(function (data) {
        if (!data || !data.ok) return;

        // Expose the payload globally in the exact shape issues.html expects.
        window.BILLS = data.bills || [];
        window.LAST_UPDATED = data.last_updated || { date: '', time: '' };

        // Hero stats (three numbers above the filter bar).
        var statActive    = document.getElementById('statActive');
        var statPassed    = document.getElementById('statPassed');
        var statCommittee = document.getElementById('statCommittee');
        if (statActive)    statActive.textContent    = data.stats.bills_tracked;
        if (statPassed)    statPassed.textContent    = data.stats.passed_a_chamber;
        if (statCommittee) statCommittee.textContent = data.stats.in_committee;

        // "Last Updated" card.
        var dateEl = document.getElementById('lastUpdatedDate');
        var timeEl = document.getElementById('lastUpdatedTime');
        if (dateEl) dateEl.textContent = data.last_updated.date;
        if (timeEl) timeEl.textContent = data.last_updated.time;

        // Trigger the page's own renderers.
        if (typeof window.renderBills === 'function') {
          window.renderBills(window.BILLS);
        }
        if (typeof window.updateStats === 'function') {
          window.updateStats(window.BILLS);
        }

        if (typeof options.onReady === 'function') {
          options.onReady(data);
        }
      })
      .catch(function () { /* fail open — existing HTML stays visible */ });
  }

  // -----------------------------------------------------------------------
  // Scorecard page (/scorecard) — Round 3
  //
  // Replaces the HOUSE_MEMBERS / SENATE_MEMBERS / GRADE_SCALE /
  // SCORECARD_UPDATED globals that used to live in js/scorecard-data.js.
  // -----------------------------------------------------------------------
  function loadScorecardPage(options) {
    options = options || {};

    getJson(ENDPOINTS.scorecard)
      .then(function (data) {
        if (!data || !data.ok) return;

        // Expose globals in the exact shape scorecard.html expects so the
        // existing combine + render + filter path keeps working unchanged.
        window.HOUSE_MEMBERS     = data.house  || [];
        window.SENATE_MEMBERS    = data.senate || [];
        window.GRADE_SCALE       = (data.grade_scale || []).slice().sort(function (a, b) {
          return b.min - a.min; // highest min first, matches the old constant order
        });
        window.SCORECARD_UPDATED = data.last_updated || { date: '', time: '' };

        // calcScore / calcGrade shims. scorecard.html calls these against each
        // member; because the DB already computed score + grade per row we just
        // return the precomputed values rather than re-running the formula.
        window.calcScore = function (m) { return m.score; };
        window.calcGrade = function (score) {
          var scale = window.GRADE_SCALE || [];
          for (var i = 0; i < scale.length; i++) {
            if (score >= scale[i].min) return scale[i];
          }
          return scale[scale.length - 1] || { grade: 'F', label: 'Hostile', color: '#dc2626' };
        };

        // Hero stats on the scorecard header.
        var statTotal    = document.getElementById('stat-total');
        var statChamps   = document.getElementById('stat-champions');
        var statHostile  = document.getElementById('stat-hostile');
        var statBills    = document.getElementById('stat-bills');
        function setStat(el, n) {
          if (!el) return;
          el.textContent = n;
          el.setAttribute('data-count', n);
        }
        setStat(statTotal,   data.stats.legislators_scored);
        setStat(statChamps,  data.stats.champions_a_plus);
        setStat(statHostile, data.stats.hostile_f);
        setStat(statBills,   data.stats.bills_tracked);

        // "Last updated" badge.
        var updated = document.getElementById('updated-text');
        if (updated) {
          updated.textContent = 'Last updated ' + data.last_updated.date +
                                ' at ' + data.last_updated.time;
        }

        // Notify the page that globals are ready. scorecard.html wraps its
        // main render in a DOMContentLoaded handler; by the time this fetch
        // resolves that handler has already run with empty globals. We
        // dispatch a custom event so the page can re-run its render cheaply.
        window.dispatchEvent(new CustomEvent('ohiopride:scorecard-data-ready', {
          detail: data,
        }));

        if (typeof options.onReady === 'function') {
          options.onReady(data);
        }
      })
      .catch(function () { /* fail open */ });
  }

  // -----------------------------------------------------------------------
  // Expose on window under a single namespace
  // -----------------------------------------------------------------------
  window.OhioPride = window.OhioPride || {};
  window.OhioPride.loadProgress             = loadProgress;
  window.OhioPride.loadBoard                = loadBoard;
  window.OhioPride.loadFoundingMemberTiers  = loadFoundingMemberTiers;
  window.OhioPride.loadPublicMembers        = loadPublicMembers;
  window.OhioPride.loadSiteLeadership       = loadSiteLeadership;
  window.OhioPride.loadDonatePageTiers      = loadDonatePageTiers;
  window.OhioPride.loadIssuesPage           = loadIssuesPage;
  window.OhioPride.loadScorecardPage        = loadScorecardPage;
})();
