/* =========================================================================
   Ohio Pride PAC :: Compliance module controller
   -------------------------------------------------------------------------
   Drives the four module pages (Revenue / Expense / Loan / Reconciliation).
   Each page sets `data-compliance-page` on #shell-root; this script reads it,
   gates on finance:read, and renders the matching UI into #shellBody.

   The uploaded workbook + the filing config are cached in sessionStorage so
   the operator uploads once and exports each schedule individually from its
   own page. All export/reconcile rules live in cfofs-browser.js (window.CFOFS).
   ========================================================================= */
(function () {
  'use strict';

  var WB_KEY = 'opCompliance.workbook';   // { name, sheets }
  var CFG_KEY = 'opCompliance.config';    // { entity, report, form, stamp }

  // revenue/expense/loan map to the three CFOFS schedules; reconcile is special.
  var PAGES = {
    revenue:   { schedule: 'CONT', heading: 'Revenue',  sub: 'Contributions — Schedule 31-A', tab: 'Contributions' },
    expense:   { schedule: 'EXPS', heading: 'Expense',  sub: 'Expenditures — Schedule 31-B', tab: 'Expense' },
    loan:      { schedule: 'LOAN', heading: 'Loan',     sub: 'Loans & debts — Schedule 31-N / 31-C', tab: 'Loan' },
    reconcile: { schedule: null,   heading: 'Reconciliation', sub: 'Tie the books to the bank statement', tab: null }
  };
  var SIBLINGS = [
    { page: 'revenue', label: 'Revenue', href: '/admin/compliance/revenue' },
    { page: 'expense', label: 'Expense', href: '/admin/compliance/expense' },
    { page: 'loan', label: 'Loan', href: '/admin/compliance/loan' },
    { page: 'reconcile', label: 'Reconciliation', href: '/admin/compliance/reconcile' }
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }
  function el(id) { return document.getElementById(id); }

  function getJSON(key) { try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch (e) { return null; } }
  function setJSON(key, val) { try { sessionStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

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

  function download(name, text) {
    var blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

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

  // ---- Shared chrome ----------------------------------------------------
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
      '<p class="cmp-note">Form-of-contribution code is the module\'s working legend — ' +
        '<strong>verify via CFOFS Data Download before filing.</strong> ' +
        'With “Stamp PAC #” on, the filer number is written into PAC REGISTRATION NUMBER on every ' +
        'Contributions/Loan row (a row that already names a different PAC keeps its own number).</p>';
  }
  function opt(v, label, sel) { return '<option value="' + v + '"' + (v === sel ? ' selected' : '') + '>' + esc(label) + '</option>'; }

  function dropZoneHtml(dropId, inputId, main, sub, accept) {
    return '<label class="cmp-drop" id="' + dropId + '">' +
      '<input type="file" id="' + inputId + '" accept="' + accept + '" />' +
      '<div class="cmp-drop-main">' + esc(main) + '</div>' +
      '<div class="cmp-drop-sub">' + esc(sub) + '</div>' +
      '<div class="cmp-filename" id="' + inputId + 'Name"></div>' +
    '</label>';
  }

  function wireConfig(onChange) {
    ['cfgEntity', 'cfgReport', 'cfgForm', 'cfgStamp'].forEach(function (id) {
      el(id).addEventListener('change', function () { saveConfigFromInputs(); if (onChange) onChange(); });
    });
  }

  function wireDrop(dropId, inputId, onLoad) {
    var drop = el(dropId), input = el(inputId);
    input.addEventListener('change', function () { if (input.files[0]) handle(input.files[0]); });
    ['dragover', 'dragenter'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('is-over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('is-over'); });
    });
    drop.addEventListener('drop', function (e) { if (e.dataTransfer.files[0]) handle(e.dataTransfer.files[0]); });
    function handle(file) {
      el(inputId + 'Name').textContent = 'Loading ' + file.name + '…';
      readWorkbookFile(file).then(function (sheets) {
        el(inputId + 'Name').textContent = '✓ ' + file.name;
        onLoad(sheets, file.name);
      }).catch(function (err) {
        el(inputId + 'Name').textContent = '✗ ' + err.message;
      });
    }
  }

  function card(num, label) {
    return '<div class="cmp-card"><div class="cmp-card-num">' + esc(num) + '</div>' +
      '<div class="cmp-card-label">' + esc(label) + '</div></div>';
  }
  function siblingsHtml(current) {
    return '<p class="cmp-siblings">Other parts of this filing: ' +
      SIBLINGS.filter(function (s) { return s.page !== current; })
        .map(function (s) { return '<a href="' + s.href + '">' + esc(s.label) + '</a>'; })
        .join(' &middot; ') + '</p>';
  }

  // ---- Schedule pages (revenue / expense / loan) ------------------------
  function renderSchedulePage(pageKey) {
    var page = PAGES[pageKey];
    var cached = getJSON(WB_KEY);
    var loadedNote = cached ? 'Loaded: ' + cached.name + ' — drop a new file to replace.' : '';
    el('shellBody').innerHTML =
      '<div class="admin-panel">' +
        configBarHtml() +
        dropZoneHtml('wbDrop', 'wbFile',
          'Drop the working workbook here, or click to choose',
          '3 tabs — Contributions, Expense, Loan · .xlsx or .xls · shared across all pages', '.xlsx,.xls') +
        '<div id="schedResult"></div>' +
        siblingsHtml(pageKey) +
      '</div>';
    if (cached && cached.name) el('wbFileName').textContent = '✓ ' + cached.name + ' (from this session)';

    wireConfig(function () { renderSchedule(pageKey); });
    wireDrop('wbDrop', 'wbFile', function (sheets, name) {
      setJSON(WB_KEY, { name: name, sheets: sheets });
      renderSchedule(pageKey);
    });
    renderSchedule(pageKey);
    if (loadedNote) { /* note shown via filename line */ }
  }

  function renderSchedule(pageKey) {
    var page = PAGES[pageKey];
    var cached = getJSON(WB_KEY);
    var box = el('schedResult');
    if (!cached || !cached.sheets) {
      box.innerHTML = '<p class="cmp-muted">Upload the workbook above to validate and export the ' +
        esc(page.heading) + ' schedule.</p>';
      return;
    }
    var out = CFOFS.exportWorkbook(cached.sheets, liveConfig());
    var f = out.files[page.schedule];

    var status, badge, canDl = false, extra = '';
    if (!f.found) { status = 'tab missing'; badge = 'cmp-badge-empty'; extra = 'No "' + esc(page.tab) + '" tab found in the workbook.'; }
    else if (f.blocking.length) { status = f.blocking.length + ' row(s) held'; badge = 'cmp-badge-held'; }
    else if (!f.rows.length) { status = 'no rows'; badge = 'cmp-badge-empty'; extra = 'Nothing to export this period.'; }
    else { status = 'ready to upload'; badge = 'cmp-badge-ok'; canDl = true; }

    var html =
      '<div class="cmp-schedule">' +
        '<div class="cmp-schedule-head">' +
          '<div>' +
            '<div class="cmp-schedule-title">' + esc(page.heading) + '</div>' +
            '<div class="cmp-schedule-sub">' + esc(page.sub) + '</div>' +
            '<div class="cmp-schedule-meta">' +
              (f.found ? (f.rows.length + ' row(s) &middot; total ' + CFOFS.fmtAmount(f.total)) : '&mdash;') + '</div>' +
          '</div>' +
          '<div style="display:flex;gap:10px;align-items:center;">' +
            '<span class="cmp-badge ' + badge + '">' + esc(status) + '</span>' +
            (canDl
              ? '<button type="button" class="shell-btn shell-btn-primary" id="schedDl">Download ' + esc(f.filename) + '</button>'
              : '<button type="button" class="shell-btn shell-btn-outline" disabled>Download</button>') +
          '</div>' +
        '</div>' +
        (extra ? '<div class="cmp-schedule-sub" style="margin-top:8px;">' + esc(extra) + '</div>' : '') +
        issuesHtml(f) +
      '</div>';
    box.innerHTML = html;
    if (canDl) el('schedDl').addEventListener('click', function () { download(f.filename, CFOFS.toCsv(f.rows)); });
  }

  function issuesHtml(f) {
    var html = '';
    if (f.blocking && f.blocking.length) {
      html += '<ul class="cmp-issues">' + f.blocking.map(function (r) {
        return r.errors.map(function (e) {
          return '<li class="err"><span class="cmp-row">row ' + r.row + ':</span> ' + esc(e) + '</li>';
        }).join('');
      }).join('') + '</ul>';
    }
    if (f.warned && f.warned.length) {
      html += '<ul class="cmp-issues">' + f.warned.map(function (r) {
        return r.warnings.map(function (w) {
          return '<li class="warn"><span class="cmp-row">row ' + r.row + ':</span> ' + esc(w) + '</li>';
        }).join('');
      }).join('') + '</ul>';
    }
    return html;
  }

  // ---- Reconciliation page ----------------------------------------------
  function renderReconcilePage() {
    var cached = getJSON(WB_KEY);
    el('shellBody').innerHTML =
      '<div class="admin-panel">' +
        configBarHtml() +
        dropZoneHtml('wbDrop', 'wbFile', 'Workbook (same 3-tab file)',
          'Reuses the file from the other pages if already loaded · .xlsx or .xls', '.xlsx,.xls') +
        dropZoneHtml('bankDrop', 'bankFile', 'Bank statement',
          'CSV or Excel — date, description, amount (or debit/credit)', '.csv,.xlsx,.xls') +
        '<div class="cmp-config" style="grid-template-columns:repeat(4,1fr);margin-top:4px;">' +
          fld('rePeriodStart', 'Period start', '<input type="date" class="admin-input" id="rePeriodStart" />') +
          fld('rePeriodEnd', 'Period end', '<input type="date" class="admin-input" id="rePeriodEnd" />') +
          fld('reTolerance', 'Match window (days)', '<input class="admin-input" id="reTolerance" value="5" inputmode="numeric" />') +
          fld('reOpening', 'Opening balance (optional)', '<input class="admin-input" id="reOpening" placeholder="1000.00" inputmode="decimal" />') +
        '</div>' +
        '<button type="button" class="shell-btn shell-btn-primary" id="reRun" style="margin-bottom:16px;">Run reconciliation</button>' +
        '<div id="reResults"></div>' +
        siblingsHtml('reconcile') +
      '</div>';

    var bankState = { rows: null };
    if (cached && cached.name) el('wbFileName').textContent = '✓ ' + cached.name + ' (from this session)';

    wireConfig(null);
    wireDrop('wbDrop', 'wbFile', function (sheets, name) { setJSON(WB_KEY, { name: name, sheets: sheets }); });
    wireDrop('bankDrop', 'bankFile', function (sheets) { bankState.rows = sheets[Object.keys(sheets)[0]]; });

    el('reRun').addEventListener('click', function () { runReconcile(bankState); });
  }
  function fld(id, label, control) {
    return '<div class="cmp-field"><label for="' + id + '">' + esc(label) + '</label>' + control + '</div>';
  }

  function runReconcile(bankState) {
    var box = el('reResults');
    var cached = getJSON(WB_KEY);
    if (!cached || !cached.sheets) { box.innerHTML = '<p class="cmp-muted">Load the workbook first.</p>'; return; }
    if (!bankState.rows) { box.innerHTML = '<p class="cmp-muted">Upload a bank statement to reconcile.</p>'; return; }
    var recon;
    try {
      recon = CFOFS.reconcile(cached.sheets, bankState.rows, {
        periodStart: el('rePeriodStart').value || null,
        periodEnd: el('rePeriodEnd').value || null,
        toleranceDays: parseInt(el('reTolerance').value, 10) || 5,
        openingBalance: el('reOpening').value || null
      });
    } catch (err) {
      box.innerHTML = '<div class="cmp-balance off">' + esc(err.message) + '</div>'; return;
    }
    var html = '<div class="cmp-cards">' +
      card(CFOFS.fmtAmount(recon.inCents), 'Money in (revenue + loan proceeds)') +
      card(CFOFS.fmtAmount(recon.outCents), 'Money out (expenses + payments)') +
      card(CFOFS.fmtAmount(recon.ledgerNet), 'Ledger net movement') +
    '</div>';
    html += '<p class="cmp-muted">Period ' + (recon.start ? CFOFS.fmtISO(recon.start) : '(start)') +
      ' &rarr; ' + (recon.end ? CFOFS.fmtISO(recon.end) : '(end)') +
      ' &middot; bank net ' + CFOFS.fmtAmount(recon.bankNet) +
      (recon.opening !== null ? ' &middot; opening ' + CFOFS.fmtAmount(recon.opening) +
        ' &rarr; computed closing ' + CFOFS.fmtAmount(recon.opening + recon.bankNet) : '') + '</p>';
    html += '<div class="cmp-balance ' + (recon.balanced ? 'ok' : 'off') + '">' +
      (recon.balanced ? 'In balance — ' + recon.matched.length + ' items cleared, nothing outstanding.'
        : 'Out of balance by ' + CFOFS.fmtAmount(recon.diff) + ' — ' + recon.matched.length + ' matched, ' +
          recon.unmatchedLedger.length + ' in books only, ' + recon.unmatchedBank.length + ' on statement only.') +
    '</div>';
    html += '<div class="cmp-recon-grid">' +
      reconList('In your books, not on the statement', recon.unmatchedLedger, true) +
      reconList('On the statement, not in your books', recon.unmatchedBank, false) +
    '</div>';
    html += '<button type="button" class="shell-btn shell-btn-primary" id="dlRecon">Download reconciliation worksheet</button>';
    box.innerHTML = html;
    el('dlRecon').addEventListener('click', function () {
      var c = liveConfig();
      var stem = [c.entity, 'RECON', c.report].filter(Boolean).join('_') || 'reconciliation';
      download(stem + '.csv', CFOFS.reconWorksheetCsv(recon));
    });
  }
  function reconList(title, items, showSource) {
    if (!items.length) return '<div><strong>' + esc(title) + '</strong><p class="cmp-muted" style="margin:6px 0 0;">None.</p></div>';
    return '<div><strong>' + esc(title) + '</strong><ul class="cmp-list">' +
      items.slice().sort(function (a, b) { return a.date - b.date; }).map(function (e) {
        return '<li><span>' + CFOFS.fmtISO(e.date) + '</span>' +
          '<span class="' + (e.cents < 0 ? 'neg' : 'pos') + '">' + CFOFS.fmtAmount(e.cents) + '</span>' +
          '<span>' + esc((showSource ? e.source + ' ' + e.ref + ' — ' : '') + e.desc) + '</span></li>';
      }).join('') + '</ul></div>';
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
    var root = document.getElementById('shell-root');
    var pageKey = (root && root.dataset.compliancePage) || 'revenue';
    if (pageKey === 'reconcile') renderReconcilePage();
    else renderSchedulePage(pageKey);
  });
})();
