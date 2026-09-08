/* Unit tests for lib/actblue.mjs (+ the CSV parser it rides on).
 *
 * Run:  node --test "tests/*.test.mjs"        (or plain `node --test`)
 *
 * No network, no real Supabase: the CSV API is driven through a scripted
 * fetchImpl and reconciliation runs against tests/fixtures/fake-supabase.mjs,
 * which emulates the unique keys and the two triggers that shape what the
 * sync reads back. Every donor here is fake. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  norm, normEmail, isEmail, truthy, dollarsToCents, parseActBlueDate,
  basicAuthHeader, ActBlueApiError, fetchActBlueCsv, ACTBLUE_API_BASE, MAX_RANGE_DAYS,
  CONTRIBUTION_COLUMNS, buildHeaderIndex, parseContributionCsv,
  detectRecurrence, isFoundingRefcode, DEFAULT_FOUNDING_MATCH,
  mapContribution, mapCancellation, mapContributionCsv, mapCancellationCsv,
  reconcileContributions, applyRefunds, applyCancellations,
} from '../lib/actblue.mjs';
import { parseCsv, parseCsvObjects } from '../lib/csv.mjs';
import {
  PAID_HEADER, PAID_HEADER_LINE, CANCELLED_HEADER, CANCELLED_HEADER_LINE,
  buildCsv, csvField, paidRow, cancelledRow, MONTHLY_FIELDS,
} from './fixtures/actblue-headers.mjs';
import { createFakeSupabase } from './fixtures/fake-supabase.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(path.join(here, 'fixtures', name), 'utf8');

/* =============================================================================
 * csv.mjs
 * ========================================================================== */

describe('parseCsv', () => {
  test('CRLF, quoted commas, doubled quotes, embedded newline', () => {
    const text = 'a,b,c\r\n1,"x, y","say ""hi"""\r\n2,"line1\nline2",\r\n';
    assert.deepEqual(parseCsv(text), [
      ['a', 'b', 'c'],
      ['1', 'x, y', 'say "hi"'],
      ['2', 'line1\nline2', ''],
    ]);
  });

  test('LF only, no trailing newline, blank lines skipped', () => {
    assert.deepEqual(parseCsv('a,b\n\n1,2\n\n3,4'), [['a', 'b'], ['1', '2'], ['3', '4']]);
  });

  test('empty text -> no rows', () => {
    assert.deepEqual(parseCsv(''), []);
  });

  test('parseCsvObjects keys rows by header and pads short rows', () => {
    assert.deepEqual(parseCsvObjects('a,b,c\n1,2\n'), [{ a: '1', b: '2', c: '' }]);
    assert.deepEqual(parseCsvObjects('a,b\n'), []);
  });
});

/* =============================================================================
 * Small helpers
 * ========================================================================== */

describe('helpers', () => {
  test('norm / normEmail / isEmail / truthy', () => {
    assert.equal(norm('  x '), 'x');
    assert.equal(norm(null), '');
    assert.equal(norm(undefined), '');
    assert.equal(norm(42), '42');
    assert.equal(normEmail('  Test1@Example.COM '), 'test1@example.com');
    assert.equal(isEmail('test1@example.com'), true);
    assert.equal(isEmail('nope'), false);
    assert.equal(isEmail('a@b'), false);
    assert.equal(isEmail(''), false);
    for (const v of ['t', 'true', 'YES', 'y', '1', 'on', ' T ']) assert.equal(truthy(v), true, v);
    for (const v of ['f', 'false', 'no', '0', '', 'unknown', null, undefined]) assert.equal(truthy(v), false, String(v));
  });

  test('basicAuthHeader is base64 of uuid:secret', () => {
    assert.equal(basicAuthHeader('uuid-1', 'secret-1'), 'Basic ' + Buffer.from('uuid-1:secret-1').toString('base64'));
    assert.equal(basicAuthHeader('uuid-1', 'secret-1'), 'Basic dXVpZC0xOnNlY3JldC0x');
  });

  test('ActBlueApiError carries status, body and stage', () => {
    const e = new ActBlueApiError('boom', { status: 401, body: 'x', stage: 'request' });
    assert.ok(e instanceof Error);
    assert.equal(e.name, 'ActBlueApiError');
    assert.equal(e.message, 'boom');
    assert.equal(e.status, 401);
    assert.equal(e.body, 'x');
    assert.equal(e.stage, 'request');
  });
});

/* =============================================================================
 * 1. parseActBlueDate
 * ========================================================================== */

describe('parseActBlueDate', () => {
  test('EDT wall clock (UTC-4)', () => {
    assert.equal(parseActBlueDate('2026-05-11 12:15:54'), '2026-05-11T16:15:54.000Z');
  });

  test('EST wall clock (UTC-5)', () => {
    assert.equal(parseActBlueDate('2026-01-15 09:00:00'), '2026-01-15T14:00:00.000Z');
  });

  test('bare date is midnight Eastern', () => {
    assert.equal(parseActBlueDate('2026-05-11'), '2026-05-11T04:00:00.000Z');
    assert.equal(parseActBlueDate('2026-01-15'), '2026-01-15T05:00:00.000Z');
  });

  test('T separator and missing seconds are accepted as wall clock', () => {
    assert.equal(parseActBlueDate('2026-05-11T12:15'), '2026-05-11T16:15:00.000Z');
    assert.equal(parseActBlueDate('2026-05-11 12:15'), '2026-05-11T16:15:00.000Z');
  });

  test('surrounding whitespace is ignored', () => {
    assert.equal(parseActBlueDate('  2026-05-11 12:15:54 '), '2026-05-11T16:15:54.000Z');
  });

  test('ISO strings with Z or an offset pass through as the same instant', () => {
    assert.equal(parseActBlueDate('2026-05-11T16:15:54Z'), '2026-05-11T16:15:54.000Z');
    assert.equal(parseActBlueDate('2026-05-11T12:15:54-04:00'), '2026-05-11T16:15:54.000Z');
    assert.equal(parseActBlueDate('2026-05-11T12:15:54.250+00:00'), '2026-05-11T12:15:54.250Z');
    assert.equal(parseActBlueDate('2026-05-11T16:15:54.000Z'), '2026-05-11T16:15:54.000Z');
  });

  test('garbage -> null', () => {
    for (const v of ['not a date', 'abc', '', '   ', null, undefined, 'yesterday', '11/05/2026 nope']) {
      assert.equal(parseActBlueDate(v), null, String(v));
    }
  });

  test('out-of-range components are rejected, not rolled over', () => {
    assert.equal(parseActBlueDate('2026-02-30 12:00:00'), null);
    assert.equal(parseActBlueDate('2026-13-45 99:99:99'), null);
  });

  test('DST spring forward 2026-03-08: 03:30 is after the jump (EDT)', () => {
    assert.equal(parseActBlueDate('2026-03-08 03:30:00'), '2026-03-08T07:30:00.000Z');
    // just before the jump is still EST
    assert.equal(parseActBlueDate('2026-03-08 01:59:59'), '2026-03-08T06:59:59.000Z');
    // the skipped hour does not throw and lands on the same calendar day
    const skipped = parseActBlueDate('2026-03-08 02:30:00');
    assert.match(skipped, /^2026-03-08T0[67]:30:00\.000Z$/);
  });

  test('DST fall back 2026-11-01: 01:30 is ambiguous, yields one of the two valid instants', () => {
    let out;
    assert.doesNotThrow(() => { out = parseActBlueDate('2026-11-01 01:30:00'); });
    assert.ok(['2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z'].includes(out), out);
    // either side of the ambiguous hour is unambiguous
    assert.equal(parseActBlueDate('2026-11-01 00:30:00'), '2026-11-01T04:30:00.000Z');
    assert.equal(parseActBlueDate('2026-11-01 02:30:00'), '2026-11-01T07:30:00.000Z');
  });

  test('custom timeZone', () => {
    assert.equal(parseActBlueDate('2026-05-11 12:15:54', 'UTC'), '2026-05-11T12:15:54.000Z');
    assert.equal(parseActBlueDate('2026-05-11 12:15:54', 'America/Los_Angeles'), '2026-05-11T19:15:54.000Z');
  });
});

/* =============================================================================
 * 2. dollarsToCents
 * ========================================================================== */

describe('dollarsToCents', () => {
  test('table', () => {
    const cases = [
      ['25.00', 2500], ['$1,969.00', 196900], ['19.69', 1969], ['', null], ['abc', null], ['-5', -500],
      ['0.38', 38], ['100', 10000], [' 25.00 ', 2500], ['$0.00', 0], ['.', null], ['-', null],
      [null, null], [undefined, null], [25, 2500], [19.69, 1969],
    ];
    for (const [input, expected] of cases) assert.equal(dollarsToCents(input), expected, JSON.stringify(input));
  });
});

/* =============================================================================
 * 3. detectRecurrence
 * ========================================================================== */

describe('detectRecurrence', () => {
  const oneTimeLive = { recurring_total_months: '', recurrence_number: '1', recurring_type: '', recurring_pledged: '1', recur_weekly: '' };
  const foreverLive = { recurring_total_months: 'unlimited', recurrence_number: '1', recurring_type: 'forever', recurring_pledged: 'forever', recur_weekly: '' };

  test('live one-time row (Recurring Pledged "1", Recurrence Number "1", rest blank) -> one_time', () => {
    assert.equal(detectRecurrence(oneTimeLive), 'one_time');
    assert.equal(detectRecurrence({ ...oneTimeLive, recur_weekly: 'f' }), 'one_time');
  });

  test('live monthly rows -> monthly', () => {
    assert.equal(detectRecurrence(foreverLive), 'monthly');
    assert.equal(detectRecurrence({ ...foreverLive, recurring_type: 'monthly_adjustable' }), 'monthly');
    assert.equal(detectRecurrence({ ...foreverLive, recurrence_number: '7' }), 'monthly');
  });

  test('each monthly signal on its own is enough', () => {
    assert.equal(detectRecurrence({ recurring_total_months: 'unlimited' }), 'monthly');
    assert.equal(detectRecurrence({ recurring_total_months: '12' }), 'monthly');
    assert.equal(detectRecurrence({ recurring_type: 'forever' }), 'monthly');
    assert.equal(detectRecurrence({ recurring_type: 'monthly_adjustable' }), 'monthly');
    assert.equal(detectRecurrence({ recurring_pledged: 'forever' }), 'monthly');
    assert.equal(detectRecurrence({ recurring_pledged: '12' }), 'monthly');
    assert.equal(detectRecurrence({ recurring_period: 'monthly' }), 'monthly');
    assert.equal(detectRecurrence({ recurrence_number: '2' }), 'monthly');
  });

  test('negative spellings are not monthly', () => {
    assert.equal(detectRecurrence({}), 'one_time');
    assert.equal(detectRecurrence({ recurrence_number: '1' }), 'one_time');
    assert.equal(detectRecurrence({ recurrence_number: '0' }), 'one_time');
    assert.equal(detectRecurrence({ recurring_total_months: '0', recurring_type: 'none', recurring_pledged: '0', recurring_period: 'one-time' }), 'one_time');
    assert.equal(detectRecurrence({ recurring_type: 'one_time' }), 'one_time');
    assert.equal(detectRecurrence({ recurring_period: 'n/a' }), 'one_time');
    assert.equal(detectRecurrence({ recurring_pledged: 'no' }), 'one_time');
  });

  test('Recur Weekly "t" wins -> weekly', () => {
    assert.equal(detectRecurrence({ ...oneTimeLive, recur_weekly: 't' }), 'weekly');
    assert.equal(detectRecurrence({ ...foreverLive, recur_weekly: 'true' }), 'weekly');
  });
});

/* =============================================================================
 * 4. isFoundingRefcode
 * ========================================================================== */

