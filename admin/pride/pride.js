/* =========================================================================
   Ohio Pride PAC :: /admin/pride
   -------------------------------------------------------------------------
   Road Tour coordinator dashboard. Reads pride_events, pride_volunteers,
   pride_event_volunteers (+ roster view). Lets admins:
     - browse all events with confirmed/tentative/declined/removed counts
     - flip an assignment's status across the 4 tabs
     - add a volunteer to an event
     - remove an assignment (soft via status='removed', or hard delete)
     - export the current tab to CSV

   Auth: relies on admin-shell.js. Reads `state.client` from the shell-ready
   event and assumes RLS gates everything by public.is_admin().
   ========================================================================= */

(function () {
  'use strict';

  // ---------- Constants ----------
  var STATUS_TABS = [
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'tentative', label: 'Tentative' },
    { key: 'declined',  label: 'Declined'  },
    { key: 'removed',   label: 'Removed'   }
  ];

  var ROLE_OPTIONS = [
    'marcher','captain','tabler','driver','photographer','greeter','marshal','scout','other'
  ];

  var state = {
    client: null,
    canWrite: false,
    activeTab: 'confirmed',
    activeEventId: '',          // '' = all events
    activeRegion: '',
    search: '',
    rosters: [],                // pride_event_roster_v rows
    assignments: [],            // pride_event_volunteers_v rows
    volunteers: [],             // pride_volunteers full list (for add picker)
    rostersById: {}             // event_id -> roster row
  };

  // ---------- Bootstrap ----------
  document.addEventListener('admin-shell-ready', function (ev) {
    var detail = ev.detail || {};
    state.client = detail.client;
    state.canWrite = detail.can('pride','write') || detail.can('pride','admin') ||
                     (detail.roles || []).some(function (r) { return r.slug === 'super_admin'; });

    var actions = document.getElementById('shellPageActions');
    actions.innerHTML =
      '<a class="shell-btn shell-btn-outline" href="/pride/signup" target="_blank" rel="noopener">View signup form</a>' +
      (state.canWrite
        ? '<button type="button" class="shell-btn shell-btn-outline" id="prideAdd">Assign volunteer</button>'
        : '') +
      '<button type="button" class="shell-btn shell-btn-primary" id="prideExport">Export CSV</button>';

    document.getElementById('shellBody').innerHTML = pageHtml();

    loadAll().catch(function (err) {
      console.error('pride dashboard load failed', err);
      document.getElementById('prideBody').innerHTML =
        '<div class="pride-empty admin-error">Could not load the Pride dashboard. ' +
        'Your role may not include this module, or RLS blocked the query.</div>';
    });

    bindEvents();
  });

  // ---------- HTML scaffolding ----------
  function pageHtml() {
    return [
      // KPI strip
      '<div class="admin-stat-grid">',
        '<div class="admin-stat"><div class="admin-stat-num" id="kpiEvents">0</div><div class="admin-stat-label">Events</div></div>',
        '<div class="admin-stat"><div class="admin-stat-num" id="kpiConfirmed">0</div><div class="admin-stat-label">Confirmed</div></div>',
        '<div class="admin-stat"><div class="admin-stat-num" id="kpiTentative">0</div><div class="admin-stat-label">Tentative</div></div>',
        '<div class="admin-stat"><div class="admin-stat-num" id="kpiDeclined">0</div><div class="admin-stat-label">Declined</div></div>',
        '<div class="admin-stat"><div class="admin-stat-num" id="kpiRemoved">0</div><div class="admin-stat-label">Removed</div></div>',
      '</div>',

      // Toolbar
      '<div class="admin-toolbar">',
        '<input type="search" class="admin-input" id="prideSearch" placeholder="Search volunteer, role, or notes..." autocomplete="off" />',
        '<select class="admin-input pride-event-filter" id="prideEventFilter"><option value="">All events</option></select>',
        '<select class="admin-input" id="prideRegionFilter">',
          '<option value="">All regions</option>',
          '<option value="Central">Central</option>',
          '<option value="NE">Northeast</option>',
          '<option value="NW">Northwest</option>',
          '<option value="SE">Southeast</option>',
          '<option value="SW">Southwest</option>',
        '</select>',
        '<span class="admin-toolbar-spacer"></span>',
        '<span class="admin-result-count" id="prideCount"></span>',
      '</div>',

      // Tabs
      '<div class="pride-tabs" id="prideTabs">',
        STATUS_TABS.map(function (t) {
          return '<button type="button" class="pride-tab' + (t.key === state.activeTab ? ' is-active' : '') +
                 '" data-tab="' + t.key + '">' + t.label +
                 '<span class="pride-tab-count" data-tab-count="' + t.key + '">0</span></button>';
        }).join(''),
      '</div>',

      // Body
      '<div id="prideBody"><div class="pride-empty">Loading...</div></div>'
    ].join('');
  }

  // ---------- Data loading ----------
  function loadAll() {
    return Promise.all([
      state.client
        .from('pride_event_roster_v')
        .select('*')
        .order('event_date', { ascending: true })
        .then(function (r) { if (r.error) throw r.error; state.rosters = r.data || []; }),
      state.client
        .from('pride_event_volunteers_v')
        .select('*')
        .order('set_at', { ascending: false })
        .then(function (r) { if (r.error) throw r.error; state.assignments = r.data || []; }),
      state.client
        .from('pride_volunteers')
        .select('id, first_name, last_name, email, city, preferred_region')
        .order('last_name', { ascending: true })
        .then(function (r) { if (r.error) throw r.error; state.volunteers = r.data || []; })
    ]).then(function () {
      state.rostersById = {};
      state.rosters.forEach(function (e) { state.rostersById[e.event_id] = e; });
      populateEventFilter();
      renderKpis();
      renderTabCounts();
      render();
    });
  }

  function refreshAssignments() {
    return state.client
      .from('pride_event_volunteers_v')
      .select('*')
      .order('set_at', { ascending: false })
      .then(function (r) {
        if (r.error) throw r.error;
        state.assignments = r.data || [];
      });
  }

  function refreshRosters() {
    return state.client
      .from('pride_event_roster_v')
      .select('*')
      .order('event_date', { ascending: true })
      .then(function (r) {
        if (r.error) throw r.error;
        state.rosters = r.data || [];
        state.rostersById = {};
        state.rosters.forEach(function (e) { state.rostersById[e.event_id] = e; });
      });
  }

  // ---------- Rendering ----------
  function renderKpis() {
    var totals = state.rosters.reduce(function (acc, e) {
      acc.confirmed += e.confirmed_count || 0;
      acc.tentative += e.tentative_count || 0;
      acc.declined  += e.declined_count  || 0;
      acc.removed   += e.removed_count   || 0;
      return acc;
    }, { confirmed: 0, tentative: 0, declined: 0, removed: 0 });

    $('kpiEvents').textContent     = state.rosters.length.toLocaleString();
    $('kpiConfirmed').textContent  = totals.confirmed.toLocaleString();
    $('kpiTentative').textContent  = totals.tentative.toLocaleString();
    $('kpiDeclined').textContent   = totals.declined.toLocaleString();
    $('kpiRemoved').textContent    = totals.removed.toLocaleString();
  }

  function renderTabCounts() {
    var counts = { confirmed: 0, tentative: 0, declined: 0, removed: 0 };
    filtered(/* respectStatus= */ false).forEach(function (a) {
      if (counts[a.status] != null) counts[a.status]++;
    });
    STATUS_TABS.forEach(function (t) {
      var el = document.querySelector('[data-tab-count="' + t.key + '"]');
      if (el) el.textContent = counts[t.key];
    });
  }

  function filtered(respectStatus) {
    if (respectStatus == null) respectStatus = true;
    var q = (state.search || '').toLowerCase();
    return state.assignments.filter(function (a) {
      if (respectStatus && a.status !== state.activeTab) return false;
      if (state.activeEventId && a.event_id !== state.activeEventId) return false;
      if (state.activeRegion && a.event_region !== state.activeRegion) return false;
      if (q) {
        var hay = (
          (a.first_name||'') + ' ' + (a.last_name||'') + ' ' + (a.volunteer_email||'') + ' ' +
          (a.role||'') + ' ' + (a.notes||'') + ' ' + (a.event_name||'') + ' ' + (a.event_city||'')
        ).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function render() {
    renderTabCounts();
    var rows = filtered(true);
    $('prideCount').textContent =
      rows.length === state.assignments.length
        ? rows.length + ' assignments'
        : rows.length + ' shown';

    var body = $('prideBody');
    if (rows.length === 0) {
      body.innerHTML = '<div class="pride-table-wrap"><div class="pride-empty">' +
        emptyMessage() + '</div></div>';
      return;
    }

    // Group by event
    var byEvent = {};
    rows.forEach(function (a) {
      (byEvent[a.event_id] = byEvent[a.event_id] || []).push(a);
    });

    // Sort event groups by event_date asc
    var eventIds = Object.keys(byEvent).sort(function (x, y) {
      var ex = state.rostersById[x], ey = state.rostersById[y];
      return (ex && ey)
        ? new Date(ex.event_date) - new Date(ey.event_date)
        : 0;
    });

    body.innerHTML = eventIds.map(function (eid) {
      var rost = state.rostersById[eid] || {};
      var list = byEvent[eid];
      return [
        '<div class="pride-event-group">',
          '<div class="pride-event-head">',
            '<h3>', escapeHtml(rost.name || 'Event'),
              rost.pac_priority ? ' <span class="admin-pill" style="background:rgba(115,215,238,0.12);color:#73D7EE">Priority</span>' : '',
            '</h3>',
            '<div class="pride-event-head-meta">',
              escapeHtml(fmtEventDate(rost.event_date)), ' &middot; ', escapeHtml(rost.city || ''),
              ', ', escapeHtml(regionLabel(rost.region)),
              ' &middot; <b>', list.length, '</b> ', state.activeTab,
            '</div>',
          '</div>',
          assignmentTable(list),
        '</div>'
      ].join('');
    }).join('');
  }

  function emptyMessage() {
    if (state.activeTab === 'confirmed') return 'No confirmed volunteers yet. Move tentative assignments here once they reply yes.';
    if (state.activeTab === 'tentative') return 'No tentative assignments. Add volunteers from /admin/volunteers or via "Assign volunteer".';
    if (state.activeTab === 'declined')  return 'No declined assignments. Volunteers who said no will show up here.';
    if (state.activeTab === 'removed')   return 'No removed assignments. Use "Remove" on an assignment to send it here.';
    return 'No assignments match the current filters.';
  }

  function assignmentTable(rows) {
    var rowHtml = rows.map(function (a) {
      var name = ((a.first_name||'') + ' ' + (a.last_name||'')).trim() || a.volunteer_email || '(unknown)';
      var contact = [a.volunteer_email, a.volunteer_phone].filter(Boolean).map(escapeHtml).join(' &middot; ');
      var captain = a.is_captain ? '<span class="pride-captain-badge">Captain</span>' : '';
      var notes = a.notes ? '<span class="admin-cell-sub">' + escapeHtml(a.notes) + '</span>' : '';
      return '<tr data-id="' + escapeAttr(a.id) + '">' +
        '<td class="admin-cell-name">' + escapeHtml(name) + captain +
          (a.volunteer_city ? '<span class="admin-cell-sub">' + escapeHtml(a.volunteer_city) + '</span>' : '') +
        '</td>' +
        '<td>' + (contact || '<span class="admin-muted">&mdash;</span>') + '</td>' +
        '<td>' + escapeHtml(prettyRole(a.role)) + notes + '</td>' +
        '<td><span class="pride-status-pill pride-status-' + escapeAttr(a.status) + '">' + escapeHtml(a.status) + '</span>' +
          '<span class="admin-cell-sub">' + escapeHtml(fmtRel(a.set_at)) +
            (a.set_by ? ' by ' + escapeHtml(a.set_by.split('@')[0]) : '') +
          '</span>' +
        '</td>' +
        '<td>' + actionsHtml(a) + '</td>' +
      '</tr>';
    }).join('');

    return [
      '<div class="pride-table-wrap"><div class="admin-table-wrap" style="border:none;">',
        '<table class="admin-table pride-table">',
          '<thead><tr>',
            '<th>Volunteer</th><th>Contact</th><th>Role</th><th>Status</th><th>Actions</th>',
          '</tr></thead>',
          '<tbody>', rowHtml, '</tbody>',
        '</table>',
      '</div></div>'
    ].join('');
  }

  function actionsHtml(a) {
    if (!state.canWrite) return '<span class="admin-muted">read-only</span>';
    var btn = function (status, label) {
      return '<button type="button" data-action="set-status" data-id="' + escapeAttr(a.id) +
             '" data-status="' + status + '"' +
             (a.status === status ? ' class="is-current"' : '') + '>' + label + '</button>';
    };
    return '<div class="pride-row-actions">' +
      btn('confirmed','Confirm') +
      btn('tentative','Tentative') +
      btn('declined','Decline') +
      btn('removed','Remove') +
      '<button type="button" data-action="delete" data-id="' + escapeAttr(a.id) + '" title="Hard delete">&times;</button>' +
    '</div>';
  }

  function populateEventFilter() {
    var sel = $('prideEventFilter');
    while (sel.options.length > 1) sel.remove(1);
    state.rosters.forEach(function (e) {
      var opt = document.createElement('option');
      opt.value = e.event_id;
      opt.textContent = fmtEventDate(e.event_date) + ' — ' + e.name + ' (' + e.city + ')';
      sel.appendChild(opt);
    });
  }

  // ---------- Mutations ----------
  function setStatus(id, status) {
    var row = state.assignments.find(function (a) { return a.id === id; });
    if (!row) return Promise.reject(new Error('row not found'));
    if (row.status === status) return Promise.resolve();

    var prev = row.status;
    row.status = status;     // optimistic
    render();
    return state.client
      .from('pride_event_volunteers')
      .update({ status: status, set_by: state.client.auth.user ? state.client.auth.user.email : null })
      .eq('id', id)
      .then(function (r) {
        if (r.error) {
          row.status = prev;
          render();
          throw r.error;
        }
        return refreshRosters().then(function () { renderKpis(); renderTabCounts(); });
      });
  }

  function hardDelete(id) {
    if (!confirm('Permanently delete this assignment? Use "Remove" if you want to keep an audit trail.')) return;
    state.client
      .from('pride_event_volunteers')
      .delete()
      .eq('id', id)
      .then(function (r) {
        if (r.error) throw r.error;
        state.assignments = state.assignments.filter(function (a) { return a.id !== id; });
        return refreshRosters();
      })
      .then(function () { renderKpis(); render(); window.AdminShell.toast('Assignment deleted.', 'success'); })
      .catch(function (err) { console.error(err); window.AdminShell.toast('Could not delete.', 'error'); });
  }

  function openAddDrawer() {
    var eventOpts = state.rosters.map(function (e) {
      return '<option value="' + escapeAttr(e.event_id) + '">' +
        fmtEventDate(e.event_date) + ' — ' + escapeHtml(e.name) + ' (' + escapeHtml(e.city) + ')' +
      '</option>';
    }).join('');

    var volOpts = state.volunteers.map(function (v) {
      var label = ((v.first_name||'') + ' ' + (v.last_name||'')).trim() + ' — ' + (v.email||'');
      return '<option value="' + escapeAttr(v.id) + '">' + escapeHtml(label) + '</option>';
    }).join('');

    var roleOpts = ROLE_OPTIONS.map(function (r) {
      return '<option value="' + r + '">' + prettyRole(r) + '</option>';
    }).join('');

    var statusOpts = STATUS_TABS.map(function (t) {
      return '<option value="' + t.key + '"' + (t.key==='tentative' ? ' selected' : '') + '>' + t.label + '</option>';
    }).join('');

    var body =
      '<form id="prideAddForm" class="admin-form">' +
        '<label>Event<select class="admin-input" name="event_id" required>' + eventOpts + '</select></label>' +
        '<label>Volunteer<select class="admin-input" name="volunteer_id" required>' + volOpts + '</select></label>' +
        '<label>Role<select class="admin-input" name="role">' + roleOpts + '</select></label>' +
        '<label>Status<select class="admin-input" name="status">' + statusOpts + '</select></label>' +
        '<label><input type="checkbox" name="is_captain" /> Captain</label>' +
        '<label>Notes<textarea class="admin-input" name="notes" rows="2"></textarea></label>' +
      '</form>';

    window.AdminShell.openDrawer({
      eyebrow: 'New assignment',
      title: 'Assign volunteer to event',
      bodyHtml: body,
      footHtml:
        '<button type="button" class="shell-btn shell-btn-outline" data-drawer-close>Cancel</button>' +
        '<button type="button" class="shell-btn shell-btn-primary" id="prideAddSubmit">Save</button>'
    });

    document.getElementById('prideAddSubmit').onclick = function () {
      var form = document.getElementById('prideAddForm');
      var fd = new FormData(form);
      var payload = {
        event_id: fd.get('event_id'),
        volunteer_id: fd.get('volunteer_id'),
        role: fd.get('role') || 'marcher',
        status: fd.get('status') || 'tentative',
        is_captain: fd.get('is_captain') === 'on',
        notes: fd.get('notes') || null,
        set_by: (state.client.auth.user && state.client.auth.user.email) || null
      };
      state.client.from('pride_event_volunteers').insert(payload).select().single()
        .then(function (r) {
          if (r.error) throw r.error;
          return Promise.all([refreshAssignments(), refreshRosters()]);
        })
        .then(function () {
          window.AdminShell.closeDrawer();
          renderKpis(); render();
          window.AdminShell.toast('Assignment created.', 'success');
        })
        .catch(function (err) {
          console.error(err);
          window.AdminShell.toast(
            err && err.code === '23505' ? 'That volunteer is already on this event.'
                                        : 'Could not create assignment.',
            'error'
          );
        });
    };
  }

  // ---------- Events ----------
  function bindEvents() {
    var debT;
    document.addEventListener('input', function (ev) {
      if (ev.target && ev.target.id === 'prideSearch') {
        clearTimeout(debT);
        debT = setTimeout(function () { state.search = ev.target.value.trim(); render(); }, 120);
      }
    });
    document.addEventListener('change', function (ev) {
      if (!ev.target) return;
      if (ev.target.id === 'prideEventFilter') { state.activeEventId = ev.target.value; render(); }
      if (ev.target.id === 'prideRegionFilter') { state.activeRegion = ev.target.value; render(); }
    });
    document.addEventListener('click', function (ev) {
      var tab = ev.target.closest && ev.target.closest('[data-tab]');
      if (tab) {
        document.querySelectorAll('.pride-tab').forEach(function (b) { b.classList.remove('is-active'); });
        tab.classList.add('is-active');
        state.activeTab = tab.dataset.tab;
        render();
        return;
      }
      var btn = ev.target.closest && ev.target.closest('[data-action]');
      if (btn) {
        var id = btn.dataset.id;
        if (btn.dataset.action === 'set-status') {
          setStatus(id, btn.dataset.status).catch(function (err) {
            console.error(err); window.AdminShell.toast('Could not update status.', 'error');
          });
        } else if (btn.dataset.action === 'delete') {
          hardDelete(id);
        }
        return;
      }
      if (ev.target && ev.target.id === 'prideAdd') openAddDrawer();
      if (ev.target && ev.target.id === 'prideExport') exportCsv();
    });
  }

  // ---------- Export ----------
  function exportCsv() {
    var rows = filtered(true);
    if (rows.length === 0) {
      window.AdminShell.toast('Nothing to export with the current filters.', 'error');
      return;
    }
    var cols = ['event_date','event_name','event_city','event_region','first_name','last_name',
                'volunteer_email','volunteer_phone','role','is_captain','status','set_at','set_by','notes'];
    var lines = [cols.join(',')];
    rows.forEach(function (r) {
      lines.push(cols.map(function (c) {
        var v = r[c];
        if (typeof v === 'boolean') v = v ? 'true' : 'false';
        if (v == null) v = '';
        v = String(v).replace(/"/g, '""');
        return /[,"\n]/.test(v) ? '"' + v + '"' : v;
      }).join(','));
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'ohiopride-road-tour-' + state.activeTab + '-' + new Date().toISOString().slice(0,10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    window.AdminShell.toast('Exported ' + rows.length + ' rows.', 'success');
  }

  // ---------- Helpers ----------
  function $(id) { return document.getElementById(id); }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }
  function prettyRole(r) {
    return (r || 'marcher').replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }
  function regionLabel(r) {
    return { 'NE':'Northeast','NW':'Northwest','SE':'Southeast','SW':'Southwest','Central':'Central' }[r] || (r || '');
  }
  function fmtEventDate(d) {
    if (!d) return '';
    var dt = new Date(d + 'T12:00:00');
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' });
  }
  function fmtRel(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    var diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60)        return 'Just now';
    if (diff < 3600)      return Math.floor(diff/60) + 'm ago';
    if (diff < 86400)     return Math.floor(diff/3600) + 'h ago';
    if (diff < 86400 * 7) return Math.floor(diff/86400) + 'd ago';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
})();
