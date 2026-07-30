/* =========================================================================
   Ohio Pride PAC :: /admin/pride/volunteers
   -------------------------------------------------------------------------
   Roster of every road-tour volunteer (public.pride_volunteers) with the
   events each one is confirmed / tentative / declined for
   (public.pride_event_volunteers_v). Confirmed assignments "pop over" to
   the top of each volunteer's drawer. Admins can flip an assignment's
   status, remove it, or assign the volunteer to another event.

   Pride signups also land in public.volunteers automatically (DB trigger
   trg_sync_pride_volunteer), so every name here also shows on
   /admin/volunteers.
   ========================================================================= */

(function () {
  'use strict';

  var P = window.PrideAdmin;

  var state = {
    client: null,
    canWrite: false,
    volunteers: [],
    events: [],
    byVol: {},          // volunteer_id -> [assignment rows]
    filtered: [],
    search: '',
    region: '',
    activeId: null
  };

  document.addEventListener('admin-shell-ready', function (ev) {
    var detail = ev.detail || {};
    state.client = detail.client;
    state.canWrite = detail.can('pride', 'write') || detail.can('pride', 'admin') ||
      (detail.roles || []).some(function (r) { return r.slug === 'super_admin'; });

    document.getElementById('shellPageActions').innerHTML =
      '<a class="shell-btn shell-btn-outline" href="/pride/signup" target="_blank" rel="noopener">View signup form</a>' +
      '<button type="button" class="shell-btn shell-btn-outline" id="prideVolExport">Export CSV</button>' +
      (state.canWrite
        ? '<button type="button" class="shell-btn shell-btn-primary" id="prideVolAdd">Add volunteer</button>'
        : '');

    document.getElementById('shellBody').innerHTML = pageHtml();

    loadAll().catch(function (err) {
      console.error('pride volunteers load failed', err);
      document.getElementById('prideVolBody').innerHTML =
        '<tr><td colspan="6" class="admin-empty-row admin-error">Could not load Pride volunteers. ' +
        'Your role may not include this module, or RLS blocked the query.</td></tr>';
    });

    bindEvents();
  });

  function pageHtml() {
    return [
      P.tabBarHtml('volunteers'),
      '<div class="admin-stat-grid">',
        '<div class="admin-stat"><div class="admin-stat-num" id="kpiVols">0</div><div class="admin-stat-label">Volunteers</div></div>',
        '<div class="admin-stat"><div class="admin-stat-num" id="kpiConfirmed">0</div><div class="admin-stat-label">Confirmed</div></div>',
        '<div class="admin-stat"><div class="admin-stat-num" id="kpiTentative">0</div><div class="admin-stat-label">Tentative</div></div>',
        '<div class="admin-stat"><div class="admin-stat-num" id="kpiEvents">0</div><div class="admin-stat-label">Events covered</div></div>',
      '</div>',
      '<div class="admin-toolbar">',
        '<input type="search" class="admin-input" id="prideVolSearch" placeholder="Search name, email, city, role..." autocomplete="off" />',
        '<select class="admin-input" id="prideVolRegion">',
          '<option value="">All regions</option>',
          P.REGIONS.map(function (r) { return '<option value="' + r.value + '">' + r.label + '</option>'; }).join(''),
          '<option value="Anywhere">Anywhere</option>',
        '</select>',
        '<span class="admin-toolbar-spacer"></span>',
        '<span class="admin-result-count" id="prideVolCount"></span>',
      '</div>',
      '<div class="pride-cal" style="padding:16px">',
        '<div class="admin-table-wrap" style="border:none">',
          '<table class="admin-table">',
            '<thead><tr>',
              '<th>Volunteer</th><th>Contact</th><th>Location</th>',
              '<th>Wants to</th><th>Events</th><th>Signed up</th>',
            '</tr></thead>',
            '<tbody id="prideVolBody"><tr><td colspan="6" class="admin-empty-row">Loading&hellip;</td></tr></tbody>',
          '</table>',
        '</div>',
      '</div>'
    ].join('');
  }

  function loadAll() {
    return Promise.all([
      state.client.from('pride_volunteers').select('*')
        .order('created_at', { ascending: false })
        .then(function (r) { if (r.error) throw r.error; state.volunteers = r.data || []; }),
      state.client.from('pride_event_volunteers_v').select('*')
        .then(function (r) { if (r.error) throw r.error; indexAssignments(r.data || []); }),
      state.client.from('pride_events').select('id, name, city, event_date, region')
        .order('event_date', { ascending: true })
        .then(function (r) { if (r.error) throw r.error; state.events = r.data || []; })
    ]).then(function () {
      renderKpis();
      applyFilters();
    });
  }

  function indexAssignments(rows) {
    state.byVol = {};
    rows.forEach(function (a) {
      (state.byVol[a.volunteer_id] = state.byVol[a.volunteer_id] || []).push(a);
    });
  }

  function refreshAssignments() {
    return state.client.from('pride_event_volunteers_v').select('*')
      .then(function (r) {
        if (r.error) throw r.error;
        indexAssignments(r.data || []);
        renderKpis();
        applyFilters();
      });
  }

  function reloadVolunteers() {
    return Promise.all([
      state.client.from('pride_volunteers').select('*')
        .order('created_at', { ascending: false })
        .then(function (r) { if (r.error) throw r.error; state.volunteers = r.data || []; }),
      state.client.from('pride_event_volunteers_v').select('*')
        .then(function (r) { if (r.error) throw r.error; indexAssignments(r.data || []); })
    ]).then(function () { renderKpis(); applyFilters(); });
  }

  function statusCounts(vid) {
    var list = state.byVol[vid] || [];
    var c = { confirmed: 0, tentative: 0, declined: 0, removed: 0 };
    list.forEach(function (a) { if (c[a.status] != null) c[a.status]++; });
    return c;
  }

  function renderKpis() {
    var confirmed = 0, tentative = 0, evts = {};
    Object.keys(state.byVol).forEach(function (vid) {
      (state.byVol[vid] || []).forEach(function (a) {
        if (a.status === 'confirmed') { confirmed++; evts[a.event_id] = true; }
        else if (a.status === 'tentative') tentative++;
      });
    });
    $('kpiVols').textContent = state.volunteers.length;
    $('kpiConfirmed').textContent = confirmed;
    $('kpiTentative').textContent = tentative;
    $('kpiEvents').textContent = Object.keys(evts).length;
  }

  function applyFilters() {
    var q = state.search.toLowerCase();
    state.filtered = state.volunteers.filter(function (v) {
      if (state.region && v.preferred_region !== state.region) return false;
      if (q) {
        var hay = ((v.first_name || '') + ' ' + (v.last_name || '') + ' ' +
          (v.email || '') + ' ' + (v.city || '') + ' ' +
          (v.roles_interested || []).join(' ')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    renderRows();
  }

  function renderRows() {
    var body = $('prideVolBody');
    $('prideVolCount').textContent = state.filtered.length === state.volunteers.length
      ? state.volunteers.length + ' total'
      : state.filtered.length + ' of ' + state.volunteers.length;

    if (!state.filtered.length) {
      body.innerHTML = '<tr><td colspan="6" class="admin-empty-row">' +
        (state.volunteers.length ? 'No volunteers match the current filters.'
          : 'No road-tour signups yet. Submissions from /pride/signup appear here.') +
        '</td></tr>';
      return;
    }

    body.innerHTML = state.filtered.map(function (v) {
      var name = ((v.first_name || '') + ' ' + (v.last_name || '')).trim() || '&mdash;';
      var c = statusCounts(v.id);
      var contact = [
        v.email ? '<a href="mailto:' + P.escAttr(v.email) + '" class="admin-link" onclick="event.stopPropagation()">' + P.esc(v.email) + '</a>' : '',
        v.phone ? '<span class="admin-cell-sub">' + P.esc(v.phone) + '</span>' : ''
      ].filter(Boolean).join('') || '<span class="admin-muted">&mdash;</span>';
      var loc = [v.city, P.regionLabel(v.preferred_region)].filter(Boolean).join(' · ') || '&mdash;';
      var roles = (v.roles_interested || []).slice(0, 3).map(function (x) {
        return '<span class="admin-pill">' + P.esc(P.titleCase(x)) + '</span>';
      }).join(' ') || '<span class="admin-muted">&mdash;</span>';
      var evtCell = (c.confirmed
        ? '<span class="pride-status-pill pride-status-confirmed">' + c.confirmed + ' confirmed</span> '
        : '') +
        (c.tentative ? '<span class="pride-status-pill pride-status-tentative">' + c.tentative + ' tentative</span>' : '') ||
        '<span class="admin-muted">None yet</span>';
      return '<tr data-vid="' + P.escAttr(v.id) + '" style="cursor:pointer">' +
        '<td class="admin-cell-name">' + P.esc(name) +
          (v.is_vetted ? '<span class="pride-captain-badge">Vetted</span>' : '') + '</td>' +
        '<td>' + contact + '</td>' +
        '<td>' + P.esc(loc) + '</td>' +
        '<td><div class="admin-pill-row">' + roles + '</div></td>' +
        '<td>' + evtCell + '</td>' +
        '<td>' + P.esc(P.fmtRel(v.created_at)) + '</td>' +
        '</tr>';
    }).join('');
  }

  // ---- drawer ----
  function openVolDrawer(v) {
    state.activeId = v.id;
    window.AdminShell.openDrawer({
      eyebrow: P.regionLabel(v.preferred_region) || 'Volunteer',
      title: ((v.first_name || '') + ' ' + (v.last_name || '')).trim() || 'Volunteer',
      bodyHtml: volDrawerBody(v),
      footHtml:
        (state.canWrite
          ? '<button type="button" class="shell-btn shell-btn-danger" id="prideVolDelete">Delete</button>'
          : '') +
        '<a class="shell-btn shell-btn-outline" href="mailto:' + P.escAttr(v.email || '') + '">Email</a>' +
        '<button type="button" class="shell-btn shell-btn-primary" data-drawer-close>Done</button>'
    });
    if (state.canWrite) {
      document.getElementById('prideVolDelete').onclick = function () { confirmDeleteVol(v); };
    }
  }

  // ---- add volunteer ----
  function openAddVolDrawer() {
    var regionOpts = '<option value="">Preferred region&hellip;</option>' +
      P.REGIONS.map(function (r) { return '<option value="' + r.value + '">' + r.label + '</option>'; }).join('') +
      '<option value="Anywhere">Anywhere</option>';
    var roleChecks = P.ROLE_OPTIONS.map(function (r) {
      return '<label class="pride-check-inline"><input type="checkbox" name="role" value="' +
        P.escAttr(r) + '" /> ' + P.esc(P.titleCase(r)) + '</label>';
    }).join('');
    var body = [
      '<form id="prideVolForm" class="pride-form">',
        '<div class="pride-drawer-section">',
          '<h4>Volunteer</h4>',
          '<div class="pride-form-row">',
            '<label>First name<input type="text" name="first_name" required /></label>',
            '<label>Last name<input type="text" name="last_name" required /></label>',
          '</div>',
          '<label>Email<input type="email" name="email" required /></label>',
          '<div class="pride-form-row">',
            '<label>Phone<input type="text" name="phone" /></label>',
            '<label>City<input type="text" name="city" /></label>',
          '</div>',
          '<div class="pride-form-row">',
            '<label>ZIP<input type="text" name="zip" /></label>',
            '<label>Region<select name="preferred_region">' + regionOpts + '</select></label>',
          '</div>',
        '</div>',
        '<div class="pride-drawer-section">',
          '<h4>Wants to</h4>',
          '<div class="pride-check-grid">' + roleChecks + '</div>',
        '</div>',
        '<div class="pride-drawer-section">',
          '<h4>Logistics</h4>',
          '<label class="pride-check-inline"><input type="checkbox" name="can_travel" /> Can travel</label>',
          '<label class="pride-check-inline"><input type="checkbox" name="has_vehicle" /> Has a vehicle</label>',
          '<label class="pride-check-inline"><input type="checkbox" name="is_vetted" /> Vetted</label>',
          '<label>Notes<textarea name="notes" rows="3"></textarea></label>',
        '</div>',
      '</form>'
    ].join('');
    window.AdminShell.openDrawer({
      eyebrow: 'New volunteer',
      title: 'Add a road-tour volunteer',
      bodyHtml: body,
      footHtml:
        '<button type="button" class="shell-btn shell-btn-outline" data-drawer-close>Cancel</button>' +
        '<button type="button" class="shell-btn shell-btn-primary" id="prideVolCreate">Create volunteer</button>'
    });
    document.getElementById('prideVolCreate').onclick = createVolunteer;
  }

  function createVolunteer() {
    var form = document.getElementById('prideVolForm');
    var fd = new FormData(form);
    var first = (fd.get('first_name') || '').trim();
    var last = (fd.get('last_name') || '').trim();
    var email = (fd.get('email') || '').trim();
    if (!first || !last || !email) {
      window.AdminShell.toast('First name, last name and email are required.', 'error');
      return;
    }
    var payload = {
      first_name: first,
      last_name: last,
      email: email,
      phone: (fd.get('phone') || '').trim() || null,
      city: (fd.get('city') || '').trim() || null,
      zip: (fd.get('zip') || '').trim() || null,
      preferred_region: fd.get('preferred_region') || null,
      roles_interested: fd.getAll('role'),
      can_travel: fd.get('can_travel') === 'on',
      has_vehicle: fd.get('has_vehicle') === 'on',
      is_vetted: fd.get('is_vetted') === 'on',
      notes: (fd.get('notes') || '').trim() || null,
      consent_communications: true,
      source: 'admin_pride_manual'
    };
    var btn = document.getElementById('prideVolCreate');
    btn.disabled = true;
    state.client.from('pride_volunteers').insert(payload).select().single()
      .then(function (r) { if (r.error) throw r.error; return reloadVolunteers(); })
      .then(function () {
        window.AdminShell.closeDrawer();
        window.AdminShell.toast('Volunteer added.', 'success');
      })
      .catch(function (err) {
        console.error(err);
        window.AdminShell.toast(
          err && err.code === '23505' ? 'A volunteer with that email already exists.'
            : 'Could not add the volunteer.', 'error');
        btn.disabled = false;
      });
  }

  // ---- delete volunteer (two-step confirm in the drawer footer) ----
  function confirmDeleteVol(v) {
    var ft = document.getElementById('shellDrawerFoot');
    if (!ft) return;
    var name = ((v.first_name || '') + ' ' + (v.last_name || '')).trim() || 'this volunteer';
    ft.innerHTML =
      '<span class="pride-del-warn">Delete ' + P.esc(name) +
        '? This also removes their event assignments.</span>' +
      '<button type="button" class="shell-btn shell-btn-outline" id="prideVolDelCancel">Cancel</button>' +
      '<button type="button" class="shell-btn shell-btn-danger" id="prideVolDelYes">Delete volunteer</button>';
    document.getElementById('prideVolDelCancel').onclick = function () { openVolDrawer(v); };
    document.getElementById('prideVolDelYes').onclick = function () { deleteVolunteer(v); };
  }

  function deleteVolunteer(v) {
    var btn = document.getElementById('prideVolDelYes');
    if (btn) btn.disabled = true;
    state.client.from('pride_volunteers').delete().eq('id', v.id)
      .then(function (r) { if (r.error) throw r.error; state.activeId = null; return reloadVolunteers(); })
      .then(function () {
        window.AdminShell.closeDrawer();
        window.AdminShell.toast('Volunteer deleted.', 'success');
      })
      .catch(function (err) {
        console.error(err);
        window.AdminShell.toast('Could not delete the volunteer.', 'error');
        if (btn) btn.disabled = false;
      });
  }

  function volDrawerBody(v) {
    var list = (state.byVol[v.id] || []).slice();
    var order = { confirmed: 0, tentative: 1, declined: 2, removed: 3 };
    list.sort(function (a, b) {
      var d = (order[a.status] - order[b.status]);
      if (d) return d;
      return new Date(a.event_date) - new Date(b.event_date);
    });
    var confirmed = list.filter(function (a) { return a.status === 'confirmed'; });

    var popover = confirmed.length
      ? confirmed.map(function (a) {
          return '<span class="pride-chip is-confirmed">' + P.esc(a.event_name) +
            ' · ' + P.esc(P.fmtEventDate(a.event_date)) + '</span>';
        }).join('')
      : '<p class="admin-muted" style="font-size:13px">No confirmed events yet.</p>';

    var assignRows = list.length
      ? '<table class="pride-mini-table"><tbody>' + list.map(function (a) {
          return '<tr><td>' + P.esc(a.event_name) +
            '<span class="admin-cell-sub">' + P.esc(P.fmtEventDate(a.event_date)) +
            ' · ' + P.esc(a.event_city) + ' · ' + P.esc(P.prettyRole(a.role)) + '</span></td>' +
            '<td style="text-align:right">' + P.statusPill(a.status) + '</td>' +
            '<td style="text-align:right">' + assignActions(a) + '</td></tr>';
        }).join('') + '</tbody></table>'
      : '<p class="admin-muted" style="font-size:13px">Not assigned to any event yet.</p>';

    function row(label, val) {
      return '<tr><td style="color:rgba(255,255,255,0.5);width:42%">' + P.esc(label) + '</td><td>' +
        (val || '<span class="admin-muted">&mdash;</span>') + '</td></tr>';
    }
    var rolesInt = (v.roles_interested || []).map(function (x) { return P.titleCase(x); }).join(', ');
    var evInt = (v.events_interested || []).length + ' selected';
    var vehicle = v.has_vehicle
      ? ('Yes' + (v.vehicle_capacity ? ' (' + v.vehicle_capacity + ' seats)' : '')) : 'No';

    return [
      '<div class="pride-drawer-section">',
        '<h4>Confirmed events</h4>', popover,
      '</div>',
      '<div class="pride-drawer-section">',
        '<h4>All assignments</h4>', assignRows,
        (state.canWrite ? assignFormHtml(v) : ''),
      '</div>',
      '<div class="pride-drawer-section">',
        '<h4>Volunteer detail</h4>',
        '<table class="pride-mini-table"><tbody>',
          row('Email', v.email ? '<a href="mailto:' + P.escAttr(v.email) + '">' + P.esc(v.email) + '</a>' : ''),
          row('Phone', P.esc(v.phone)),
          row('City / ZIP', P.esc([v.city, v.zip].filter(Boolean).join(' · '))),
          row('Preferred region', P.esc(P.regionLabel(v.preferred_region))),
          row('Wants to', P.esc(rolesInt)),
          row('Events interested', P.esc(evInt)),
          row('Can travel', v.can_travel ? 'Yes' : 'No'),
          row('Vehicle', P.esc(vehicle)),
          row('T-shirt', P.esc(v.tshirt_size)),
          row('Accessibility', P.esc(v.accessibility_needs)),
          row('Notes', P.esc(v.notes)),
          row('Signed up', P.esc(new Date(v.created_at).toLocaleString())),
        '</tbody></table>',
      '</div>'
    ].join('');
  }

  function assignActions(a) {
    if (!state.canWrite) return '';
    function b(status, label) {
      return '<button type="button" data-act="set" data-id="' + P.escAttr(a.id) +
        '" data-status="' + status + '"' + (a.status === status ? ' class="is-current"' : '') +
        '>' + label + '</button>';
    }
    return '<div class="pride-row-actions" style="justify-content:flex-end">' +
      b('confirmed', 'Confirm') + b('tentative', 'Tentative') +
      b('declined', 'Decline') + b('removed', 'Remove') + '</div>';
  }

  function assignFormHtml(v) {
    var evOpts = state.events.map(function (e) {
      return '<option value="' + P.escAttr(e.id) + '">' +
        P.esc(P.fmtEventDate(e.event_date)) + ' — ' + P.esc(e.name) + ' (' + P.esc(e.city) + ')</option>';
    }).join('');
    var roleOpts = P.ROLE_OPTIONS.map(function (r) {
      return '<option value="' + r + '">' + P.titleCase(r) + '</option>';
    }).join('');
    return '<form id="prideAssignForm" class="pride-form" style="margin-top:12px">' +
      '<div class="pride-form-row">' +
        '<label>Assign to event<select name="event_id" required>' + evOpts + '</select></label>' +
        '<label>Role<select name="role">' + roleOpts + '</select></label>' +
      '</div>' +
      '<button type="button" class="shell-btn shell-btn-outline" id="prideAssignBtn" ' +
        'data-vid="' + P.escAttr(v.id) + '">Add to event (tentative)</button>' +
      '</form>';
  }

  function reopenActive() {
    if (!state.activeId) return;
    var v = state.volunteers.find(function (x) { return x.id === state.activeId; });
    if (v) {
      document.getElementById('shellDrawerBody').innerHTML = volDrawerBody(v);
    }
  }

  // ---- events ----
  function bindEvents() {
    var debT;
    document.addEventListener('input', function (ev) {
      if (ev.target && ev.target.id === 'prideVolSearch') {
        clearTimeout(debT);
        debT = setTimeout(function () { state.search = ev.target.value.trim(); applyFilters(); }, 120);
      }
    });
    document.addEventListener('change', function (ev) {
      if (ev.target && ev.target.id === 'prideVolRegion') {
        state.region = ev.target.value; applyFilters();
      }
    });
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (t && t.id === 'prideVolExport') { exportCsv(); return; }
      if (t && t.id === 'prideVolAdd') { openAddVolDrawer(); return; }

      var setBtn = t.closest && t.closest('[data-act="set"]');
      if (setBtn) {
        if (!state.canWrite) { window.AdminShell.toast('Read-only role.', 'error'); return; }
        setBtn.disabled = true;
        P.setAssignmentStatus(state.client, setBtn.dataset.id, setBtn.dataset.status)
          .then(function () { return refreshAssignments(); })
          .then(function () { reopenActive(); window.AdminShell.toast('Status updated.', 'success'); })
          .catch(function (e) { console.error(e); window.AdminShell.toast('Could not update status.', 'error'); });
        return;
      }

      if (t && t.id === 'prideAssignBtn') {
        var form = document.getElementById('prideAssignForm');
        var fd = new FormData(form);
        var payload = {
          event_id: fd.get('event_id'),
          volunteer_id: t.dataset.vid,
          role: fd.get('role') || 'marcher',
          status: 'tentative',
          set_by: (state.client.auth && state.client.auth.user && state.client.auth.user.email) || null
        };
        t.disabled = true;
        state.client.from('pride_event_volunteers').insert(payload).select().single()
          .then(function (r) { if (r.error) throw r.error; return refreshAssignments(); })
          .then(function () { reopenActive(); window.AdminShell.toast('Added to event.', 'success'); })
          .catch(function (e) {
            console.error(e);
            window.AdminShell.toast(
              e && e.code === '23505' ? 'Already assigned to that event.' : 'Could not assign.', 'error');
            t.disabled = false;
          });
        return;
      }

      var tr = t.closest && t.closest('tr[data-vid]');
      if (tr && !t.closest('a')) {
        var v = state.volunteers.find(function (x) { return x.id === tr.dataset.vid; });
        if (v) openVolDrawer(v);
      }
    });
  }

  function exportCsv() {
    if (!state.filtered.length) {
      window.AdminShell.toast('Nothing to export with the current filters.', 'error');
      return;
    }
    var cols = ['first_name', 'last_name', 'email', 'phone', 'city', 'zip',
      'preferred_region', 'roles_interested', 'can_travel', 'has_vehicle',
      'confirmed_events', 'tentative_events', 'created_at'];
    var lines = [cols.join(',')];
    state.filtered.forEach(function (v) {
      var c = statusCounts(v.id);
      var rec = {
        first_name: v.first_name, last_name: v.last_name, email: v.email,
        phone: v.phone, city: v.city, zip: v.zip,
        preferred_region: v.preferred_region,
        roles_interested: (v.roles_interested || []).join('; '),
        can_travel: v.can_travel, has_vehicle: v.has_vehicle,
        confirmed_events: c.confirmed, tentative_events: c.tentative,
        created_at: v.created_at
      };
      lines.push(cols.map(function (k) {
        var val = rec[k];
        if (typeof val === 'boolean') val = val ? 'true' : 'false';
        if (val == null) val = '';
        val = String(val).replace(/"/g, '""');
        return /[,"\n]/.test(val) ? '"' + val + '"' : val;
      }).join(','));
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'ohiopride-road-tour-volunteers-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    window.AdminShell.toast('Exported ' + state.filtered.length + ' volunteers.', 'success');
  }

  function $(id) { return document.getElementById(id); }
})();