describe('isFoundingRefcode', () => {
  test('default needle', () => {
    assert.equal(DEFAULT_FOUNDING_MATCH, 'founding');
    assert.equal(isFoundingRefcode('website_founding_member'), true);
    assert.equal(isFoundingRefcode('website_founding_stonewall'), true);
    assert.equal(isFoundingRefcode('WEBSITE_FOUNDING_MEMBER'), true);
    assert.equal(isFoundingRefcode('website_donate_25'), false);
    assert.equal(isFoundingRefcode('ab_qr_code'), false);
    assert.equal(isFoundingRefcode(''), false);
    assert.equal(isFoundingRefcode('   '), false);
    assert.equal(isFoundingRefcode(null), false);
    assert.equal(isFoundingRefcode(undefined), false);
  });

  test('custom needle', () => {
    assert.equal(isFoundingRefcode('website_founding_stonewall', 'stonewall'), true);
    assert.equal(isFoundingRefcode('website_founding_member', 'stonewall'), false);
    assert.equal(isFoundingRefcode('website_founding_member', 'FOUNDING_MEMBER'), true);
    assert.equal(isFoundingRefcode('website_founding_member', ''), false);
    assert.equal(isFoundingRefcode('', 'stonewall'), false);
  });
});

/* =============================================================================
 * 5. buildHeaderIndex / parseContributionCsv on the live headers
 * ========================================================================== */

describe('buildHeaderIndex on the live paid_contributions header', () => {
  test('fixture header is the live 101-column header with seven Reserved columns', () => {
    assert.equal(PAID_HEADER.length, 101);
    assert.equal(PAID_HEADER.filter((h) => h === 'Reserved').length, 7);
    assert.equal(PAID_HEADER.join(','), PAID_HEADER_LINE);
    assert.equal(CANCELLED_HEADER.length, 49);
    assert.equal(CANCELLED_HEADER.join(','), CANCELLED_HEADER_LINE);
  });

  test('every alias resolves to the right column', () => {
    const idx = buildHeaderIndex(PAID_HEADER);
    const at = (name) => PAID_HEADER.indexOf(name);
    const expected = {
      receipt_id: at('Receipt ID'), lineitem_id: at('Lineitem ID'), date: at('Date'), amount: at('Amount'), fee: at('Fee'),
      recurring_total_months: at('Recurring Total Months'), recurrence_number: at('Recurrence Number'),
      recurring_type: at('Recurring Type'), recurring_pledged: at('Recurring Pledged'), recur_weekly: at('Recur Weekly'),
      refcode: at('Reference Code'), refcode2: at('Reference Code 2'), kind: at('Kind'),
      first_name: at('Donor First Name'), last_name: at('Donor Last Name'), email: at('Donor Email'), phone: at('Donor Phone'),
      address1: at('Donor Addr1'), address2: at('Donor Addr2'), city: at('Donor City'), state: at('Donor State'),
      zip: at('Donor ZIP'), country: at('Donor Country'), employer: at('Donor Employer'), occupation: at('Donor Occupation'),
      donor_id: at('Donor ID'), refund_id: at('Refund ID'), refund_date: at('Refund Date'), text_opt_in: at('Text Message Opt In'),
      custom_label: at('Custom Field 1 Label'), custom_value: at('Custom Field 1 Value'),
    };
    assert.deepEqual(idx, expected);
    // the two Reference Code columns must not be confused
    assert.equal(idx.refcode, 9);
    assert.equal(idx.refcode2, 8);
    assert.equal(idx.address1, 12);
    assert.equal(idx.lineitem_id, 43);
    assert.equal(idx.donor_id, 32);
    // nothing lands on a Reserved / Employer / Shipping / Payment column
    for (const [field, i] of Object.entries(idx)) {
      assert.notEqual(PAID_HEADER[i], 'Reserved', field);
      assert.doesNotMatch(PAID_HEADER[i], /^(Employer|Shipping|Payment|Fundraiser|Partner) /, field);
    }
    // cancellation-only fields are absent
    for (const f of ['cancelled_on', 'recurrence_amount', 'initial_contribution_date', 'cancelation_reason', 'recurring_period']) {
      assert.equal(Object.hasOwn(idx, f), false, f);
    }
    // amount is "Amount", not "Monthly Recurring Amount" / "Smart Boost Amount" / "Weekly Recurring Amount"
    assert.equal(PAID_HEADER[idx.amount], 'Amount');
    assert.equal(PAID_HEADER[idx.date], 'Date');
  });

  test('cancelled_recurring_contributions header resolves the cancellation fields', () => {
    const idx = buildHeaderIndex(CANCELLED_HEADER);
    const at = (name) => CANCELLED_HEADER.indexOf(name);
    assert.equal(idx.receipt_id, at('Receipt ID'));
    assert.equal(idx.email, at('Donor Email'));
    assert.equal(idx.cancelled_on, at('Cancelled On'));
    assert.equal(idx.recurrence_amount, at('Recurrence Amount'));       // not "Recurring Amount" (col 43)
    assert.equal(idx.initial_contribution_date, at('Initial Contribution Date'));
    assert.equal(idx.cancelation_reason, at('Cancelation Reason'));
    assert.equal(idx.refcode, at('Reference Code'));
    assert.equal(idx.address1, at('Donor Address'));
    assert.equal(idx.text_opt_in, at('Text Message Option'));
    assert.equal(idx.recurring_period, at('Recurring Period'));
    assert.equal(idx.amount, at('Total Amount'));
    assert.equal(Object.hasOwn(idx, 'lineitem_id'), false);
    assert.equal(Object.hasOwn(idx, 'date'), false);
  });

  test('matching ignores case and punctuation, and alias order is honoured', () => {
    const idx = buildHeaderIndex(['DONOR_EMAIL', ' Lineitem-ID ', 'Receipt #', 'receipt id', 'Zip Code', 'Contribution Amount']);
    assert.equal(idx.email, 0);
    assert.equal(idx.lineitem_id, 1);
    assert.equal(idx.receipt_id, 3);       // first alias "receipt id" wins over "receipt"
    assert.equal(idx.zip, 4);
    assert.equal(idx.amount, 5);
    assert.deepEqual(buildHeaderIndex([]), {});
    // a custom column table is honoured
    assert.deepEqual(buildHeaderIndex(['Foo', 'Bar'], { bar: ['bar'], baz: ['baz'] }), { bar: 1 });
  });
});

describe('parseContributionCsv', () => {
  test('CRLF text with quoted commas and doubled quotes keeps every column aligned', () => {
    const text = buildCsv(PAID_HEADER, [paidRow({
      'Donor Addr1': '123 Main St, Apt 4',
      'Donor Employer': 'Smith, Jones "&" Co',
      'Comments': 'Thanks, "Ohio Pride"!',
      'Donor Email': ' Test1@Example.com ',
    })]);
    assert.ok(text.includes('\r\n'));
    assert.ok(text.includes('"123 Main St, Apt 4"'));
    assert.ok(text.includes('"Smith, Jones ""&"" Co"'));
    const { headers, index, records } = parseContributionCsv(text);
    assert.equal(headers.length, 101);
    assert.equal(index.refcode, 9);
    assert.equal(records.length, 1);
    const r = records[0];
    assert.equal(r.address1, '123 Main St, Apt 4');
    assert.equal(r.employer, 'Smith, Jones "&" Co');
    assert.equal(r.email, 'Test1@Example.com');       // trimmed, not lowercased (that is mapContribution's job)
    assert.equal(r.phone, '5135550100');
    assert.equal(r.lineitem_id, '700000201');
    assert.equal(r.receipt_id, 'AB300000201');
    assert.equal(r.refcode, 'website_donate_25');
    assert.equal(r.refcode2, '');
    assert.equal(r.kind, 'page');
    assert.equal(r.text_opt_in, 'unknown');
    assert.equal(r.fee, '0.38');
    assert.equal(r.recurring_pledged, '1');
    // every indexed field is present as a string
    for (const f of Object.keys(index)) assert.equal(typeof r[f], 'string', f);
  });

  test('LF line endings and short rows work too', () => {
    const lf = buildCsv(PAID_HEADER, [paidRow()], { eol: '\n' });
    assert.ok(!lf.includes('\r'));
    const { records } = parseContributionCsv(lf);
    assert.equal(records[0].email, 'test1@example.com');
    // a row shorter than the header yields '' for the missing columns
    const short = PAID_HEADER.join(',') + '\nAB1,2026-05-11 12:15:54,25.00\n';
    const r = parseContributionCsv(short).records[0];
    assert.equal(r.receipt_id, 'AB1');
    assert.equal(r.amount, '25.00');
    assert.equal(r.email, '');
    assert.equal(r.lineitem_id, '');
  });

  test('empty / header-only input', () => {
    assert.deepEqual(parseContributionCsv(''), { headers: [], index: {}, records: [] });
    assert.deepEqual(parseContributionCsv(null), { headers: [], index: {}, records: [] });
    const headerOnly = parseContributionCsv(PAID_HEADER_LINE + '\r\n');
    assert.equal(headerOnly.headers.length, 101);
    assert.equal(headerOnly.records.length, 0);
  });

  test('csvField helper round-trips through the parser', () => {
    for (const v of ['plain', 'a,b', 'say "hi"', 'multi\nline', '', ' spaced ']) {
      assert.deepEqual(parseCsv(`${csvField(v)},x\n`), [[v, 'x']], JSON.stringify(v));
    }
  });
});

/* =============================================================================
 * 6. mapContribution
 * ========================================================================== */

const parseOne = (rowObj, header = PAID_HEADER) => parseContributionCsv(buildCsv(header, [rowObj])).records[0];

