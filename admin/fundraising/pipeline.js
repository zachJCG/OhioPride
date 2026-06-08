/* =========================================================================
   Ohio Pride :: Fundraising pipeline (shared by PAC individuals + c4 companies)
   -------------------------------------------------------------------------
   THE LEGAL WALL: PAC (pac_prospects / pac_pipeline) and c4 (c4_prospects /
   c4_pipeline) are legally separate. This module is instantiated ONCE per page
   bound to exactly one side via init(cfg). It never reads or writes the other
   side's tables, and each page is gated on its own module permission.

   Frontend only — schema, RLS, RPCs, and views are already wired + verified.
   ========================================================================= */
(function () {
  'use strict';

  // Stage vocabulary (shared convention).
  var STAGES = ['identified','qualified','cultivating','ask_made','committed','secured','stewardship','lapsed','declined'];
  var STAGE_LABEL = {
    identified:'Identified', qualified:'Qualified', cultivating:'Cultivating',
    ask_made:'Ask Made', committed:'Committed', secured:'Secured',
    stewardship:'Stewardship', lapsed:'Lapsed', declined:'Declined'
  };
  var STAGE_COLOR = {
    identified:'#64748B', qualified:'#234A66', cultivating:'#1A3A52',
    ask_made:'#C2740A', committed:'#9A6700', secured:'#008026',
    stewardship:'#066B23', lapsed:'#9CA3AF', declined:'#9B2C2C'
  };
  var STATUS_OPTIONS = ['active','on_hold','archived'];
  var STATUS_LABEL = { active:'Active', on_hold:'On hold', archived:'Archived' };
  var PRIORITY_OPTIONS = ['low','medium','high'];
  var PRIORITY_LABEL = { low:'Low', medium:'Medium', high:'High' };

  function $(id) { return document.getElementById(id); }

  function money(cents) {
    if (cents == null) return '';
    var n = Number(cents);
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD',
      minimumFractionDigits: n % 100 ? 2 : 0
    }).format(n / 100);
  }
  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function relTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var secs = Math.round((Date.now() - d.getTime()) / 1000);
    if (secs < 60) return 'just now';
    var mins = Math.round(secs / 60);
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    var days = Math.round(hrs / 24);
    if (days < 30) return days + 'd ago';
    return fmtDate(iso);
  }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }
  function toast(msg, kind) { if (window.AdminShell && window.AdminShell.toast) window.AdminShell.toast(msg, kind); }
  function titleize(s) {
    return String(s || '').replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function stagePill(stage) {
    return '<span class="fund-stage-pill" style="background:' + (STAGE_COLOR[stage] || '#64748B') + '">' +
      escapeHtml(STAGE_LABEL[stage] || stage) + '</span>';
  }

  function init(cfg) {
    var state = {
      client: null,
      canWrite: false,
      rows: [],
      filtered: [],
      adminUsers: [],
      adminUserById: {},
      sortKey: 'capacity_estimate_cents',
      sortDir: 'desc',
      // filters
      search: '',
      type: cfg.defaultType || '',
      stageFilter: [],
      ownerId: '',
      source: '',
      county: '',
      priority: '',
      dnc: '',
      activeRow: null
    };

    document.addEventListener('admin-shell-ready', function (ev) {
      state.client = (ev.detail || {}).client;
      if (!state.client) return;

      Promise.all([
        state.client.rpc('has_permission', { p_module: cfg.module, p_action: 'read' }),
        state.client.rpc('has_permission', { p_module: cfg.module, p_action: 'write' })
      ]).then(function (res) {
        var canRead = res[0] && res[0].data === true;
        state.canWrite = res[1] && res[1].data === true;
        if (!canRead) { renderDenied(); return; }
        renderShell();
        bindEvents();
        loadAdminUsers().then(function () { loadData(); });
      }).catch(function (err) {
        console.error('fundraising gate failed', err);
        renderDenied();
      });
    });

    function renderDenied() {
      $('shellBody').innerHTML =
        '<div class="admin-panel"><div class="admin-panel-empty">' +
          '<div class="admin-panel-empty-eyebrow">Restricted</div>' +
          '<h2>You don’t have access to this pipeline</h2>' +
          '<p>The <code>' + escapeHtml(cfg.module) + '</code> module is limited by role. ' +
          'PAC and c4 access are granted separately. Ask the Director if you need it.</p>' +
        '</div></div>';
    }

    function renderShell() {
      $('shellBody').innerHTML = pageHtml();
    }

    function pageHtml() {
      var typeFilter = '';
      if (cfg.typeField) {
        var opts = '<option value="">All ' + escapeHtml((cfg.typeLabel || 'type').toLowerCase()) + 's</option>';
        if (Array.isArray(cfg.typeOptions)) {
          opts += cfg.typeOptions.map(function (o) {
            return '<option value="' + escapeAttr(o.value) + '"' + (o.value === state.type ? ' selected' : '') + '>' + escapeHtml(o.label) + '</option>';
          }).join('');
        }
        typeFilter = '<select class="admin-input" id="filterType">' + opts + '</select>';
      }

      return [
        '<div class="fund-gradient-bar" aria-hidden="true"></div>',

        '<div class="fund-wall" role="note">',
          '<span class="fund-wall-tag">' + (cfg.side === 'pac' ? 'PAC' : 'c4') + '</span>',
          '<span>',
            '<span class="fund-wall-title">' + escapeHtml(cfg.wallTitle) + '</span><br/>',
            '<span class="fund-wall-body">' + escapeHtml(cfg.wallBody) + '</span>',
          '</span>',
        '</div>',

        '<div class="admin-stat-grid" id="statGrid"></div>',
        '<p class="fund-stat-note">Capacity = demonstrated capacity (public record), not pledged.</p>',

        '<div class="fund-summary" id="summaryStrip" aria-label="Pipeline by stage"></div>',

        '<div class="admin-toolbar">',
          '<input type="search" class="admin-input" id="filterSearch" placeholder="Search name or email…" autocomplete="off" />',
          typeFilter,
          '<select class="admin-input" id="filterOwner"><option value="">All owners</option><option value="__unassigned__">Unassigned</option></select>',
          '<select class="admin-input" id="filterSource"><option value="">All sources</option></select>',
          '<select class="admin-input" id="filterCounty"><option value="">All counties</option></select>',
          '<select class="admin-input" id="filterPriority"><option value="">All priorities</option>' +
            PRIORITY_OPTIONS.map(function (p) { return '<option value="' + p + '">' + PRIORITY_LABEL[p] + '</option>'; }).join('') +
          '</select>',
          '<select class="admin-input" id="filterDnc">',
            '<option value="">Any contact status</option>',
            '<option value="hide">Hide do-not-contact</option>',
            '<option value="only">Do-not-contact only</option>',
          '</select>',
          '<span class="admin-toolbar-spacer"></span>',
          '<span class="admin-result-count" id="resultCount"></span>',
        '</div>',

        '<div class="admin-table-wrap">',
          '<table class="admin-table" id="fundTable" data-stack-mobile="true">',
            '<thead><tr>',
              '<th data-sort="full_name" class="admin-sortable">Name<span class="admin-sort-arrow">&darr;</span></th>',
              (cfg.typeField ? '<th>' + escapeHtml(cfg.typeLabel || 'Type') + '</th>' : ''),
              '<th>Stage</th>',
              '<th>Owner</th>',
              '<th class="admin-num" data-sort="capacity_estimate_cents">Capacity<span class="admin-sort-arrow">&darr;</span></th>',
              '<th class="admin-num" data-sort="committed_amount_cents">Committed<span class="admin-sort-arrow">&darr;</span></th>',
              '<th>Next action</th>',
            '</tr></thead>',
            '<tbody id="fundBody"><tr><td colspan="7" class="admin-empty-row">Loading…</td></tr></tbody>',
          '</table>',
        '</div>',

        '<p class="admin-panel-foot">',
          'Source of truth: <code>' + escapeHtml(cfg.baseTable) + '</code> &middot; ',
          'Stage changes log automatically via <code>' + escapeHtml(cfg.setStageRpc) + '</code>. ',
          cfg.side === 'pac'
            ? 'PAC data is never combined with Ohio Pride Action (c4).'
            : 'c4 data is never combined with Ohio Pride PAC.',
        '</p>'
      ].join('');
    }

    // ---- lookups ----
    function loadAdminUsers() {
      return state.client.from('admin_users')
        .select('id, email, full_name, is_active')
        .eq('is_active', true)
        .order('full_name', { ascending: true })
        .then(function (resp) {
          if (resp.error) { console.warn('admin_users load failed', resp.error); return; }
          state.adminUsers = resp.data || [];
          state.adminUserById = {};
          state.adminUsers.forEach(function (u) { state.adminUserById[u.id] = u; });
        });
    }

    // ---- data ----
    function loadData() {
      state.client.from(cfg.view).select('*').order('full_name', { ascending: true })
        .then(function (resp) {
          if (resp.error) {
            console.error('pipeline load failed', resp.error);
            $('fundBody').innerHTML =
              '<tr><td colspan="7" class="admin-empty-row admin-error">Could not load this pipeline. Your role may not include it.</td></tr>';
            toast('Could not load pipeline.', 'error');
            return;
          }
          state.rows = resp.data || [];
          populateFilterOptions();
          renderStats();
          applyFilters();
        });
    }

    function populateFilterOptions() {
      // Owners
      var oSel = $('filterOwner');
      state.adminUsers.forEach(function (u) {
        var opt = document.createElement('option');
        opt.value = u.id; opt.textContent = u.full_name || u.email;
        oSel.appendChild(opt);
      });
      // Sources + counties (distinct from data)
      var sources = {}, counties = {};
      state.rows.forEach(function (r) {
        if (r.source) sources[r.source] = true;
        if (r.county) counties[r.county] = true;
      });
      var sSel = $('filterSource');
      Object.keys(sources).sort().forEach(function (s) {
        var opt = document.createElement('option');
        opt.value = s; opt.textContent = titleize(s); sSel.appendChild(opt);
      });
      var cSel = $('filterCounty');
      Object.keys(counties).sort().forEach(function (c) {
        var opt = document.createElement('option');
        opt.value = c; opt.textContent = c; cSel.appendChild(opt);
      });
      // Dynamic type options (c4)
      if (cfg.typeField && cfg.typeOptions === 'dynamic') {
        var types = {};
        state.rows.forEach(function (r) { if (r[cfg.typeField]) types[r[cfg.typeField]] = true; });
        var tSel = $('filterType');
        Object.keys(types).sort().forEach(function (t) {
          var opt = document.createElement('option');
          opt.value = t; opt.textContent = titleize(t); tSel.appendChild(opt);
        });
      }
    }

    function renderStats() {
      // Stats reflect the active type filter so the wall stays honest.
      var scoped = state.rows.filter(typeMatches);
      var count = scoped.length;
      var committed = scoped.reduce(function (s, r) { return s + (Number(r.committed_amount_cents) || 0); }, 0);
      var capacity = scoped.reduce(function (s, r) { return s + (Number(r.capacity_estimate_cents) || 0); }, 0);
      $('statGrid').innerHTML =
        statCard(count.toLocaleString(), 'In pipeline') +
        statCard(money(committed), 'Committed') +
        statCard(money(capacity), 'Demonstrated capacity');
    }
    function statCard(num, label) {
      return '<div class="admin-stat"><div class="admin-stat-num">' + num + '</div>' +
        '<div class="admin-stat-label">' + escapeHtml(label) + '</div></div>';
    }

    function typeMatches(r) {
      if (!cfg.typeField || !state.type) return true;
      return r[cfg.typeField] === state.type;
    }

    function applyFilters() {
      var q = state.search.toLowerCase();
      state.filtered = state.rows.filter(function (r) {
        if (!typeMatches(r)) return false;
        if (state.stageFilter.length && state.stageFilter.indexOf(r.stage) === -1) return false;
        if (state.ownerId === '__unassigned__' && r.owner_id) return false;
        if (state.ownerId && state.ownerId !== '__unassigned__' && r.owner_id !== state.ownerId) return false;
        if (state.source && r.source !== state.source) return false;
        if (state.county && r.county !== state.county) return false;
        if (state.priority && r.priority !== state.priority) return false;
        if (state.dnc === 'only' && !r.do_not_contact) return false;
        if (state.dnc === 'hide' && r.do_not_contact) return false;
        if (q) {
          var hay = ((r.full_name || '') + ' ' + (r.email || '') + ' ' + (r.organization || '')).toLowerCase();
          if (hay.indexOf(q) === -1) return false;
        }
        return true;
      });
      applySort();
      renderSummary();
      renderStats();
    }

    function applySort() {
      var key = state.sortKey, dir = state.sortDir === 'asc' ? 1 : -1;
      state.filtered.sort(function (a, b) {
        var av = a[key], bv = b[key];
        if (key === 'capacity_estimate_cents' || key === 'committed_amount_cents') {
          return ((Number(av) || 0) - (Number(bv) || 0)) * dir;
        }
        return String(av || '').localeCompare(String(bv || ''), undefined, { sensitivity: 'base' }) * dir;
      });
      renderRows();
      renderSortHeaders();
    }

    function renderSummary() {
      var scoped = state.rows.filter(typeMatches);
      var byStage = {};
      scoped.forEach(function (r) {
        var s = byStage[r.stage] || (byStage[r.stage] = { count: 0, committed: 0 });
        s.count++; s.committed += Number(r.committed_amount_cents) || 0;
      });
      $('summaryStrip').innerHTML = STAGES.map(function (stage) {
        var row = byStage[stage] || { count: 0, committed: 0 };
        var on = state.stageFilter.indexOf(stage) !== -1;
        var moneyHtml = row.committed > 0
          ? '<span class="fund-chip-money">' + money(row.committed) + '</span>'
          : '<span class="fund-chip-money">&nbsp;</span>';
        return '<button type="button" class="fund-chip' + (on ? ' is-on' : '') + '" data-stage="' + stage + '" aria-pressed="' + on + '">' +
          '<span class="fund-chip-top"><span class="fund-chip-dot" style="background:' + STAGE_COLOR[stage] + '"></span>' +
          '<span class="fund-chip-label">' + escapeHtml(STAGE_LABEL[stage]) + '</span></span>' +
          '<span class="fund-chip-count">' + row.count.toLocaleString() + '</span>' + moneyHtml +
        '</button>';
      }).join('');
    }

    function renderSortHeaders() {
      var ths = document.querySelectorAll('#fundTable thead th[data-sort]');
      for (var i = 0; i < ths.length; i++) {
        ths[i].classList.remove('admin-sort-asc', 'admin-sort-desc');
        if (ths[i].dataset.sort === state.sortKey) {
          ths[i].classList.add(state.sortDir === 'asc' ? 'admin-sort-asc' : 'admin-sort-desc');
        }
      }
    }

    function ownerCell(r) {
      return r.owner_name ? escapeHtml(r.owner_name) : '<span class="admin-muted">Unassigned</span>';
    }
    function nextCell(r) {
      if (!r.next_action && !r.next_action_date) return '<span class="admin-muted">&mdash;</span>';
      var overdue = r.next_action_date && r.next_action_date <= todayISO();
      var html = r.next_action ? escapeHtml(r.next_action) : '<span class="admin-muted">&mdash;</span>';
      if (r.next_action_date) {
        html += '<span class="admin-cell-sub"' + (overdue ? ' style="color:#ffc857"' : '') + '>' +
          (overdue ? 'Due ' : '') + escapeHtml(fmtDate(r.next_action_date)) + '</span>';
      }
      return html;
    }
    function stageCell(r) {
      if (!state.canWrite) return stagePill(r.stage);
      return '<select class="admin-input fund-stage-select" data-stage-for="' + escapeAttr(r.id) + '">' +
        STAGES.map(function (s) {
          return '<option value="' + s + '"' + (s === r.stage ? ' selected' : '') + '>' + STAGE_LABEL[s] + '</option>';
        }).join('') + '</select>';
    }

    function renderRows() {
      var body = $('fundBody');
      $('resultCount').textContent = state.filtered.length.toLocaleString() +
        (state.filtered.length === 1 ? ' prospect' : ' prospects');

      if (state.filtered.length === 0) {
        body.innerHTML = '<tr><td colspan="7" class="admin-empty-row">No prospects match these filters.</td></tr>';
        return;
      }

      var hasType = !!cfg.typeField;
      var html = '';
      state.filtered.forEach(function (r) {
        var sub = [];
        if (r.email) sub.push(escapeHtml(r.email));
        if (r.county) sub.push(escapeHtml(r.county) + (/(County|Co\.)$/i.test(r.county) ? '' : ' Co.'));
        var subHtml = sub.length ? '<span class="admin-cell-sub">' + sub.join(' · ') + '</span>' : '';

        var typeCell = hasType
          ? '<td data-label="' + escapeAttr(cfg.typeLabel || 'Type') + '"><span class="fund-type-pill">' +
              escapeHtml(titleize(r[cfg.typeField] || '—')) + '</span></td>'
          : '';

        html +=
          '<tr class="fund-row" data-id="' + escapeAttr(r.id) + '">' +
            '<td class="admin-cell-name" data-label="Name">' + escapeHtml(r.full_name || '—') + subHtml + '</td>' +
            typeCell +
            '<td data-label="Stage">' + stageCell(r) + '</td>' +
            '<td data-label="Owner">' + ownerCell(r) + '</td>' +
            '<td class="admin-num" data-label="Capacity">' + (r.capacity_estimate_cents ? money(r.capacity_estimate_cents) : '<span class="admin-muted">&mdash;</span>') + '</td>' +
            '<td class="admin-num" data-label="Committed">' + (r.committed_amount_cents ? money(r.committed_amount_cents) : '<span class="admin-muted">&mdash;</span>') + '</td>' +
            '<td class="fund-cell-next" data-label="Next action">' + nextCell(r) + '</td>' +
          '</tr>';
      });
      body.innerHTML = html;
    }

    // ---- events ----
    function bindEvents() {
      var debT;
      $('filterSearch').addEventListener('input', function () {
        clearTimeout(debT);
        debT = setTimeout(function () { state.search = $('filterSearch').value.trim(); applyFilters(); }, 150);
      });
      ['filterOwner','filterSource','filterCounty','filterPriority','filterDnc'].forEach(function (id) {
        $(id).addEventListener('change', function () {
          state.ownerId = $('filterOwner').value;
          state.source = $('filterSource').value;
          state.county = $('filterCounty').value;
          state.priority = $('filterPriority').value;
          state.dnc = $('filterDnc').value;
          applyFilters();
        });
      });
      if (cfg.typeField) {
        $('filterType').addEventListener('change', function () { state.type = $('filterType').value; applyFilters(); });
      }

      $('summaryStrip').addEventListener('click', function (e) {
        var btn = e.target.closest && e.target.closest('[data-stage]');
        if (!btn) return;
        var stage = btn.dataset.stage;
        var i = state.stageFilter.indexOf(stage);
        if (i === -1) state.stageFilter.push(stage); else state.stageFilter.splice(i, 1);
        applyFilters();
      });

      document.querySelectorAll('#fundTable thead th[data-sort]').forEach(function (th) {
        th.addEventListener('click', function () {
          var key = th.dataset.sort;
          if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
          else { state.sortKey = key; state.sortDir = (key === 'full_name') ? 'asc' : 'desc'; }
          applySort();
        });
      });

      // Inline stage change (write only) — stop row->drawer.
      $('fundBody').addEventListener('change', function (e) {
        var sel = e.target.closest && e.target.closest('[data-stage-for]');
        if (!sel) return;
        var id = sel.dataset.stageFor;
        var row = state.rows.find(function (r) { return r.id === id; });
        if (!row || sel.value === row.stage) return;
        commitStage(row, sel.value, sel);
      });
      $('fundBody').addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('[data-stage-for]')) return; // ignore select clicks
        var tr = e.target.closest && e.target.closest('tr.fund-row');
        if (!tr) return;
        var row = state.rows.find(function (r) { return r.id === tr.dataset.id; });
        if (row) openDrawer(row);
      });
    }

    // ---- mutations ----
    function commitStage(row, next, selEl) {
      if (selEl) selEl.disabled = true;
      state.client.rpc(cfg.setStageRpc, { p_prospect_id: row.id, p_stage: next, p_note: null })
        .then(function (resp) {
          if (resp.error) throw resp.error;
          row.stage = next;
          toast('Stage → ' + (STAGE_LABEL[next] || next), 'success');
          applyFilters();
        })
        .catch(function (err) {
          console.error('stage change failed', err);
          if (selEl) selEl.value = row.stage;
          toast('Could not change stage.', 'error');
        })
        .finally(function () { if (selEl) selEl.disabled = false; });
    }

    // ---- drawer ----
    function ownerOptionsHtml(currentId) {
      var opts = ['<option value="">Unassigned</option>'];
      state.adminUsers.forEach(function (u) {
        opts.push('<option value="' + escapeAttr(u.id) + '"' + (u.id === currentId ? ' selected' : '') + '>' +
          escapeHtml(u.full_name || u.email) + '</option>');
      });
      if (currentId && !state.adminUserById[currentId]) {
        opts.push('<option value="' + escapeAttr(currentId) + '" selected>Former admin</option>');
      }
      return opts.join('');
    }
    function selectOptionsHtml(values, labels, current) {
      return values.map(function (v) {
        return '<option value="' + v + '"' + (v === current ? ' selected' : '') + '>' + escapeHtml(labels[v] || v) + '</option>';
      }).join('');
    }

    function detailRow(label, val) {
      if (val == null || val === '') return '';
      return '<div><dt>' + escapeHtml(label) + '</dt><dd>' + escapeHtml(String(val)) + '</dd></div>';
    }

    function openDrawer(row) {
      state.activeRow = row;
      var ro = !state.canWrite;
      var dis = ro ? ' disabled' : '';

      // Identity / context block (read-only — side-specific fields).
      var identity = '<dl class="admin-detail-grid">';
      identity += detailRow('Name', row.full_name);
      if (cfg.side === 'pac') {
        identity += detailRow('Type', titleize(row.prospect_type));
        if (row.committee_type) identity += detailRow('Committee type', titleize(row.committee_type));
        identity += detailRow('Employer', row.employer);
        identity += detailRow('Occupation', row.occupation);
      } else {
        identity += detailRow('Type', titleize(row.prospect_type));
        identity += detailRow('Sector', titleize(row.sector));
        if (row.sponsorship_tier) identity += detailRow('Sponsorship tier', titleize(row.sponsorship_tier));
      }
      identity += detailRow('Email', row.email);
      identity += detailRow('Phone', row.phone);
      identity += detailRow('City', row.city);
      identity += detailRow('County', row.county);
      identity += detailRow('Region', row.region);
      if (row.compliant_vehicle) identity += detailRow('Compliant vehicle', titleize(row.compliant_vehicle));
      identity += '</dl>';

      var moneyBlock = '<dl class="admin-detail-grid">' +
        detailRow('Demonstrated capacity', row.capacity_estimate_cents != null ? money(row.capacity_estimate_cents) : null) +
        detailRow('Ask target', row.ask_target_cents != null ? money(row.ask_target_cents) : null) +
        detailRow('Committed', row.committed_amount_cents != null ? money(row.committed_amount_cents) : null) +
        '</dl>' +
        '<p class="fund-capacity-note">Capacity reflects demonstrated capacity from the public record — not a pledge.</p>';

      var evidence = '';
      if (row.evidence || row.source_citation) {
        evidence = '<div class="shell-drawer-section"><h4>Evidence</h4>' +
          (row.evidence ? '<p style="font-size:13px;color:rgba(255,255,255,0.85);white-space:pre-wrap">' + escapeHtml(row.evidence) + '</p>' : '') +
          (row.source_citation ? '<p class="fund-readonly-note">Source: ' + escapeHtml(row.source_citation) + '</p>' : '') +
          '</div>';
      }

      var crm =
        '<div class="shell-drawer-section"><h4>Pipeline</h4>' +
          '<div class="fund-form-grid">' +
            '<label>Stage<select class="admin-input" id="dwStage"' + dis + '>' + selectOptionsHtml(STAGES, STAGE_LABEL, row.stage) + '</select></label>' +
            '<label>Priority<select class="admin-input" data-crm="priority"' + dis + '>' + selectOptionsHtml(PRIORITY_OPTIONS, PRIORITY_LABEL, row.priority || 'medium') + '</select></label>' +
            '<label>Owner<select class="admin-input" data-crm="owner_id"' + dis + '>' + ownerOptionsHtml(row.owner_id) + '</select></label>' +
            '<label>Status<select class="admin-input" data-crm="status"' + dis + '>' + selectOptionsHtml(STATUS_OPTIONS, STATUS_LABEL, row.status || 'active') + '</select></label>' +
            '<label class="span-2">Tags (comma-separated)<input class="admin-input" data-crm="tags" value="' + escapeAttr((row.tags || []).join(', ')) + '"' + dis + ' /></label>' +
            '<label class="span-2">Next action<input class="admin-input" data-crm="next_action" value="' + escapeAttr(row.next_action || '') + '"' + dis + ' /></label>' +
            '<label>Next action date<input class="admin-input" type="date" data-crm="next_action_date" value="' + escapeAttr(row.next_action_date || '') + '"' + dis + ' /></label>' +
          '</div>' +
          '<div class="fund-bool-row"><label><input type="checkbox" data-crm="do_not_contact"' + (row.do_not_contact ? ' checked' : '') + dis + '> Do not contact</label></div>' +
          '<label style="display:block;margin-top:10px;font-size:11px;letter-spacing:0.6px;text-transform:uppercase;color:rgba(255,255,255,0.55);font-family:Montserrat,sans-serif">Stage-change note (optional)' +
            '<input class="admin-input" id="dwStageNote" placeholder="Logged with the next stage change"' + dis + ' style="margin-top:4px" /></label>' +
        '</div>' +
        '<div class="shell-drawer-section"><h4>Notes</h4>' +
          '<textarea class="admin-input" data-crm="notes"' + dis + ' style="width:100%;min-height:80px;font-family:Roboto Slab,Georgia,serif;color:var(--text-white)">' + escapeHtml(row.notes || '') + '</textarea>' +
        '</div>';

      var foot = state.canWrite
        ? (row.email ? '<a class="shell-btn shell-btn-outline" href="mailto:' + escapeAttr(row.email) + '">Email</a>' : '') +
          '<button type="button" class="shell-btn shell-btn-outline" data-drawer-close>Close</button>' +
          '<button type="button" class="shell-btn shell-btn-primary" id="fundSaveBtn">Save changes</button>'
        : '<button type="button" class="shell-btn shell-btn-outline" data-drawer-close>Close</button>';

      window.AdminShell.openDrawer({
        eyebrow: (cfg.side === 'pac' ? 'PAC' : 'c4') + ' · ' + (STAGE_LABEL[row.stage] || 'Prospect'),
        title: row.full_name || 'Prospect',
        bodyHtml:
          '<div class="shell-drawer-section"><h4>Profile</h4>' + identity + '</div>' +
          '<div class="shell-drawer-section"><h4>Money</h4>' + moneyBlock + '</div>' +
          evidence + crm,
        footHtml: foot
      });

      bindDrawer(row);
    }

    function bindDrawer(row) {
      if (!state.canWrite) return;
      var stageSel = $('dwStage');
      if (stageSel) {
        stageSel.addEventListener('change', function () {
          if (stageSel.value === row.stage) return;
          var note = $('dwStageNote') ? $('dwStageNote').value.trim() : '';
          stageSel.disabled = true;
          state.client.rpc(cfg.setStageRpc, { p_prospect_id: row.id, p_stage: stageSel.value, p_note: note || null })
            .then(function (resp) {
              if (resp.error) throw resp.error;
              row.stage = stageSel.value;
              toast('Stage → ' + (STAGE_LABEL[row.stage] || row.stage), 'success');
              applyFilters();
            })
            .catch(function (err) { console.error(err); stageSel.value = row.stage; toast('Could not change stage.', 'error'); })
            .finally(function () { stageSel.disabled = false; });
        });
      }
      var saveBtn = $('fundSaveBtn');
      if (saveBtn) saveBtn.addEventListener('click', function () { saveCrm(row); });
    }

    function saveCrm(row) {
      function read(field) {
        var el = document.querySelector('#shellDrawerBody [data-crm="' + field + '"]');
        if (!el) return undefined;
        if (el.type === 'checkbox') return el.checked;
        return el.value;
      }
      function trimOrNull(v) { v = (v == null ? '' : String(v)).trim(); return v.length ? v : null; }

      var patch = {
        priority: read('priority') || 'medium',
        status: read('status') || 'active',
        owner_id: read('owner_id') || null,
        next_action: trimOrNull(read('next_action')),
        next_action_date: trimOrNull(read('next_action_date')),
        notes: trimOrNull(read('notes')),
        do_not_contact: read('do_not_contact') === true,
        tags: String(read('tags') || '').split(',').map(function (t) { return t.trim(); }).filter(Boolean)
      };

      var btn = $('fundSaveBtn');
      if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

      state.client.from(cfg.baseTable).update(patch).eq('id', row.id)
        .then(function (resp) {
          if (resp.error) throw resp.error;
          // Reflect locally so the list updates without a full reload.
          Object.keys(patch).forEach(function (k) { row[k] = patch[k]; });
          var owner = state.adminUserById[patch.owner_id];
          row.owner_name = owner ? (owner.full_name || owner.email) : null;
          toast('Saved.', 'success');
          window.AdminShell.closeDrawer();
          applyFilters();
        })
        .catch(function (err) {
          console.error('save failed', err);
          toast('Could not save changes.', 'error');
          if (btn) { btn.disabled = false; btn.textContent = 'Save changes'; }
        });
    }
  }

  window.FUND_PIPELINE = { init: init };
})();
