/* ==========================================================================
   pride-events.js
   Powers /pride: a rock-band-style tour-date list, informational only.

   Only events the PAC has confirmed it is attending (pac_attending) are
   shown. New stops appear here once an admin marks attendance in
   /admin/pride. No filters, no map, no per-event signup CTAs: signup is
   region-based and lives on /pride/signup.

   Data: GET /.netlify/functions/pride-events
         -> { ok, events: [...] }

   Brand rules honored: solid navy/cyan/white only, pride gradient as a
   thin accent bar only, no em or en dashes in copy.
   ========================================================================== */

(function () {
  'use strict';

  var ENDPOINT = '/.netlify/functions/pride-events';
  var SIGNUP_URL = '/pride/signup';
  var TZ = 'America/New_York';

  function parseEventDate(iso) {
    var p = String(iso).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function monthAbbr(iso) {
    return parseEventDate(iso)
      .toLocaleDateString('en-US', { month: 'short' })
      .toUpperCase();
  }

  function dayNum(iso) {
    return parseEventDate(iso).toLocaleDateString('en-US', { day: 'numeric' });
  }

  function weekdayName(iso) {
    return parseEventDate(iso).toLocaleDateString('en-US', { weekday: 'long' });
  }

  function formatTimeRange(ev) {
    if (!ev.time_confirmed || !ev.start_time_utc) return 'Time TBD';
    var opts = { hour: 'numeric', minute: '2-digit', timeZone: TZ };
    var s = new Date(ev.start_time_utc).toLocaleTimeString('en-US', opts);
    if (!ev.end_time_utc) return s;
    var e = new Date(ev.end_time_utc).toLocaleTimeString('en-US', opts);
    return s + ' to ' + e;
  }

  var EVENT_TYPE_LABEL = {
    parade: 'Parade', march: 'March', festival: 'Festival',
    parade_and_festival: 'Parade + Festival', rally: 'Rally', mixer: 'Mixer',
    kickoff: 'Kickoff', fundraiser: 'Fundraiser', '5k': '5K',
    interfaith: 'Interfaith', community: 'Community', other: 'Event'
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  var ALL = [];

  function tourRowHtml(ev, idx) {
    var id = 'pe-' + idx;
    var typeLabel = EVENT_TYPE_LABEL[ev.event_type] || 'Event';

    var subParts = [];
    if (ev.venue) subParts.push(esc(ev.venue));
    subParts.push(esc(typeLabel));
    var sub = subParts.join(' &middot; ');

    var pills = [];

    var detail = [];
    if (ev.description) detail.push('<p>' + esc(ev.description) + '</p>');
    if (ev.notes) detail.push('<p>' + esc(ev.notes) + '</p>');
    var meta = [];
    if (ev.address) meta.push('<span>' + esc(ev.address) + '</span>');
    meta.push('<span>' + esc(weekdayName(ev.event_date)) + ', ' +
      esc(formatTimeRange(ev)) + '</span>');
    if (ev.registration_status && ev.registration_status !== 'tbd') {
      meta.push('<span>Registration: ' +
        esc(ev.registration_status.replace('_', ' ')) + '</span>');
    }
    detail.push('<div class="pride-event-meta">' + meta.join('') + '</div>');
    if (ev.organizer_url) {
      detail.push('<p><a href="' + esc(ev.organizer_url) +
        '" target="_blank" rel="noopener noreferrer">' +
        esc(ev.organizer || 'Organizer site') + '</a></p>');
    }

    return '' +
      '<div class="pride-tourdate">' +
        '<button type="button" class="pride-td-main" aria-expanded="false" ' +
          'aria-controls="' + id + '">' +
          '<span class="pride-td-date">' +
            '<span class="pride-td-month">' + esc(monthAbbr(ev.event_date)) + '</span>' +
            '<span class="pride-td-day">' + esc(dayNum(ev.event_date)) + '</span>' +
          '</span>' +
          '<span class="pride-td-info">' +
            '<span class="pride-td-city">' + esc(ev.city) + ', OH</span>' +
            '<span class="pride-td-name">' + esc(ev.name) + '</span>' +
            '<span class="pride-td-sub">' + sub + '</span>' +
          '</span>' +
          '<span class="pride-td-pills">' + pills.join('') + '</span>' +
        '</button>' +
        '<div class="pride-td-detail" id="' + id + '" hidden>' +
          detail.join('') +
        '</div>' +
      '</div>';
  }

  function renderList() {
    var root = document.getElementById('pride-events-root');
    if (!root) return;

    if (!ALL.length) {
      root.innerHTML =
        '<div class="pride-tour-empty">' +
          '<p>Tour dates are being locked in. Check back soon, or sign up ' +
          'now and we will route you to the closest confirmed stop.</p>' +
          '<a class="pride-btn pride-btn--primary" href="' + SIGNUP_URL +
          '">Sign Up to Work Pride</a>' +
        '</div>';
      return;
    }

    var html = ALL.map(function (ev, i) { return tourRowHtml(ev, i); });
    root.innerHTML = html.join('');
    wireRows(root);
  }

  function wireRows(root) {
    root.addEventListener('click', function (e) {
      var btn = e.target.closest('.pride-td-main');
      if (!btn) return;
      var panel = document.getElementById(btn.getAttribute('aria-controls'));
      if (!panel) return;
      var open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      panel.hidden = open;
    });
  }

  function init() {
    fetch(ENDPOINT, { headers: { accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.ok) throw new Error('bad_response');
        ALL = (data.events || []).filter(function (e) {
          return e.pac_attending;
        });
        renderList();
      })
      .catch(function () {
        var root = document.getElementById('pride-events-root');
        if (root) {
          root.innerHTML = '<p class="pride-count">We could not load the ' +
            'tour dates right now. Please refresh, or email zach@ohiopride.org.</p>';
        }
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