describe('mapContribution', () => {
  const foundingRowObj = paidRow({
    ...MONTHLY_FIELDS,
    'Receipt ID': 'AB300000101', 'Lineitem ID': '700000101',
    'Date': '2026-05-11 12:15:54', 'Amount': '25.00', 'Fee': '0.38', 'Recurrence Number': '1',
    'Reference Code': 'website_founding_member', 'Reference Code 2': 'share',
    'Donor First Name': ' Test ', 'Donor Last Name': 'Person', 'Donor Email': 'Test1@Example.COM',
    'Donor Addr1': '123 Test St', 'Donor Addr2': 'Unit 2', 'Donor City': 'Cincinnati', 'Donor State': 'oh',
    'Donor ZIP': '45202-1234', 'Donor Country': 'United States', 'Donor Phone': '513-555-0100',
    'Donor Employer': 'Example Co', 'Donor Occupation': 'Tester', 'Donor ID': '900001',
    'Kind': 'Page', 'Text Message Opt In': 'unknown', 'Custom Field 1 Label': 'Shirt', 'Custom Field 1 Value': 'L',
  });

  test('a full founding first-installment row maps every field', () => {
    const m = mapContribution(parseOne(foundingRowObj));
    assert.deepEqual(m, {
      ok: true,
      lineitem_id: '700000101',
      receipt_id: 'AB300000101',
      contributed_at: '2026-05-11T16:15:54.000Z',
      amount_cents: 2500,
      fee_cents: 38,
      recurrence: 'monthly',
      recurrence_number: 1,
      is_first_installment: true,
      refcode: 'website_founding_member',
      refcode2: 'share',
      kind: 'page',
      is_founding: true,
      first_name: 'Test',
      last_name: 'Person',
      full_name: 'Test Person',
      email: 'test1@example.com',
      phone: '513-555-0100',
      address1: '123 Test St',
      address2: 'Unit 2',
      city: 'Cincinnati',
      state: 'OH',
      zip: '45202',
      country: 'United States',
      employer: 'Example Co',
      occupation: 'Tester',
      actblue_donor_id: '900001',
      refund_id: null,
      refunded_at: null,
      sms_optin: null,
      custom_label: 'Shirt',
      custom_value: 'L',
    });
  });

  test('an installment (Recurrence Number 3) is monthly and not a first installment', () => {
    const m = mapContribution(parseOne(paidRow({ ...MONTHLY_FIELDS, 'Recurrence Number': '3', 'Reference Code': 'website_founding_stonewall', 'Amount': '19.69' })));
    assert.equal(m.ok, true);
    assert.equal(m.recurrence, 'monthly');
    assert.equal(m.recurrence_number, 3);
    assert.equal(m.is_first_installment, false);
    assert.equal(m.is_founding, true);
    assert.equal(m.amount_cents, 1969);
    // Recurrence Number alone (no other recurring column) still means monthly
    const bare = mapContribution({ receipt_id: 'AB1', amount: '5.00', date: '2026-05-11', recurrence_number: '2' });
    assert.equal(bare.recurrence, 'monthly');
    assert.equal(bare.is_first_installment, false);
  });

  test('a live one-time row is one_time and not founding', () => {
    const m = mapContribution(parseOne(paidRow()));
    assert.equal(m.recurrence, 'one_time');
    assert.equal(m.is_first_installment, true);
    assert.equal(m.is_founding, false);
    assert.equal(m.refcode, 'website_donate_25');
    assert.equal(m.refcode2, null);
    assert.equal(m.custom_label, null);
    assert.equal(m.address2, null);
  });

  test('a refund-export row carries refund_id and an Eastern refunded_at', () => {
    const m = mapContribution(parseOne(paidRow({ 'Refund ID': '509802082', 'Refund Date': '2026-05-15 00:00:00' })));
    assert.equal(m.refund_id, '509802082');
    assert.equal(m.refunded_at, '2026-05-15T04:00:00.000Z');
  });

  test('weekly plan, blank/odd optional fields, text opt-in', () => {
    const m = mapContribution(parseOne(paidRow({ 'Recur Weekly': 't', 'Reference Code': '', 'Kind': '', 'Donor Email': 'not-an-email', 'Donor State': 'ohio', 'Donor ZIP': 'ABC', 'Text Message Opt In': 't', 'Donor First Name': '', 'Donor Last Name': '' })));
    assert.equal(m.recurrence, 'weekly');
    assert.equal(m.refcode, null);
    assert.equal(m.is_founding, false);
    assert.equal(m.kind, null);
    assert.equal(m.email, null);          // invalid email is dropped, not kept
    assert.equal(m.state, 'OH');          // uppercased and cut to two letters
    assert.equal(m.zip, null);            // no digits -> null
    assert.equal(m.sms_optin, true);
    assert.equal(m.first_name, null);
    assert.equal(m.last_name, null);
    assert.equal(m.full_name, null);
  });

  test('foundingMatch option', () => {
    const rec = parseOne(paidRow({ 'Reference Code': 'website_founding_member' }));
    assert.equal(mapContribution(rec, { foundingMatch: 'stonewall' }).is_founding, false);
    assert.equal(mapContribution(rec, { foundingMatch: 'member' }).is_founding, true);
  });

  test('keyed on receipt alone or lineitem alone', () => {
    assert.equal(mapContribution({ receipt_id: 'AB1', amount: '1.00', date: '2026-05-11' }).lineitem_id, null);
    assert.equal(mapContribution({ lineitem_id: '123', amount: '1.00', date: '2026-05-11' }).receipt_id, null);
  });

  test('rows that cannot be keyed, have no money or a bad date are rejected', () => {
    assert.deepEqual(mapContribution(parseOne(paidRow({ 'Receipt ID': '', 'Lineitem ID': '' }))), { ok: false, reason: 'no_id' });
    assert.deepEqual(mapContribution(parseOne(paidRow({ 'Amount': '0.00' }))), { ok: false, reason: 'no_amount' });
    assert.deepEqual(mapContribution(parseOne(paidRow({ 'Amount': '' }))), { ok: false, reason: 'no_amount' });
    assert.deepEqual(mapContribution(parseOne(paidRow({ 'Amount': '-25.00' }))), { ok: false, reason: 'no_amount' });
    assert.deepEqual(mapContribution(parseOne(paidRow({ 'Date': 'yesterday' }))), { ok: false, reason: 'bad_date' });
    assert.deepEqual(mapContribution(parseOne(paidRow({ 'Date': '' }))), { ok: false, reason: 'bad_date' });
    // no_id wins over the other reasons
    assert.deepEqual(mapContribution({}), { ok: false, reason: 'no_id' });
  });
});

/* =============================================================================
 * 7. mapCancellation
 * ========================================================================== */

describe('mapCancellation', () => {
  test('maps the 49-column cancelled_recurring_contributions row', () => {
    const rec = parseOne(cancelledRow({ 'Donor Email': ' Test1@Example.com ' }), CANCELLED_HEADER);
    assert.deepEqual(mapCancellation(rec), {
      ok: true,
      receipt_id: 'AB300000101',
      email: 'test1@example.com',
      refcode: 'website_founding_stonewall',
      cancelled_at: '2026-06-01T14:00:00.000Z',
      recurrence_amount_cents: 1969,
      initial_contribution_at: '2026-04-16T16:10:46.000Z',
      reason: 'donor_request',
    });
  });

  test('receipt or email alone is enough; neither is rejected', () => {
    assert.equal(mapCancellation(parseOne(cancelledRow({ 'Donor Email': '' }), CANCELLED_HEADER)).ok, true);
    const byEmail = mapCancellation(parseOne(cancelledRow({ 'Receipt ID': '' }), CANCELLED_HEADER));
    assert.equal(byEmail.ok, true);
    assert.equal(byEmail.receipt_id, null);
    assert.deepEqual(mapCancellation(parseOne(cancelledRow({ 'Receipt ID': '', 'Donor Email': 'nope' }), CANCELLED_HEADER)), { ok: false, reason: 'no_id' });
  });

  test('blank optional fields map to null', () => {
    const m = mapCancellation(parseOne(cancelledRow({ 'Cancelled On': '', 'Recurrence Amount': '', 'Cancelation Reason': '', 'Reference Code': '', 'Initial Contribution Date': '' }), CANCELLED_HEADER));
    assert.equal(m.cancelled_at, null);
    assert.equal(m.recurrence_amount_cents, null);
    assert.equal(m.reason, null);
    assert.equal(m.refcode, null);
    assert.equal(m.initial_contribution_at, null);
  });
});

/* =============================================================================
 * 8. mapContributionCsv / mapCancellationCsv
 * ========================================================================== */

describe('mapContributionCsv / mapCancellationCsv', () => {
  test('the static 101-column sample (CRLF) maps 4 rows and tallies 3 skips', () => {
    const text = fixture('paid_contributions.sample.csv');
    assert.ok(text.includes('\r\n'));
    assert.equal(text.split('\r\n')[0], PAID_HEADER_LINE);
    const { rows, skipped, total } = mapContributionCsv(text);
    assert.equal(total, 7);
    assert.deepEqual(skipped, { no_id: 1, no_amount: 1, bad_date: 1 });
    assert.equal(rows.length, 4);
    const [founding, installment, oneTime, event] = rows;
    assert.equal(founding.is_founding, true);
    assert.equal(founding.is_first_installment, true);
    assert.equal(founding.address1, '123 Main St, Apt 4');
    assert.equal(founding.employer, 'Smith, Jones "&" Co');
    assert.equal(founding.zip, '45202');
    assert.equal(founding.state, 'OH');
    assert.equal(founding.email, 'test1@example.com');
    assert.equal(founding.contributed_at, '2026-04-16T16:10:46.000Z');
    assert.equal(installment.recurrence_number, 3);
    assert.equal(installment.is_first_installment, false);
    assert.equal(oneTime.is_founding, false);
    assert.equal(oneTime.recurrence, 'one_time');
    assert.equal(event.kind, 'event');
    assert.equal(event.refcode, null);
    assert.equal(event.amount_cents, 10000);
  });

  test('foundingMatch is passed through', () => {
    const text = buildCsv(PAID_HEADER, [paidRow({ 'Reference Code': 'website_founding_member' })]);
    assert.equal(mapContributionCsv(text).rows[0].is_founding, true);
    assert.equal(mapContributionCsv(text, { foundingMatch: 'stonewall' }).rows[0].is_founding, false);
  });

  test('empty input', () => {
    assert.deepEqual(mapContributionCsv(''), { rows: [], skipped: { no_id: 0, no_amount: 0, bad_date: 0 }, total: 0 });
    assert.deepEqual(mapCancellationCsv(''), { rows: [], skipped: 0, total: 0 });
  });

  test('cancellations: rows + skipped tally', () => {
    const text = buildCsv(CANCELLED_HEADER, [
      cancelledRow(),
      cancelledRow({ 'Receipt ID': 'AB111111111', 'Donor Email': 'test2@example.com', 'Cancelled On': '2026-07-04 09:15:00' }),
      cancelledRow({ 'Receipt ID': '', 'Donor Email': '' }),
    ]);
    const { rows, skipped, total } = mapCancellationCsv(text);
    assert.equal(total, 3);
    assert.equal(skipped, 1);
    assert.equal(rows.length, 2);
    assert.equal(rows[1].receipt_id, 'AB111111111');
    assert.equal(rows[1].cancelled_at, '2026-07-04T13:15:00.000Z');
  });
});

/* =============================================================================
 * 9. fetchActBlueCsv with a scripted fetchImpl
 * ========================================================================== */

const jsonRes = (status, body) => ({ ok: status >= 200 && status < 300, status, async text() { return JSON.stringify(body); } });
const textRes = (status, body) => ({ ok: status >= 200 && status < 300, status, async text() { return body; } });

function scriptedFetch(handler) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init: init ?? null });
    return handler(url, init, calls.length);
  };
  impl.calls = calls;
  return impl;
}

const CSVS_URL = `${ACTBLUE_API_BASE}/csvs`;
const DOWNLOAD_URL = 'https://s3.example.com/actblue/export.csv?sig=abc';
const CSV_TEXT = buildCsv(PAID_HEADER, [paidRow()]);

const baseOpts = () => ({
  clientUuid: 'uuid-1', clientSecret: 'secret-1', csvType: 'paid_contributions',
  start: '2026-05-01T00:00:00Z', end: '2026-05-31T00:00:00Z',
  pollMs: 1, deadlineMs: Date.now() + 10_000,
});

