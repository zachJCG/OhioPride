// CFOFS rules for the Ohio Secretary of State upload files.
//
// Ported from public/admin/compliance/cfofs-browser.js (normalizers, schedule
// processors, CSV writer) and public/admin/compliance/compliance-app.js (the
// per-schedule column model). Every filing rule the treasurer relies on lives
// here and nowhere else, so it stays auditable and testable on its own.
//
// Money is carried as integer cents everywhere, matching the database columns.

// ---- Column schemas (exact CFOFS template order) --------------------------
const CONT_HEADERS = [
  'CONTRIBUTOR FIRST NAME', 'CONTRIB MIDDLE NAME', 'CONTRIBUTOR LAST NAME',
  'SUFFIX', 'NON INDIVIDUAL CONTRIBUTOR', 'PAC REGISTRATION NUMBER',
  'CONTRIBUTOR ADDRESS', 'CITY', 'STATE', 'ZIP',
  'CONTRIBUTOR EMPLOYER OCCUPATION OR LABOR ORGANIZATION',
  'FORM OF CONTRIBUTION', 'DATE OF CONTRIBUTION', 'AMOUNT',
  'OTHER INCOME TYPE', 'EVENT DATE', 'INKIND DESCRIPTION',
  'RECEIVED AT FUNDRAISING EVENT (Y/N)', 'NAME OF CREDITOR',
  'AMOUNT OF DEBT REMAINING', 'ITEM NUMBER', 'SCHEDULE CODE (EX. 31A)',
];
const CONT_IDS = [
  'first', 'middle', 'last', 'suffix', 'non_individual', 'pac_reg',
  'address', 'city', 'state', 'zip', 'employer', 'form', 'date', 'amount',
  'other_income_type', 'event_date', 'inkind_desc', 'received_at_event',
  'name_of_creditor', 'amount_debt_remaining', 'item_number', 'schedule_code',
];

const EXPS_HEADERS = [
  'PAYEE FIRST NAME', 'PAYEE MIDDLE NAME', 'PAYEE LAST NAME', 'SUFFIX',
  'NON INDIVIDUAL PAYEE', 'PAYEE ADDRESS', 'CITY', 'STATE', 'ZIP',
  'DATE OF EXPENDITURE', 'AMOUNT', 'PURPOSE', 'EVENT DATE',
  'CANDIDATE OR BALLOT ISSUE (FORM 31U ONLY)',
  'SUPPORT/ OPPOSE (1 if Support/2 if Oppose)', 'OFFICE (FORM 31U ONLY)',
  'EXPENDITURE FROM POLITICAL PARTY FUND (FORM 31M ONLY)',
  'ITEM NUMBER', 'SCHEDULE CODE (EX. 31B)',
];
const EXPS_IDS = [
  'first', 'middle', 'last', 'suffix', 'non_individual', 'address', 'city',
  'state', 'zip', 'date', 'amount', 'purpose', 'event_date',
  'candidate_or_issue', 'support_oppose', 'office', 'party_fund',
  'item_number', 'schedule_code',
];

// Column 5 header is the official misspelling "NON INDIDIVUAL". Keep it.
const LOAN_HEADERS = [
  'FIRST NAME', 'MIDDLE NAME', 'LAST NAME', 'SUFFIX', 'NON INDIDIVUAL',
  'PAC REGISTRATION NUMBER', 'ADDRESS', 'CITY', 'STATE', 'ZIP',
  'EMPLOYER OCCUPATION LABOR ORGANIZATION',
  'DATE LOAN WAS ORIGINAL INCURRED', 'PRIOR AMOUNT', 'OUTSTANDING BALANCE',
  'PURPOSE', 'FORGIVEN (If True Enter a 1)', 'AMOUNT INCURRED',
  'PAYMENT DATE', 'PAYMENT AMOUNT', 'ITEM NUMBER',
  'SCHEDULE CODE (EX 31C, 31N)',
];
const LOAN_IDS = [
  'first', 'middle', 'last', 'suffix', 'non_individual', 'pac_reg',
  'address', 'city', 'state', 'zip', 'employer', 'date_incurred',
  'prior_amount', 'outstanding_balance', 'purpose', 'forgiven',
  'amount_incurred', 'payment_date', 'payment_amount', 'item_number',
  'schedule_code',
];

