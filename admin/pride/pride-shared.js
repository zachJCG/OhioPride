/* =========================================================================
   Ohio Pride PAC :: /admin/pride shared helpers
   -------------------------------------------------------------------------
   Exposes window.PrideAdmin with formatting helpers, the Events/Volunteers
   tab bar, and the assignment status mutator. Loaded by both
   /admin/pride/events and /admin/pride/volunteers before their page script.
   ========================================================================= */

(function () {
  'use strict';

  var REGIONS = [
    { value: 'Central', label: 'Central' },
    { value: 'NE', label: 'Northeast' },
    { value: 'NW', label: 'Northwest' },
    { value: 'SE', label: 'Southeast' },
    { value: 'SW', label: 'Southwest' }
  ];

  var EVENT_TYPES = [
    'parade', 'march', 'festival', 'parade_and_festival', 'rally', 'mixer',
    'kickoff', 'fundraiser', '5k', 'interfaith', 'community', 'other'
  ];

  var PAC_ROLES = ['none', 'marching', 'tabling', 'both', 'scouting'];
  var REG_STATUSES = ['tbd', 'open', 'closed', 'late_add', 'passed'];
  var ROLE_OPTIONS = [
    'marcher', 'captain', 'tabler', 'driver', 'photographer',
    'greeter', 'marshal', 'scout', 'other'
  ];
  var ASSIGNMENT_STATUSES = [
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'tentative', label: 'Tentative' },
    { key: 'declined',  label: 'Declined'  },
    { key: 'removed',   label: 'Removed'   }
  ];

  // Who's-going categories. "volunteers" is derived from the event roster
  // (any confirmed/tentative assignment); the rest are pride_events flags.
  // "ed" is the Executive Director ("me") — drives /admin/pride/ED.
  var ATTENDANCE = [
    { key: 'volunteers', label: 'Volunteers', color: '#73D7EE', derived: true },
    { key: 'board',      label: 'Board',      color: '#4ade80', col: 'board_attending' },
    { key: 'staff',      label: 'Staff',      color: '#fb923c', col: 'staff_attending' },
    { key: 'ed',         label: 'ED',         color: '#f472b6', col: 'ed_attending' }
  ];

  // Colored dots for the categories attending an event. `flags` is
  // { volunteers, board, staff, ed } booleans.
  function attendanceDots(flags) {
    flags = flags || {};
    var dots = ATTENDANCE.filter(function (a) { return flags[a.key]; })
      .map(function (a) {
        return '<span class="pride-att-dot" title="' + escAttr(a.label) +
          '" style="background:' + a.color + '"></span>';
      }).join('');
    return dots ? '<span class="pride-att-dots">' + dots + '</span>' : '';
  }

  // Legend chip row for the attendance categories.
  function attendanceLegend() {
    return '<div class="pride-att-legend">' + ATTENDANCE.map(function (a) {
      return '<span class="pride-att-key"><span class="pride-att-dot" style="background:' +
        a.color + '"></span>' + esc(a.label) + '</span>';
    }).join('') + '</div>';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }

  function titleCase(s) {
    return String(s || '').replace(/_/g, ' ').replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });
  }
  function regionLabel(r) {
    var m = { NE: 'Northeast', NW: 'Northwest', SE: 'Southeast', SW: 'Southwest', Central: 'Central' };
    return m[r] || r || '';
  }
  function prettyRole(r) { return titleCase(r || 'marcher'); }
  function eventTypeLabel(t) { return titleCase(t || 'event'); }

  // 'YYYY-MM-DD' -> local Date at noon (avoids UTC day-shift).
  function parseDateOnly(d) {
    if (!d) return null;
    var p = String(d).slice(0, 10).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12, 0, 0);
  }
  function fmtEventDate(d) {
    var dt = parseDateOnly(d);
    if (!dt) return '';
    return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function fmtRel(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + 'd ago';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // Eastern wall-clock { h, m } from a timestamptz ISO string.
  function easternHM(iso) {
    if (!iso) return null;
    var d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    var s = d.toLocaleString('en-US', {
      timeZone: 'America/New_York', hour12: false,
      hour: '2-digit', minute: '2-digit'
    });
    var p = s.split(':');
    return { h: Number(p[0]) % 24, m: Number(p[1]) || 0 };
  }
  function fmtTimeET(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-US', {
      timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit'
    });
  }
  // Build a timestamptz from an event date + Eastern HH:MM. The 2026 road
  // tour runs May-Oct, entirely within EDT (UTC-04:00); a winter event
  // would need -05:00 here.
  function easternToISO(dateStr, hhmm) {
    if (!dateStr || !hhmm) return null;
    return String(dateStr).slice(0, 10) + 'T' + hhmm + ':00-04:00';
  }
  // 'HH:MM' (for <input type=time>) in Eastern, from a timestamptz.
  function easternTimeInput(iso) {
    var hm = easternHM(iso);
    if (!hm) return '';
    return ('0' + hm.h).slice(-2) + ':' + ('0' + hm.m).slice(-2);
  }

  function tabBarHtml(active) {
    function tab(id, href, label) {
      return '<a class="pride-tab' + (id === active ? ' is-active' : '') +
        '" href="' + href + '">' + label + '</a>';
    }
    return '<div class="pride-tabs">' +
      tab('events', '/admin/pride/events', 'Events') +
      tab('volunteers', '/admin/pride/volunteers', 'Volunteers') +
      tab('ed', '/admin/pride/ED', 'ED') +
      '</div>';
  }

  function statusPill(status) {
    return '<span class="pride-status-pill pride-status-' + escAttr(status) + '">' +
      esc(status) + '</span>';
  }

  // Flip a pride_event_volunteers row's status. Resolves on success.
  function setAssignmentStatus(client, id, status) {
    return client
      .from('pride_event_volunteers')
      .update({
        status: status,
        set_by: (client.auth && client.auth.user && client.auth.user.email) || null
      })
      .eq('id', id)
      .then(function (r) { if (r.error) throw r.error; });
  }

  window.PrideAdmin = {
    REGIONS: REGIONS,
    EVENT_TYPES: EVENT_TYPES,
    PAC_ROLES: PAC_ROLES,
    REG_STATUSES: REG_STATUSES,
    ROLE_OPTIONS: ROLE_OPTIONS,
    ASSIGNMENT_STATUSES: ASSIGNMENT_STATUSES,
    ATTENDANCE: ATTENDANCE,
    attendanceDots: attendanceDots,
    attendanceLegend: attendanceLegend,
    esc: esc,
    escAttr: escAttr,
    titleCase: titleCase,
    regionLabel: regionLabel,
    prettyRole: prettyRole,
    eventTypeLabel: eventTypeLabel,
    parseDateOnly: parseDateOnly,
    fmtEventDate: fmtEventDate,
    fmtRel: fmtRel,
    easternHM: easternHM,
    fmtTimeET: fmtTimeET,
    easternToISO: easternToISO,
    easternTimeInput: easternTimeInput,
    tabBarHtml: tabBarHtml,
    statusPill: statusPill,
    setAssignmentStatus: setAssignmentStatus
  };
})();