describe('fetchActBlueCsv', () => {
  test('POST body, Basic auth, polling until download_url, returned CSV', async () => {
    let polls = 0;
    const events = [];
    const fetchImpl = scriptedFetch((url, init) => {
      if (url === CSVS_URL && init?.method === 'POST') return jsonRes(202, { id: 'job-123' });
      if (url === `${CSVS_URL}/job-123`) {
        polls++;
        return polls === 1
          ? jsonRes(200, { id: 'job-123', status: 'in_progress', download_url: null })
          : jsonRes(200, { id: 'job-123', status: 'complete', download_url: DOWNLOAD_URL });
      }
      if (url === DOWNLOAD_URL) return textRes(200, CSV_TEXT);
      return textRes(404, 'unexpected ' + url);
    });

    const text = await fetchActBlueCsv({ ...baseOpts(), fetchImpl, onProgress: (e) => events.push(e) });
    assert.equal(text, CSV_TEXT);
    assert.equal(fetchImpl.calls.length, 4);

    const post = fetchImpl.calls[0];
    assert.equal(post.url, CSVS_URL);
    assert.equal(post.init.method, 'POST');
    assert.equal(post.init.headers.Authorization, 'Basic ' + Buffer.from('uuid-1:secret-1').toString('base64'));
    assert.equal(post.init.headers['Content-Type'], 'application/json');
    assert.equal(post.init.headers.Accept, 'application/json');
    assert.deepEqual(JSON.parse(post.init.body), {
      csv_type: 'paid_contributions',
      date_range_start: '2026-05-01T00:00:00.000Z',
      date_range_end: '2026-05-31T00:00:00.000Z',
    });

    for (const c of fetchImpl.calls.slice(1, 3)) {
      assert.equal(c.url, `${CSVS_URL}/job-123`);
      assert.equal(c.init.headers.Authorization, post.init.headers.Authorization);
      assert.equal(c.init.method, undefined);      // GET
    }
    // the S3 link is fetched bare: no ActBlue credentials go to a third party
    assert.equal(fetchImpl.calls[3].url, DOWNLOAD_URL);
    assert.equal(fetchImpl.calls[3].init, null);

    assert.deepEqual(events, [
      { stage: 'requested', csvType: 'paid_contributions', id: 'job-123' },
      { stage: 'ready', csvType: 'paid_contributions', id: 'job-123' },
    ]);
  });

  test('Date objects are accepted and the job id is URL-encoded', async () => {
    const fetchImpl = scriptedFetch((url, init) => {
      if (init?.method === 'POST') return jsonRes(202, { id: 'job 9/x' });
      if (url === `${CSVS_URL}/job%209%2Fx`) return jsonRes(200, { status: 'complete', download_url: DOWNLOAD_URL });
      if (url === DOWNLOAD_URL) return textRes(200, 'a,b\n1,2\n');
      return textRes(404, url);
    });
    const text = await fetchActBlueCsv({ ...baseOpts(), start: new Date('2026-05-01T00:00:00Z'), end: new Date('2026-05-02T00:00:00Z'), csvType: 'refunded_contributions', fetchImpl });
    assert.equal(text, 'a,b\n1,2\n');
    assert.equal(JSON.parse(fetchImpl.calls[0].init.body).csv_type, 'refunded_contributions');
  });

  test('401 on the POST throws ActBlueApiError at stage "request" with status and body', async () => {
    const fetchImpl = scriptedFetch(() => textRes(401, 'HTTP Basic: Access denied.'));
    await assert.rejects(fetchActBlueCsv({ ...baseOpts(), fetchImpl }), (e) => {
      assert.ok(e instanceof ActBlueApiError);
      assert.equal(e.stage, 'request');
      assert.equal(e.status, 401);
      assert.equal(e.body, 'HTTP Basic: Access denied.');
      assert.match(e.message, /401/);
      return true;
    });
    assert.equal(fetchImpl.calls.length, 1);
  });

  test('non-JSON or id-less POST response is a "request" failure', async () => {
    await assert.rejects(
      fetchActBlueCsv({ ...baseOpts(), fetchImpl: scriptedFetch(() => textRes(202, '<html>oops</html>')) }),
      (e) => e instanceof ActBlueApiError && e.stage === 'request' && /non-JSON/.test(e.message),
    );
    await assert.rejects(
      fetchActBlueCsv({ ...baseOpts(), fetchImpl: scriptedFetch(() => jsonRes(202, { ok: true })) }),
      (e) => e instanceof ActBlueApiError && e.stage === 'request' && /no id/.test(e.message),
    );
  });

  test('deadline passing while still in_progress throws at stage "poll"', async () => {
    const fetchImpl = scriptedFetch((url, init) => {
      if (init?.method === 'POST') return jsonRes(202, { id: 'job-slow' });
      return jsonRes(200, { id: 'job-slow', status: 'in_progress' });
    });
    const t0 = Date.now();
    await assert.rejects(
      fetchActBlueCsv({ ...baseOpts(), fetchImpl, pollMs: 5, deadlineMs: Date.now() + 150 }),
      (e) => e instanceof ActBlueApiError && e.stage === 'poll' && /deadline/.test(e.message),
    );
    assert.ok(Date.now() - t0 >= 100, 'waited for the deadline');
    assert.ok(fetchImpl.calls.length >= 3, 'polled more than once');
    assert.ok(fetchImpl.calls.slice(1).every((c) => c.url === `${CSVS_URL}/job-slow`));
  });

  test('a 5xx / 429 poll is retried; a 404 poll is final; a terminal status fails', async () => {
    let n = 0;
    const flaky = scriptedFetch((url, init) => {
      if (init?.method === 'POST') return jsonRes(202, { id: 'j' });
      if (url === `${CSVS_URL}/j`) { n++; return n <= 2 ? textRes(n === 1 ? 503 : 429, 'busy') : jsonRes(200, { status: 'complete', download_url: DOWNLOAD_URL }); }
      if (url === DOWNLOAD_URL) return textRes(200, 'ok');
      return textRes(404, url);
    });
    assert.equal(await fetchActBlueCsv({ ...baseOpts(), fetchImpl: flaky }), 'ok');
    assert.equal(n, 3);

    const gone = scriptedFetch((url, init) => (init?.method === 'POST' ? jsonRes(202, { id: 'j' }) : textRes(404, 'not found')));
    await assert.rejects(fetchActBlueCsv({ ...baseOpts(), fetchImpl: gone }), (e) => e instanceof ActBlueApiError && e.stage === 'poll' && e.status === 404);
    assert.equal(gone.calls.length, 2);

    const failed = scriptedFetch((url, init) => (init?.method === 'POST' ? jsonRes(202, { id: 'j' }) : jsonRes(200, { status: 'failed' })));
    await assert.rejects(fetchActBlueCsv({ ...baseOpts(), fetchImpl: failed }), (e) => e instanceof ActBlueApiError && e.stage === 'poll' && /status failed/.test(e.message));
  });

  test('a failing download throws at stage "download"', async () => {
    const fetchImpl = scriptedFetch((url, init) => {
      if (init?.method === 'POST') return jsonRes(202, { id: 'j' });
      if (url === `${CSVS_URL}/j`) return jsonRes(200, { status: 'complete', download_url: DOWNLOAD_URL });
      return textRes(403, 'expired');
    });
    await assert.rejects(fetchActBlueCsv({ ...baseOpts(), fetchImpl }), (e) => e instanceof ActBlueApiError && e.stage === 'download' && e.status === 403);
  });

  test('a range over 180 days is rejected before any network call; exactly 180 days is allowed', async () => {
    assert.equal(MAX_RANGE_DAYS, 180);
    const fetchImpl = scriptedFetch(() => textRes(401, 'should not be called'));
    await assert.rejects(
      fetchActBlueCsv({ ...baseOpts(), start: '2026-01-01T00:00:00Z', end: '2026-08-01T00:00:00Z', fetchImpl }),
      (e) => e instanceof ActBlueApiError && e.stage === 'request' && /180 days/.test(e.message),
    );
    assert.equal(fetchImpl.calls.length, 0);

    const ok180 = scriptedFetch(() => textRes(401, 'abort after the POST'));
    await assert.rejects(
      fetchActBlueCsv({ ...baseOpts(), start: '2026-01-01T00:00:00Z', end: '2026-06-30T00:00:00Z', fetchImpl: ok180 }),
      (e) => e.stage === 'request' && e.status === 401,
    );
    assert.equal(ok180.calls.length, 1, 'the POST went out for a 180-day range');
  });

  test('invalid range or csv_type is rejected before any network call', async () => {
    const fetchImpl = scriptedFetch(() => textRes(500, 'no'));
    await assert.rejects(fetchActBlueCsv({ ...baseOpts(), start: '2026-05-31T00:00:00Z', end: '2026-05-01T00:00:00Z', fetchImpl }), (e) => e.stage === 'request' && /invalid date range/.test(e.message));
    await assert.rejects(fetchActBlueCsv({ ...baseOpts(), start: 'garbage', fetchImpl }), (e) => e.stage === 'request');
    await assert.rejects(fetchActBlueCsv({ ...baseOpts(), csvType: 'all_the_things', fetchImpl }), (e) => e.stage === 'request' && /unknown csv_type/.test(e.message));
    assert.equal(fetchImpl.calls.length, 0);
  });
});

/* =============================================================================
 * 10. Reconciliation against the fake Supabase
 * ========================================================================== */

const PERSON = {
  one: { 'Donor First Name': 'Test', 'Donor Last Name': 'Person', 'Donor Email': 'test1@example.com', 'Donor ID': '900001', 'Donor Addr1': '123 Test St', 'Donor City': 'Cincinnati', 'Donor State': 'OH', 'Donor ZIP': '45202', 'Donor Phone': '5135550100', 'Donor Employer': 'Example Co', 'Donor Occupation': 'Tester' },
  two: { 'Donor First Name': 'Sample', 'Donor Last Name': 'Donor', 'Donor Email': 'test2@example.com', 'Donor ID': '900002', 'Donor Addr1': '456 Sample Ave', 'Donor City': 'Dayton', 'Donor State': 'OH', 'Donor ZIP': '45420', 'Donor Phone': '9375550101', 'Donor Employer': 'Sample LLC', 'Donor Occupation': 'Analyst' },
  three: { 'Donor First Name': 'Fake', 'Donor Last Name': 'Giver', 'Donor Email': 'test3@example.com', 'Donor ID': '900003', 'Donor Addr1': '789 Fake Rd', 'Donor City': 'Columbus', 'Donor State': 'OH', 'Donor ZIP': '43215', 'Donor Phone': '6145550102', 'Donor Employer': 'Fake Inc', 'Donor Occupation': 'Engineer' },
};

/* Person one joins as a monthly Stonewall Sustainer on 2026-04-16 12:10:46 EDT. */
const stonewallFirst = (o = {}) => paidRow({
  ...PERSON.one, ...MONTHLY_FIELDS,
  'Receipt ID': 'AB300000101', 'Lineitem ID': '700000101',
  'Date': '2026-04-16 12:10:46', 'Payment Date': '2026-04-16 12:10:46',
  'Amount': '19.69', 'Fee': '0.30', 'Recurrence Number': '1', 'Reference Code': 'website_founding_stonewall',
  ...o,
});
/* Installment n of that series, a month apart, with its own receipt + lineitem. */
const stonewallInstallment = (n, o = {}) => paidRow({
  ...PERSON.one, ...MONTHLY_FIELDS,
  'Receipt ID': `AB40000000${n}`, 'Lineitem ID': `80000000${n}`,
  'Date': `2026-${String(3 + n).padStart(2, '0')}-16 12:10:46`,
  'Amount': '19.69', 'Fee': '0.30', 'Recurrence Number': String(n), 'Reference Code': 'website_founding_stonewall',
  ...o,
});
/* Person two gives $25 once through the website. */
const oneTime25 = (o = {}) => paidRow({
  ...PERSON.two,
  'Receipt ID': 'AB300000201', 'Lineitem ID': '700000201', 'Date': '2026-05-09 17:33:08',
  'Amount': '25.00', 'Fee': '0.38', 'Reference Code': 'website_donate_25',
  ...o,
});
/* Person three pays at an event (Kind = event, no refcode). */
const eventGift = (o = {}) => paidRow({
  ...PERSON.three,
  'Receipt ID': 'AB300000301', 'Lineitem ID': '700000301', 'Date': '2026-05-11 06:02:45',
  'Amount': '100.00', 'Fee': '1.00', 'Reference Code': '', 'Kind': 'event',
  ...o,
});

/* Map fixture rows through the real CSV path; every row must map. */
function mapRows(rowObjs) {
  const { rows, skipped } = mapContributionCsv(buildCsv(PAID_HEADER, rowObjs));
  assert.deepEqual(skipped, { no_id: 0, no_amount: 0, bad_date: 0 });
  assert.equal(rows.length, rowObjs.length);
  return rows;
}
function mapCancelRows(rowObjs) {
  const { rows, skipped } = mapCancellationCsv(buildCsv(CANCELLED_HEADER, rowObjs));
  assert.equal(skipped, 0);
  return rows;
}

const ZERO_COUNTS = {
  founding_inserted: 0, founding_updated: 0, founding_adopted: 0,
  donors_inserted: 0, donors_updated: 0, donors_adopted: 0, donors_skipped: 0,
  contacts_created: 0, contacts_enriched: 0, errors: 0,
};

