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
          var hasBio = bioParagraphs.length > 0;

          // Toggle button only renders when there is a bio to show. The
          // bio wrapper uses an inner `.board-card-bio-inner` grid child
          // so `grid-template-rows: 0fr → 1fr` can animate against the
          // natural content height.
          var toggleHtml = hasBio
            ? (
                '<button type="button" class="board-card-toggle" aria-expanded="false" aria-controls="' + bioId + '">' +
                  '<span class="toggle-label">Read bio</span>' +
                  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>' +
                '</button>'
              )
            : '';

          var bioBlockHtml = hasBio
            ? (
                '<div class="board-card-bio" id="' + bioId + '">' +
                  '<div class="board-card-bio-inner">' + bioHtml + '</div>' +
                '</div>'
              )
            : '';

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
            toggleHtml +
            bioBlockHtml;

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
          // Round 3: tier-legend cards become ActBlue links when actblue_url
          // is provided so the founding-members page is one tap from giving.
          // Falls back to a non-clickable div if the URL is missing.
          if (t.actblue_url) {
            return (
              '<a class="tier-legend-card tier-legend-card-link" ' +
                'href="' + escapeAttr(t.actblue_url) + '" ' +
                'data-slug="' + escapeAttr(t.slug) + '" ' +
                'data-actblue-tier="' + escapeAttr(t.slug) + '" ' +
                'rel="noopener">' +
                '<div class="tier-name">' + escapeHtml(t.name) + '</div>' +
                '<div class="tier-price">' + escapeHtml(t.amount_display) + '</div>' +
                '<div class="tier-cta">Donate via ActBlue &rarr;</div>' +
              '</a>'
            );
          }
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
  // Expose on window under a single namespace
  // -----------------------------------------------------------------------
  window.OhioPride = window.OhioPride || {};
  window.OhioPride.loadProgress             = loadProgress;
  window.OhioPride.loadBoard                = loadBoard;
  window.OhioPride.loadFoundingMemberTiers  = loadFoundingMemberTiers;
  window.OhioPride.loadPublicMembers        = loadPublicMembers;
  window.OhioPride.loadSiteLeadership       = loadSiteLeadership;
  window.OhioPride.loadDonatePageTiers      = loadDonatePageTiers;
})();