const FORM_LABEL_TO_CODE = {
  check: '1', cheque: '1',
  cash: '2',
  'credit card': '3', creditcard: '3', credit: '3', card: '3',
  electronic: '4', 'electronic transfer': '4',
  'electronic funds transfer': '4', ach: '4', eft: '4',
  actblue: '4', wire: '4', online: '4',
};

const PLACEHOLDER_ADDRESSES = new Set([
  'tbd', 'n/a', 'na', 'none', 'unknown', '-', '--', '.', 'pending',
  'address', 'on file', 'see notes', 'xxx', 'x',
]);

// ---- Normalizers ----------------------------------------------------------
export function collapse(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

function properCase(v) {
  const s = collapse(v);
  if (!s || /[a-z]/.test(s)) return s; // keep human-typed mixed case
  return s.replace(/[A-Za-z]+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function normalizeZip(v) {
  const s = collapse(v);
  if (!s) return { value: '', error: null };
  const digits = s.replace(/\D/g, '');
  if (digits.length < 5) return { value: s, error: "ZIP '" + s + "' is not 5 digits" };
  return { value: digits.slice(0, 5), error: null };
}

export function parseAmount(v) {
  if (v === null || v === undefined || v === '') return { cents: null, error: null };
  if (typeof v === 'number') {
    if (!isFinite(v)) return { cents: null, error: "unparseable amount '" + v + "'" };
    return { cents: Math.round(v * 100), error: null };
  }
  let s = collapse(v);
  if (!s) return { cents: null, error: null };
  let negative = false;
  if (s.charAt(0) === '(' && s.charAt(s.length - 1) === ')') { negative = true; s = s.slice(1, -1); }
  s = s.replace(/\$/g, '').replace(/,/g, '').replace(/\s/g, '');
  if (s.charAt(0) === '-') { negative = true; s = s.slice(1); }
  if (!/^\d*\.?\d+$/.test(s) && !/^\d+\.?\d*$/.test(s)) {
    return { cents: null, error: "unparseable amount '" + v + "'" };
  }
  const n = parseFloat(s);
  if (Number.isNaN(n)) return { cents: null, error: "unparseable amount '" + v + "'" };
  const cents = Math.round(n * 100);
  return { cents: negative ? -cents : cents, error: null };
}

export function fmtAmount(cents) {
  return (cents / 100).toFixed(2);
}

// Form entry: dollars typed by a person, negative and junk rejected.
export function parseCents(str) {
  if (str == null) return NaN;
  const n = parseFloat(String(str).replace(/[^0-9.\-]/g, ''));
  if (Number.isNaN(n) || n < 0) return NaN;
  return Math.round(n * 100);
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30); // 1899-12-30, absorbs the 1900 leap bug

function validYMD(y, mo, da) {
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
  const d = new Date(Date.UTC(y, mo - 1, da));
  if (d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== da) return null;
  return d;
}

export function toDateUTC(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  }
  if (typeof v === 'number') {
    if (v <= 0) return null;
    return new Date(EXCEL_EPOCH + Math.floor(v) * 86400000);
  }
  const s = collapse(v);
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const serial = parseFloat(s);
    return serial > 0 ? new Date(EXCEL_EPOCH + Math.floor(serial) * 86400000) : null;
  }
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (m) {
    let yr = +m[3];
    if (yr < 100) yr += 2000;
    return validYMD(yr, +m[1], +m[2]);
  }
  m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (m) return validYMD(+m[1], +m[2], +m[3]);
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  }
  return null;
}

