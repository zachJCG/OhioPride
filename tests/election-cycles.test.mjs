/* Unit tests for the application copy that lib/election-cycles.mjs builds
 * from election_cycles rows.
 *
 * Run:  node --test "tests/*.test.mjs"
 *
 * The fixture mirrors the three cycles seeded by
 * supabase/migrations/20260910000100_election_cycles_v2_seed.sql. The strings
 * asserted here are the post-election copy deck word for word: if the seed
 * dates and the deck ever disagree, this is where it shows. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  applicationYear,
  deadlineLines,
  DEADLINE_LINES_FALLBACK,
  filingDeadline,
} from '../lib/election-cycles.mjs';

const et = (local) => new Date(`${local}-04:00`).toISOString(); // EDT wall clock
const est = (local) => new Date(`${local}-05:00`).toISOString(); // EST wall clock

const CYCLES = [
  {
    slug: '2026-general',
    election_type: 'general',
    election_date: '2026-11-03',
    petition_filing_deadline: est('2026-02-04T16:00:00'),
    independent_deadline: et('2026-05-04T16:00:00'),
    is_open: false,
    is_upcoming: false,
  },
  {
    slug: '2027-general',
    election_type: 'general',
    election_date: '2027-11-02',
    petition_filing_deadline: et('2027-08-04T16:00:00'),
    independent_deadline: et('2027-05-03T16:00:00'),
    is_open: true,
    is_upcoming: false,
  },
  {
    slug: '2027-primary',
    election_type: 'primary',
    election_date: '2027-05-04',
    petition_filing_deadline: est('2027-02-03T16:00:00'),
    independent_deadline: et('2027-05-03T16:00:00'),
    is_open: true,
    is_upcoming: false,
  },
];

describe('applicationYear', () => {
  test('is the earliest open election year', () => {
    assert.equal(applicationYear(CYCLES), 2027);
  });
  test('is null when nothing is open', () => {
    assert.equal(applicationYear(CYCLES.map((c) => ({ ...c, is_open: false }))), null);
    assert.equal(applicationYear([]), null);
    assert.equal(applicationYear(undefined), null);
  });
});

describe('deadlineLines', () => {
  test('prints the copy deck lines from the data, primary first', () => {
    assert.deepEqual(deadlineLines(CYCLES), DEADLINE_LINES_FALLBACK);
  });
  test('a primary uses the party petition, a general the later petition', () => {
    const primary = CYCLES.find((c) => c.slug === '2027-primary');
    const general = CYCLES.find((c) => c.slug === '2027-general');
    assert.equal(filingDeadline(primary), primary.petition_filing_deadline);
    assert.equal(filingDeadline(general), general.petition_filing_deadline);
  });
  test('closed cycles and unknown types are left out', () => {
    const lines = deadlineLines([
      ...CYCLES,
      { election_type: 'special', election_date: '2027-08-03', petition_filing_deadline: et('2027-05-05T16:00:00'), is_open: true },
    ]);
    assert.equal(lines.length, 2);
    assert.ok(lines.every((l) => !l.includes('2026')));
  });
  test('never throws on an empty or failed read', () => {
    assert.deepEqual(deadlineLines([]), []);
    assert.deepEqual(deadlineLines(undefined), []);
  });
});
