/* ActBlue CSV export headers exactly as they are live (2026-09-08), plus tiny
 * builders that turn objects keyed by header name into CSV text, so a fixture
 * row can never drift out of column alignment (the paid export has 101
 * columns, seven of them named "Reserved").
 *
 * Every value in this file is fake: no real donors, emails or ids. */

export const PAID_HEADER_LINE = 'Receipt ID,Date,Amount,Recurring Total Months,Recurrence Number,Recipient,Fundraising Page,Fundraising Partner,Reference Code 2,Reference Code,Donor First Name,Donor Last Name,Donor Addr1,Donor Addr2,Donor City,Donor State,Donor ZIP,Donor Country,Donor Occupation,Donor Employer,Donor Email,Donor Phone,New Express Signup,Comments,Check Number,Check Date,Employer Addr1,Employer Addr2,Employer City,Employer State,Employer ZIP,Employer Country,Donor ID,Fundraiser ID,Fundraiser Recipient ID,Fundraiser Contact Email,Fundraiser Contact First Name,Fundraiser Contact Last Name,Partner ID,Partner Contact Email,Partner Contact First Name,Partner Contact Last Name,Reserved,Lineitem ID,AB Test Name,AB Variation,Recipient Committee,Recipient ID,Recipient Gov ID,Recipient Election,Reserved,Payment ID,Payment Date,Disbursement ID,Disbursement Date,Recovery ID,Recovery Date,Refund ID,Refund Date,Fee,Recur Weekly,ActBlue Express Lane,Reserved,Card Type,Reserved,Reserved,Reserved,Reserved,Mobile,Recurring Upsell Shown,Recurring Upsell Succeeded,Double Down,Smart Recurring,Monthly Recurring Amount,Apple Pay,Card Replaced by Account Updater,ActBlue Express Donor,Custom Field 1 Label,Custom Field 1 Value,Donor US Passport Number,Text Message Opt In,Gift Identifier,Gift Declined,Shipping Addr1,Shipping City,Shipping State,Shipping Zip,Shipping Country,Weekly Recurring Amount,Smart Boost Amount,Smart Boost Shown,Bump Recurring Seen,Bump Recurring Succeeded,Weekly to Monthly Rollover Date,Weekly Recurring Sunset,Recurring Type,Recurring Pledged,Paypal,Kind,Managed Entity Name,Managed Entity Committee Name';
export const PAID_HEADER = PAID_HEADER_LINE.split(',');

export const CANCELLED_HEADER_LINE = 'Receipt ID,Recurrence Amount,Total Amount,Initial Pledge Length,Recurrence Frequency,Initial Contribution Date,Cancelled On,Express Donor,Donor First Name,Donor Last Name,Donor Address,Donor City,Donor State,Donor ZIP,Donor Country,Donor Occupation,Donor Employer,Donor Email,Donor Phone,Reference Code,Bump Recurring Seen,Bump Recurring Succeeded,Contribution Form,Credit Card Expiration,Recurring Period,Recurring Duration,AB Test Name,Weekly Recurring Sunset,Is Paypal,Is Mobile,AB Test Variation,With Express Lane,Express Sign Up,Text Message Option,Gift Declined,Gift Identifier,Smart Boost Amount,Recur Completed,Cancelation Reason,Is Eligible For Express Lane,Sequence,FEC Id,Committee Name,Recurring Amount,Form Name,Form Kind,Managed Entitity Name,Managed Entity Committee Name,Owner Email';
export const CANCELLED_HEADER = CANCELLED_HEADER_LINE.split(',');