function fmtMDY(date) {
  if (!date) return '';
  const mo = String(date.getUTCMonth() + 1).padStart(2, '0');
  const da = String(date.getUTCDate()).padStart(2, '0');
  return mo + '/' + da + '/' + date.getUTCFullYear();
}

export function fmtISO(date) {
  if (!date) return '';
  const mo = String(date.getUTCMonth() + 1).padStart(2, '0');
  const da = String(date.getUTCDate()).padStart(2, '0');
  return date.getUTCFullYear() + '-' + mo + '-' + da;
}

function parseDate(v) {
  if (v === null || v === undefined || v === '') return { text: '', error: null };
  const d = toDateUTC(v);
  if (!d) return { text: '', error: "unparseable date '" + collapse(v) + "'" };
  return { text: fmtMDY(d), error: null };
}

function normalizeForm(v, defaultCode) {
  const s = collapse(v);
  if (!s) return { code: defaultCode, error: null };
  if (/^\d+$/.test(s)) return { code: s, error: null };
  const key = s.toLowerCase();
  if (FORM_LABEL_TO_CODE[key]) return { code: FORM_LABEL_TO_CODE[key], error: null };
  return { code: s, error: "FORM OF CONTRIBUTION '" + s + "' is a text label, not an SOS code" };
}

function yesNo(v, dflt) {
  const s = collapse(v).toLowerCase();
  if (!s) return dflt || 'N';
  return (s === 'y' || s === 'yes' || s === 'true' || s === '1') ? 'Y' : 'N';
}

function forgivenCell(v) {
  const s = collapse(v).toLowerCase();
  return (s === '1' || s === 'y' || s === 'yes' || s === 'true' || s === 'forgiven') ? '1' : '';
}

function isTruthy(v) {
  const s = collapse(v).toLowerCase();
  return s === '1' || s === 'y' || s === 'yes' || s === 'true' || s === 'on';
}

function filerPac(fields, cfg) {
  const existing = collapse(fields.pac_reg);
  if (existing) return existing;
  if (isTruthy(cfg.stamp_filer_pac_number) && collapse(cfg.entity)) return collapse(cfg.entity);
  return '';
}

// ---- Row helpers ----------------------------------------------------------
function isBlankRow(row) {
  if (!row) return true;
  for (const c of row) {
    if (c !== null && c !== undefined && String(c).trim() !== '') return false;
  }
  return true;
}

function dataRows(rows) {
  // Strip the header (row 1) and drop blank rows. Returns [{ rownum, row }].
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    if (isBlankRow(rows[i])) continue;
    out.push({ rownum: i + 1, row: rows[i] });
  }
  return out;
}

function rowFields(row, ids) {
  const f = {};
  for (let i = 0; i < ids.length; i++) f[ids[i]] = (row && i < row.length) ? row[i] : null;
  return f;
}

// ---- Shared validations ---------------------------------------------------
function checkPersonOrOrg(f, errors, label) {
  const nameFilled = !!(collapse(f.first) || collapse(f.last));
  const anyNamePart = !!(collapse(f.first) || collapse(f.middle) || collapse(f.last) || collapse(f.suffix));
  const orgFilled = !!collapse(f.non_individual);
  if (orgFilled && anyNamePart) errors.push('both individual name and NON INDIVIDUAL ' + label + ' are filled');
  else if (!nameFilled && !orgFilled) errors.push('missing ' + label + ': no name parts and no NON INDIVIDUAL value');
  return nameFilled && !orgFilled;
}

function checkAddress(f, errors, label, flagPlaceholder) {
  const addr = collapse(f.address);
  const zip = normalizeZip(f.zip);
  if (!addr) errors.push('missing ' + label + ' street address');
  else if (flagPlaceholder && PLACEHOLDER_ADDRESSES.has(addr.toLowerCase())) errors.push("placeholder " + label + " address '" + addr + "' is not allowed");
  if (!collapse(f.city)) errors.push('missing city');
  if (!collapse(f.state)) errors.push('missing state');
  if (!collapse(f.zip)) errors.push('missing ZIP');
  else if (zip.error) errors.push(zip.error);
  return zip.value;
}

