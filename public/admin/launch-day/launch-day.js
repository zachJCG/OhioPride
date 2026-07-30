/* =========================================================================
   Ohio Pride PAC :: /admin/launch-day
   -------------------------------------------------------------------------
   Roster of every launch-day RSVP (public.launch_signups). Modeled on
   /admin/pride/volunteers: searchable list, source filter, KPIs, CSV
   export, and a detail drawer. Admins (launch:write / super_admin) can
   add an RSVP by hand or delete one.

   The public RSVP form on /launch-day inserts as the anon role; this page
   reads back via the launch_signups_admin_select RLS policy (is_admin()).
   ========================================================================= */

(function () {
  'use strict';

  var P = window.PrideAdmin;

  var state = {
    client: null,
    canWrite: false,
    rsvps: [],
    filtered: [],
    search: '',
    source: '',
    activeId: null
  };

  document.addEventListener('admin-shell-ready', function (ev) {
    var detail = ev.detail || {};
    state.client = detail.client;
    state.canWrite = detail.can('launch', 'write') || detail.can('launch', 'admin') ||
      (detail.roles || []).some(function (r) { return r.slug === 'super_admin'; });

    document.getElementById('shellPageActions').innerHTML =
      '<a class="shell-btn shell-btn-outline" href="/launch-day" target="_blank" rel="noopener">View RSVP form</a>' +
      '<button type="button" class="shell-btn shell-btn-outline" id="launchExport">Export CSV</button>' +
      (state.canWrite
        ? '<button type="button" class="shell-btn shell-btn-primary" id="launchAdd">Add RSVP</button>'
        : '');

    document.getElementById('shellBody').innerHTML = pageHtml();

    loadAll().catch(function (err) {
      console.error('launch-day load failed', err);
      document.getElementById('launchBody').innerHTML =
        '<tr><td colspan="5" class="admin-empty-row admin-error">Could not load launch-day RSVPs. ' +
        'Your role may not include this module, or RLS blocked the query.</td></tr>';
    });

    bindEvents();
  });

  function pageHtml() {
    return [
      '<div class="admin-stat-grid">',
        '<div class="admin-stat"><div class="admin-stat-num" id="kpiTotal">0</div><div class="admin-stat-label">RSVPs</div></div>',
        '<div class="admin-stat"><div class="admin-stat-num" id="kpiWeek">0</div><div class="admin-stat-label">Last 7 days</div></div>',
        '<div class="admin-stat"><div class="admin-stat-num" id="kpiOrgs">0</div><div class="admin-stat-label">With organization</div></div>',
        '<div class="admin-stat"><div class="admin-stat-num" id="kpiSources">0</div><div class="admin-stat-label">Sources</div></div>',
      '</div>',
      '<div class="admin-toolbar">',
        '<input type="search" class="admin-input" id="launchSearch" placeholder="Search name, email, organization, title..." autocomplete="off" />',
        '<select class="admin-input" id="launchSource"><option value="">All sources</option></select>',
        '<span class="admin-toolbar-spacer"></span>',
        '<span class="admin-result-count" id="launchCount"></span>',
      '</div>',
      '<div class="pride-cal" style="padding:16px">',
        '<div class="admin-table-wrap" style="border:none">',
          '<table class="admin-table">',
            '<thead><tr>',
              '<th>Name</th><th>Contact</th><th>Organization</th>',
              '<th>Source</th><th>RSVP’d</th>',
            '</tr></thead>',
            '<tbody id="launchBody"><tr><td colspan="5" class="admin-empty-row">Loading&hellip;</td></tr></tbody>',
          '</table>',
        '</div>',
      '</div>'
    ].join('');
  }

  function loadAll() {
    return state.client.from('launch_signups').select('*')
      .order('created_at', { ascending: false })
      .then(function (r) {
        if (r.error) throw r.error;
        state.rsvps = r.data || [];
        renderKpis();
        renderSourceOptions();
        applyFilters();
      });
  }

  function reload() {
    return loadAll();
  }

  function sources() {
    var seen = {};
    state.rsvps.forEach(function (v) { if (v.source) seen[v.source] = true; });
    return Object.keys(seen).sort();
  }

  function renderSourceOptions() {
    var sel = $('launchSource');
    if (!sel) return;
    var current = state.source;
    sel.innerHTML = '<option value="">All sources</option>' +
      sources().map(function (s) {
        return '<option value="' + P.escAttr(s) + '">' + P.esc(s) + '</option>';
      }).join('');
    sel.value = current;
  }

  function renderKpis() {
    var weekAgo = Date.now() - 7 * 86400 * 1000;
    var week = 0, orgs = 0;
    state.rsvps.forEach(function (v) {
      if (v.created_at && new Date(v.created_at).getTime() >= weekAgo) week++;
      if (v.organization && String(v.organization).trim()) orgs++;
    });
    $('kpiTotal').textContent = state.rsvps.length;
    $('kpiWeek').textContent = week;
    $('kpiOrgs').textContent = orgs;
    $('kpiSources').textContent = sources().length;
  }

  function applyFilters() {
    var q = state.search.toLowerCase();
    state.filtered = state.rsvps.filter(function (v) {
      if (state.source && v.source !== state.source) return false;
      if (q) {
        var hay = ((v.first_name || '') + ' ' + (v.last_name || '') + ' ' +
          (v.email || '') + ' ' + (v.organization || '') + ' ' +
          (v.title || '')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    renderRows();
  }

  function renderRows() {
    var body = $('launchBody');
    $('launchCount').textContent = state.filtered.length === state.rsvps.length
      ? state.rsvps.length + ' total'
      : state.filtered.length + ' of ' + state.rsvps.length;

    if (!state.filtered.length) {
      body.innerHTML = '<tr><td colspan="5" class="admin-empty-row">' +
        (state.rsvps.length ? 'No RSVPs match the current filters.'
          : 'No RSVPs yet. Submissions from the launch-day form appear here.') +
        '</td></tr>';
      return;
    }

    body.innerHTML = state.filtered.map(function (v) {
      var name = ((v.first_name || '') + ' ' + (v.last_name || '')).trim() || '&mdash;';
      var contact = v.email
        ? '<a href="mailto:' + P.escAttr(v.email) + '" class="admin-link" onclick="event.stopPropagation()">' +
          P.esc(v.email) + '</a>'
        : '<span class="admin-muted">&mdash;</span>';
      var org = [
        v.organization ? P.esc(v.organization) : '',
        v.title ? '<span class="admin-cell-sub">' + P.esc(v.title) + '</span>' : ''
      ].filter(Boolean).join('') || '<span class="admin-muted">&mdash;</span>';
      var src = v.source
        ? '<span class="admin-pill">' + P.esc(v.source) + '</span>'
        : '<span class="admin-muted">&mdash;</span>';
      return '<tr data-id="' + P.escAttr(v.id) + '" style="cursor:pointer">' +
        '<td class="admin-cell-name">' + P.esc(name) + '</td>' +
        '<td>' + contact + '</td>' +
        '<td>' + org + '</td>' +
        '<td>' + src + '</td>' +
        '<td>' + P.esc(P.fmtRel(v.created_at)) + '</td>' +
        '</tr>';
    }).join('');
  }

  // ---- drawer ----
  function openRsvpDrawer(v) {
    state.activeId = v.id;
    window.AdminShell.openDrawer({
      eyebrow: v.source || 'RSVP',
      title: ((v.first_name || '') + ' ' + (v.last_name || '')).trim() || 'RSVP',
      bodyHtml: rsvpDrawerBody(v),
      footHtml:
        (state.canWrite
          ? '<button type="button" class="shell-btn shell-btn-danger" id="launchDelete">Delete</button>'
          : '') +
        '<a class="shell-btn shell-btn-outline" href="mailto:' + P.escAttr(v.email || '') + '">Email</a>' +
        '<button type="button" class="shell-btn shell-btn-primary" data-drawer-close>Done</button>'
    });
    if (state.canWrite) {
      document.getElementById('launchDelete').onclick = function () { confirmDelete(v); };
    }
  }

  function rsvpDrawerBody(v) {
    function row(label, val) {
      return '<tr><td style="color:rgba(255,255,255,0.5);width:42%">' + P.esc(label) + '</td><td>' +
        (val || '<span class="admin-muted">&mdash;</span>') + '</td></tr>';
    }
    var consented = v.consented_at ? new Date(v.consented_at).toLocaleString() : '';
    var created = v.created_at ? new Date(v.created_at).toLocaleString() : '';
    return [
      '<div class="pride-drawer-section">',
        '<h4>RSVP detail</h4>',
        '<table class="pride-mini-table"><tbody>',
          row('Email', v.email ? '<a href="mailto:' + P.escAttr(v.email) + '">' + P.esc(v.email) + '</a>' : ''),
          row('First name', P.esc(v.first_name)),
          row('Last name', P.esc(v.last_name)),
          row('Organization', P.esc(v.organization)),
          row('Title', P.esc(v.title)),
          row('Source', P.esc(v.source)),
          row('Consented', P.esc(consented)),
          row('RSVP’d', P.esc(created)),
        '</tbody></table>',
      '</div>',
      '<div class="pride-drawer-section">',
        '<h4>Capture context</h4>',
        '<table class="pride-mini-table"><tbody>',
          row('Referrer', P.esc(v.referrer)),
          row('User agent', P.esc(v.user_agent)),
        '</tbody></table>',
      '</div>'
    ].join('');
  }

  // ---- add RSVP ----
  function openAddDrawer() {
    var srcOpts = sources().map(function (s) {
      return '<option value="' + P.escAttr(s) + '">' + P.esc(s) + '</option>';
    }).join('');
    var body = [
      '<form id="launchForm" class="pride-form">',
        '<div class="pride-drawer-section">',
          '<h4>Person</h4>',
          '<div class="pride-form-row">',
            '<label>First name<input type="text" name="first_name" required /></label>',
            '<label>Last name<input type="text" name="last_name" required /></label>',
          '</div>',
          '<label>Email<input type="email" name="email" required /></label>',
          '<div class="pride-form-row">',
            '<label>Organization<input type="text" name="organization" /></label>',
            '<label>Title<input type="text" name="title" /></label>',
          '</div>',
          '<label>Source<input type="text" name="source" list="launchSourceList" value="launch-day-rsvp" />' +
            '<datalist id="launchSourceList">' + srcOpts + '</datalist></label>',
        '</div>',
      '</form>'
    ].join('');
    window.AdminShell.openDrawer({
      eyebrow: 'New RSVP',
      title: 'Add an RSVP',
      bodyHtml: body,
      footHtml:
        '<button type="button" class="shell-btn shell-btn-outline" data-drawer-close>Cancel</button>' +
        '<button type="button" class="shell-btn shell-btn-primary" id="launchCreate">Create RSVP</button>'
    });
    document.getElementById('launchCreate').onclick = createRsvp;
  }

  function createRsvp() {
    var form = document.getElementById('launchForm');
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
      organization: (fd.get('organization') || '').trim() || null,
      title: (fd.get('title') || '').trim() || null,
      source: (fd.get('source') || '').trim() || 'launch-day-rsvp'
    };
    var btn = document.getElementById('launchCreate');
    btn.disabled = true;
    state.client.from('launch_signups').insert(payload).select().single()
      .then(function (r) { if (r.error) throw r.error; return reload(); })
      .then(function () {
        window.AdminShell.closeDrawer();
        window.AdminShell.toast('RSVP added.', 'success');
      })
      .catch(function (err) {
        console.error(err);
        window.AdminShell.toast(
          err && err.code === '23505'
            ? 'An RSVP with that email already exists for this source.'
            : 'Could not add the RSVP.', 'error');
        btn.disabled = false;
      });
  }

  // ---- delete RSVP (two-step confirm in the drawer footer) ----
  function confirmDelete(v) {
    var ft = document.getElementById('shellDrawerFoot');
    if (!ft) return;
    var name = ((v.first_name || '') + ' ' + (v.last_name || '')).trim() || 'this RSVP';
    ft.innerHTML =
      '<span class="pride-del-warn">Delete ' + P.esc(name) + '’s RSVP? This cannot be undone.</span>' +
      '<button type="button" class="shell-btn shell-btn-outline" id="launchDelCancel">Cancel</button>' +
      '<button type="button" class="shell-btn shell-btn-danger" id="launchDelYes">Delete RSVP</button>';
    document.getElementById('launchDelCancel').onclick = function () { openRsvpDrawer(v); };
    document.getElementById('launchDelYes').onclick = function () { deleteRsvp(v); };
  }

  function deleteRsvp(v) {
    var btn = document.getElementById('launchDelYes');
    if (btn) btn.disabled = true;
    state.client.from('launch_signups').delete().eq('id', v.id)
      .then(function (r) { if (r.error) throw r.error; state.activeId = null; return reload(); })
      .then(function () {
        window.AdminShell.closeDrawer();
        window.AdminShell.toast('RSVP deleted.', 'success');
      })
      .catch(function (err) {
        console.error(err);
        window.AdminShell.toast('Could not delete the RSVP.', 'error');
        if (btn) btn.disabled = false;
      });
  }

  // ---- events ----
  function bindEvents() {
    var debT;
    document.addEventListener('input', function (ev) {
      if (ev.target && ev.target.id === 'launchSearch') {
        clearTimeout(debT);
        debT = setTimeout(function () { state.search = ev.target.value.trim(); applyFilters(); }, 120);
      }
    });
    document.addEventListener('change', function (ev) {
      if (ev.target && ev.target.id === 'launchSource') {
        state.source = ev.target.value; applyFilters();
      }
    });
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (t && t.id === 'launchExport') { exportCsv(); return; }
      if (t && t.id === 'launchAdd') { openAddDrawer(); return; }

      var tr = t.closest && t.closest('tr[data-id]');
      if (tr && !t.closest('a')) {
        var v = state.rsvps.find(function (x) { return String(x.id) === tr.dataset.id; });
        if (v) openRsvpDrawer(v);
      }
    });
  }

  function exportCsv() {
    if (!state.filtered.length) {
      window.AdminShell.toast('Nothing to export with the current filters.', 'error');
      return;
    }
    var cols = ['first_name', 'last_name', 'email', 'organization', 'title',
      'source', 'referrer', 'consented_at', 'created_at'];
    var lines = [cols.join(',')];
    state.filtered.forEach(function (v) {
      lines.push(cols.map(function (k) {
        var val = v[k];
        if (val == null) val = '';
        val = String(val).replace(/"/g, '""');
        return /[,"\n]/.test(val) ? '"' + val + '"' : val;
      }).join(','));
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'ohiopride-launch-day-rsvps-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    window.AdminShell.toast('Exported ' + state.filtered.length + ' RSVPs.', 'success');
  }

  function $(id) { return document.getElementById(id); }
})();
