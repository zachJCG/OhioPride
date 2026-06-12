/* =========================================================================
   Ohio Pride PAC :: Compliance module controller
   -------------------------------------------------------------------------
   Drives the three CFOFS schedule pages: Contribution (31-A), Expense (31-B),
   Loan (31-N / 31-C). Each page sets `data-compliance-page` on #shell-root;
   this script reads it, gates on finance:read, and renders:

     1. A live "export" card — runs the CFOFS engine (cfofs-browser.js) over
        the rows in the database and shows readiness + the SOS upload file.
     2. An add / edit form whose fields mirror the official CFOFS template.
     3. The saved-entries table (edit / delete inline).
     4. An "import from a workbook" drawer that bulk-loads an .xlsx/.xls into
        the same table, so a treasurer can either type rows or import them.

   Data lives in public.compliance_contributions / _expenditures / _loans
   (RLS: admin read, finance:write to write). The per-filing config
   (entity / report / default form / PAC stamp) is cached in sessionStorage.
   All CFOFS formatting + validation rules stay in cfofs-browser.js.
   ========================================================================= */
(function () {
  'use strict';

  var CFG_KEY = 'opCompliance.config';   // { entity, report, form, stamp }

  // ---- Field model: one entry per CFOFS template column we let users edit.
  //   id    -> the template field id (positionally aligned to CFOFS.*_IDS)
  //   col   -> the database column
  //   type  -> text | money | date | bool | select
  //   money fields are stored as integer cents.
  var FORM_OPTS = [
    { v: '', l: '(use default)' }, { v: '1', l: '1 — Check' },
    { v: '2', l: '2 — Cash' }, { v: '3', l: '3 — Credit Card' },
    { v: '4', l: '4 — Electronic' }
  ];

  var SCHED = {
    contribution: {
      key: 'CONT', code: '31A', tab: 'Contributions',
      table: 'compliance_contributions',
      title: 'Contribution', sub: 'Schedule 31-A — contributions & other income',
      headers: CFOFS.CONT_HEADERS, ids: CFOFS.CONT_IDS,
      nameLabel: 'Contributor',
      fields: [
        { id: 'first', col: 'first_name', label: 'First name', type: 'text' },
        { id: 'middle', col: 'middle_name', label: 'Middle', type: 'text' },
        { id: 'last', col: 'last_name', label: 'Last name', type: 'text' },
        { id: 'suffix', col: 'suffix', label: 'Suffix', type: 'text' },
        { id: 'non_individual', col: 'non_individual', label: 'Organization (non-individual)', type: 'text', wide: true },
        { id: 'pac_reg', col: 'pac_reg_number', label: 'PAC registration #', type: 'text' },
        { id: 'address', col: 'address', label: 'Street address', type: 'text', wide: true },
        { id: 'city', col: 'city', label: 'City', type: 'text' },
        { id: 'state', col: 'state', label: 'State', type: 'text' },
        { id: 'zip', col: 'zip', label: 'ZIP', type: 'text' },
        { id: 'employer', col: 'employer', label: 'Employer / occupation', type: 'text', wide: true },
        { id: 'form', col: 'form_of_contribution', label: 'Form of contribution', type: 'select', options: FORM_OPTS },
        { id: 'date', col: 'contribution_date', label: 'Date of contribution', type: 'date', required: true },
        { id: 'amount', col: 'amount_cents', label: 'Amount', type: 'money', required: true },
        { id: 'other_income_type', col: 'other_income_type', label: 'Other income type', type: 'text' },
        { id: 'event_date', col: 'event_date', label: 'Event date', type: 'date' },
        { id: 'inkind_desc', col: 'inkind_description', label: 'In-kind description', type: 'text', wide: true },
        { id: 'received_at_event', col: 'received_at_event', label: 'Received at fundraising event', type: 'bool' },
        { id: 'name_of_creditor', col: 'name_of_creditor', label: 'Name of creditor', type: 'text' },
        { id: 'amount_debt_remaining', col: 'amount_debt_remaining_cents', label: 'Amount of debt remaining', type: 'money' }
      ]
    },
    expense: {
      key: 'EXPS', code: '31B', tab: 'Expense',
      table: 'compliance_expenditures',
      title: 'Expense', sub: 'Schedule 31-B — expenditures',
      headers: CFOFS.EXPS_HEADERS, ids: CFOFS.EXPS_IDS,
      nameLabel: 'Payee',
      fields: [
        { id: 'first', col: 'first_name', label: 'First name', type: 'text' },
        { id: 'middle', col: 'middle_name', label: 'Middle', type: 'text' },
        { id: 'last', col: 'last_name', label: 'Last name', type: 'text' },
        { id: 'suffix', col: 'suffix', label: 'Suffix', type: 'text' },
        { id: 'non_individual', col: 'non_individual', label: 'Organization (non-individual)', type: 'text', wide: true },
        { id: 'address', col: 'address', label: 'Street address', type: 'text', wide: true },
        { id: 'city', col: 'city', label: 'City', type: 'text' },
        { id: 'state', col: 'state', label: 'State', type: 'text' },
        { id: 'zip', col: 'zip', label: 'ZIP', type: 'text' },
        { id: 'date', col: 'expenditure_date', label: 'Date of expenditure', type: 'date', required: true },
        { id: 'amount', col: 'amount_cents', label: 'Amount', type: 'money', required: true },
        { id: 'purpose', col: 'purpose', label: 'Purpose', type: 'text', wide: true },
        { id: 'event_date', col: 'event_date', label: 'Event date', type: 'date' },
        { id: 'candidate_or_issue', col: 'candidate_or_issue', label: 'Candidate / ballot issue (31U)', type: 'text' },
        { id: 'support_oppose', col: 'support_oppose', label: 'Support / oppose', type: 'select', options: [{ v: '', l: '—' }, { v: '1', l: '1 — Support' }, { v: '2', l: '2 — Oppose' }] },
        { id: 'office', col: 'office', label: 'Office (31U)', type: 'text' },
        { id: 'party_fund', col: 'party_fund', label: 'Political party fund (31M)', type: 'text' }
      ]
    },
    loan: {
      key: 'LOAN', code: '31N/31C', tab: 'Loan',
      table: 'compliance_loans',
      title: 'Loan', sub: 'Schedule 31-N (debt) / 31-C (loan)',
      headers: CFOFS.LOAN_HEADERS, ids: CFOFS.LOAN_IDS,
      nameLabel: 'Creditor',
      fields: [
        { id: 'first', col: 'first_name', label: 'First name', type: 'text' },
        { id: 'middle', col: 'middle_name', label: 'Middle', type: 'text' },
        { id: 'last', col: 'last_name', label: 'Last name', type: 'text' },
        { id: 'suffix', col: 'suffix', label: 'Suffix', type: 'text' },
        { id: 'non_individual', col: 'non_individual', label: 'Organization (non-individual)', type: 'text', wide: true },
        { id: 'pac_reg', col: 'pac_reg_number', label: 'PAC registration #', type: 'text' },
        { id: 'address', col: 'address', label: 'Street address', type: 'text', wide: true },
        { id: 'city', col: 'city', label: 'City', type: 'text' },
        { id: 'state', col: 'state', label: 'State', type: 'text' },
        { id: 'zip', col: 'zip', label: 'ZIP', type: 'text' },
        { id: 'employer', col: 'employer', label: 'Employer / occupation', type: 'text', wide: true },
        { id: 'schedule_code', col: 'schedule_code', label: 'Schedule', type: 'select', required: true, options: [{ v: '31N', l: '31N — Debt' }, { v: '31C', l: '31C — Loan' }] },
        { id: 'date_incurred', col: 'date_incurred', label: 'Date originally incurred', type: 'date', required: true },
        { id: 'purpose', col: 'purpose', label: 'Purpose', type: 'text', wide: true },
        { id: 'prior_amount', col: 'prior_amount_cents', label: 'Prior amount', type: 'money' },
        { id: 'amount_incurred', col: 'amount_incurred_cents', label: 'Amount incurred', type: 'money' },
        { id: 'outstanding_balance', col: 'outstanding_balance_cents', label: 'Outstanding balance', type: 'money' },
        { id: 'forgiven', col: 'forgiven', label: 'Forgiven', type: 'bool' },
        { id: 'payment_date', col: 'payment_date', label: 'Payment date', type: 'date' },
        { id: 'payment_amount', col: 'payment_amount_cents', label: 'Payment amount', type: 'money' }
      ]
    }
  };

  // byId lookup + the columns we read back from the DB.
  Object.keys(SCHED).forEach(function (k) {
    var s = SCHED[k];
    s.byId = {};
    s.cols = ['id'];
    s.fields.forEach(function (f) { s.byId[f.id] = f; s.cols.push(f.col); });
    s.cols.push('created_at');
    s.colSelect = s.cols.join(', ');
  });

  // ---- State ------------------------------------------------------------
  var state = { client: null, pageKey: null, sched: null, rows: [], filter: '', editingId: null, validation: [] };

  // ---- Helpers ----------------------------------------------------------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function el(id) { return document.getElementById(id); }
  function getJSON(key) { try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch (e) { return null; } }
  function setJSON(key, val) { try { sessionStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

  function toast(msg, kind) {
    if (window.AdminShell && window.AdminShell.toast) { window.AdminShell.toast(msg, kind); return; }
    console.log('[compliance]', kind || 'info', msg);
  }

  function fmtMoneyCents(cents) {
    if (cents == null) return '<span class="cmp-muted">—</span>';
    return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
  }
  function fmtDate(iso) {
    if (!iso) return '<span class="cmp-muted">—</span>';
    var d = new Date(iso + 'T00:00:00Z');
    if (isNaN(d.getTime())) return esc(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  }
  function parseCents(str) {
    if (str == null) return NaN;
    var n = parseFloat(String(str).replace(/[^0-9.\-]/g, ''));
    if (isNaN(n) || n < 0) return NaN;
    return Math.round(n * 100);
  }

  function download(name, text) {
    var blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function entryName(rec) {
    var person = ((rec.first_name || '') + ' ' + (rec.last_name || '')).trim();
    return rec.non_individual || person || '(unnamed)';
  }

  // ---- Per-filing config bar -------------------------------------------
  function getConfig() {
    var c = getJSON(CFG_KEY) || {};
    return {
      entity: c.entity || '16372',
      report: c.report || 'PostPrimary2026',
      form_of_contribution_code: c.form || '4',
      stamp_filer_pac_number: (c.stamp === false ? 'false' : 'true')
    };
  }
  function saveConfigFromInputs() {
    setJSON(CFG_KEY, {
      entity: el('cfgEntity').value.trim(),
      report: el('cfgReport').value.trim(),
      form: el('cfgForm').value,
      stamp: el('cfgStamp').checked
    });
  }
  function liveConfig() {
    return {
      entity: el('cfgEntity').value.trim(),
      report: el('cfgReport').value.trim(),
      form_of_contribution_code: el('cfgForm').value,
      stamp_filer_pac_number: el('cfgStamp').checked ? 'true' : 'false'
    };
  }
  function opt(v, label, sel) { return '<option value="' + esc(v) + '"' + (v === sel ? ' selected' : '') + '>' + esc(label) + '</option>'; }

  function configBarHtml() {
    var c = getConfig();
    return '' +
      '<div class="cmp-config">' +
        '<div class="cmp-field"><label for="cfgEntity">Entity (PAC #)</label>' +
          '<input class="admin-input" id="cfgEntity" value="' + esc(c.entity) + '" /></div>' +
        '<div class="cmp-field"><label for="cfgReport">Report</label>' +
          '<input class="admin-input" id="cfgReport" value="' + esc(c.report) + '" /></div>' +
        '<div class="cmp-field"><label for="cfgForm">Default form of contribution</label>' +
          '<select class="admin-input" id="cfgForm">' +
            opt('1', '1 — Check', c.form_of_contribution_code) + opt('2', '2 — Cash', c.form_of_contribution_code) +
            opt('3', '3 — Credit Card', c.form_of_contribution_code) + opt('4', '4 — Electronic', c.form_of_contribution_code) +
          '</select></div>' +
        '<div class="cmp-field cmp-check"><input type="checkbox" id="cfgStamp"' +
          (c.stamp_filer_pac_number === 'true' ? ' checked' : '') + ' />' +
          '<label for="cfgStamp" style="text-transform:none;letter-spacing:0;">Stamp PAC # on every row</label></div>' +
      '</div>' +
      '<p class="cmp-note">Entity &amp; Report name the export file; they are never written into a PAC REGISTRATION NUMBER column. ' +
        'Verify the form-of-contribution code against CFOFS Data Download before filing.</p>';
  }

  // ---- CFOFS export over the database rows -------------------------------
  // Build a synthetic workbook (header row + one row per record in template
  // column order) and hand it to the same engine the workbook upload uses.
  function buildInputRows(sched, records) {
    var rows = [sched.headers.slice()];
    records.forEach(function (rec) {
      rows.push(sched.ids.map(function (id) {
        var fd = sched.byId[id];
        if (!fd) return null;                       // item_number / fixed schedule code
        var v = rec[fd.col];
        if (v === undefined || v === null) return null;
        if (fd.type === 'money') return v / 100;     // cents -> dollars
        if (fd.type === 'bool') return v ? '1' : '';
        return v;
      }));
    });
    return rows;
  }
  function exportFile(sched, records, cfg) {
    var sheets = {};
    sheets[sched.tab] = buildInputRows(sched, records);
    return CFOFS.exportWorkbook(sheets, cfg).files[sched.key];
  }

  // ---- Render: export readiness card ------------------------------------
  function renderCard() {
    var sched = state.sched;
    var f = exportFile(sched, state.rows, liveConfig());
    state.validation = f.rows;   // index-aligned to state.rows

    var status, badge, canDl = false;
    if (!state.rows.length) { status = 'no rows'; badge = 'cmp-badge-empty'; }
    else if (f.blocking.length) { status = f.blocking.length + ' row(s) held'; badge = 'cmp-badge-held'; canDl = true; }
    else { status = 'ready to upload'; badge = 'cmp-badge-ok'; canDl = true; }

    var html =
      '<div class="cmp-schedule">' +
        '<div class="cmp-schedule-head">' +
          '<div>' +
            '<div class="cmp-schedule-title">' + esc(sched.title) + ' — CFOFS upload file</div>' +
            '<div class="cmp-schedule-sub">' + esc(sched.sub) + '</div>' +
            '<div class="cmp-schedule-meta">' +
              state.rows.length + ' row(s) &middot; total ' + (f.total != null ? CFOFS.fmtAmount(f.total) : '0.00') + '</div>' +
          '</div>' +
          '<div style="display:flex;gap:10px;align-items:center;">' +
            '<span class="cmp-badge ' + badge + '">' + esc(status) + '</span>' +
            (canDl
              ? '<button type="button" class="shell-btn shell-btn-primary" id="cmpDownload">Download ' + esc(f.filename) + '</button>'
              : '<button type="button" class="shell-btn shell-btn-outline" disabled>Download</button>') +
          '</div>' +
        '</div>' +
        (f.blocking.length
          ? '<div class="cmp-schedule-sub" style="margin-top:8px;color:#b3261e;">Held rows are excluded from the file until fixed — the file still downloads with the clean rows.</div>'
          : '') +
        issuesHtml(f) +
      '</div>';
    el('cmpCard').innerHTML = html;

    if (canDl) {
      el('cmpDownload').addEventListener('click', function () {
        // Re-export only the rows that pass validation so the CFOFS item
        // numbers stay contiguous (1..N) in the downloaded file.
        var cleanRecords = state.rows.filter(function (rec, i) {
          var v = state.validation[i];
          return !(v && v.errors && v.errors.length);
        });
        if (!cleanRecords.length) { toast('Every row has a blocking error — nothing to export yet.', 'error'); return; }
        var out = exportFile(sched, cleanRecords, liveConfig());
        download(out.filename, CFOFS.toCsv(out.rows));
        toast('Exported ' + out.rows.length + ' row(s) to ' + out.filename, 'success');
      });
    }
  }

  function issuesHtml(f) {
    var html = '';
    function lines(list, cls, key) {
      return list.map(function (r) {
        var rec = state.rows[f.rows.indexOf(r)];
        var who = rec ? esc(entryName(rec)) : 'row ' + r.row;
        return r[key].map(function (m) {
          return '<li class="' + cls + '"><span class="cmp-row">' + who + ':</span> ' + esc(m) + '</li>';
        }).join('');
      }).join('');
    }
    if (f.blocking && f.blocking.length) html += '<ul class="cmp-issues">' + lines(f.blocking, 'err', 'errors') + '</ul>';
    if (f.warned && f.warned.length) html += '<ul class="cmp-issues">' + lines(f.warned, 'warn', 'warnings') + '</ul>';
    return html;
  }

  // ---- Render: entry form ----------------------------------------------
  function fieldControl(fd, val) {
    var id = 'fld_' + fd.id;
    if (fd.type === 'bool') {
      return '<div class="cmp-field cmp-check"><input type="checkbox" id="' + id + '"' + (val ? ' checked' : '') + ' />' +
        '<label for="' + id + '" style="text-transform:none;letter-spacing:0;">' + esc(fd.label) + '</label></div>';
    }
    var inner;
    if (fd.type === 'select') {
      inner = '<select class="admin-input" id="' + id + '">' +
        fd.options.map(function (o) { return opt(o.v, o.l, val == null ? '' : String(val)); }).join('') + '</select>';
    } else if (fd.type === 'date') {
      inner = '<input type="date" class="admin-input" id="' + id + '" value="' + esc(val || '') + '" />';
    } else if (fd.type === 'money') {
      inner = '<input class="admin-input" id="' + id + '" inputmode="decimal" value="' + esc(val == null ? '' : (val / 100).toFixed(2)) + '" placeholder="0.00" />';
    } else {
      inner = '<input type="text" class="admin-input" id="' + id + '" value="' + esc(val == null ? '' : val) + '" />';
    }
    return '<div class="cmp-field' + (fd.wide ? ' cmp-field-wide' : '') + '">' +
      '<label for="' + id + '">' + esc(fd.label) + (fd.required ? ' *' : '') + '</label>' + inner + '</div>';
  }

  function renderForm() {
    var sched = state.sched;
    var editing = state.editingId ? state.rows.filter(function (r) { return r.id === state.editingId; })[0] : null;
    var grid = sched.fields.map(function (fd) {
      var v = editing ? editing[fd.col] : (fd.id === 'state' ? 'OH' : (fd.id === 'schedule_code' ? '31N' : null));
      return fieldControl(fd, v);
    }).join('');
    el('cmpForm').innerHTML =
      '<div class="cmp-form-head">' + (editing ? 'Edit entry' : 'Add a ' + sched.title.toLowerCase()) + '</div>' +
      '<div class="cmp-entry-grid">' + grid + '</div>' +
      '<div class="cmp-form-actions">' +
        '<button type="submit" class="shell-btn shell-btn-primary" id="cmpSave">' + (editing ? 'Save changes' : 'Add entry') + '</button>' +
        (editing ? '<button type="button" class="shell-btn shell-btn-ghost" id="cmpCancel">Cancel</button>' : '') +
      '</div>';
  }

  function collectForm() {
    var sched = state.sched, payload = {}, errors = [];
    sched.fields.forEach(function (fd) {
      var node = el('fld_' + fd.id);
      if (!node) return;
      if (fd.type === 'bool') { payload[fd.col] = !!node.checked; return; }
      var raw = node.value;
      if (fd.type === 'money') {
        if (raw == null || String(raw).trim() === '') {
          if (fd.required) errors.push(fd.label + ' is required');
          payload[fd.col] = fd.required ? 0 : null;
        } else {
          var c = parseCents(raw);
          if (isNaN(c)) errors.push(fd.label + ' is not a valid amount');
          else payload[fd.col] = c;
        }
        return;
      }
      var t = (raw == null ? '' : String(raw)).trim();
      if (fd.required && !t) errors.push(fd.label + ' is required');
      payload[fd.col] = t || (fd.id === 'schedule_code' ? '31N' : null);
    });
    return { payload: payload, errors: errors };
  }

  function submitForm(ev) {
    ev.preventDefault();
    var sched = state.sched;
    var res = collectForm();
    if (res.errors.length) { toast(res.errors[0], 'error'); return; }
    var btn = el('cmpSave');
    btn.disabled = true;
    var q = state.editingId
      ? state.client.from(sched.table).update(res.payload).eq('id', state.editingId).select(sched.colSelect)
      : state.client.from(sched.table).insert(res.payload).select(sched.colSelect);
    q.then(function (resp) {
      if (resp.error) throw resp.error;
      var row = (resp.data && resp.data[0]) || null;
      if (state.editingId) {
        state.rows = state.rows.map(function (r) { return (row && r.id === row.id) ? row : r; });
        toast('Entry updated.', 'success');
        state.editingId = null;
      } else if (row) {
        state.rows.unshift(row);
        toast('Entry added.', 'success');
      }
      sortRows();
      renderForm(); renderCard(); renderList();
    }).catch(function (err) {
      console.error('compliance save failed', err);
      toast('Could not save — your account may not have finance write access.', 'error');
    }).finally(function () { btn.disabled = false; });
  }

  // ---- Render: entries table -------------------------------------------
  function sortRows() {
    var dateCol = state.sched.byId[state.pageKey === 'loan' ? 'date_incurred' : 'date'].col;
    state.rows.sort(function (a, b) {
      return String(b[dateCol] || '').localeCompare(String(a[dateCol] || '')) ||
             String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });
  }

  function rowHasError(id) {
    var idx = -1;
    for (var i = 0; i < state.rows.length; i++) if (state.rows[i].id === id) { idx = i; break; }
    var v = idx >= 0 ? state.validation[idx] : null;
    return v && v.errors && v.errors.length;
  }

  function listColumns() {
    var p = state.pageKey;
    if (p === 'loan') return ['Date incurred', 'Creditor', 'Schedule', 'Outstanding', ''];
    if (p === 'expense') return ['Date', 'Payee', 'Purpose', 'Amount', ''];
    return ['Date', 'Contributor', 'City', 'Amount', ''];
  }
  function listCells(rec) {
    var p = state.pageKey;
    if (p === 'loan') {
      return [fmtDate(rec.date_incurred), esc(entryName(rec)),
        '<span class="cmp-cat-pill">' + esc(rec.schedule_code || '31N') + '</span>', fmtMoneyCents(rec.outstanding_balance_cents)];
    }
    if (p === 'expense') {
      return [fmtDate(rec.expenditure_date), esc(entryName(rec)),
        rec.purpose ? esc(rec.purpose) : '<span class="cmp-muted">—</span>', fmtMoneyCents(rec.amount_cents)];
    }
    var loc = [rec.city, rec.state].filter(Boolean).join(', ');
    return [fmtDate(rec.contribution_date), esc(entryName(rec)),
      loc ? esc(loc) : '<span class="cmp-muted">—</span>', fmtMoneyCents(rec.amount_cents)];
  }

  function renderList() {
    var q = state.filter.trim().toLowerCase();
    var rows = !q ? state.rows : state.rows.filter(function (r) {
      return (entryName(r) + ' ' + (r.city || '') + ' ' + (r.purpose || '')).toLowerCase().indexOf(q) !== -1;
    });
    el('cmpCount').textContent = rows.length === state.rows.length
      ? state.rows.length + ' entr' + (state.rows.length === 1 ? 'y' : 'ies')
      : rows.length + ' of ' + state.rows.length;

    var cols = listColumns();
    var head = '<tr>' + cols.map(function (c, i) {
      return '<th' + (i === 3 ? ' class="admin-num"' : '') + '>' + esc(c) + '</th>';
    }).join('') + '</tr>';

    var body;
    if (!rows.length) {
      body = '<tr><td colspan="' + cols.length + '" class="admin-empty-row">' +
        (state.rows.length ? 'No entries match your search.' : 'No entries yet. Add one above, or import a workbook below.') + '</td></tr>';
    } else {
      body = rows.map(function (rec) {
        var cells = listCells(rec);
        var flag = rowHasError(rec.id) ? ' <span class="cmp-badge cmp-badge-held" title="Has a blocking error — see the export card">fix</span>' : '';
        return '<tr data-id="' + esc(rec.id) + '">' +
          '<td>' + cells[0] + '</td>' +
          '<td>' + cells[1] + flag + '</td>' +
          '<td>' + cells[2] + '</td>' +
          '<td class="admin-num">' + cells[3] + '</td>' +
          '<td><div class="cmp-row-actions">' +
            '<button type="button" class="shell-btn shell-btn-ghost" data-edit="' + esc(rec.id) + '">Edit</button>' +
            '<button type="button" class="shell-btn shell-btn-ghost cmp-del" data-del="' + esc(rec.id) + '">Delete</button>' +
          '</div></td></tr>';
      }).join('');
    }
    el('cmpList').innerHTML = '<table class="admin-table"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
  }

  function startEdit(id) {
    state.editingId = id;
    renderForm();
    el('cmpForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function deleteEntry(id) {
    var rec = state.rows.filter(function (r) { return r.id === id; })[0];
    if (!rec) return;
    if (!window.confirm('Delete this entry?\n\n' + entryName(rec))) return;
    state.client.from(state.sched.table).delete().eq('id', id).then(function (resp) {
      if (resp.error) throw resp.error;
      state.rows = state.rows.filter(function (r) { return r.id !== id; });
      if (state.editingId === id) state.editingId = null;
      renderForm(); renderCard(); renderList();
      toast('Entry deleted.', 'success');
    }).catch(function (err) {
      console.error('compliance delete failed', err);
      toast('Could not delete. Please try again.', 'error');
    });
  }

  // ---- Workbook import --------------------------------------------------
  function readWorkbookFile(file) {
    return file.arrayBuffer().then(function (buf) {
      var wb = XLSX.read(buf, { type: 'array' });
      var sheets = {};
      wb.SheetNames.forEach(function (n) {
        sheets[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: false });
      });
      return sheets;
    });
  }

  // Map one template-ordered worksheet row to a DB payload.
  function importRowToPayload(sched, row) {
    var payload = {};
    sched.ids.forEach(function (id, i) {
      var fd = sched.byId[id];
      if (!fd) return;
      var raw = (row && i < row.length) ? row[i] : null;
      if (fd.type === 'money') {
        var a = CFOFS.parseAmount(raw);
        payload[fd.col] = (a.error || a.cents == null) ? (fd.required ? 0 : null) : Math.max(0, a.cents);
      } else if (fd.type === 'date') {
        var d = CFOFS.toDateUTC(raw);
        payload[fd.col] = d ? CFOFS.fmtISO(d) : null;
      } else if (fd.type === 'bool') {
        var s = CFOFS.collapse(raw).toLowerCase();
        payload[fd.col] = (s === '1' || s === 'y' || s === 'yes' || s === 'true');
      } else {
        var t = CFOFS.collapse(raw);
        if (fd.id === 'schedule_code') t = t.toUpperCase() || '31N';
        payload[fd.col] = t || (fd.id === 'schedule_code' ? '31N' : null);
      }
    });
    return payload;
  }

  function wireImport() {
    var drop = el('cmpDrop'), input = el('cmpDropInput'), nameEl = el('cmpDropName'), pending = { payloads: null };
    function setStatus(msg) { nameEl.textContent = msg; }
    function handle(file) {
      setStatus('Reading ' + file.name + '…');
      el('cmpImportBtn').disabled = true;
      readWorkbookFile(file).then(function (sheets) {
        var tabs = CFOFS.matchTabs(sheets);
        var found = tabs[state.sched.key];
        if (!found) { setStatus('✗ No "' + state.sched.tab + '" tab found in ' + file.name); return; }
        var data = found.rows.slice(1).filter(function (r) {
          return r && r.some(function (c) { return c != null && String(c).trim() !== ''; });
        });
        if (!data.length) { setStatus('✗ The "' + found.name + '" tab has no data rows.'); return; }
        pending.payloads = data.map(function (r) { return importRowToPayload(state.sched, r); });
        setStatus('✓ ' + file.name + ' — ' + pending.payloads.length + ' row(s) ready to import from the "' + found.name + '" tab.');
        el('cmpImportBtn').disabled = false;
      }).catch(function (err) { setStatus('✗ ' + err.message); });
    }
    input.addEventListener('change', function () { if (input.files[0]) handle(input.files[0]); });
    ['dragover', 'dragenter'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('is-over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('is-over'); }); });
    drop.addEventListener('drop', function (e) { if (e.dataTransfer.files[0]) handle(e.dataTransfer.files[0]); });

    el('cmpImportBtn').addEventListener('click', function () {
      if (!pending.payloads || !pending.payloads.length) return;
      var n = pending.payloads.length;
      if (!window.confirm('Import ' + n + ' row(s) into ' + state.sched.title + ' entries?')) return;
      var btn = el('cmpImportBtn'); btn.disabled = true; setStatus('Importing ' + n + ' row(s)…');
      state.client.from(state.sched.table).insert(pending.payloads).select(state.sched.colSelect).then(function (resp) {
        if (resp.error) throw resp.error;
        state.rows = (resp.data || []).concat(state.rows);
        sortRows();
        pending.payloads = null;
        setStatus('✓ Imported ' + n + ' row(s).');
        renderCard(); renderList();
        toast('Imported ' + n + ' row(s).', 'success');
      }).catch(function (err) {
        console.error('compliance import failed', err);
        setStatus('✗ Import failed — your account may not have finance write access.');
        toast('Import failed.', 'error');
      });
    });
  }

  // ---- Page render ------------------------------------------------------
  function renderPage() {
    var sched = state.sched;
    el('shellBody').innerHTML =
      '<div class="admin-panel">' +
        configBarHtml() +
        '<form class="cmp-entry-form" id="cmpForm" autocomplete="off"></form>' +
        '<div id="cmpCard"></div>' +
        '<div class="admin-toolbar" style="margin-top:18px;">' +
          '<input type="search" class="admin-input" id="cmpSearch" placeholder="Search entries…" autocomplete="off" />' +
          '<span class="admin-toolbar-spacer"></span>' +
          '<span class="admin-result-count" id="cmpCount"></span>' +
        '</div>' +
        '<div class="admin-table-wrap" id="cmpList"></div>' +
        '<details class="cmp-import">' +
          '<summary>Import from a workbook (.xlsx / .xls)</summary>' +
          '<p class="cmp-muted" style="margin:10px 0;">Reads the <strong>' + esc(sched.tab) + '</strong> tab using the official CFOFS column order and loads each row into the entries above. Header row is skipped.</p>' +
          '<label class="cmp-drop" id="cmpDrop">' +
            '<input type="file" id="cmpDropInput" accept=".xlsx,.xls" />' +
            '<div class="cmp-drop-main">Drop a workbook here, or click to choose</div>' +
            '<div class="cmp-drop-sub">Only the "' + esc(sched.tab) + '" tab is imported on this page</div>' +
            '<div class="cmp-filename" id="cmpDropName"></div>' +
          '</label>' +
          '<button type="button" class="shell-btn shell-btn-outline" id="cmpImportBtn" disabled>Import rows</button>' +
        '</details>' +
        '<p class="cmp-siblings">Other CFOFS schedules: ' +
          siblingsHtml() + '</p>' +
      '</div>';

    ['cfgEntity', 'cfgReport', 'cfgForm', 'cfgStamp'].forEach(function (id) {
      el(id).addEventListener('change', function () { saveConfigFromInputs(); renderCard(); });
    });
    el('cmpForm').addEventListener('submit', submitForm);
    var t;
    el('cmpSearch').addEventListener('input', function () {
      clearTimeout(t); t = setTimeout(function () { state.filter = el('cmpSearch').value; renderList(); }, 150);
    });
    el('cmpList').addEventListener('click', function (ev) {
      var edit = ev.target.closest && ev.target.closest('[data-edit]');
      var del = ev.target.closest && ev.target.closest('[data-del]');
      if (edit) startEdit(edit.getAttribute('data-edit'));
      else if (del) deleteEntry(del.getAttribute('data-del'));
    });
    el('cmpForm').addEventListener('click', function (ev) {
      if (ev.target && ev.target.id === 'cmpCancel') { state.editingId = null; renderForm(); }
    });
    wireImport();

    renderForm();
    loadRows();
  }

  function siblingsHtml() {
    var links = [
      { key: 'contribution', label: 'Contribution', href: '/admin/compliance/contribution' },
      { key: 'expense', label: 'Expense', href: '/admin/compliance/expense' },
      { key: 'loan', label: 'Loan', href: '/admin/compliance/loan' }
    ];
    return links.filter(function (l) { return l.key !== state.pageKey; })
      .map(function (l) { return '<a href="' + l.href + '">' + esc(l.label) + '</a>'; }).join(' &middot; ');
  }

  function loadRows() {
    el('cmpCard').innerHTML = '<p class="cmp-muted">Loading entries…</p>';
    el('cmpList').innerHTML = '<table class="admin-table"><tbody><tr><td class="admin-empty-row">Loading…</td></tr></tbody></table>';
    state.client.from(state.sched.table).select(state.sched.colSelect)
      .then(function (resp) {
        if (resp.error) throw resp.error;
        state.rows = resp.data || [];
        sortRows();
        renderCard(); renderList();
      }, function (err) {
        console.error('compliance load failed', err);
        el('cmpCard').innerHTML = '<div class="cmp-balance off">Could not load entries. The compliance tables may not be migrated yet.</div>';
        el('cmpList').innerHTML = '';
      });
  }

  // ---- Boot -------------------------------------------------------------
  document.addEventListener('admin-shell-ready', function (ev) {
    var can = (ev.detail && ev.detail.can) || function () { return false; };
    var body = el('shellBody');
    if (!can('finance', 'read')) {
      body.innerHTML = '<div class="admin-panel"><p>You don’t have finance access. ' +
        'Ask the Director to grant the <code>finance</code> role.</p></div>';
      return;
    }
    state.client = (ev.detail && ev.detail.client) || (window.AdminShell && window.AdminShell.client);
    var root = document.getElementById('shell-root');
    state.pageKey = (root && root.dataset.compliancePage) || 'contribution';
    state.sched = SCHED[state.pageKey] || SCHED.contribution;
    if (!state.client) { body.innerHTML = '<div class="admin-panel"><p>Could not connect to the database.</p></div>'; return; }
    renderPage();
  });
})();