describe('reconcileContributions: founding members', () => {
  test('a founding first installment for a new email inserts one founding row and only the fan-out donors row', async () => {
    const db = createFakeSupabase();
    const r = await reconcileContributions(db.admin, mapRows([stonewallFirst()]));

    assert.deepEqual(r.counts, { ...ZERO_COUNTS, rows: 1, founding_inserted: 1, contacts_enriched: 1 });
    assert.deepEqual(r.problems, []);
    assert.deepEqual(r.plan, [{ action: 'founding_insert', lineitem: '700000101', receipt: 'AB300000101', refcode: 'website_founding_stonewall', amount_cents: 1969, recurrence: 'monthly' }]);

    const fms = db.rows('founding_members');
    assert.equal(fms.length, 1);
    const fm = fms[0];
    assert.equal(fm.full_name, 'Test Person');
    assert.equal(fm.display_name, null);
    assert.equal(fm.email, 'test1@example.com');
    assert.equal(fm.amount_cents, 1969);
    assert.equal(fm.recurrence, 'monthly');
    assert.equal(fm.actblue_contribution_id, '700000101');
    assert.equal(fm.actblue_receipt_id, 'AB300000101');
    assert.equal(fm.actblue_donor_id, '900001');
    assert.equal(fm.contributed_at, '2026-04-16T16:10:46.000Z');
    assert.equal(fm.is_public, false);
    assert.equal(fm.is_vetted, false);
    assert.equal(fm.city, 'Cincinnati');
    assert.equal(fm.state, 'OH');
    assert.equal(fm.zip, '45202');
    assert.equal(fm.phone, '5135550100');
    assert.equal(fm.address1, '123 Test St');
    assert.equal(fm.employer, 'Example Co');
    assert.equal(fm.occupation, 'Tester');
    assert.equal(fm.refcode, 'website_founding_stonewall');
    assert.ok(fm.contact_id, 'linked to a contact by the trigger');

    // exactly one donors row, and it is the trigger fan-out, not a sync insert
    const donors = db.rows('donors');
    assert.equal(donors.length, 1);
    assert.equal(donors[0].founding_member_id, fm.id);
    assert.equal(donors[0].source, 'founding_member');
    assert.equal(donors[0].reason, 'Founding Member');
    assert.equal(donors[0].actblue_contribution_id, '700000101');
    assert.equal(donors[0].amount_cents, 1969);
    assert.equal(donors[0].contact_id, fm.contact_id);
    assert.equal(db.ops.filter((o) => o.table === 'donors' && !o.trigger).length, 0, 'the sync itself never wrote donors');

    // the contact carries both roles, the actblue source and the fields the trigger cannot fill
    const contacts = db.rows('contacts');
    assert.equal(contacts.length, 1);
    const c = contacts[0];
    assert.equal(c.email, 'test1@example.com');
    assert.ok(c.roles.includes('donor') && c.roles.includes('founding_member'), JSON.stringify(c.roles));
    assert.ok(c.sources.includes('actblue'), JSON.stringify(c.sources));
    assert.equal(c.first_name, 'Test');
    assert.equal(c.last_name, 'Person');
    assert.equal(c.full_name, 'Test Person');
    assert.equal(c.employer, 'Example Co');
    assert.equal(c.occupation, 'Tester');
    assert.equal(c.state, 'OH');
    assert.equal(c.address1, '123 Test St');
  });

  test('autoPublish inserts the founding row as vetted + public', async () => {
    const db = createFakeSupabase();
    await reconcileContributions(db.admin, mapRows([stonewallFirst()]), { autoPublish: true });
    const fm = db.rows('founding_members')[0];
    assert.equal(fm.is_public, true);
    assert.equal(fm.is_vetted, true);
  });

  test('a weekly founding plan is stored as monthly on the founding row', async () => {
    const db = createFakeSupabase();
    const rows = mapRows([stonewallFirst({ 'Recur Weekly': 't' })]);
    assert.equal(rows[0].recurrence, 'weekly');
    const r = await reconcileContributions(db.admin, rows);
    assert.equal(r.plan[0].recurrence, 'monthly');
    assert.equal(db.rows('founding_members')[0].recurrence, 'monthly');
  });

  test('a row without a usable name falls back to the email, then "Anonymous"', async () => {
    const db = createFakeSupabase();
    await reconcileContributions(db.admin, mapRows([
      stonewallFirst({ 'Donor First Name': '', 'Donor Last Name': '' }),
      stonewallFirst({ ...PERSON.two, 'Donor First Name': '', 'Donor Last Name': '', 'Donor Email': '', 'Receipt ID': 'AB300000103', 'Lineitem ID': '700000103', 'Date': '2026-04-17 09:00:00' }),
    ]));
    const names = db.rows('founding_members').map((f) => f.full_name);
    assert.deepEqual(names, ['test1@example.com', 'Anonymous']);
  });

  test('the same rows run twice are a no-op the second time', async () => {
    const db = createFakeSupabase();
    const rows = mapRows([stonewallFirst(), oneTime25(), eventGift()]);
    const first = await reconcileContributions(db.admin, rows);
    assert.equal(first.counts.founding_inserted, 1);
    assert.equal(first.counts.donors_inserted, 2);

    const before = db.snapshot();
    const opsBefore = db.ops.length;
    const second = await reconcileContributions(db.admin, rows);
    assert.deepEqual(second.counts, { ...ZERO_COUNTS, rows: 3, donors_skipped: 2 });
    assert.deepEqual(second.plan.map((p) => p.action).sort(), ['donor_exists', 'donor_exists', 'founding_exists']);
    assert.deepEqual(second.problems, []);
    assert.deepEqual(db.snapshot(), before);
    assert.equal(db.ops.length, opsBefore, 'no writes on the second run');
  });

  test('installment #2 for an existing member is a donors row with the installment reason, no second seat', async () => {
    const db = createFakeSupabase();
    await reconcileContributions(db.admin, mapRows([stonewallFirst()]));
    const fm = db.rows('founding_members')[0];

    const r = await reconcileContributions(db.admin, mapRows([stonewallInstallment(2)]));
    assert.deepEqual(r.counts, { ...ZERO_COUNTS, rows: 1, donors_inserted: 1 });
    assert.deepEqual(r.plan, [{ action: 'donor_insert', lineitem: '800000002', receipt: 'AB400000002', refcode: 'website_founding_stonewall', amount_cents: 1969, recurrence_number: 2, founding_member: true }]);

    assert.equal(db.rows('founding_members').length, 1);
    const donors = db.rows('donors');
    assert.equal(donors.length, 2);
    const inst = donors.find((d) => d.actblue_contribution_id === '800000002');
    assert.ok(inst);
    assert.equal(inst.reason, 'Founding member installment #2');
    assert.equal(inst.source, 'actblue');
    assert.equal(inst.recurrence, 'monthly');
    assert.equal(inst.recurrence_number, 2);
    assert.equal(inst.founding_member_id, null);           // the fan-out row owns that key
    assert.equal(inst.contact_id, fm.contact_id);           // linked to the same person by the trigger
    assert.equal(inst.actblue_receipt_id, 'AB400000002');
    assert.equal(inst.fee_cents, 30);
    assert.equal(inst.kind, 'page');
    assert.equal(inst.refcode, 'website_founding_stonewall');
    assert.equal(inst.contributed_at, '2026-05-16T16:10:46.000Z');
  });

  test('an installment whose first payment predates the window never mints a seat', async () => {
    const db = createFakeSupabase();
    const r = await reconcileContributions(db.admin, mapRows([stonewallInstallment(7)]));
    assert.equal(db.rows('founding_members').length, 0);
    assert.equal(r.counts.donors_inserted, 1);
    assert.equal(r.plan[0].founding_member, false);
    assert.equal(db.rows('donors')[0].reason, 'Founding member installment #7');
  });

  test('a second founding-refcode gift from an existing member email is an "Additional founding-tier gift"', async () => {
    const db = createFakeSupabase();
    await reconcileContributions(db.admin, mapRows([stonewallFirst()]));

    const extra = stonewallFirst({ 'Receipt ID': 'AB300000102', 'Lineitem ID': '700000102', 'Date': '2026-04-27 08:37:40', 'Amount': '25.00', 'Reference Code': 'website_founding_member', 'Recurring Total Months': '', 'Recurring Type': '', 'Recurring Pledged': '1' });
    const r = await reconcileContributions(db.admin, mapRows([extra]));
    assert.deepEqual(r.counts, { ...ZERO_COUNTS, rows: 1, donors_inserted: 1 });
    assert.equal(db.rows('founding_members').length, 1);
    const d = db.find('donors', (x) => x.actblue_contribution_id === '700000102');
    assert.ok(d);
    assert.equal(d.reason, 'Additional founding-tier gift');
    assert.equal(d.recurrence, 'one_time');
    assert.equal(d.amount_cents, 2500);
    assert.equal(d.founding_member_id, null);
  });

  test('two first-installment founding gifts from one new email in a single batch make ONE founding row', async () => {
    const db = createFakeSupabase();
    const rows = mapRows([
      stonewallFirst(),
      stonewallFirst({ 'Receipt ID': 'AB300000102', 'Lineitem ID': '700000102', 'Date': '2026-04-27 08:37:40', 'Amount': '25.00', 'Reference Code': 'website_founding_member', 'Recurring Total Months': '', 'Recurring Type': '', 'Recurring Pledged': '1' }),
    ]);
    const r = await reconcileContributions(db.admin, rows);
    assert.equal(db.rows('founding_members').length, 1, 'one seat per person');
    assert.equal(r.counts.founding_inserted, 1);
    assert.equal(r.counts.donors_inserted, 1);
    const d = db.find('donors', (x) => x.actblue_contribution_id === '700000102');
    assert.equal(d?.reason, 'Additional founding-tier gift');
  });

  test('a receipt-keyed founding row adopts the lineitem and fills blanks; curated fields are untouched', async () => {
    const db = createFakeSupabase();
    const seeded = db.seed('founding_members', {
      full_name: 'Test Person', email: 'test1@example.com',
      display_name: 'Test P.', notes: 'vetted by hand 2026-05', is_public: true, is_vetted: true,
      amount_cents: 1969, recurrence: 'monthly',
      actblue_contribution_id: 'AB300000101', actblue_receipt_id: 'AB300000101',     // older import keyed on the receipt
      contributed_at: '2026-04-16T16:10:46.000Z',
      city: 'Cincinnati', state: 'OH', zip: null, phone: null, address1: null, employer: null, occupation: null, refcode: null, actblue_donor_id: null,
    });
    assert.equal(db.rows('donors')[0].actblue_contribution_id, 'AB300000101', 'fan-out mirrors the receipt key');

    const rows = mapRows([stonewallFirst({ 'Donor City': 'Columbus' })]);   // differing city must not win
    const r = await reconcileContributions(db.admin, rows);
    assert.deepEqual(r.counts, { ...ZERO_COUNTS, rows: 1, founding_adopted: 1, contacts_enriched: 1 });
    assert.deepEqual(r.problems, []);
    assert.equal(r.plan[0].action, 'founding_adopt');
    assert.deepEqual([...r.plan[0].fields].sort(), ['actblue_contribution_id', 'actblue_donor_id', 'address1', 'employer', 'occupation', 'phone', 'refcode', 'zip']);

    const fm = db.find('founding_members', (x) => x.id === seeded.id);
    assert.equal(fm.actblue_contribution_id, '700000101');
    assert.equal(fm.actblue_receipt_id, 'AB300000101');
    assert.equal(fm.zip, '45202');
    assert.equal(fm.phone, '5135550100');
    assert.equal(fm.address1, '123 Test St');
    assert.equal(fm.employer, 'Example Co');
    assert.equal(fm.occupation, 'Tester');
    assert.equal(fm.refcode, 'website_founding_stonewall');
    assert.equal(fm.actblue_donor_id, '900001');
    // never overwritten
    assert.equal(fm.city, 'Cincinnati');
    assert.equal(fm.display_name, 'Test P.');
    assert.equal(fm.is_public, true);
    assert.equal(fm.is_vetted, true);
    assert.equal(fm.notes, 'vetted by hand 2026-05');
    assert.equal(fm.amount_cents, 1969);

    // the fan-out row followed the new key; nothing was duplicated
    assert.equal(db.rows('founding_members').length, 1);
    const donors = db.rows('donors');
    assert.equal(donors.length, 1);
    assert.equal(donors[0].founding_member_id, seeded.id);
    assert.equal(donors[0].actblue_contribution_id, '700000101');

    // the next run matches on the stable key and does nothing
    const again = await reconcileContributions(db.admin, rows);
    assert.deepEqual(again.counts, { ...ZERO_COUNTS, rows: 1 });
    assert.deepEqual(again.plan, [{ action: 'founding_exists', lineitem: '700000101', receipt: 'AB300000101', refcode: 'website_founding_stonewall' }]);
  });

  test('receipt-keyed founding row: a one_time row flips to monthly when the export says so, blanks-only otherwise', async () => {
    const db = createFakeSupabase();
    db.seed('founding_members', {
      full_name: 'Test Person', email: 'test1@example.com', amount_cents: 1969, recurrence: 'one_time',
      actblue_contribution_id: 'AB300000101', actblue_receipt_id: 'AB300000101', contributed_at: '2026-04-16T16:10:46.000Z',
      city: 'Cincinnati', state: 'OH', zip: '45202', phone: '5135550100', address1: '123 Test St', employer: 'Example Co', occupation: 'Tester', refcode: 'website_founding_stonewall', actblue_donor_id: '900001',
    });
    const r = await reconcileContributions(db.admin, mapRows([stonewallFirst()]));
    assert.equal(r.counts.founding_adopted, 1);
    assert.deepEqual([...r.plan[0].fields].sort(), ['actblue_contribution_id', 'recurrence']);
    assert.equal(db.rows('founding_members')[0].recurrence, 'monthly');
    assert.equal(db.rows('donors')[0].recurrence, 'monthly');
  });

  test('lineitem clash: adoption is skipped and reported when a stray donors row already holds the lineitem', async () => {
    const db = createFakeSupabase();
    const seeded = db.seed('founding_members', {
      full_name: 'Test Person', email: 'test1@example.com', amount_cents: 1969, recurrence: 'monthly',
      actblue_contribution_id: 'AB300000101', actblue_receipt_id: 'AB300000101', contributed_at: '2026-04-16T16:10:46.000Z',
      city: 'Cincinnati', state: 'OH',
    });
    const stray = db.seed('donors', {
      full_name: 'Test Person', email: 'test1@example.com', amount_cents: 1969, recurrence: 'monthly',
      actblue_contribution_id: '700000101', actblue_receipt_id: null, contributed_at: '2026-04-16T16:10:46.000Z', source: 'actblue',
    }, { triggers: false });

    const r = await reconcileContributions(db.admin, mapRows([stonewallFirst()]));
    assert.equal(r.counts.founding_adopted, 0);
    assert.equal(r.counts.founding_updated, 1, 'the blank fill still happens');
    assert.equal(r.counts.errors, 0);
    assert.deepEqual(r.problems, [{ kind: 'lineitem_clash', lineitem: '700000101', founding_member_id: seeded.id, donor_id: stray.id }]);
    const fm = db.rows('founding_members')[0];
    assert.equal(fm.actblue_contribution_id, 'AB300000101', 'key left alone');
    assert.equal(fm.zip, '45202', 'blanks were filled');
    assert.equal(db.rows('donors').length, 2);
  });
});

