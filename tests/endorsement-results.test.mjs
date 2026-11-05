/* tests/endorsement-results.test.mjs
 *
 * The badge, the profile line, the group order and the ballot order are the
 * work order's rules (7.4, 7.6 and the phase 3 copy deck). These tests pin
 * them with made-up candidates, not the real 2026 results: results are data,
 * and the data lives in Supabase.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RESULT_GROUPS,
  compareByRace,
  countResults,
  electionDayLabel,
  groupResults,
  lastNameKey,
  raceRank,
  resultBadge,
  resultKey,
  resultLine,
  seatLabel,
} from '../lib/endorsement-results.mjs';

test('badge rule: won and incumbent is Re-elected, won is Elected, lost is Not elected, else pending', () => {
  assert.equal(resultBadge({ result: 'won', incumbent: true }), 'Re-elected');
  assert.equal(resultBadge({ result: 'won', incumbent: false }), 'Elected');
  assert.equal(resultBadge({ result: 'won' }), 'Elected');
  // Incumbency never changes a loss.
  assert.equal(resultBadge({ result: 'lost', incumbent: true }), 'Not elected');
  assert.equal(resultBadge({ result: 'pending' }), 'Result pending');
  assert.equal(resultBadge({ result: null }), 'Result pending');
  assert.equal(resultKey({ result: null }), 'pending');
});

test('profile lines are the copy deck strings, word for word', () => {
  assert.equal(resultLine({ cycle: 2026, result: 'won', incumbent: true }), 'Re-elected November 3, 2026.');
  assert.equal(resultLine({ cycle: 2026, result: 'won', incumbent: false }), 'Elected November 3, 2026.');
  assert.equal(resultLine({ cycle: 2026, result: 'lost' }), 'Endorsed in 2026. Not elected.');
  assert.equal(resultLine({ cycle: 2026, result: 'pending' }), '2026 result pending.');
  assert.equal(resultLine({ cycle: 2026, result: null }), '2026 result pending.');
  assert.equal(resultLine({ cycle: null, result: 'won' }), null);
  for (const r of ['won', 'lost', 'pending']) {
    assert.doesNotMatch(resultLine({ cycle: 2026, result: r }), /[–—]/);
  }
});

test('Election Day is the Tuesday after the first Monday in November', () => {
  assert.equal(electionDayLabel(2026), 'November 3, 2026');
  assert.equal(electionDayLabel(2027), 'November 2, 2027');
  assert.equal(electionDayLabel(2028), 'November 7, 2028'); // Nov 1 is a Wednesday
  assert.equal(electionDayLabel(2022), 'November 8, 2022'); // Nov 1 is a Tuesday: not election day
});

test('groups read Elected, Not elected this cycle, Result pending, and skip empty ones', () => {
  assert.deepEqual(RESULT_GROUPS.map((g) => g.heading), ['Elected.', 'Not elected this cycle.', 'Result pending.']);
  const groups = groupResults([
    { name: 'A Person', result: 'lost' },
    { name: 'B Person', result: 'won' },
  ]);
  assert.deepEqual(groups.map((g) => g.key), ['won', 'lost']);
});

test('ballot order: statewide, senate, house, county, judicial, then last name', () => {
  const rows = [
    { name: 'Judge Zed', race_level: 'judicial_trial', office_sought: 'Court of Common Pleas' },
    { name: 'Aud Itor', race_level: 'county', office_sought: 'County Auditor' },
    { name: 'Rep Young', race_level: 'general_assembly', office_sought: 'Ohio House' },
    { name: 'Rep Adams', race_level: 'general_assembly', office_sought: 'Ohio House of Representatives' },
    { name: 'Sen Ate', race_level: 'general_assembly', office_sought: 'State Senate' },
    { name: 'Treas Urer', race_level: 'statewide_executive', office_sought: 'Ohio State Treasurer' },
  ];
  const order = [...rows].sort(compareByRace).map((r) => r.name);
  assert.deepEqual(order, ['Treas Urer', 'Sen Ate', 'Rep Adams', 'Rep Young', 'Aud Itor', 'Judge Zed']);
  assert.equal(raceRank({ race_level: 'judicial_trial' }), 9);
  assert.equal(raceRank({ race_level: 'municipal' }) < raceRank({ race_level: 'school_board' }), true);
});

test('last names ignore initials and suffixes', () => {
  assert.equal(lastNameKey('J. Noah Spinner'), 'spinner');
  assert.equal(lastNameKey('Pat Doe Jr.'), 'doe');
  assert.equal(lastNameKey('Madonna'), 'madonna');
});

test('seat labels: numbered districts join the office, everything else is the office alone', () => {
  assert.equal(seatLabel({ office: 'Ohio House of Representatives', district: '6' }), 'Ohio House, District 6');
  assert.equal(seatLabel({ office: 'Ohio House', district: 'House District 52' }), 'Ohio House, District 52');
  assert.equal(seatLabel({ office: 'State Senate', district: 'District 3' }), 'Ohio Senate, District 3');
  assert.equal(seatLabel({ office: 'Hamilton County Auditor', district: 'Incumbent' }), 'Hamilton County Auditor');
  assert.equal(seatLabel({ office: 'Ohio State Treasurer', district: '' }), 'Ohio State Treasurer');
});

test('counts come from the rows', () => {
  assert.deepEqual(
    countResults([{ result: 'won' }, { result: 'won' }, { result: 'lost' }, { result: null }]),
    { total: 4, won: 2, lost: 1, pending: 1 },
  );
});