/* RFC-4180 quoting: wrap when the value holds a comma, quote or newline. */
export function csvField(v) {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvLine(header, values) {
  return header.map((h) => csvField(values[h])).join(',');
}

/* CRLF by default, which is what ActBlue ships. */
export function buildCsv(header, rows, { eol = '\r\n' } = {}) {
  return [header.join(','), ...rows.map((r) => csvLine(header, r))].join(eol) + eol;
}

/* A one-time $25 website gift from a fake donor. Override what a test needs;
 * unlisted columns (all the Reserved ones, shipping, partner, ...) stay blank. */
export const PAID_DEFAULTS = Object.freeze({
  'Receipt ID': 'AB300000201',
  'Date': '2026-05-09 17:33:08',
  'Amount': '25.00',
  'Recurring Total Months': '',
  'Recurrence Number': '1',
  'Recipient': 'Ohio Pride PAC',
  'Fundraising Page': 'ohio-pride-pac',
  'Fundraising Partner': '',
  'Reference Code 2': '',
  'Reference Code': 'website_donate_25',
  'Donor First Name': 'Test',
  'Donor Last Name': 'Person',
  'Donor Addr1': '123 Test St',
  'Donor Addr2': '',
  'Donor City': 'Cincinnati',
  'Donor State': 'OH',
  'Donor ZIP': '45202',
  'Donor Country': 'United States',
  'Donor Occupation': 'Tester',
  'Donor Employer': 'Example Co',
  'Donor Email': 'test1@example.com',
  'Donor Phone': '5135550100',
  'New Express Signup': 'f',
  'Comments': '',
  'Donor ID': '900001',
  'Lineitem ID': '700000201',
  'Recipient Committee': 'Ohio Pride PAC',
  'Recipient ID': '1',
  'Payment ID': '650000001',
  'Payment Date': '2026-05-09 17:33:08',
  'Refund ID': '',
  'Refund Date': '',
  'Fee': '0.38',
  'Recur Weekly': '',
  'ActBlue Express Lane': 'f',
  'Card Type': 'visa',
  'Mobile': 't',
  'Apple Pay': 't',
  'ActBlue Express Donor': 'f',
  'Custom Field 1 Label': '',
  'Custom Field 1 Value': '',
  'Text Message Opt In': 'unknown',
  'Recurring Type': '',
  'Recurring Pledged': '1',
  'Paypal': 'f',
  'Kind': 'page',
  'Managed Entity Name': '',
  'Managed Entity Committee Name': '',
});

/* What a live monthly ("forever") series row carries on top of the defaults. */
export const MONTHLY_FIELDS = Object.freeze({
  'Recurring Total Months': 'unlimited',
  'Recurring Type': 'forever',
  'Recurring Pledged': 'forever',
});

export function paidRow(overrides = {}) {
  return { ...PAID_DEFAULTS, ...overrides };
}

/* A cancelled monthly Stonewall series from the same fake donor. */
export const CANCELLED_DEFAULTS = Object.freeze({
  'Receipt ID': 'AB300000101',
  'Recurrence Amount': '19.69',
  'Total Amount': '39.38',
  'Initial Pledge Length': 'unlimited',
  'Recurrence Frequency': 'monthly',
  'Initial Contribution Date': '2026-04-16 12:10:46',
  'Cancelled On': '2026-06-01 10:00:00',
  'Express Donor': 'f',
  'Donor First Name': 'Test',
  'Donor Last Name': 'Person',
  'Donor Address': '123 Test St',
  'Donor City': 'Cincinnati',
  'Donor State': 'OH',
  'Donor ZIP': '45202',
  'Donor Country': 'United States',
  'Donor Occupation': 'Tester',
  'Donor Employer': 'Example Co',
  'Donor Email': 'test1@example.com',
  'Donor Phone': '5135550100',
  'Reference Code': 'website_founding_stonewall',
  'Contribution Form': 'ohio-pride-pac',
  'Recurring Period': 'monthly',
  'Recurring Duration': 'forever',
  'Text Message Option': 'unknown',
  'Recur Completed': '2',
  'Cancelation Reason': 'donor_request',
  'Sequence': '2',
  'Committee Name': 'Ohio Pride PAC',
  'Recurring Amount': '19.69',
  'Form Name': 'ohio-pride-pac',
  'Form Kind': 'page',
});

export function cancelledRow(overrides = {}) {
  return { ...CANCELLED_DEFAULTS, ...overrides };
}