describe('reconcileContributions: donors', () => {
  test('a non-founding one-time gift and an event gift insert donors rows with source actblue', async () => {
    const db = createFakeSupabase();
    const r = await reconcileContributions(db.admin, mapRows([oneTime25(), eventGift()]));
    assert.deepEqual(r.counts, { ...ZERO_COUNTS, rows: 2, donors_inserted: 2, contacts_enriched: 2 });
    assert.deepEqual(r.plan.map((p) => p.action), ['donor_insert', 'donor_insert']);
    assert.equal(db.rows('founding_members').length, 0);

    const donors = db.rows('donors');
    assert.equal(donors.length, 2);
    const gift = donors.find((d) => d.actblue_contribution_id === '700000201');
    assert.equal(gift.source, 'actblue');
    assert.equal(gift.reason, null);
    assert.equal(gift.full_name, 'Sample Donor');
    assert.equal(gift.email, 'test2@example.com');
    assert.equal(gift.amount_cents, 2500);
    assert.equal(gift.fee_cents, 38);
    assert.equal(gift.recurrence, 'one_time');
    assert.equal(gift.recurrence_number, 1);
    assert.equal(gift.kind, 'page');
    assert.equal(gift.refcode, 'website_donate_25');
    assert.equal(gift.actblue_receipt_id, 'AB300000201');
    assert.equal(gift.actblue_donor_id, '900002');
    assert.equal(gift.contributed_at, '2026-05-09T21:33:08.000Z');
    assert.equal(gift.founding_member_id, null);
    assert.equal(gift.city, 'Dayton');
    assert.equal(gift.zip, '45420');
    assert.ok(gift.contact_id);

    const ev = donors.find((d) => d.actblue_contribution_id === '700000301');
    assert.equal(ev.kind, 'event');
    assert.equal(ev.reason, 'Event contribution');
    assert.equal(ev.refcode, null);
    assert.equal(ev.amount_cents, 10000);

    // one contact per email, both tagged donor + actblue
    const contacts = db.rows('contacts');
    assert.deepEqual(contacts.map((c) => c.email).sort(), ['test2@example.com', 'test3@example.com']);
    for (const c of contacts) {
      assert.ok(c.roles.includes('donor'));
      assert.ok(c.sources.includes('actblue'));
      assert.ok(!c.roles.includes('founding_member'));
    }
  });

  test('a row with only a receipt is keyed on the receipt', async () => {
    const db = createFakeSupabase();
    await reconcileContributions(db.admin, mapRows([oneTime25({ 'Lineitem ID': '' })]));
    const d = db.rows('donors')[0];
    assert.equal(d.actblue_contribution_id, 'AB300000201');
    assert.equal(d.actblue_receipt_id, 'AB300000201');
  });

  test('a receipt-keyed donors row for the same payment (within 36h) is adopted; a later payment months apart is inserted', async () => {
    const db = createFakeSupabase();
    const seeded = db.seed('donors', {
      full_name: 'Sample Donor', email: 'test2@example.com', amount_cents: 2500, recurrence: 'one_time',
      actblue_contribution_id: 'AB300000201', actblue_receipt_id: 'AB300000201',
      contributed_at: '2026-05-10T09:00:00.000Z',                                  // 11.5h after the export's instant
      source: 'actblue', city: 'Dayton', state: 'OH', phone: null, zip: null, employer: null, fee_cents: null, kind: null, recurrence_number: null,
    });

    const rows = mapRows([
      oneTime25(),                                                                                   // 2026-05-09 21:33:08Z, $25
      oneTime25({ 'Lineitem ID': '810000001', 'Date': '2026-08-09 17:33:08', 'Recurrence Number': '2' }),  // same receipt, 3 months later
    ]);
    const r = await reconcileContributions(db.admin, rows);
    assert.deepEqual(r.counts, { ...ZERO_COUNTS, rows: 2, donors_adopted: 1, donors_skipped: 1, donors_inserted: 1, contacts_enriched: 1 });
    assert.equal(r.plan[0].action, 'donor_adopt');
    assert.ok(r.plan[0].fields.includes('actblue_contribution_id'));
    assert.equal(r.plan[1].action, 'donor_insert');

    const donors = db.rows('donors');
    assert.equal(donors.length, 2, 'no duplicate for the adopted payment');
    const adopted = donors.find((d) => d.id === seeded.id);
    assert.equal(adopted.actblue_contribution_id, '700000201');
    assert.equal(adopted.actblue_receipt_id, 'AB300000201');
    assert.equal(adopted.phone, '9375550101');
    assert.equal(adopted.zip, '45420');
    assert.equal(adopted.employer, 'Sample LLC');
    assert.equal(adopted.fee_cents, 38);
    assert.equal(adopted.kind, 'page');
    assert.equal(adopted.recurrence_number, 1);
    assert.equal(adopted.contributed_at, '2026-05-10T09:00:00.000Z', 'existing timestamp kept');
    const later = donors.find((d) => d.actblue_contribution_id === '810000001');
    assert.ok(later);
    assert.equal(later.recurrence, 'monthly');
    assert.equal(later.recurrence_number, 2);
    assert.equal(later.contributed_at, '2026-08-09T21:33:08.000Z');
  });

  test('a receipt-keyed row with a different amount is not the same payment', async () => {
    const db = createFakeSupabase();
    db.seed('donors', {
      full_name: 'Sample Donor', email: 'test2@example.com', amount_cents: 5000, recurrence: 'one_time',
      actblue_contribution_id: 'AB300000201', actblue_receipt_id: 'AB300000201', contributed_at: '2026-05-09T21:33:08.000Z', source: 'actblue',
    });
    const r = await reconcileContributions(db.admin, mapRows([oneTime25()]));
    assert.equal(r.counts.donors_inserted, 1);
    assert.equal(r.counts.donors_adopted, 0);
    assert.equal(db.rows('donors').length, 2);
  });

  test('a lineitem the fan-out row already holds is skipped as an existing gift', async () => {
    const db = createFakeSupabase();
    await reconcileContributions(db.admin, mapRows([stonewallFirst()]));
    // the same payment shows up again as a non-first-installment (e.g. re-exported with a bumped recurrence number)
    const r = await reconcileContributions(db.admin, mapRows([stonewallFirst({ 'Recurrence Number': '2' })]));
    assert.deepEqual(r.counts, { ...ZERO_COUNTS, rows: 1, donors_skipped: 1 });
    assert.equal(r.plan[0].action, 'donor_exists');
    assert.equal(db.rows('donors').length, 1);
  });

  test('a batch insert failure falls back to one-at-a-time and a bad row is counted, not fatal', async () => {
    const db = createFakeSupabase();
    let batches = 0;
    db.failWhen((table, op, payload) => {
      if (table !== 'donors' || op !== 'upsert') return null;
      if (Array.isArray(payload) && payload.length > 1) { batches++; return 'simulated batch failure'; }
      const one = Array.isArray(payload) ? payload[0] : payload;
      return one.actblue_contribution_id === '700000301' ? 'simulated row failure' : null;
    });
    const r = await reconcileContributions(db.admin, mapRows([oneTime25(), eventGift(), oneTime25({ ...PERSON.one, 'Receipt ID': 'AB300000202', 'Lineitem ID': '700000202', 'Date': '2026-05-11 10:28:51' })]));
    assert.equal(batches, 1);
    assert.equal(r.counts.donors_inserted, 2);
    assert.equal(r.counts.errors, 1);
    assert.deepEqual(r.problems, [{ kind: 'donor_insert_failed', lineitem: '700000301', message: 'simulated row failure' }]);
    assert.deepEqual(db.rows('donors').map((d) => d.actblue_contribution_id).sort(), ['700000201', '700000202']);
  });
});