function requiredAmount(f, key, errors, label) {
  const a = parseAmount(f[key]);
  if (a.error) { errors.push(a.error); return null; }
  if (a.cents === null) { errors.push('missing ' + label); return null; }
  if (a.cents <= 0) { errors.push(label + ' must be greater than 0 (got ' + fmtAmount(a.cents) + ')'); return null; }
  return a.cents;
}

function optionalNonNeg(f, key, errors, label) {
  const a = parseAmount(f[key]);
  if (a.error) { errors.push(a.error); return null; }
  if (a.cents === null) return 0;
  if (a.cents < 0) { errors.push(label + ' cannot be negative (got ' + fmtAmount(a.cents) + ')'); return null; }
  return a.cents;
}

// ---- Schedule processors --------------------------------------------------
function processContributions(rows, cfg) {
  const results = [];
  let item = 0;
  dataRows(rows).forEach((rec) => {
    const f = rowFields(rec.row, CONT_IDS);
    const errors = [];
    const warnings = [];
    const isPerson = checkPersonOrOrg(f, errors, 'contributor');
    const zip = checkAddress(f, errors, 'contributor', false);
    const employer = collapse(f.employer);
    if (isPerson && !employer) warnings.push('missing employer (CFOFS flags blank employer for individuals)');
    const form = normalizeForm(f.form, cfg.form_of_contribution_code);
    if (form.error) errors.push(form.error);
    const d = parseDate(f.date);
    if (d.error) errors.push(d.error);
    else if (!d.text) errors.push('missing DATE OF CONTRIBUTION');
    const amount = requiredAmount(f, 'amount', errors, 'AMOUNT');
    const pac = filerPac(f, cfg);
    const ev = parseDate(f.event_date);
    if (ev.error) errors.push(ev.error);
    const dr = parseAmount(f.amount_debt_remaining);
    item += 1;
    const cells = [
      properCase(f.first), properCase(f.middle), properCase(f.last), collapse(f.suffix),
      collapse(f.non_individual), pac, collapse(f.address), properCase(f.city),
      collapse(f.state).toUpperCase(), zip, employer, form.code, d.text,
      amount !== null ? fmtAmount(amount) : '', collapse(f.other_income_type), ev.text,
      collapse(f.inkind_desc), yesNo(f.received_at_event, 'N'), properCase(f.name_of_creditor),
      (dr.error || dr.cents === null) ? collapse(f.amount_debt_remaining) : fmtAmount(dr.cents),
      String(item), '31A',
    ];
    results.push({ row: rec.rownum, cells, errors, warnings, amount: amount || 0 });
  });
  return results;
}

function processExpenses(rows, cfg) {
  const results = [];
  let item = 0;
  dataRows(rows).forEach((rec) => {
    const f = rowFields(rec.row, EXPS_IDS);
    const errors = [];
    const warnings = [];
    checkPersonOrOrg(f, errors, 'payee');
    const zip = checkAddress(f, errors, 'payee', false);
    const d = parseDate(f.date);
    if (d.error) errors.push(d.error);
    else if (!d.text) errors.push('missing DATE OF EXPENDITURE');
    const amount = requiredAmount(f, 'amount', errors, 'AMOUNT');
    if (!collapse(f.purpose)) warnings.push('missing PURPOSE (CFOFS expects a short, specific purpose)');
    const ev = parseDate(f.event_date);
    if (ev.error) errors.push(ev.error);
    item += 1;
    const cells = [
      properCase(f.first), properCase(f.middle), properCase(f.last), collapse(f.suffix),
      collapse(f.non_individual), collapse(f.address), properCase(f.city),
      collapse(f.state).toUpperCase(), zip, d.text, amount !== null ? fmtAmount(amount) : '',
      collapse(f.purpose), ev.text, collapse(f.candidate_or_issue), collapse(f.support_oppose),
      collapse(f.office), collapse(f.party_fund), String(item), '31B',
    ];
    results.push({ row: rec.rownum, cells, errors, warnings, amount: amount || 0 });
  });
  return results;
}

