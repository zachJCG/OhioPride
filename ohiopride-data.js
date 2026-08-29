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
        grid.innerHTML = '';

        data.members.forEach(function (m, i) {
          var card = document.createElement('article');
          card.className = 'board-card reveal';
          card.style.transitionDelay = (Math.min(i, 6) * 0.05) + 's';

          var chipHtml = '';
          if (m.chip && chipLabelByClass[m.chip]) {
            chipHtml = '<span class="board-card-chip ' + m.chip + '">' +
                       chipLabelByClass[m.chip] + '</span>';
          }

          var bioParagraphs = Array.isArray(m.bio) ? m.bio : [];
          var bioHtml = bioParagraphs
            .map(function (p) { return '<p>' + escapeHtml(p) + '</p>'; })
            .join('');

          card.innerHTML =
            '<div class="board-card-photo">' +
              (m.img_path
                ? '<img src="' + escapeAttr(m.img_path) + '" alt="' + escapeAttr(m.name) + '" loading="lazy">'
                : '<div class="board-card-photo-placeholder" aria-hidden="true"></div>') +
            '</div>' +
            '<div class="board-card-body">' +
              chipHtml +
              '<h3 class="board-card-name">' + escapeHtml(m.name) + '</h3>' +
              '<p class="board-card-role">' + escapeHtml(m.role || 'Board Member') + '</p>' +
              '<div class="board-card-bio">' + bioHtml + '</div>' +
            '</div>';

          grid.appendChild(card);
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
  // Expose on window under a single namespace
  // -----------------------------------------------------------------------
  window.OhioPride = window.OhioPride || {};
  window.OhioPride.loadProgress             = loadProgress;
  window.OhioPride.loadBoard                = loadBoard;
  window.OhioPride.loadFoundingMemberTiers  = loadFoundingMemberTiers;
  window.OhioPride.loadPublicMembers        = loadPublicMembers;
  window.OhioPride.loadSiteLeadership       = loadSiteLeadership;
})();