describe('reconcileContributions: contacts', () => {
  test('without triggers the sync creates the contact itself with donor (+founding_member) roles and the actblue source', async () => {
    const db = createFakeSupabase({ triggers: false });
    const r = await reconcileContributions(db.admin, mapRows([stonewallFirst(), oneTime25()]));
    assert.equal(r.counts.contacts_created, 2);
    assert.equal(r.counts.contacts_enriched, 0);

    const c1 = db.find('contacts', (c) => c.email === 'test1@example.com');
    assert.deepEqual(c1.roles, ['donor', 'founding_member']);
    assert.deepEqual(c1.sources, ['actblue']);
    assert.equal(c1.source, 'actblue');
    assert.equal(c1.first_name, 'Test');
    assert.equal(c1.last_name, 'Person');
    assert.equal(c1.full_name, 'Test Person');
    assert.equal(c1.phone, '5135550100');
    assert.equal(c1.address1, '123 Test St');
    assert.equal(c1.city, 'Cincinnati');
    assert.equal(c1.state, 'OH');
    assert.equal(c1.zip, '45202');
    assert.equal(c1.employer, 'Example Co');
    assert.equal(c1.occupation, 'Tester');
    assert.equal(c1.sms_optin, null);

    const c2 = db.find('contacts', (c) => c.email === 'test2@example.com');
    assert.deepEqual(c2.roles, ['donor']);
    assert.deepEqual(c2.sources, ['actblue']);

    // a second run finds them and does nothing
    const again = await reconcileContributions(db.admin, mapRows([stonewallFirst(), oneTime25()]));
    assert.equal(again.counts.contacts_created, 0);
    assert.equal(again.counts.contacts_enriched, 0);
  });

  test('an existing contact with a blank employer is filled; a differing employer is never overwritten', async () => {
    const db = createFakeSupabase();
    const a = db.seed('contacts', { email: 'test2@example.com', first_name: 'Sample', last_name: 'Donor', full_name: 'Sample Donor', employer: null, roles: ['newsletter'], sources: ['mailerlite'] });
    const b = db.seed('contacts', {
      email: 'test3@example.com', first_name: 'Fake', last_name: 'Giver', full_name: 'Fake Giver',
      phone: '6145550102', address1: '789 Fake Rd', address2: 'Suite 9', city: 'Columbus', state: 'OH', zip: '43215',
      employer: 'Existing Co', occupation: 'Engineer', roles: ['donor'], sources: ['actblue'],
    });

    const r = await reconcileContributions(db.admin, mapRows([
      oneTime25({ 'Donor Employer': 'New Co' }),
      eventGift({ 'Donor Employer': 'New Co', 'Donor Occupation': 'Plumber' }),
    ]));
    assert.equal(r.counts.contacts_created, 0);
    assert.equal(r.counts.contacts_enriched, 1);

    const A = db.find('contacts', (c) => c.id === a.id);
    assert.equal(A.employer, 'New Co');
    assert.equal(A.phone, '9375550101');
    assert.equal(A.city, 'Dayton');
    assert.equal(A.first_name, 'Sample', 'existing identity kept');
    assert.ok(A.roles.includes('newsletter') && A.roles.includes('donor'));
    assert.ok(A.sources.includes('mailerlite') && A.sources.includes('actblue'));

    const B = db.find('contacts', (c) => c.id === b.id);
    assert.equal(B.employer, 'Existing Co');
    assert.equal(B.occupation, 'Engineer');
    assert.equal(B.address2, 'Suite 9');
    assert.equal(db.rows('contacts').length, 2);
  });

  test('a merged contact is left alone; sms opt-in only fills a null', async () => {
    const db = createFakeSupabase({ triggers: false });
    const merged = db.seed('contacts', { email: 'test2@example.com', is_merged: true, employer: null, roles: [], sources: [] });
    const opted = db.seed('contacts', { email: 'test3@example.com', sms_optin: false, roles: ['donor'], sources: ['actblue'], first_name: 'Fake', last_name: 'Giver', phone: '6145550102', address1: '789 Fake Rd', city: 'Columbus', state: 'OH', zip: '43215', employer: 'Fake Inc', occupation: 'Engineer' });
    const r = await reconcileContributions(db.admin, mapRows([oneTime25(), eventGift({ 'Text Message Opt In': 't' })]));
    assert.equal(r.counts.contacts_enriched, 0);
    assert.equal(db.find('contacts', (c) => c.id === merged.id).employer, null);
    assert.deepEqual(db.find('contacts', (c) => c.id === merged.id).roles, []);
    assert.equal(db.find('contacts', (c) => c.id === opted.id).sms_optin, false, 'an explicit opt-out is not flipped');
  });
});

describe('reconcileContributions: dryRun', () => {
  const batch = () => mapRows([stonewallFirst(), oneTime25(), eventGift(), stonewallInstallment(2)]);
  // founding_member on a donor_insert entry is informational and differs in a dry run (see the TODO below)
  const withoutFoundingFlag = ({ founding_member, ...rest }) => rest;

  test('writes nothing but reports the same plan and counts as a real run', async () => {
    const dryDb = createFakeSupabase();
    const before = dryDb.snapshot();
    const dry = await reconcileContributions(dryDb.admin, batch(), { dryRun: true });
    assert.deepEqual(dryDb.snapshot(), before);
    assert.equal(dryDb.ops.length, 0);
    assert.deepEqual(dry.problems, []);
    assert.equal(dry.counts.founding_inserted, 1);
    assert.equal(dry.counts.donors_inserted, 3);
    assert.equal(dry.counts.contacts_created, 3);

    const realDb = createFakeSupabase();
    const real = await reconcileContributions(realDb.admin, batch());
    assert.deepEqual(dry.plan.map(withoutFoundingFlag), real.plan.map(withoutFoundingFlag));
    const noContacts = ({ contacts_created, contacts_enriched, ...rest }) => rest;
    assert.deepEqual(noContacts(dry.counts), noContacts(real.counts));
    // with the triggers on, the real run finds the contacts the triggers made and enriches instead of creating
    assert.equal(real.counts.contacts_created, 0);
    assert.equal(real.counts.contacts_enriched, 3);
    assert.equal(realDb.rows('founding_members').length, 1);
    assert.equal(realDb.rows('donors').length, 4);
  });

  test('with no triggers every counter matches exactly', async () => {
    const dryDb = createFakeSupabase({ triggers: false });
    const realDb = createFakeSupabase({ triggers: false });
    const dry = await reconcileContributions(dryDb.admin, batch(), { dryRun: true });
    const real = await reconcileContributions(realDb.admin, batch());
    assert.deepEqual(dry.counts, real.counts);
    assert.deepEqual(dry.plan.map(withoutFoundingFlag), real.plan.map(withoutFoundingFlag));
    assert.equal(dryDb.ops.length, 0);
    assert.ok(realDb.ops.length > 0);
  });

  test('the dry-run plan flags an installment whose seat is inserted in the same run as founding_member', async () => {
    const dry = await reconcileContributions(createFakeSupabase().admin, batch(), { dryRun: true });
    const real = await reconcileContributions(createFakeSupabase().admin, batch());
    assert.deepEqual(dry.plan, real.plan);
    assert.equal(dry.plan.find((p) => p.lineitem === '800000002').founding_member, true);
  });

  test('a dry run on an already-reconciled database reports the adoption/fill it would do', async () => {
    const db = createFakeSupabase();
    db.seed('founding_members', {
      full_name: 'Test Person', email: 'test1@example.com', amount_cents: 1969, recurrence: 'monthly',
      actblue_contribution_id: 'AB300000101', actblue_receipt_id: 'AB300000101', contributed_at: '2026-04-16T16:10:46.000Z',
    });
    const before = db.snapshot();
    const r = await reconcileContributions(db.admin, mapRows([stonewallFirst()]), { dryRun: true });
    assert.equal(r.counts.founding_adopted, 1);
    assert.equal(r.plan[0].action, 'founding_adopt');
    assert.deepEqual(db.snapshot(), before);
  });
});

/* =============================================================================
 * applyRefunds
 * ========================================================================== */

describe('applyRefunds', () => {
  const refundOf = (rowObj, refundDate = '2026-05-15 00:00:00', refundId = '509802082') => rowObj && { ...rowObj, 'Refund ID': refundId, 'Refund Date': refundDate };

  test('a first-installment founding refund stamps the founding row and its fan-out; an installment refund stamps only its donors row; unknown rows are unmatched', async () => {
    const db = createFakeSupabase();
    await reconcileContributions(db.admin, mapRows([stonewallFirst(), stonewallInstallment(2), oneTime25()]));
    const fm = db.rows('founding_members')[0];

    const refunds = mapRows([
      refundOf(stonewallFirst()),
      refundOf(stonewallInstallment(2), '2026-05-20 09:30:00', '509802090'),
      refundOf(paidRow({ ...PERSON.three, 'Receipt ID': 'AB999999999', 'Lineitem ID': '999999999' }), '2026-05-21 00:00:00', '509802099'),
    ]);
    assert.equal(refunds[0].refunded_at, '2026-05-15T04:00:00.000Z');

    const r = await applyRefunds(db.admin, refunds);
    assert.deepEqual(r.counts, { rows: 3, founding_refunded: 1, donors_refunded: 2, unmatched: 1, errors: 0 });
    assert.deepEqual(r.problems, []);
    assert.deepEqual(r.plan, [
      { action: 'founding_refund', lineitem: '700000101', receipt: 'AB300000101', founding_member_id: fm.id },
      { action: 'donor_refund', lineitem: '700000101', receipt: 'AB300000101', donor_id: db.find('donors', (d) => d.founding_member_id === fm.id).id },
      { action: 'donor_refund', lineitem: '800000002', receipt: 'AB400000002', donor_id: db.find('donors', (d) => d.actblue_contribution_id === '800000002').id },
      { action: 'refund_unmatched', lineitem: '999999999', receipt: 'AB999999999' },
    ]);

    assert.equal(db.rows('founding_members')[0].refunded_at, '2026-05-15T04:00:00.000Z');
    const fan = db.find('donors', (d) => d.founding_member_id === fm.id);
    assert.equal(fan.refunded_at, '2026-05-15T04:00:00.000Z');
    assert.equal(db.find('donors', (d) => d.actblue_contribution_id === '800000002').refunded_at, '2026-05-20T13:30:00.000Z');
    assert.equal(db.find('donors', (d) => d.actblue_contribution_id === '700000201').refunded_at, null, 'unrelated gift untouched');
    assert.equal(db.rows('founding_members').length, 1, 'nothing deleted');
    assert.equal(db.rows('donors').length, 3);

    // idempotent: a second pass finds everything stamped
    const again = await applyRefunds(db.admin, refunds);
    assert.deepEqual(again.counts, { rows: 3, founding_refunded: 0, donors_refunded: 0, unmatched: 1, errors: 0 });
  });

  test('an installment refund never touches the founding seat', async () => {
    const db = createFakeSupabase();
    await reconcileContributions(db.admin, mapRows([stonewallFirst(), stonewallInstallment(3)]));
    const r = await applyRefunds(db.admin, mapRows([refundOf(stonewallInstallment(3))]));
    assert.deepEqual(r.counts, { rows: 1, founding_refunded: 0, donors_refunded: 1, unmatched: 0, errors: 0 });
    assert.equal(db.rows('founding_members')[0].refunded_at, null);
    assert.equal(db.find('donors', (d) => d.founding_member_id != null).refunded_at, null);
    assert.equal(db.find('donors', (d) => d.actblue_contribution_id === '800000003').refunded_at, '2026-05-15T04:00:00.000Z');
  });

  test('a receipt-keyed founding row (older import) is matched by receipt + same payment', async () => {
    const db = createFakeSupabase();
    const seeded = db.seed('founding_members', {
      full_name: 'Test Person', email: 'test1@example.com', amount_cents: 1969, recurrence: 'monthly',
      actblue_contribution_id: 'AB300000101', actblue_receipt_id: 'AB300000101', contributed_at: '2026-04-16T16:10:46.000Z',
    });
    const r = await applyRefunds(db.admin, mapRows([refundOf(stonewallFirst())]));
    assert.deepEqual(r.counts, { rows: 1, founding_refunded: 1, donors_refunded: 1, unmatched: 0, errors: 0 });
    assert.equal(db.find('founding_members', (f) => f.id === seeded.id).refunded_at, '2026-05-15T04:00:00.000Z');
    assert.equal(db.find('donors', (d) => d.founding_member_id === seeded.id).refunded_at, '2026-05-15T04:00:00.000Z');
  });

  test('a refund row without Refund Date falls back to the contribution date', async () => {
    const db = createFakeSupabase();
    await reconcileContributions(db.admin, mapRows([oneTime25()]));
    const r = await applyRefunds(db.admin, mapRows([{ ...oneTime25(), 'Refund ID': '509802082', 'Refund Date': '' }]));
    assert.equal(r.counts.donors_refunded, 1);
    assert.equal(db.rows('donors')[0].refunded_at, '2026-05-09T21:33:08.000Z');
  });

  test('dryRun writes nothing; an empty list is a no-op', async () => {
    const db = createFakeSupabase();
    await reconcileContributions(db.admin, mapRows([stonewallFirst()]));
    const before = db.snapshot();
    const ops = db.ops.length;
    const r = await applyRefunds(db.admin, mapRows([refundOf(stonewallFirst())]), { dryRun: true });
    assert.deepEqual(r.counts, { rows: 1, founding_refunded: 1, donors_refunded: 1, unmatched: 0, errors: 0 });
    assert.deepEqual(db.snapshot(), before);
    assert.equal(db.ops.length, ops);
    assert.deepEqual(await applyRefunds(db.admin, []), { counts: { rows: 0, founding_refunded: 0, donors_refunded: 0, unmatched: 0, errors: 0 }, plan: [], problems: [] });
  });
});