function processLoans(rows, cfg) {
  const results = [];
  let item = 0;
  dataRows(rows).forEach((rec) => {
    const f = rowFields(rec.row, LOAN_IDS);
    const errors = [];
    const warnings = [];
    checkPersonOrOrg(f, errors, 'creditor');
    const zip = checkAddress(f, errors, 'creditor', true);
    const d = parseDate(f.date_incurred);
    if (d.error) errors.push(d.error);
    else if (!d.text) errors.push('missing DATE LOAN WAS ORIGINAL INCURRED');
    const prior = optionalNonNeg(f, 'prior_amount', errors, 'PRIOR AMOUNT');
    const incurred = optionalNonNeg(f, 'amount_incurred', errors, 'AMOUNT INCURRED');
    const payment = optionalNonNeg(f, 'payment_amount', errors, 'PAYMENT AMOUNT');
    const outRaw = parseAmount(f.outstanding_balance);
    if (outRaw.error) errors.push(outRaw.error);
    let outstanding = null;
    if (prior !== null && incurred !== null && payment !== null) {
      const expected = prior + incurred - payment;
      if (outRaw.cents === null) outstanding = expected;
      else if (outRaw.cents !== expected) {
        errors.push('OUTSTANDING BALANCE ' + fmtAmount(outRaw.cents) + ' != prior ' + fmtAmount(prior) +
          ' + incurred ' + fmtAmount(incurred) + ' - payment ' + fmtAmount(payment) + ' = ' + fmtAmount(expected));
      } else outstanding = outRaw.cents;
      if (outstanding !== null && outstanding < 0) errors.push('OUTSTANDING BALANCE is negative (' + fmtAmount(outstanding) + ')');
    }
    const pd = parseDate(f.payment_date);
    if (pd.error) errors.push(pd.error);
    if (payment && payment > 0 && !pd.text) warnings.push('PAYMENT AMOUNT present but PAYMENT DATE is blank');
    const code = collapse(f.schedule_code).toUpperCase() || '31N';
    if (code !== '31N' && code !== '31C') errors.push("SCHEDULE CODE '" + code + "' must be 31N (debt) or 31C (loan)");
    const pac = filerPac(f, cfg);
    item += 1;
    const cells = [
      properCase(f.first), properCase(f.middle), properCase(f.last), collapse(f.suffix),
      collapse(f.non_individual), pac, collapse(f.address), properCase(f.city),
      collapse(f.state).toUpperCase(), zip, collapse(f.employer), d.text,
      prior !== null ? fmtAmount(prior) : '', outstanding !== null ? fmtAmount(outstanding) : '',
      collapse(f.purpose), forgivenCell(f.forgiven), incurred !== null ? fmtAmount(incurred) : '',
      pd.text, (payment !== null && payment > 0) ? fmtAmount(payment) : '', String(item), code,
    ];
    results.push({ row: rec.rownum, cells, errors, warnings, amount: outstanding || 0 });
  });
  return results;
}

// ---- Field model: one entry per CFOFS column the treasurer can edit --------
//   id    -> the template field id (positionally aligned to the *_IDS arrays)
//   col   -> the database column
//   type  -> text | money | date | bool | select
const FORM_OPTS = [
  { v: '', l: 'Use the filing default' },
  { v: '1', l: 'Check (1)' },
  { v: '2', l: 'Cash (2)' },
  { v: '3', l: 'Credit card (3)' },
  { v: '4', l: 'Electronic (4)' },
];

