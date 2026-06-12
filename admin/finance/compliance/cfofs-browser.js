/* =========================================================================
   Ohio Pride PAC :: CFOFS browser engine
   -------------------------------------------------------------------------
   Pure (DOM-free) port of scripts/compliance/cfofs_export.py + reconcile.py.
   Takes parsed workbook data ({ sheetName: rows[][] }) and produces the three
   header-less CFOFS upload rows + a bank reconciliation. No SheetJS, no DOM in
   here -- the page reads files with SheetJS and hands rows to these functions,
   which keeps the compliance rules in one auditable place and testable in Node.

   Mirrors the Python module's rules: dates -> MM/DD/YYYY (incl. Excel serials),
   amounts -> plain 2-decimal (no $/commas/parens, negatives invalid), ZIP -> 5
   digits, Proper Case for ALL-CAPS names/cities, FORM OF CONTRIBUTION label ->
   SOS code, name-XOR-org, required address fields, loan balance arithmetic, and
   the filer-PAC-number stamp.
   ========================================================================= */
(function (root) {
  'use strict';

  // ---- Column schemas (exact CFOFS template order) ----------------------
  var CONT_HEADERS = [
    'CONTRIBUTOR FIRST NAME', 'CONTRIB MIDDLE NAME', 'CONTRIBUTOR LAST NAME',
    'SUFFIX', 'NON INDIVIDUAL CONTRIBUTOR', 'PAC REGISTRATION NUMBER',
    'CONTRIBUTOR ADDRESS', 'CITY', 'STATE', 'ZIP',
    'CONTRIBUTOR EMPLOYER OCCUPATION OR LABOR ORGANIZATION',
    'FORM OF CONTRIBUTION', 'DATE OF CONTRIBUTION', 'AMOUNT',
    'OTHER INCOME TYPE', 'EVENT DATE', 'INKIND DESCRIPTION',
    'RECEIVED AT FUNDRAISING EVENT (Y/N)', 'NAME OF CREDITOR',
    'AMOUNT OF DEBT REMAINING', 'ITEM NUMBER', 'SCHEDULE CODE (EX. 31A)'
  ];
  var CONT_IDS = [
    'first', 'middle', 'last', 'suffix', 'non_individual', 'pac_reg',
    'address', 'city', 'state', 'zip', 'employer', 'form', 'date', 'amount',
    'other_income_type', 'event_date', 'inkind_desc', 'received_at_event',
    'name_of_creditor', 'amount_debt_remaining', 'item_number', 'schedule_code'
  ];

  var EXPS_HEADERS = [
    'PAYEE FIRST NAME', 'PAYEE MIDDLE NAME', 'PAYEE LAST NAME', 'SUFFIX',
    'NON INDIVIDUAL PAYEE', 'PAYEE ADDRESS', 'CITY', 'STATE', 'ZIP',
    'DATE OF EXPENDITURE', 'AMOUNT', 'PURPOSE', 'EVENT DATE',
    'CANDIDATE OR BALLOT ISSUE (FORM 31U ONLY)',
    'SUPPORT/ OPPOSE (1 if Support/2 if Oppose)', 'OFFICE (FORM 31U ONLY)',
    'EXPENDITURE FROM POLITICAL PARTY FUND (FORM 31M ONLY)',
    'ITEM NUMBER', 'SCHEDULE CODE (EX. 31B)'
  ];
  var EXPS_IDS = [
    'first', 'middle', 'last', 'suffix', 'non_individual', 'address', 'city',
    'state', 'zip', 'date', 'amount', 'purpose', 'event_date',
    'candidate_or_issue', 'support_oppose', 'office', 'party_fund',
    'item_number', 'schedule_code'
  ];

  // Column 5 header is the official misspelling "NON INDIDIVUAL" -- keep it.
  var LOAN_HEADERS = [
    'FIRST NAME', 'MIDDLE NAME', 'LAST NAME', 'SUFFIX', 'NON INDIDIVUAL',
    'PAC REGISTRATION NUMBER', 'ADDRESS', 'CITY', 'STATE', 'ZIP',
    'EMPLOYER OCCUPATION LABOR ORGANIZATION',
    'DATE LOAN WAS ORIGINAL INCURRED', 'PRIOR AMOUNT', 'OUTSTANDING BALANCE',
    'PURPOSE', 'FORGIVEN (If True Enter a 1)', 'AMOUNT INCURRED',
    'PAYMENT DATE', 'PAYMENT AMOUNT', 'ITEM NUMBER',
    'SCHEDULE CODE (EX 31C, 31N)'
  ];
  var LOAN_IDS = [
    'first', 'middle', 'last', 'suffix', 'non_individual', 'pac_reg',
    'address', 'city', 'state', 'zip', 'employer', 'date_incurred',
    'prior_amount', 'outstanding_balance', 'purpose', 'forgiven',
    'amount_incurred', 'payment_date', 'payment_amount', 'item_number',
    'schedule_code'
  ];

  var FORM_LABEL_TO_CODE = {
    'check': '1', 'cheque': '1',
    'cash': '2',
    'credit card': '3', 'creditcard': '3', 'credit': '3', 'card': '3',
    'electronic': '4', 'electronic transfer': '4',
    'electronic funds transfer': '4', 'ach': '4', 'eft': '4',
    'actblue': '4', 'wire': '4', 'online': '4'
  };

  var PLACEHOLDER_ADDRESSES = {
    'tbd': 1, 'n/a': 1, 'na': 1, 'none': 1, 'unknown': 1, '-': 1, '--': 1,
    '.': 1, 'pending': 1, 'address': 1, 'on file': 1, 'see notes': 1,
    'xxx': 1, 'x': 1
  };

  // ---- Normalizers ------------------------------------------------------
  function collapse(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/\s+/g, ' ').trim();
  }

  function properCase(v) {
    var s = collapse(v);
    if (!s || /[a-z]/.test(s)) return s; // keep human-typed mixed case
    return s.replace(/[A-Za-z]+/g, function (w) {
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    });
  }

  function normalizeZip(v) {
    var s = collapse(v);
    if (!s) return { value: '', error: null };
    var digits = s.replace(/\D/g, '');
    if (digits.length < 5) return { value: s, error: "ZIP '" + s + "' is not 5 digits" };
    return { value: digits.slice(0, 5), error: null };
  }

  // Money is carried as integer cents to dodge float drift.
  function parseAmount(v) {
    if (v === null || v === undefined || v === '') return { cents: null, error: null };
    if (typeof v === 'number') {
      if (!isFinite(v)) return { cents: null, error: "unparseable amount '" + v + "'" };
      return { cents: Math.round(v * 100), error: null };
    }
    var s = collapse(v);
    if (!s) return { cents: null, error: null };
    var negative = false;
    if (s.charAt(0) === '(' && s.charAt(s.length - 1) === ')') { negative = true; s = s.slice(1, -1); }
    s = s.replace(/\$/g, '').replace(/,/g, '').replace(/\s/g, '');
    if (s.charAt(0) === '-') { negative = true; s = s.slice(1); }
    if (!/^\d*\.?\d+$/.test(s) && !/^\d+\.?\d*$/.test(s)) {
      return { cents: null, error: "unparseable amount '" + v + "'" };
    }
    var n = parseFloat(s);
    if (isNaN(n)) return { cents: null, error: "unparseable amount '" + v + "'" };
    var cents = Math.round(n * 100);
    return { cents: negative ? -cents : cents, error: null };
  }

  function fmtAmount(cents) {
    return (cents / 100).toFixed(2);
  }

  var EXCEL_EPOCH = Date.UTC(1899, 11, 30); // 1899-12-30, absorbs 1900 leap bug

  function toDateUTC(v) {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) {
      return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
    }
    if (typeof v === 'number') {
      if (v <= 0) return null;
      return new Date(EXCEL_EPOCH + Math.floor(v) * 86400000);
    }
    var s = collapse(v);
    if (!s) return null;
    if (/^\d+(\.\d+)?$/.test(s)) {
      var serial = parseFloat(s);
      return serial > 0 ? new Date(EXCEL_EPOCH + Math.floor(serial) * 86400000) : null;
    }
    var m;
    if ((m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/))) {
      var mo = +m[1], da = +m[2], yr = +m[3];
      if (yr < 100) yr += 2000;
      return validYMD(yr, mo, da);
    }
    if ((m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/))) {
      return validYMD(+m[1], +m[2], +m[3]);
    }
    var parsed = Date.parse(s);
    if (!isNaN(parsed)) {
      var d = new Date(parsed);
      return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    }
    return null;
  }

  function validYMD(y, mo, da) {
    if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
    var d = new Date(Date.UTC(y, mo - 1, da));
    if (d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== da) return null;
    return d;
  }

  function fmtMDY(date) {
    if (!date) return '';
    var mo = String(date.getUTCMonth() + 1).padStart(2, '0');
    var da = String(date.getUTCDate()).padStart(2, '0');
    return mo + '/' + da + '/' + date.getUTCFullYear();
  }

  function fmtISO(date) {
    if (!date) return '';
    var mo = String(date.getUTCMonth() + 1).padStart(2, '0');
    var da = String(date.getUTCDate()).padStart(2, '0');
    return date.getUTCFullYear() + '-' + mo + '-' + da;
  }

  function parseDate(v) {
    if (v === null || v === undefined || v === '') return { text: '', error: null };
    var d = toDateUTC(v);
    if (!d) return { text: '', error: "unparseable date '" + collapse(v) + "'" };
    return { text: fmtMDY(d), error: null };
  }

  function normalizeForm(v, defaultCode) {
    var s = collapse(v);
    if (!s) return { code: defaultCode, error: null };
    if (/^\d+$/.test(s)) return { code: s, error: null };
    var key = s.toLowerCase();
    if (FORM_LABEL_TO_CODE[key]) return { code: FORM_LABEL_TO_CODE[key], error: null };
    return { code: s, error: "FORM OF CONTRIBUTION '" + s + "' is a text label, not an SOS code" };
  }

  function yesNo(v, dflt) {
    var s = collapse(v).toLowerCase();
    if (!s) return dflt || 'N';
    return (s === 'y' || s === 'yes' || s === 'true' || s === '1') ? 'Y' : 'N';
  }

  function forgiven(v) {
    var s = collapse(v).toLowerCase();
    return (s === '1' || s === 'y' || s === 'yes' || s === 'true' || s === 'forgiven') ? '1' : '';
  }

  function isTruthy(v) {
    var s = collapse(v).toLowerCase();
    return s === '1' || s === 'y' || s === 'yes' || s === 'true' || s === 'on';
  }

  function filerPac(fields, cfg) {
    var existing = collapse(fields.pac_reg);
    if (existing) return existing;
    if (isTruthy(cfg.stamp_filer_pac_number) && collapse(cfg.entity)) return collapse(cfg.entity);
    return '';
  }

  // ---- Row helpers ------------------------------------------------------
  function isBlankRow(row) {
    if (!row) return true;
    for (var i = 0; i < row.length; i++) {
      var c = row[i];
      if (c !== null && c !== undefined && String(c).trim() !== '') return false;
    }
    return true;
  }

  function dataRows(rows) {
    // Strip header (row 1), drop blank rows. Returns [{ rownum, row }].
    var out = [];
    for (var i = 1; i < rows.length; i++) {
      if (isBlankRow(rows[i])) continue;
      out.push({ rownum: i + 1, row: rows[i] });
    }
    return out;
  }

  function rowFields(row, ids) {
    var f = {};
    for (var i = 0; i < ids.length; i++) f[ids[i]] = (row && i < row.length) ? row[i] : null;
    return f;
  }

  function fullName(f) {
    return collapse((collapse(f.first) + ' ' + collapse(f.last)).trim());
  }

  // ---- Shared validations ----------------------------------------------
  function checkPersonOrOrg(f, errors, label) {
    var nameFilled = !!(collapse(f.first) || collapse(f.last));
    var anyNamePart = !!(collapse(f.first) || collapse(f.middle) || collapse(f.last) || collapse(f.suffix));
    var orgFilled = !!collapse(f.non_individual);
    if (orgFilled && anyNamePart) errors.push('both individual name and NON INDIVIDUAL ' + label + ' are filled');
    else if (!nameFilled && !orgFilled) errors.push('missing ' + label + ': no name parts and no NON INDIVIDUAL value');
    return nameFilled && !orgFilled;
  }

  function checkAddress(f, errors, label, flagPlaceholder) {
    var addr = collapse(f.address);
    var zip = normalizeZip(f.zip);
    if (!addr) errors.push('missing ' + label + ' street address');
    else if (flagPlaceholder && PLACEHOLDER_ADDRESSES[addr.toLowerCase()]) errors.push("placeholder " + label + " address '" + addr + "' is not allowed");
    if (!collapse(f.city)) errors.push('missing city');
    if (!collapse(f.state)) errors.push('missing state');
    if (!collapse(f.zip)) errors.push('missing ZIP');
    else if (zip.error) errors.push(zip.error);
    return zip.value;
  }

  function requiredAmount(f, key, errors, label) {
    var a = parseAmount(f[key]);
    if (a.error) { errors.push(a.error); return null; }
    if (a.cents === null) { errors.push('missing ' + label); return null; }
    if (a.cents <= 0) { errors.push(label + ' must be greater than 0 (got ' + fmtAmount(a.cents) + ')'); return null; }
    return a.cents;
  }

  function optionalNonNeg(f, key, errors, label) {
    var a = parseAmount(f[key]);
    if (a.error) { errors.push(a.error); return null; }
    if (a.cents === null) return 0;
    if (a.cents < 0) { errors.push(label + ' cannot be negative (got ' + fmtAmount(a.cents) + ')'); return null; }
    return a.cents;
  }

  // ---- Schedule processors ---------------------------------------------
  function processContributions(rows, cfg) {
    var results = [], item = 0;
    dataRows(rows).forEach(function (rec) {
      var f = rowFields(rec.row, CONT_IDS), errors = [], warnings = [];
      var isPerson = checkPersonOrOrg(f, errors, 'contributor');
      var zip = checkAddress(f, errors, 'contributor', false);
      var employer = collapse(f.employer);
      if (isPerson && !employer) warnings.push('missing employer (CFOFS flags blank employer for individuals)');
      var form = normalizeForm(f.form, cfg.form_of_contribution_code);
      if (form.error) errors.push(form.error);
      var d = parseDate(f.date);
      if (d.error) errors.push(d.error); else if (!d.text) errors.push('missing DATE OF CONTRIBUTION');
      var amount = requiredAmount(f, 'amount', errors, 'AMOUNT');
      var pac = filerPac(f, cfg);
      var ev = parseDate(f.event_date);
      if (ev.error) errors.push(ev.error);
      var dr = parseAmount(f.amount_debt_remaining);
      item += 1;
      var cells = [
        properCase(f.first), properCase(f.middle), properCase(f.last), collapse(f.suffix),
        collapse(f.non_individual), pac, collapse(f.address), properCase(f.city),
        collapse(f.state).toUpperCase(), zip, employer, form.code, d.text,
        amount !== null ? fmtAmount(amount) : '', collapse(f.other_income_type), ev.text,
        collapse(f.inkind_desc), yesNo(f.received_at_event, 'N'), properCase(f.name_of_creditor),
        (dr.error || dr.cents === null) ? collapse(f.amount_debt_remaining) : fmtAmount(dr.cents),
        String(item), '31A'
      ];
      results.push({ row: rec.rownum, cells: cells, errors: errors, warnings: warnings, amount: amount || 0 });
    });
    return results;
  }

  function processExpenses(rows, cfg) {
    var results = [], item = 0;
    dataRows(rows).forEach(function (rec) {
      var f = rowFields(rec.row, EXPS_IDS), errors = [], warnings = [];
      checkPersonOrOrg(f, errors, 'payee');
      var zip = checkAddress(f, errors, 'payee', false);
      var d = parseDate(f.date);
      if (d.error) errors.push(d.error); else if (!d.text) errors.push('missing DATE OF EXPENDITURE');
      var amount = requiredAmount(f, 'amount', errors, 'AMOUNT');
      if (!collapse(f.purpose)) warnings.push('missing PURPOSE (CFOFS expects a short, specific purpose)');
      var ev = parseDate(f.event_date);
      if (ev.error) errors.push(ev.error);
      item += 1;
      var cells = [
        properCase(f.first), properCase(f.middle), properCase(f.last), collapse(f.suffix),
        collapse(f.non_individual), collapse(f.address), properCase(f.city),
        collapse(f.state).toUpperCase(), zip, d.text, amount !== null ? fmtAmount(amount) : '',
        collapse(f.purpose), ev.text, collapse(f.candidate_or_issue), collapse(f.support_oppose),
        collapse(f.office), collapse(f.party_fund), String(item), '31B'
      ];
      results.push({ row: rec.rownum, cells: cells, errors: errors, warnings: warnings, amount: amount || 0 });
    });
    return results;
  }

  function processLoans(rows, cfg) {
    var results = [], item = 0;
    dataRows(rows).forEach(function (rec) {
      var f = rowFields(rec.row, LOAN_IDS), errors = [], warnings = [];
      checkPersonOrOrg(f, errors, 'creditor');
      var zip = checkAddress(f, errors, 'creditor', true);
      var d = parseDate(f.date_incurred);
      if (d.error) errors.push(d.error); else if (!d.text) errors.push('missing DATE LOAN WAS ORIGINAL INCURRED');
      var prior = optionalNonNeg(f, 'prior_amount', errors, 'PRIOR AMOUNT');
      var incurred = optionalNonNeg(f, 'amount_incurred', errors, 'AMOUNT INCURRED');
      var payment = optionalNonNeg(f, 'payment_amount', errors, 'PAYMENT AMOUNT');
      var outRaw = parseAmount(f.outstanding_balance);
      if (outRaw.error) errors.push(outRaw.error);
      var outstanding = null;
      if (prior !== null && incurred !== null && payment !== null) {
        var expected = prior + incurred - payment;
        if (outRaw.cents === null) outstanding = expected;
        else if (outRaw.cents !== expected) {
          errors.push('OUTSTANDING BALANCE ' + fmtAmount(outRaw.cents) + ' != prior ' + fmtAmount(prior) +
            ' + incurred ' + fmtAmount(incurred) + ' - payment ' + fmtAmount(payment) + ' = ' + fmtAmount(expected));
        } else outstanding = outRaw.cents;
        if (outstanding !== null && outstanding < 0) errors.push('OUTSTANDING BALANCE is negative (' + fmtAmount(outstanding) + ')');
      }
      var pd = parseDate(f.payment_date);
      if (pd.error) errors.push(pd.error);
      if (payment && payment > 0 && !pd.text) warnings.push('PAYMENT AMOUNT present but PAYMENT DATE is blank');
      var code = collapse(f.schedule_code).toUpperCase() || '31N';
      if (code !== '31N' && code !== '31C') errors.push("SCHEDULE CODE '" + code + "' must be 31N (debt) or 31C (loan)");
      var pac = filerPac(f, cfg);
      item += 1;
      var cells = [
        properCase(f.first), properCase(f.middle), properCase(f.last), collapse(f.suffix),
        collapse(f.non_individual), pac, collapse(f.address), properCase(f.city),
        collapse(f.state).toUpperCase(), zip, collapse(f.employer), d.text,
        prior !== null ? fmtAmount(prior) : '', outstanding !== null ? fmtAmount(outstanding) : '',
        collapse(f.purpose), forgiven(f.forgiven), incurred !== null ? fmtAmount(incurred) : '',
        pd.text, (payment !== null && payment > 0) ? fmtAmount(payment) : '', String(item), code
      ];
      results.push({ row: rec.rownum, cells: cells, errors: errors, warnings: warnings, amount: outstanding || 0 });
    });
    return results;
  }

  // ---- Tab matching + top-level export ----------------------------------
  function matchTabs(sheets) {
    var found = { CONT: null, EXPS: null, LOAN: null };
    Object.keys(sheets).forEach(function (name) {
      var key = name.replace(/\s+/g, '').toLowerCase();
      if (key.indexOf('contribution') !== -1 && !found.CONT) found.CONT = { name: name, rows: sheets[name] };
      else if ((key.indexOf('expens') !== -1 || key.indexOf('expenditure') !== -1) && !found.EXPS) found.EXPS = { name: name, rows: sheets[name] };
      else if ((key.indexOf('loan') !== -1 || key.indexOf('debt') !== -1) && !found.LOAN) found.LOAN = { name: name, rows: sheets[name] };
    });
    return found;
  }

  var SCHEDULES = [
    { key: 'CONT', code: '31A', tab: 'Contributions', proc: processContributions, amountLabel: 'AMOUNT' },
    { key: 'EXPS', code: '31B', tab: 'Expense', proc: processExpenses, amountLabel: 'AMOUNT' },
    { key: 'LOAN', code: '31N/31C', tab: 'Loan', proc: processLoans, amountLabel: 'outstanding' }
  ];

  function exportWorkbook(sheets, cfg) {
    var tabs = matchTabs(sheets);
    var out = { files: {}, totals: {} };
    SCHEDULES.forEach(function (sc) {
      var rec = { schedule: sc.key, code: sc.code, tab: sc.tab, amountLabel: sc.amountLabel,
        found: !!tabs[sc.key], sheetName: tabs[sc.key] ? tabs[sc.key].name : null,
        rows: [], blocking: [], warned: [], total: 0,
        filename: (cfg.entity || 'ENTITY') + '_' + sc.key + '_' + (cfg.report || 'REPORT') + '.csv' };
      if (tabs[sc.key]) {
        rec.rows = sc.proc(tabs[sc.key].rows, cfg);
        rec.rows.forEach(function (r) {
          rec.total += r.amount;
          if (r.errors.length) rec.blocking.push(r);
          if (r.warnings.length) rec.warned.push(r);
        });
      }
      out.files[sc.key] = rec;
      out.totals[sc.key] = rec.total;
    });
    return out;
  }

  // ---- CSV writer (QUOTE_MINIMAL, no header, CRLF) ----------------------
  function csvField(v) {
    var s = (v === null || v === undefined) ? '' : String(v);
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCsv(rows) {
    return rows.map(function (r) {
      return r.cells.map(csvField).join(',');
    }).join('\r\n') + '\r\n';
  }

  // ---- Reconciliation ---------------------------------------------------
  function ledgerEvents(sheets) {
    var tabs = matchTabs(sheets);
    var events = [], missing = [];
    function name(f, suffix) {
      var n = collapse(f.non_individual) || fullName(f) || suffix.base;
      return suffix.tag ? n + ' ' + suffix.tag : n;
    }
    if (tabs.CONT) {
      dataRows(tabs.CONT.rows).forEach(function (rec) {
        var f = rowFields(rec.row, CONT_IDS);
        var a = parseAmount(f.amount), d = toDateUTC(f.date);
        if (a.cents && a.cents > 0 && d) events.push({ date: d, cents: a.cents, desc: name(f, { base: 'contribution' }), source: 'Contributions', ref: 'row ' + rec.rownum, matched: null });
      });
    } else missing.push('Contributions');
    if (tabs.EXPS) {
      dataRows(tabs.EXPS.rows).forEach(function (rec) {
        var f = rowFields(rec.row, EXPS_IDS);
        var a = parseAmount(f.amount), d = toDateUTC(f.date);
        var who = collapse(f.non_individual) || fullName(f) || collapse(f.purpose) || 'expense';
        if (a.cents && a.cents > 0 && d) events.push({ date: d, cents: -a.cents, desc: who, source: 'Expense', ref: 'row ' + rec.rownum, matched: null });
      });
    } else missing.push('Expense');
    if (tabs.LOAN) {
      dataRows(tabs.LOAN.rows).forEach(function (rec) {
        var f = rowFields(rec.row, LOAN_IDS);
        var code = collapse(f.schedule_code).toUpperCase() || '31N';
        var who = collapse(f.non_individual) || fullName(f) || 'loan';
        if (code === '31C') {
          var inc = parseAmount(f.amount_incurred), di = toDateUTC(f.date_incurred);
          if (inc.cents && inc.cents > 0 && di) events.push({ date: di, cents: inc.cents, desc: who + ' (loan proceeds)', source: 'Loan', ref: 'row ' + rec.rownum, matched: null });
        }
        var pay = parseAmount(f.payment_amount), pd = toDateUTC(f.payment_date);
        if (pay.cents && pay.cents > 0 && pd) events.push({ date: pd, cents: -pay.cents, desc: who + ' (payment)', source: 'Loan', ref: 'row ' + rec.rownum, matched: null });
      });
    } else missing.push('Loan');
    return { events: events, missing: missing };
  }

  function findCol(headers, keywords, override) {
    var i, h;
    if (override) {
      var target = collapse(override).toLowerCase();
      for (i = 0; i < headers.length; i++) if (headers[i] === target) return i;
      return -2; // explicit-but-not-found
    }
    for (i = 0; i < headers.length; i++) {
      h = headers[i];
      for (var k = 0; k < keywords.length; k++) if (h.indexOf(keywords[k]) !== -1) return i;
    }
    return -1;
  }

  function bankEvents(rows, opts) {
    opts = opts || {};
    if (!rows || !rows.length) throw new Error('Bank statement is empty');
    var headers = rows[0].map(function (h) { return collapse(h).toLowerCase(); });
    var dateI = findCol(headers, ['date', 'posted', 'posting'], opts.dateCol);
    var descI = findCol(headers, ['description', 'memo', 'details', 'payee', 'name'], opts.descCol);
    var amtI = findCol(headers, ['amount', 'value'], opts.amountCol);
    var debI = findCol(headers, ['debit', 'withdrawal', 'withdraw'], opts.debitCol);
    var creI = findCol(headers, ['credit', 'deposit'], opts.creditCol);
    if (dateI < 0) throw new Error('Could not find a date column in the bank statement. Headers: ' + headers.join(', '));
    var useSplit = (debI >= 0 || creI >= 0) && amtI < 0;
    if (amtI < 0 && !useSplit) throw new Error("Could not find an amount column (need 'amount', or 'debit'/'credit'). Headers: " + headers.join(', '));
    var events = [];
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r];
      if (isBlankRow(row)) continue;
      var d = toDateUTC(cell(row, dateI));
      if (!d) continue;
      var cents;
      if (useSplit) {
        var deb = parseAmount(cell(row, debI)).cents || 0;
        var cre = parseAmount(cell(row, creI)).cents || 0;
        cents = cre - deb;
      } else {
        cents = parseAmount(cell(row, amtI)).cents;
      }
      if (cents === null || cents === 0) continue;
      events.push({ date: d, cents: cents, desc: descI >= 0 ? collapse(cell(row, descI)) : '', source: 'Bank', ref: 'row ' + (r + 1), matched: null });
    }
    return events;
  }

  function cell(row, i) { return (i !== null && i >= 0 && i < row.length) ? row[i] : null; }

  function inPeriod(ev, start, end) {
    if (start && ev.date.getTime() < start.getTime()) return false;
    if (end && ev.date.getTime() > end.getTime()) return false;
    return true;
  }

  function matchEvents(ledger, bank, toleranceDays) {
    var tolMs = toleranceDays * 86400000;
    var byAmount = {};
    bank.forEach(function (b) { (byAmount[b.cents] = byAmount[b.cents] || []).push(b); });
    ledger.slice().sort(function (a, b) { return a.date - b.date; }).forEach(function (led) {
      var cands = (byAmount[led.cents] || []).filter(function (b) { return !b.matched; });
      var best = null, bestGap = null;
      cands.forEach(function (b) {
        var gap = Math.abs(b.date.getTime() - led.date.getTime());
        if (gap <= tolMs && (bestGap === null || gap < bestGap)) { best = b; bestGap = gap; }
      });
      if (best) { led.matched = best; best.matched = led; }
    });
  }

  function sumCents(arr) { return arr.reduce(function (s, e) { return s + e.cents; }, 0); }

  function reconcile(sheets, bankRows, opts) {
    opts = opts || {};
    var L = ledgerEvents(sheets);
    var ledger = L.events;
    var bank = bankEvents(bankRows, opts);

    var start = opts.periodStart ? toDateUTC(opts.periodStart) : null;
    var end = opts.periodEnd ? toDateUTC(opts.periodEnd) : null;
    if (!start && bank.length) start = bank.reduce(function (m, e) { return e.date < m ? e.date : m; }, bank[0].date);
    if (!end && bank.length) end = bank.reduce(function (m, e) { return e.date > m ? e.date : m; }, bank[0].date);

    ledger = ledger.filter(function (e) { return inPeriod(e, start, end); });
    bank = bank.filter(function (e) { return inPeriod(e, start, end); });

    matchEvents(ledger, bank, opts.toleranceDays != null ? opts.toleranceDays : 5);

    var matched = ledger.filter(function (e) { return e.matched; });
    var unmatchedLedger = ledger.filter(function (e) { return !e.matched; });
    var unmatchedBank = bank.filter(function (e) { return !e.matched; });

    var inCents = sumCents(ledger.filter(function (e) { return e.cents > 0; }));
    var outCents = sumCents(ledger.filter(function (e) { return e.cents < 0; }));
    var ledgerNet = inCents + outCents;
    var bankNet = sumCents(bank);
    var diff = ledgerNet - bankNet;

    var opening = (opts.openingBalance !== undefined && opts.openingBalance !== null && opts.openingBalance !== '')
      ? parseAmount(opts.openingBalance).cents : null;

    return {
      start: start, end: end, missing: L.missing,
      ledger: ledger, bank: bank, matched: matched,
      unmatchedLedger: unmatchedLedger, unmatchedBank: unmatchedBank,
      inCents: inCents, outCents: outCents, ledgerNet: ledgerNet, bankNet: bankNet,
      diff: diff, opening: opening, balanced: diff === 0 && !unmatchedLedger.length && !unmatchedBank.length
    };
  }

  function reconWorksheetCsv(recon) {
    var lines = [['status', 'date', 'amount', 'source', 'ref', 'description', 'matched_date', 'matched_description']];
    recon.ledger.forEach(function (e) {
      var m = e.matched;
      lines.push([m ? 'matched' : 'unmatched_in_books', fmtISO(e.date), fmtAmount(e.cents), e.source, e.ref, e.desc, m ? fmtISO(m.date) : '', m ? m.desc : '']);
    });
    recon.unmatchedBank.forEach(function (e) {
      lines.push(['unmatched_on_statement', fmtISO(e.date), fmtAmount(e.cents), 'Bank', e.ref, e.desc, '', '']);
    });
    return lines.map(function (r) { return r.map(csvField).join(','); }).join('\r\n') + '\r\n';
  }

  var API = {
    CONT_HEADERS: CONT_HEADERS, EXPS_HEADERS: EXPS_HEADERS, LOAN_HEADERS: LOAN_HEADERS,
    SCHEDULES: SCHEDULES,
    collapse: collapse, properCase: properCase, normalizeZip: normalizeZip,
    parseAmount: parseAmount, fmtAmount: fmtAmount, parseDate: parseDate, fmtMDY: fmtMDY,
    fmtISO: fmtISO, toDateUTC: toDateUTC, normalizeForm: normalizeForm,
    exportWorkbook: exportWorkbook, toCsv: toCsv,
    reconcile: reconcile, reconWorksheetCsv: reconWorksheetCsv, matchTabs: matchTabs
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CFOFS = API;
})(typeof window !== 'undefined' ? window : this);
