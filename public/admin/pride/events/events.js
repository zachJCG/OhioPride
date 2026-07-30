/* =========================================================================
   Ohio Pride PAC :: /admin/pride/events
   -------------------------------------------------------------------------
   Week-by-hour calendar of every 2026 Pride road-tour stop. Reads
   pride_events (+ pride_event_roster_v for volunteer counts). Lets admins:
     - page through the tour week by week
     - see every seeded event (date-only events sit in an all-day strip;
       timed events drop into the hour grid)
     - open an event to set PAC attendance + role, registration status,
       and start/end times
     - add a new event
   Writes go straight to pride_events via the authenticated client; RLS
   policy pride_events_admin_all gates everything by public.is_admin().
   ========================================================================= */

(function () {
  'use strict';

  var P = window.PrideAdmin;
  var GRID_START = 7;   // 7 AM
  var GRID_END = 22;    // 10 PM
  var HOUR_PX = 48;

  // Set by /admin/pride/ED before this script loads, so that page is
  // genuinely "a copy of the calendar but just with ED's events".
  var CFG = window.PRIDE_CAL || {};
  var EDONLY = CFG.edOnly === true;
  var ACTIVE_TAB = CFG.tab || 'events';

  var state = {
    client: null,
    canWrite: false,
    events: [],
    rosterById: {},
    weekStart: null
  };

  document.addEventListener('admin-shell-ready', function (ev) {
    var detail = ev.detail || {};
    state.client = detail.client;
    state.canWrite = detail.can('pride', 'write') || detail.can('pride', 'admin') ||
      (detail.roles || []).some(function (r) { return r.slug === 'super_admin'; });

    document.getElementById('shellPageActions').innerHTML =
      '<a class="shell-btn shell-btn-outline" href="/pride/signup" target="_blank" rel="noopener">View signup form</a>' +
      (state.canWrite
        ? '<button type="button" class="shell-btn shell-btn-primary" id="prideAddEvent">Add event</button>'
        : '');

    document.getElementById('shellBody').innerHTML = pageHtml();

    loadAll().catch(function (err) {
      console.error('pride events load failed', err);
      document.getElementById('prideCalWrap').innerHTML =
        '<div class="pride-empty admin-error">Could not load Pride events. ' +
        'Your role may not include this module, or RLS blocked the query.</div>';
    });

    bindEvents();
  });

  function pageHtml() {
    return [
      P.tabBarHtml(ACTIVE_TAB),
      P.attendanceLegend(),
      '<div class="admin-stat-grid">',
        '<div class="admin-stat"><div class="admin-stat-num" id="kpiEvents">0</div><div class="admin-stat-label">Events</div></div>',
        '<div class="admin-stat"><div class="admin-stat-num" id="kpiPac">0</div><div class="admin-stat-label">PAC attending</div></div>',
        '<div class="admin-stat"><div class="admin-stat-num" id="kpiWeek">0</div><div class="admin-stat-label">This week</div></div>',
        '<div class="admin-stat"><div class="admin-stat-num" id="kpiConfirmed">0</div><div class="admin-stat-label">Confirmed vols</div></div>',
      '</div>',
      '<div class="pride-cal-bar">',
        '<button type="button" class="pride-cal-nav" id="prideWeekPrev" aria-label="Previous week">&lsaquo;</button>',
        '<button type="button" class="pride-cal-nav" id="prideWeekNext" aria-label="Next week">&rsaquo;</button>',
        '<span class="pride-week-label" id="prideWeekLabel">&mdash;</span>',
        '<button type="button" class="pride-cal-today" id="prideWeekToday">Today</button>',
        '<input type="date" class="admin-input" id="prideWeekJump" style="max-width:170px" />',
        '<span class="admin-toolbar-spacer"></span>',
        '<span class="admin-result-count" id="prideWeekCount"></span>',
      '</div>',
      '<div id="prideCalWrap"><div class="pride-empty">Loading calendar&hellip;</div></div>'
    ].join('');
  }

  // The ED page is the same calendar scoped to ED-attending events.
  function applyScope(rows) {
    return EDONLY ? rows.filter(function (e) { return e.ed_attending; }) : rows;
  }

  function loadAll() {
    return Promise.all([
      state.client.from('pride_events').select('*')
        .order('event_date', { ascending: true })
        .then(function (r) { if (r.error) throw r.error; state.events = applyScope(r.data || []); }),
      state.client.from('pride_event_roster_v').select('*')
        .then(function (r) { if (r.error) throw r.error; (r.data || []).forEach(function (x) { state.rosterById[x.event_id] = x; }); })
    ]).then(function () {
      state.weekStart = defaultWeekStart();
      renderKpis();
      renderCalendar();
    });
  }

  function refreshEvents() {
    return Promise.all([
      state.client.from('pride_events').select('*')
        .order('event_date', { ascending: true })
        .then(function (r) { if (r.error) throw r.error; state.events = applyScope(r.data || []); }),
      state.client.from('pride_event_roster_v').select('*')
        .then(function (r) { if (r.error) throw r.error; state.rosterById = {}; (r.data || []).forEach(function (x) { state.rosterById[x.event_id] = x; }); })
    ]).then(function () { renderKpis(); renderCalendar(); });
  }

  // ---- week math ----
  function startOfWeek(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - x.getDay()); // back to Sunday
    return x;
  }
  function defaultWeekStart() {
    var today = new Date();
    var todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var upcoming = null, earliest = null;
    state.events.forEach(function (e) {
      var dt = P.parseDateOnly(e.event_date);
      if (!dt) return;
      if (!earliest || dt < earliest) earliest = dt;
      if (dt >= todayMid && (!upcoming || dt < upcoming)) upcoming = dt;
    });
    return startOfWeek(upcoming || earliest || today);
  }
  function dayKey(d) {
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  function renderKpis() {
    var pac = 0, confirmed = 0;
    state.events.forEach(function (e) { if (e.pac_attending) pac++; });
    Object.keys(state.rosterById).forEach(function (k) {
      confirmed += state.rosterById[k].confirmed_count || 0;
    });
    $('kpiEvents').textContent = state.events.length;
    $('kpiPac').textContent = pac;
    $('kpiConfirmed').textContent = confirmed;
  }

  function renderCalendar() {
    var ws = state.weekStart;
    var days = [];
    for (var i = 0; i < 7; i++) {
      days.push(new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + i));
    }
    var weekEnd = days[6];
    $('prideWeekLabel').textContent =
      days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' – ' +
      weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    var todayKey = dayKey(new Date());

    // bucket events by day key for this week
    var byDay = {}; days.forEach(function (d) { byDay[dayKey(d)] = []; });
    var weekCount = 0;
    state.events.forEach(function (e) {
      var dt = P.parseDateOnly(e.event_date);
      if (!dt) return;
      var k = dayKey(dt);
      if (byDay[k]) { byDay[k].push(e); weekCount++; }
    });
    $('kpiWeek').textContent = weekCount;
    $('prideWeekCount').textContent = weekCount + (weekCount === 1 ? ' event' : ' events') + ' this week';

    // ---- head ----
    var head = '<div class="pride-cal-head"><div></div>';
    days.forEach(function (d) {
      var k = dayKey(d);
      head += '<div class="' + (k === todayKey ? 'is-today' : '') + '">' +
        '<span class="pride-col-dow">' + d.toLocaleDateString('en-US', { weekday: 'short' }) + '</span>' +
        '<span class="pride-col-date">' + d.getDate() + '</span></div>';
    });
    head += '</div>';

    // ---- tentative strip (unconfirmed times park here, above all-day) ----
    var tentative = '<div class="pride-tentative"><div class="pride-allday-label">Tentative</div>';
    days.forEach(function (d) {
      var list = (byDay[dayKey(d)] || []).filter(function (e) { return !e.time_confirmed; });
      tentative += '<div class="pride-allday-cell">' +
        list.map(function (e) { return eventChip(e, true); }).join('') + '</div>';
    });
    tentative += '</div>';

    // ---- all-day strip (confirmed but no specific start time) ----
    var allday = '<div class="pride-allday"><div class="pride-allday-label">All&nbsp;day</div>';
    days.forEach(function (d) {
      var list = (byDay[dayKey(d)] || []).filter(function (e) { return e.time_confirmed && !e.start_time_utc; });
      allday += '<div class="pride-allday-cell">' +
        list.map(function (e) { return eventChip(e, false); }).join('') + '</div>';
    });
    allday += '</div>';

    // ---- hour grid ----
    var hours = '<div class="pride-hours">';
    for (var h = GRID_START; h <= GRID_END; h++) {
      var lbl = (h % 12 === 0 ? 12 : h % 12) + (h < 12 ? ' AM' : ' PM');
      hours += '<div class="pride-hour-label">' + lbl + '</div>';
    }
    hours += '</div>';

    var grid = '<div class="pride-grid">' + hours;
    days.forEach(function (d) {
      var k = dayKey(d);
      var timed = (byDay[k] || []).filter(function (e) { return e.time_confirmed && e.start_time_utc; });
      grid += '<div class="pride-daycol' + (k === todayKey ? ' is-today' : '') + '">';
      for (var hh = GRID_START; hh <= GRID_END; hh++) grid += '<div class="pride-hour-line"></div>';
      timed.forEach(function (e) { grid += timedEvent(e); });
      grid += '</div>';
    });
    grid += '</div>';

    $('prideCalWrap').innerHTML = '<div class="pride-cal">' + head + tentative + allday + grid + '</div>';
  }

  function countsBadge(e) {
    var r = state.rosterById[e.id];
    if (!r) return '';
    var bits = [];
    if (r.confirmed_count) bits.push(r.confirmed_count + ' conf');
    if (r.tentative_count) bits.push(r.tentative_count + ' tent');
    return bits.length ? '<span class="pride-ev-badge">' + bits.join(' &middot; ') + '</span>' : '';
  }
  function evClass(e) {
    if (e.pac_priority) return 'pride-ev-priority';
    if (e.pac_attending) return 'pride-ev-pac';
    return 'pride-ev-off';
  }
  function attendanceFlags(e) {
    var r = state.rosterById[e.id] || {};
    return {
      volunteers: (r.confirmed_count || 0) + (r.tentative_count || 0) > 0,
      board: !!e.board_attending,
      staff: !!e.staff_attending,
      ed: !!e.ed_attending
    };
  }

  function eventChip(e, isTentative) {
    var timeBit = e.start_time_utc
      ? P.esc(P.fmtTimeET(e.start_time_utc)) + ' &middot; '
      : '';
    var confirmBtn = (isTentative && state.canWrite)
      ? '<button type="button" class="pride-ev-confirm" data-confirm-ev="' +
          P.escAttr(e.id) + '">Confirm time</button>'
      : '';
    return '<div class="pride-ev ' + evClass(e) +
      (isTentative ? ' is-tentative' : '') + '" data-ev="' + P.escAttr(e.id) + '">' +
      P.esc(e.name) + P.attendanceDots(attendanceFlags(e)) +
      '<small>' + timeBit + P.esc(e.city) + ' &middot; ' + P.esc(P.eventTypeLabel(e.event_type)) + '</small>' +
      countsBadge(e) + confirmBtn +
      '</div>';
  }

  function timedEvent(e) {
    var sh = P.easternHM(e.start_time_utc);
    if (!sh) return eventChip(e); // unparseable time -> treat as all-day
    var eh = P.easternHM(e.end_time_utc);
    var startF = clamp((sh.h + sh.m / 60), GRID_START, GRID_END);
    var endF = eh ? clamp((eh.h + eh.m / 60), startF + 0.5, GRID_END + 1) : startF + 2;
    var top = (startF - GRID_START) * HOUR_PX;
    var height = Math.max((endF - startF) * HOUR_PX, 24);
    return '<div class="pride-ev is-timed ' + evClass(e) + '" data-ev="' + P.escAttr(e.id) +
      '" style="top:' + top + 'px;height:' + height + 'px">' +
      P.esc(P.fmtTimeET(e.start_time_utc)) + ' ' + P.esc(e.name) +
      P.attendanceDots(attendanceFlags(e)) +
      '<small>' + P.esc(e.city) + '</small>' + countsBadge(e) +
      '</div>';
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ---- event drawer ----
  function openEventDrawer(id) {
    var e = state.events.find(function (x) { return x.id === id; });
    if (!e) return;
    var r = state.rosterById[e.id] || {};

    var rosterHtml = '<p class="admin-muted" style="font-size:13px">Loading roster&hellip;</p>';
    var body = eventDetailHtml(e, r, rosterHtml);

    window.AdminShell.openDrawer({
      eyebrow: P.fmtEventDate(e.event_date) + ' · ' + P.regionLabel(e.region),
      title: e.name,
      bodyHtml: body,
      footHtml: state.canWrite
        ? '<button type="button" class="shell-btn shell-btn-danger" id="prideEvDelete">Delete</button>' +
          '<button type="button" class="shell-btn shell-btn-outline" data-drawer-close>Close</button>' +
          '<button type="button" class="shell-btn shell-btn-primary" id="prideEvSave">Save changes</button>'
        : '<button type="button" class="shell-btn shell-btn-outline" data-drawer-close>Close</button>'
    });

    if (state.canWrite) {
      document.getElementById('prideEvSave').onclick = function () { saveEvent(e.id); };
      document.getElementById('prideEvDelete').onclick = function () { confirmDeleteEvent(e); };
    }

    // pull the roster names lazily
    state.client.from('pride_event_volunteers_v').select('*')
      .eq('event_id', e.id)
      .then(function (res) {
        var el = document.getElementById('prideEvRoster');
        if (!el) return;
        if (res.error) { el.innerHTML = '<p class="admin-error">Could not load roster.</p>'; return; }
        el.innerHTML = rosterTable(res.data || []);
      });
  }

  function whosGoingHtml(e, r, dis) {
    var volN = (r.confirmed_count || 0) + (r.tentative_count || 0);
    function dot(c) { return '<span class="pride-att-dot" style="background:' + c + '"></span>'; }
    function box(col, color, label) {
      return '<label class="pride-check-inline">' +
        '<input type="checkbox" name="' + col + '"' + (e[col] ? ' checked' : '') + dis + ' /> ' +
        dot(color) + label + '</label>';
    }
    var V = {};
    P.ATTENDANCE.forEach(function (a) { V[a.key] = a; });
    return '<div class="pride-whos-going">' +
      '<div class="pride-att-readonly">' + dot(V.volunteers.color) +
        'Volunteers <span class="admin-muted">' +
        (volN ? volN + ' assigned (from roster)' : 'none assigned yet') + '</span></div>' +
      box('board_attending', V.board.color, 'Board') +
      box('staff_attending', V.staff.color, 'Staff') +
      box('ed_attending',    V.ed.color,    'Director') +
      '</div>';
  }

  function eventDetailHtml(e, r, rosterHtml) {
    function sel(name, opts, current, labelFn) {
      return '<select name="' + name + '"' + (state.canWrite ? '' : ' disabled') + '>' +
        opts.map(function (o) {
          var v = typeof o === 'string' ? o : o.value;
          var l = labelFn ? labelFn(o) : (typeof o === 'string' ? P.titleCase(o) : o.label);
          return '<option value="' + P.escAttr(v) + '"' + (v === current ? ' selected' : '') + '>' + P.esc(l) + '</option>';
        }).join('') + '</select>';
    }
    var dis = state.canWrite ? '' : ' disabled';
    return [
      '<form id="prideEvForm" class="pride-form">',
        '<div class="pride-drawer-section">',
          '<h4>Event</h4>',
          '<label>Name<input type="text" name="name" value="' + P.escAttr(e.name) + '"' + dis + ' /></label>',
          '<div class="pride-form-row">',
            '<label>City<input type="text" name="city" value="' + P.escAttr(e.city) + '"' + dis + ' /></label>',
            '<label>Region' + sel('region', P.REGIONS, e.region) + '</label>',
          '</div>',
          '<div class="pride-form-row">',
            '<label>Date<input type="date" name="event_date" value="' + P.escAttr((e.event_date || '').slice(0, 10)) + '"' + dis + ' /></label>',
            '<label>Type' + sel('event_type', P.EVENT_TYPES, e.event_type) + '</label>',
          '</div>',
          '<label>Venue<input type="text" name="venue" value="' + P.escAttr(e.venue || '') + '"' + dis + ' /></label>',
        '</div>',
        '<div class="pride-drawer-section">',
          '<h4>Status</h4>',
          '<label class="pride-check-inline"><input type="checkbox" name="pac_attending"' +
            (e.pac_attending ? ' checked' : '') + dis + ' /> PAC attending this stop</label>',
          '<div class="pride-form-row">',
            '<label>PAC role' + sel('pac_role', P.PAC_ROLES, e.pac_role || 'none') + '</label>',
            '<label>Registration' + sel('registration_status', P.REG_STATUSES, e.registration_status || 'tbd') + '</label>',
          '</div>',
          '<label class="pride-check-inline"><input type="checkbox" name="pac_priority"' +
            (e.pac_priority ? ' checked' : '') + dis + ' /> Flag as PAC priority</label>',
        '</div>',
        '<div class="pride-drawer-section">',
          '<h4>Who’s going</h4>',
          whosGoingHtml(e, r, dis),
        '</div>',
        '<div class="pride-drawer-section">',
          '<h4>Times <span class="admin-muted" style="text-transform:none;font-weight:500">(Eastern; leave blank for all-day)</span></h4>',
          '<div class="pride-form-row">',
            '<label>Start<input type="time" name="start_time" value="' + P.escAttr(P.easternTimeInput(e.start_time_utc)) + '"' + dis + ' /></label>',
            '<label>End<input type="time" name="end_time" value="' + P.escAttr(P.easternTimeInput(e.end_time_utc)) + '"' + dis + ' /></label>',
          '</div>',
          '<label class="pride-check-inline"><input type="checkbox" name="time_confirmed"' +
            (e.time_confirmed ? ' checked' : '') + dis + ' /> Time confirmed ' +
            '<span class="admin-muted" style="text-transform:none;font-weight:500">(drop out of Tentative into the schedule)</span></label>',
        '</div>',
        '<div class="pride-drawer-section">',
          '<h4>Notes</h4>',
          '<label>Description<textarea name="description" rows="3"' + dis + '>' + P.esc(e.description || '') + '</textarea></label>',
        '</div>',
        '<div class="pride-drawer-section">',
          '<h4>Volunteers (' + (r.confirmed_count || 0) + ' confirmed · ' + (r.tentative_count || 0) + ' tentative)</h4>',
          '<div id="prideEvRoster">' + rosterHtml + '</div>',
        '</div>',
      '</form>'
    ].join('');
  }

  function rosterTable(rows) {
    var keep = rows.filter(function (a) { return a.status === 'confirmed' || a.status === 'tentative'; });
    if (!keep.length) return '<p class="admin-muted" style="font-size:13px">No volunteers assigned yet. Assign from the Volunteers tab.</p>';
    keep.sort(function (a, b) { return a.status === b.status ? 0 : (a.status === 'confirmed' ? -1 : 1); });
    return '<table class="pride-mini-table"><tbody>' + keep.map(function (a) {
      var name = ((a.first_name || '') + ' ' + (a.last_name || '')).trim() || a.volunteer_email || '(unknown)';
      return '<tr><td>' + P.esc(name) +
        (a.is_captain ? '<span class="pride-captain-badge">Captain</span>' : '') +
        '<span class="admin-cell-sub">' + P.esc(P.prettyRole(a.role)) + '</span></td>' +
        '<td style="text-align:right">' + P.statusPill(a.status) + '</td></tr>';
    }).join('') + '</tbody></table>';
  }

  function readForm(form) {
    var fd = new FormData(form);
    var st = (fd.get('start_time') || '').trim();
    var en = (fd.get('end_time') || '').trim();
    var date = (fd.get('event_date') || '').slice(0, 10);
    return {
      name: (fd.get('name') || '').trim(),
      city: (fd.get('city') || '').trim(),
      region: fd.get('region'),
      event_date: date,
      event_type: fd.get('event_type'),
      venue: (fd.get('venue') || '').trim() || null,
      pac_attending: fd.get('pac_attending') === 'on',
      pac_role: fd.get('pac_role'),
      pac_priority: fd.get('pac_priority') === 'on',
      registration_status: fd.get('registration_status'),
      description: (fd.get('description') || '').trim() || null,
      start_time_utc: st ? P.easternToISO(date, st) : null,
      end_time_utc: en ? P.easternToISO(date, en) : null,
      time_confirmed: fd.get('time_confirmed') === 'on',
      board_attending: fd.get('board_attending') === 'on',
      staff_attending: fd.get('staff_attending') === 'on',
      ed_attending: fd.get('ed_attending') === 'on'
    };
  }

  function saveEvent(id) {
    var form = document.getElementById('prideEvForm');
    var payload = readForm(form);
    if (!payload.name || !payload.city || !payload.event_date) {
      window.AdminShell.toast('Name, city and date are required.', 'error');
      return;
    }
    state.client.from('pride_events').update(payload).eq('id', id).select().single()
      .then(function (r) {
        if (r.error) throw r.error;
        return refreshEvents();
      })
      .then(function () {
        window.AdminShell.closeDrawer();
        window.AdminShell.toast('Event updated.', 'success');
      })
      .catch(function (err) {
        console.error(err);
        window.AdminShell.toast('Could not save the event.', 'error');
      });
  }

  // ---- confirm a tentative event's time slot ----
  function confirmEventTime(id) {
    if (!state.canWrite) { window.AdminShell.toast('Read-only role.', 'error'); return; }
    state.client.from('pride_events').update({ time_confirmed: true }).eq('id', id)
      .then(function (r) { if (r.error) throw r.error; return refreshEvents(); })
      .then(function () { window.AdminShell.toast('Time confirmed.', 'success'); })
      .catch(function (err) {
        console.error(err);
        window.AdminShell.toast('Could not confirm the time.', 'error');
      });
  }

  // ---- delete an event (two-step confirm in the drawer footer) ----
  function confirmDeleteEvent(e) {
    var ft = document.getElementById('shellDrawerFoot');
    if (!ft) return;
    ft.innerHTML =
      '<span class="pride-del-warn">Delete &ldquo;' + P.esc(e.name) +
        '&rdquo;? This also removes its volunteer assignments.</span>' +
      '<button type="button" class="shell-btn shell-btn-outline" id="prideEvDelCancel">Cancel</button>' +
      '<button type="button" class="shell-btn shell-btn-danger" id="prideEvDelYes">Delete event</button>';
    document.getElementById('prideEvDelCancel').onclick = function () { openEventDrawer(e.id); };
    document.getElementById('prideEvDelYes').onclick = function () { deleteEvent(e); };
  }

  function deleteEvent(e) {
    var btn = document.getElementById('prideEvDelYes');
    if (btn) btn.disabled = true;
    state.client.from('pride_events').delete().eq('id', e.id)
      .then(function (r) { if (r.error) throw r.error; return refreshEvents(); })
      .then(function () {
        window.AdminShell.closeDrawer();
        window.AdminShell.toast('Event deleted.', 'success');
      })
      .catch(function (err) {
        console.error(err);
        window.AdminShell.toast('Could not delete the event.', 'error');
        if (btn) btn.disabled = false;
      });
  }

  // ---- add event ----
  function openAddDrawer() {
    var blank = {
      name: '', city: '', region: 'Central', event_date: '',
      event_type: 'festival', venue: '', pac_attending: false,
      pac_role: 'none', pac_priority: false, registration_status: 'tbd',
      description: '', start_time_utc: null, end_time_utc: null,
      time_confirmed: false,
      board_attending: false, staff_attending: false,
      ed_attending: EDONLY
    };
    window.AdminShell.openDrawer({
      eyebrow: 'New event',
      title: 'Add a Pride stop',
      bodyHtml: eventDetailHtml(blank, {}, '<p class="admin-muted" style="font-size:13px">Assign volunteers after the event is created.</p>'),
      footHtml:
        '<button type="button" class="shell-btn shell-btn-outline" data-drawer-close>Cancel</button>' +
        '<button type="button" class="shell-btn shell-btn-primary" id="prideEvCreate">Create event</button>'
    });
    document.getElementById('prideEvCreate').onclick = function () {
      var payload = readForm(document.getElementById('prideEvForm'));
      if (!payload.name || !payload.city || !payload.event_date) {
        window.AdminShell.toast('Name, city and date are required.', 'error');
        return;
      }
      // slug must be unique + url-safe; lat/lng are NOT NULL with no default
      // so seed with the Ohio geographic center until refined.
      payload.slug = slugify(payload.city) + '-' + payload.event_type + '-' + payload.event_date;
      payload.lat = 40.0;
      payload.lng = -83.0;
      payload.is_public = true;
      state.client.from('pride_events').insert(payload).select().single()
        .then(function (r) {
          if (r.error) throw r.error;
          return refreshEvents();
        })
        .then(function () {
          window.AdminShell.closeDrawer();
          window.AdminShell.toast('Event created.', 'success');
        })
        .catch(function (err) {
          console.error(err);
          window.AdminShell.toast(
            err && err.code === '23505' ? 'An event with that city/type/date already exists.'
              : 'Could not create the event.', 'error');
        });
    };
  }
  function slugify(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'event';
  }

  // ---- events ----
  function bindEvents() {
    document.addEventListener('click', function (ev) {
      var confirmBtn = ev.target.closest && ev.target.closest('[data-confirm-ev]');
      if (confirmBtn) { ev.stopPropagation(); confirmEventTime(confirmBtn.dataset.confirmEv); return; }
      var chip = ev.target.closest && ev.target.closest('[data-ev]');
      if (chip) { openEventDrawer(chip.dataset.ev); return; }
      var t = ev.target;
      if (!t || !t.id) return;
      if (t.id === 'prideAddEvent') { openAddDrawer(); }
      else if (t.id === 'prideWeekPrev') { shiftWeek(-7); }
      else if (t.id === 'prideWeekNext') { shiftWeek(7); }
      else if (t.id === 'prideWeekToday') { state.weekStart = startOfWeek(new Date()); renderCalendar(); }
    });
    document.addEventListener('change', function (ev) {
      if (ev.target && ev.target.id === 'prideWeekJump' && ev.target.value) {
        var d = P.parseDateOnly(ev.target.value);
        if (d) { state.weekStart = startOfWeek(d); renderCalendar(); }
      }
    });
  }
  function shiftWeek(days) {
    var w = state.weekStart;
    state.weekStart = new Date(w.getFullYear(), w.getMonth(), w.getDate() + days);
    renderCalendar();
  }

  function $(id) { return document.getElementById(id); }
})();