export const SCHEDULES = {
  contribution: {
    key: 'CONT', code: '31A', tab: 'Contributions',
    table: 'compliance_contributions',
    title: 'Contribution', titlePlural: 'Contributions',
    sub: 'Schedule 31-A, contributions and other income',
    headers: CONT_HEADERS, ids: CONT_IDS, proc: processContributions,
    nameLabel: 'Contributor', dateId: 'date', totalLabel: 'Total contributed',
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
      { id: 'amount_debt_remaining', col: 'amount_debt_remaining_cents', label: 'Amount of debt remaining', type: 'money' },
    ],
  },
  expense: {
    key: 'EXPS', code: '31B', tab: 'Expense',
    table: 'compliance_expenditures',
    title: 'Expense', titlePlural: 'Expenses',
    sub: 'Schedule 31-B, expenditures',
    headers: EXPS_HEADERS, ids: EXPS_IDS, proc: processExpenses,
    nameLabel: 'Payee', dateId: 'date', totalLabel: 'Total spent',
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
      { id: 'support_oppose', col: 'support_oppose', label: 'Support / oppose', type: 'select', options: [{ v: '', l: 'Not applicable' }, { v: '1', l: 'Support (1)' }, { v: '2', l: 'Oppose (2)' }] },
      { id: 'office', col: 'office', label: 'Office (31U)', type: 'text' },
      { id: 'party_fund', col: 'party_fund', label: 'Political party fund (31M)', type: 'text' },
    ],
  },
  loan: {
    key: 'LOAN', code: '31N/31C', tab: 'Loan',
    table: 'compliance_loans',
    title: 'Loan', titlePlural: 'Loans',
    sub: 'Schedule 31-N (debt) and 31-C (loan)',
    headers: LOAN_HEADERS, ids: LOAN_IDS, proc: processLoans,
    nameLabel: 'Creditor', dateId: 'date_incurred', totalLabel: 'Outstanding',
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
      { id: 'schedule_code', col: 'schedule_code', label: 'Schedule', type: 'select', required: true, options: [{ v: '31N', l: '31N, debt' }, { v: '31C', l: '31C, loan' }] },
      { id: 'date_incurred', col: 'date_incurred', label: 'Date originally incurred', type: 'date', required: true },
      { id: 'purpose', col: 'purpose', label: 'Purpose', type: 'text', wide: true },
      { id: 'prior_amount', col: 'prior_amount_cents', label: 'Prior amount', type: 'money' },
      { id: 'amount_incurred', col: 'amount_incurred_cents', label: 'Amount incurred', type: 'money' },
      { id: 'outstanding_balance', col: 'outstanding_balance_cents', label: 'Outstanding balance', type: 'money' },
      { id: 'forgiven', col: 'forgiven', label: 'Forgiven', type: 'bool' },
      { id: 'payment_date', col: 'payment_date', label: 'Payment date', type: 'date' },
      { id: 'payment_amount', col: 'payment_amount_cents', label: 'Payment amount', type: 'money' },
    ],
  },
};

// byId lookup plus the exact column list read back from the database.
for (const s of Object.values(SCHEDULES)) {
  s.byId = {};
  s.cols = ['id'];
  s.fields.forEach((f) => { s.byId[f.id] = f; s.cols.push(f.col); });
  s.cols.push('created_at');
  s.colSelect = s.cols.join(', ');
  s.dateCol = s.byId[s.dateId].col;
}

export const SCHEDULE_TABS = [
  { key: 'contribution', label: 'Contributions', code: '31-A' },
  { key: 'expense', label: 'Expenses', code: '31-B' },
  { key: 'loan', label: 'Loans and debts', code: '31-N / 31-C' },
];

