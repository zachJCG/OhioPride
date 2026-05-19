/* ==========================================================================
   pride-events.js
   Powers /pride: chronological events list with filters + an interactive
   SVG map of Ohio with live tour-position markers and a status banner.

   Data: GET /.netlify/functions/pride-events
         -> { ok, events: [...], tour_status: {...}|null }

   Brand rules honored: solid navy/cyan only, no rainbow on type, marker
   colors limited to cyan / navy / outlined-navy. No em dashes in copy.
   ========================================================================== */

(function () {
  'use strict';

  var ENDPOINT = '/.netlify/functions/pride-events';

  // ---- lat/lng -> SVG projection (Section 5.5 of the build plan) ----
  var OHIO_BOUNDS = { minLat: 38.40, maxLat: 41.98, minLng: -84.82, maxLng: -80.52 };
  var VIEWBOX = { w: 800, h: 700, padX: 40, padY: 40 };

  function projectToSvg(lat, lng) {
    var x = VIEWBOX.padX +
      ((lng - OHIO_BOUNDS.minLng) / (OHIO_BOUNDS.maxLng - OHIO_BOUNDS.minLng)) *
      (VIEWBOX.w - 2 * VIEWBOX.padX);
    var y = VIEWBOX.padY +
      (1 - (lat - OHIO_BOUNDS.minLat) / (OHIO_BOUNDS.maxLat - OHIO_BOUNDS.minLat)) *
      (VIEWBOX.h - 2 * VIEWBOX.padY);
    return { x: x, y: y };
  }

  // Ohio perimeter, traced clockwise from the NW corner. Projected through
  // the same helper as the markers so dots sit correctly inside the shape.
  var OHIO_OUTLINE = [
    [41.70, -84.80], [41.70, -83.80], [41.73, -83.45], [41.60, -83.20],
    [41.55, -82.90], [41.50, -82.70], [41.43, -82.30], [41.49, -81.70],
    [41.65, -81.20], [41.85, -80.90], [41.98, -80.52], [41.20, -80.52],
    [40.67, -80.52], [40.37, -80.62], [39.95, -80.70], [39.62, -80.86],
    [39.40, -81.45], [39.10, -81.75], [38.70, -82.20], [38.42, -82.59],
    [38.60, -83.10], [38.78, -83.65], [38.80, -84.20], [39.00, -84.50],
    [39.10, -84.82], [40.30, -84.80], [41.00, -84.80], [41.70, -84.80]
  ];

  // ---- date / time helpers (render in America/New_York) ----
  var TZ = 'America/New_York';

  function parseEventDate(iso) {
    // iso = 'YYYY-MM-DD'. Build a local date so there is no tz shift.
    var p = String(iso).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function formatGroupHeader(iso) {
    return parseEventDate(iso).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
  }

  function formatTimeRange(startIso, endIso) {
    if (!startIso) return 'Time TBD';
    var opts = { hour: 'numeric', minute: '2-digit', timeZone: TZ };
    var s = new Date(startIso).toLocaleTimeString('en-US', opts);
    if (!endIso) return s;
    var e = new Date(endIso).toLocaleTimeString('en-US', opts);
    return s + ' to ' + e;
  }

  function todayIsoInTz() {
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
    return parts; // en-CA gives YYYY-MM-DD
  }

  var EVENT_TYPE_LABEL = {
    parade: 'Parade', march: 'March', festival: 'Festival',
    parade_and_festival: 'Parade + Festival', rally: 'Rally', mixer: 'Mixer',
    kickoff: 'Kickoff', fundraiser: 'Fundraiser', '5k': '5K',
    interfaith: 'Interfaith', community: 'Community', other: 'Event'
  };
  var REGION_LABEL = {
    NE: 'NE', NW: 'NW', SE: 'SE', SW: 'SW', Central: 'Central'
  };
  var MONTHS = [
    { n: 4, label: 'May' }, { n: 5, label: 'June' }, { n: 6, label: 'July' },
    { n: 7, label: 'August' }, { n: 8, label: 'September' }, { n: 9, label: 'October' }
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ---- state ----
  var ALL = [];
  var STATUS = null;
  var TODAY = todayIsoInTz();
  var filters = {
    regions: { NE: true, NW: true, SE: true, SW: true, Central: true },
    months: { 4: true, 5: true, 6: true, 7: true, 8: true, 9: true },
    attendingOnly: false,
    priorityOnly: false
  };

  function passesFilters(ev) {
    if (!filters.regions[ev.region]) return false;
    var m = parseEventDate(ev.event_date).getMonth();
    if (!filters.months[m]) return false;
    if (filters.attendingOnly && !ev.pac_attending) return false;
    if (filters.priorityOnly && !ev.pac_priority) return false;
    return true;
  }

  // ---- events list render ----
  function renderList() {
    var root = document.getElementById('pride-events-root');
    if (!root) return;
    var shown = ALL.filter(passesFilters);

    var html = [];
    html.push(filterBarHtml());
    html.push('<p class="pride-count">Showing ' + shown.length +
      ' of ' + ALL.length + ' events</p>');

    if (!shown.length) {
      html.push('<p class="pride-count">No events match these filters.</p>');
      root.innerHTML = html.join('');
      wireFilterBar();
      return;
    }

    var currentDate = null;
    shown.forEach(function (ev, i) {
      if (ev.event_date !== currentDate) {
        if (currentDate !== null) html.push('</div>');
        currentDate = ev.event_date;
        html.push('<div class="pride-date-group"><h3 class="pride-date-head">' +
          esc(formatGroupHeader(ev.event_date)) + '</h3>');
      }
      html.push(eventRowHtml(ev, i));
    });
    html.push('</div>');
    root.innerHTML = html.join('');
    wireFilterBar();
    wireRows(root);
  }

  function filterBarHtml() {
    var h = ['<div class="pride-filters">'];
    h.push('<div class="pride-filter-group"><span class="pride-filter-label">Region</span>');
    ['NE', 'NW', 'SE', 'SW', 'Central'].forEach(function (r) {
      h.push('<button type="button" class="pride-chip" data-filter="region" data-val="' +
        r + '" aria-pressed="' + filters.regions[r] + '">' + REGION_LABEL[r] + '</button>');
    });
    h.push('</div>');
    h.push('<div class="pride-filter-group"><span class="pride-filter-label">Month</span>');
    MONTHS.forEach(function (m) {
      h.push('<button type="button" class="pride-chip" data-filter="month" data-val="' +
        m.n + '" aria-pressed="' + filters.months[m.n] + '">' + m.label + '</button>');
    });
    h.push('</div>');
    h.push('<div class="pride-filter-group">');
    h.push('<button type="button" class="pride-chip" data-filter="attending" aria-pressed="' +
      filters.attendingOnly + '">We\'re Going</button>');
    h.push('<button type="button" class="pride-chip" data-filter="priority" aria-pressed="' +
      filters.priorityOnly + '">PAC Priority</button>');
    h.push('<button type="button" class="pride-filter-reset" data-filter="reset">Reset</button>');
    h.push('</div></div>');
    return h.join('');
  }

  function eventRowHtml(ev, idx) {
    var id = 'pe-' + idx;
    var pills = ['<span class="pride-pill pride-pill--type">' +
      esc(EVENT_TYPE_LABEL[ev.event_type] || 'Event') + '</span>'];
    if (ev.pac_priority) pills.push('<span class="pride-pill pride-pill--priority">PAC Priority</span>');
    if (ev.pac_attending) pills.push('<span class="pride-pill pride-pill--going">We\'re Going</span>');

    var meta = [];
    if (ev.venue) meta.push('<span>' + esc(ev.venue) + '</span>');
    if (ev.address) meta.push('<span>' + esc(ev.address) + '</span>');
    if (ev.registration_status && ev.registration_status !== 'tbd') {
      meta.push('<span>Registration: ' + esc(ev.registration_status.replace('_', ' ')) + '</span>');
    }

    var detail = [];
    if (ev.description) detail.push('<p>' + esc(ev.description) + '</p>');
    if (ev.notes) detail.push('<p>' + esc(ev.notes) + '</p>');
    if (ev.organizer_url) {
      detail.push('<p><a href="' + esc(ev.organizer_url) +
        '" target="_blank" rel="noopener noreferrer">' +
        esc(ev.organizer || 'Organizer site') + '</a></p>');
    }
    if (meta.length) detail.push('<div class="pride-event-meta">' + meta.join('') + '</div>');

    return '<div class="pride-event">' +
      '<button type="button" class="pride-event-summary" aria-expanded="false" aria-controls="' +
        id + '">' +
        '<span class="pride-event-city">' + esc(ev.city) + '</span>' +
        '<span class="pride-event-name">' + esc(ev.name) + '</span>' +
        pills.join('') +
        '<span class="pride-event-time">' +
          esc(formatTimeRange(ev.start_time_utc, ev.end_time_utc)) + '</span>' +
      '</button>' +
      '<div class="pride-event-detail" id="' + id + '" hidden>' +
        detail.join('') +
      '</div>' +
    '</div>';
  }

  function wireFilterBar() {
    var bar = document.querySelector('.pride-filters');
    if (!bar) return;
    bar.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-filter]');
      if (!btn) return;
      var f = btn.getAttribute('data-filter');
      if (f === 'region') filters.regions[btn.getAttribute('data-val')] = !filters.regions[btn.getAttribute('data-val')];
      else if (f === 'month') filters.months[btn.getAttribute('data-val')] = !filters.months[btn.getAttribute('data-val')];
      else if (f === 'attending') filters.attendingOnly = !filters.attendingOnly;
      else if (f === 'priority') filters.priorityOnly = !filters.priorityOnly;
      else if (f === 'reset') {
        filters.regions = { NE: true, NW: true, SE: true, SW: true, Central: true };
        filters.months = { 4: true, 5: true, 6: true, 7: true, 8: true, 9: true };
        filters.attendingOnly = false;
        filters.priorityOnly = false;
      }
      renderList();
    });
  }

  function wireRows(root) {
    root.addEventListener('click', function (e) {
      var btn = e.target.closest('.pride-event-summary');
      if (!btn) return;
      var panel = document.getElementById(btn.getAttribute('aria-controls'));
      if (!panel) return;
      var open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      panel.hidden = open;
    });
  }

  // ---- marker classification ----
  function markerClass(ev) {
    if (STATUS && STATUS.current_event && STATUS.current_event.slug === ev.slug) {
      return 'current';
    }
    if (!ev.pac_attending) return 'other';
    return ev.event_date < TODAY ? 'past' : 'upcoming';
  }
  var RADIUS = { current: 14, upcoming: 10, past: 8, other: 6 };

  // ---- map render ----
  function renderMap() {
    var root = document.getElementById('pride-map-root');
    if (!root) return;

    var outline = OHIO_OUTLINE.map(function (pt, i) {
      var p = projectToSvg(pt[0], pt[1]);
      return (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1);
    }).join(' ') + ' Z';

    var dots = [];
    var srItems = [];
    ALL.forEach(function (ev, i) {
      var p = projectToSvg(Number(ev.lat), Number(ev.lng));
      var cls = markerClass(ev);
      var label = ev.city + ', ' + ev.name + ', ' +
        formatGroupHeader(ev.event_date) + ', ' +
        (EVENT_TYPE_LABEL[ev.event_type] || 'event');
      dots.push(
        '<circle class="pride-marker pride-marker--' + cls + '" ' +
        'cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" ' +
        'r="' + RADIUS[cls] + '" tabindex="0" role="button" ' +
        'data-idx="' + i + '" aria-label="' + esc(label) + '"></circle>'
      );
      srItems.push('<li>' + esc(label) + '</li>');
    });

    root.innerHTML =
      '<div class="pride-map-figure">' +
        '<svg class="pride-map-svg" viewBox="0 0 ' + VIEWBOX.w + ' ' + VIEWBOX.h + '" ' +
          'role="img" aria-label="Map of Ohio showing Pride event locations">' +
          '<path class="pride-ohio-outline" d="' + outline + '"></path>' +
          dots.join('') +
        '</svg>' +
        '<div class="pride-legend" aria-hidden="true">' +
          '<span><i class="l-current"></i> Where we are now</span>' +
          '<span><i class="l-upcoming"></i> Upcoming stop</span>' +
          '<span><i class="l-past"></i> Already visited</span>' +
          '<span><i class="l-other"></i> Other Pride event</span>' +
        '</div>' +
      '</div>' +
      '<ul class="pride-sr-list">' + srItems.join('') + '</ul>' +
      '<div class="pride-tooltip" id="pride-tooltip" role="status"></div>' +
      '<div class="pride-panel-backdrop" id="pride-panel-backdrop"></div>' +
      '<aside class="pride-panel" id="pride-panel" aria-hidden="true" tabindex="-1">' +
        '<button type="button" class="pride-panel-close" id="pride-panel-close" ' +
          'aria-label="Close event details">&times;</button>' +
        '<div id="pride-panel-body"></div>' +
      '</aside>';

    wireMap(root);
  }

  function wireMap(root) {
    var tip = document.getElementById('pride-tooltip');
    var panel = document.getElementById('pride-panel');
    var backdrop = document.getElementById('pride-panel-backdrop');
    var body = document.getElementById('pride-panel-body');

    function showTip(circle, evt) {
      var ev = ALL[Number(circle.getAttribute('data-idx'))];
      tip.innerHTML = '<strong>' + esc(ev.city) + '</strong>' + esc(ev.name) +
        '<br>' + esc(formatGroupHeader(ev.event_date)) + '<br>' +
        esc(EVENT_TYPE_LABEL[ev.event_type] || 'Event');
      tip.style.display = 'block';
      var x = (evt.clientX || 0) + 14;
      var y = (evt.clientY || 0) + 14;
      tip.style.left = Math.min(x, window.innerWidth - 240) + 'px';
      tip.style.top = y + 'px';
    }
    function hideTip() { tip.style.display = 'none'; }

    function openPanel(circle) {
      var ev = ALL[Number(circle.getAttribute('data-idx'))];
      var rows = [];
      if (ev.venue) rows.push('<p>' + esc(ev.venue) + '</p>');
      if (ev.address) rows.push('<p>' + esc(ev.address) + '</p>');
      rows.push('<p>' + esc(formatGroupHeader(ev.event_date)) + '<br>' +
        esc(formatTimeRange(ev.start_time_utc, ev.end_time_utc)) + '</p>');
      if (ev.description) rows.push('<p>' + esc(ev.description) + '</p>');
      if (ev.organizer_url) {
        rows.push('<p><a href="' + esc(ev.organizer_url) +
          '" target="_blank" rel="noopener noreferrer">' +
          esc(ev.organizer || 'Organizer site') + '</a></p>');
      }
      body.innerHTML = '<span class="pride-panel-city">' + esc(ev.city) + '</span>' +
        '<h3>' + esc(ev.name) + '</h3>' + rows.join('');
      panel.classList.add('open');
      panel.setAttribute('aria-hidden', 'false');
      backdrop.classList.add('open');
      panel.focus();
    }
    function closePanel() {
      panel.classList.remove('open');
      panel.setAttribute('aria-hidden', 'true');
      backdrop.classList.remove('open');
    }

    root.addEventListener('mouseover', function (e) {
      var c = e.target.closest('.pride-marker');
      if (c) showTip(c, e);
    });
    root.addEventListener('mousemove', function (e) {
      var c = e.target.closest('.pride-marker');
      if (c) showTip(c, e);
    });
    root.addEventListener('mouseout', function (e) {
      if (e.target.closest('.pride-marker')) hideTip();
    });
    root.addEventListener('click', function (e) {
      var c = e.target.closest('.pride-marker');
      if (c) openPanel(c);
    });
    root.addEventListener('focusin', function (e) {
      var c = e.target.closest('.pride-marker');
      if (c) {
        var r = c.getBoundingClientRect();
        showTip(c, { clientX: r.left, clientY: r.top });
      }
    });
    root.addEventListener('focusout', hideTip);
    root.addEventListener('keydown', function (e) {
      var c = e.target.closest('.pride-marker');
      if (c && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        openPanel(c);
      }
    });
    document.getElementById('pride-panel-close').addEventListener('click', closePanel);
    backdrop.addEventListener('click', closePanel);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel.classList.contains('open')) closePanel();
    });
  }

  // ---- tour status banner ----
  function renderStatus() {
    var root = document.getElementById('pride-tour-status');
    if (!root || !STATUS) return;
    var h = ['<div class="pride-status">'];
    if (STATUS.current_event) {
      h.push('<p class="pride-status-row"><span class="pride-status-key">We\'re at:</span> ' +
        esc(STATUS.current_event.name) + ', ' + esc(STATUS.current_event.city) + '</p>');
    }
    if (STATUS.next_event) {
      h.push('<p class="pride-status-row"><span class="pride-status-key">Next stop:</span> ' +
        esc(STATUS.next_event.name) + ', ' + esc(STATUS.next_event.city) + ', ' +
        esc(formatGroupHeader(STATUS.next_event.event_date)) + '</p>');
    }
    if (STATUS.status_message) {
      h.push('<p class="pride-status-msg">' + esc(STATUS.status_message) + '</p>');
    }
    h.push('</div>');
    root.innerHTML = h.join('');
  }

  // ---- load ----
  function init() {
    fetch(ENDPOINT, { headers: { accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.ok) throw new Error('bad_response');
        ALL = data.events || [];
        STATUS = data.tour_status || null;
        renderStatus();
        renderList();
        renderMap();
      })
      .catch(function () {
        var root = document.getElementById('pride-events-root');
        if (root) {
          root.innerHTML = '<p class="pride-count">We could not load the ' +
            'calendar right now. Please refresh, or email zach@ohiopride.org.</p>';
        }
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