/* =============================================================================
 * applyCancellations
 * ========================================================================== */

describe('applyCancellations', () => {
  test('matched by receipt: a monthly founding row flips to cancelled with recurring_cancelled_at; the fan-out follows', async () => {
    const db = createFakeSupabase();
    await reconcileContributions(db.admin, mapRows([stonewallFirst(), stonewallInstallment(2)]));
    const fm = db.rows('founding_members')[0];

    const r = await applyCancellations(db.admin, mapCancelRows([cancelledRow()]));
    assert.deepEqual(r.counts, { rows: 1, founding_cancelled: 1, donors_cancelled: 0, unmatched: 0, errors: 0 });
    assert.deepEqual(r.plan, [{ action: 'founding_cancel', receipt: 'AB300000101', founding_member_id: fm.id }]);

    const after = db.rows('founding_members')[0];
    assert.equal(after.recurrence, 'cancelled');
    assert.equal(after.recurring_cancelled_at, '2026-06-01T14:00:00.000Z');
    assert.equal(after.refunded_at, null);
    const fan = db.find('donors', (d) => d.founding_member_id === fm.id);
    assert.equal(fan.recurrence, 'cancelled', 'trigger fan-out');
    assert.equal(fan.recurring_cancelled_at, '2026-06-01T14:00:00.000Z');
    // the installment row is not a series head and is left alone
    assert.equal(db.find('donors', (d) => d.actblue_contribution_id === '800000002').recurrence, 'monthly');
    assert.equal(db.rows('founding_members').length, 1);
  });

  test('matched by email fallback when the receipt is unknown', async () => {
    const db = createFakeSupabase();
    await reconcileContributions(db.admin, mapRows([stonewallFirst()]));
    const r = await applyCancellations(db.admin, mapCancelRows([cancelledRow({ 'Receipt ID': 'AB777777777', 'Donor Email': 'Test1@Example.com', 'Cancelled On': '2026-07-04 09:15:00' })]));
    assert.deepEqual(r.counts, { rows: 1, founding_cancelled: 1, donors_cancelled: 0, unmatched: 0, errors: 0 });
    const fm = db.rows('founding_members')[0];
    assert.equal(fm.recurrence, 'cancelled');
    assert.equal(fm.recurring_cancelled_at, '2026-07-04T13:15:00.000Z');
  });

  test('email fallback only reaches monthly rows', async () => {
    const db = createFakeSupabase();
    await reconcileContributions(db.admin, mapRows([stonewallFirst({ 'Recurring Total Months': '', 'Recurring Type': '', 'Recurring Pledged': '1' })]));
    assert.equal(db.rows('founding_members')[0].recurrence, 'one_time');
    const r = await applyCancellations(db.admin, mapCancelRows([cancelledRow({ 'Receipt ID': 'AB777777777' })]));
    assert.deepEqual(r.counts, { rows: 1, founding_cancelled: 0, donors_cancelled: 0, unmatched: 1, errors: 0 });
    assert.deepEqual(r.plan, [{ action: 'cancel_unmatched', receipt: 'AB777777777' }]);
    assert.equal(db.rows('founding_members')[0].recurrence, 'one_time');
  });

  test('a row already cancelled is never touched', async () => {
    const db = createFakeSupabase();
    const seeded = db.seed('founding_members', {
      full_name: 'Test Person', email: 'test1@example.com', amount_cents: 1969, recurrence: 'cancelled',
      recurring_cancelled_at: '2026-05-20T12:00:00.000Z',
      actblue_contribution_id: '700000101', actblue_receipt_id: 'AB300000101', contributed_at: '2026-04-16T16:10:46.000Z',
    });
    const mark = db.ops.length;
    const r = await applyCancellations(db.admin, mapCancelRows([cancelledRow()]));
    assert.deepEqual(r.counts, { rows: 1, founding_cancelled: 0, donors_cancelled: 0, unmatched: 0, errors: 0 });
    assert.deepEqual(r.plan, []);
    assert.deepEqual(db.ops.slice(mark), [], 'no writes at all');
    const fm = db.find('founding_members', (f) => f.id === seeded.id);
    assert.equal(fm.recurrence, 'cancelled');
    assert.equal(fm.recurring_cancelled_at, '2026-05-20T12:00:00.000Z', 'original stamp kept');

    // and running the same cancellation twice stamps once
    const db2 = createFakeSupabase();
    await reconcileContributions(db2.admin, mapRows([stonewallFirst()]));
    await applyCancellations(db2.admin, mapCancelRows([cancelledRow()]));
    const mark2 = db2.ops.length;
    const again = await applyCancellations(db2.admin, mapCancelRows([cancelledRow({ 'Cancelled On': '2026-08-01 00:00:00' })]));
    assert.equal(again.counts.founding_cancelled, 0);
    assert.deepEqual(db2.ops.slice(mark2), []);
    assert.equal(db2.rows('founding_members')[0].recurring_cancelled_at, '2026-06-01T14:00:00.000Z');
  });

  test('a cancelled row missing its stamp gets only the stamp', async () => {
    const db = createFakeSupabase();
    db.seed('founding_members', {
      full_name: 'Test Person', email: 'test1@example.com', amount_cents: 1969, recurrence: 'cancelled', recurring_cancelled_at: null,
      actblue_contribution_id: '700000101', actblue_receipt_id: 'AB300000101', contributed_at: '2026-04-16T16:10:46.000Z',
    });
    const mark = db.ops.length;
    const r = await applyCancellations(db.admin, mapCancelRows([cancelledRow()]));
    assert.equal(r.counts.founding_cancelled, 0);
    assert.equal(r.counts.unmatched, 0);
    const writes = db.ops.slice(mark).filter((o) => !o.trigger);
    assert.deepEqual(writes.map((o) => [o.table, o.fields]), [['founding_members', ['recurring_cancelled_at']]]);
    assert.equal(db.rows('founding_members')[0].recurring_cancelled_at, '2026-06-01T14:00:00.000Z');
  });

  test('a non-founding monthly series is cancelled on its first donors row only', async () => {
    const db = createFakeSupabase();
    const monthly25 = (n) => oneTime25({ ...MONTHLY_FIELDS, 'Receipt ID': `AB5000000${n}`, 'Lineitem ID': `85000000${n}`, 'Recurrence Number': String(n), 'Date': `2026-0${4 + n}-09 17:33:08` });
    await reconcileContributions(db.admin, mapRows([monthly25(1), monthly25(2)]));

    const r = await applyCancellations(db.admin, mapCancelRows([
      cancelledRow({ 'Receipt ID': 'AB50000001', 'Donor Email': 'test2@example.com', 'Recurrence Amount': '25.00' }),
      cancelledRow({ 'Receipt ID': 'AB50000002', 'Donor Email': 'test2@example.com', 'Recurrence Amount': '25.00' }),   // installment receipt: not a series head
    ]));
    assert.deepEqual(r.counts, { rows: 2, founding_cancelled: 0, donors_cancelled: 1, unmatched: 1, errors: 0 });
    const head = db.find('donors', (d) => d.actblue_contribution_id === '850000001');
    assert.equal(head.recurrence, 'cancelled');
    assert.equal(head.recurring_cancelled_at, '2026-06-01T14:00:00.000Z');
    assert.equal(db.find('donors', (d) => d.actblue_contribution_id === '850000002').recurrence, 'monthly');
    assert.equal(db.rows('founding_members').length, 0);
  });

  test('dryRun writes nothing; an empty list is a no-op', async () => {
    const db = createFakeSupabase();
    await reconcileContributions(db.admin, mapRows([stonewallFirst()]));
    const before = db.snapshot();
    const ops = db.ops.length;
    const r = await applyCancellations(db.admin, mapCancelRows([cancelledRow()]), { dryRun: true });
    assert.deepEqual(r.counts, { rows: 1, founding_cancelled: 1, donors_cancelled: 0, unmatched: 0, errors: 0 });
    assert.deepEqual(db.snapshot(), before);
    assert.equal(db.ops.length, ops);
    assert.deepEqual(await applyCancellations(db.admin, []), { counts: { rows: 0, founding_cancelled: 0, donors_cancelled: 0, unmatched: 0, errors: 0 }, plan: [], problems: [] });
  });
});

/* =============================================================================
 * End to end: paid -> refund -> cancel through the same fake
 * ========================================================================== */

describe('end to end', () => {
  test('a monthly founding member who is refunded and then cancels keeps one seat with both stamps', async () => {
    const db = createFakeSupabase();
    const paid = mapRows([stonewallFirst(), stonewallInstallment(2), oneTime25(), eventGift()]);
    const a = await reconcileContributions(db.admin, paid);
    assert.equal(a.counts.errors, 0);

    const refunds = mapRows([{ ...stonewallInstallment(2), 'Refund ID': '509802082', 'Refund Date': '2026-05-18 00:00:00' }]);
    const b = await applyRefunds(db.admin, refunds);
    assert.equal(b.counts.donors_refunded, 1);
    assert.equal(b.counts.founding_refunded, 0);

    const c = await applyCancellations(db.admin, mapCancelRows([cancelledRow()]));
    assert.equal(c.counts.founding_cancelled, 1);

    // and a later re-run of the paid export changes nothing
    const d = await reconcileContributions(db.admin, paid);
    assert.deepEqual(d.counts, { ...ZERO_COUNTS, rows: 4, donors_skipped: 3 });

    assert.equal(db.rows('founding_members').length, 1);
    const fm = db.rows('founding_members')[0];
    assert.equal(fm.recurrence, 'cancelled');
    assert.equal(fm.recurring_cancelled_at, '2026-06-01T14:00:00.000Z');
    assert.equal(fm.refunded_at, null, 'the seat itself was not refunded');
    assert.equal(db.rows('donors').length, 4);
    assert.equal(db.find('donors', (x) => x.actblue_contribution_id === '800000002').refunded_at, '2026-05-18T04:00:00.000Z');
    assert.equal(db.rows('contacts').length, 3);
  });
});