// ---- Running the rules over database rows ---------------------------------
// Build a synthetic sheet (header row plus one row per record in template
// column order) and hand it to the same processor the workbook path used, so
// the ledger and a filed workbook are graded by identical code.
function buildInputRows(sched, records) {
  const rows = [sched.headers.slice()];
  for (const rec of records) {
    rows.push(sched.ids.map((id) => {
      const fd = sched.byId[id];
      if (!fd) return null;                      // item_number and the fixed schedule code
      const v = rec[fd.col];
      if (v === undefined || v === null) return null;
      if (fd.type === 'money') return v / 100;    // cents back to dollars
      if (fd.type === 'bool') return v ? '1' : '';
      return v;
    }));
  }
  return rows;
}

export function runSchedule(schedKey, records, cfg) {
  const sched = SCHEDULES[schedKey];
  const results = sched.proc(buildInputRows(sched, records), cfg);
  const blocking = [];
  const warned = [];
  let total = 0;
  for (const r of results) {
    // rownum counts the header row, so record index is rownum minus two.
    r.index = r.row - 2;
    r.record = records[r.index] || null;
    total += r.amount;
    if (r.errors.length) blocking.push(r);
    if (r.warnings.length) warned.push(r);
  }
  return {
    schedule: sched.key,
    code: sched.code,
    rows: results,
    blocking,
    warned,
    total,
    filename: (cfg.entity || 'ENTITY') + '_' + sched.key + '_' + (cfg.report || 'REPORT') + '.csv',
  };
}

// ---- CSV writer (quote only when needed, no header, CRLF) -----------------
function csvField(v) {
  const s = (v === null || v === undefined) ? '' : String(v);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function toCsv(rows) {
  return rows.map((r) => r.cells.map(csvField).join(',')).join('\r\n') + '\r\n';
}

// ---- Pasted CSV in --------------------------------------------------------
export function parseCsv(text) {
  const s = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i += 1; continue;
      }
      field += c; i += 1; continue;
    }
    if (c === '"') { quoted = true; i += 1; continue; }
    if (c === ',') { row.push(field); field = ''; i += 1; continue; }
    if (c === '\r') { i += 1; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i += 1; continue; }
    field += c; i += 1;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

const headerKey = (v) => collapse(v).toUpperCase().replace(/[^A-Z0-9]/g, '');

export function looksLikeHeader(sched, row) {
  const heads = new Set(sched.headers.map(headerKey));
  let hits = 0;
  for (const c of row) {
    const k = headerKey(c);
    if (k && heads.has(k)) hits += 1;
  }
  return hits >= 3;
}

// Map one template-ordered row to a database payload.
export function importRowToPayload(sched, row) {
  const payload = {};
  sched.ids.forEach((id, i) => {
    const fd = sched.byId[id];
    if (!fd) return;
    const raw = (row && i < row.length) ? row[i] : null;
    if (fd.type === 'money') {
      const a = parseAmount(raw);
      payload[fd.col] = (a.error || a.cents == null) ? (fd.required ? 0 : null) : Math.max(0, a.cents);
    } else if (fd.type === 'date') {
      const d = toDateUTC(raw);
      payload[fd.col] = d ? fmtISO(d) : null;
    } else if (fd.type === 'bool') {
      const s = collapse(raw).toLowerCase();
      payload[fd.col] = (s === '1' || s === 'y' || s === 'yes' || s === 'true');
    } else {
      let t = collapse(raw);
      if (fd.id === 'schedule_code') t = t.toUpperCase() || '31N';
      payload[fd.col] = t || (fd.id === 'schedule_code' ? '31N' : null);
    }
  });
  return payload;
}

// ---- Display helpers ------------------------------------------------------
export function entryName(rec) {
  if (!rec) return '(unnamed)';
  const person = ((rec.first_name || '') + ' ' + (rec.last_name || '')).trim();
  return rec.non_individual || person || '(unnamed)';
}

export function usd(cents) {
  if (cents == null) return '';
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

export function ledgerDate(iso) {
  if (!iso) return 'No date';
  const d = new Date(iso + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
