/**
 * tests/candidates.test.mjs
 * -------------------------
 * The acceptance checks for Race to 100 that can run without a database:
 *
 *   - the copy rules hold across every Race to 100 source file: no em or en
 *     dashes, no "openly", no "first statewide" or "first" as a brand claim,
 *     no "Paid for by" (the site footer carries the disclaimer)
 *   - no date is typed into the UI: the race page, the form and the shared
 *     components contain nothing that looks like a 2027 calendar date
 *   - the helpers in lib/candidates.mjs do what the cards rely on
 *   - lib/db/candidates.mjs scoreboard() counts the way the dashboard says
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  TIER_ORDER, TIER_LABEL, TIER_SECTION, HELP_OPTIONS, HELP_KEYS, STATUS_ORDER,
  officeTypeOf, filingLine, filingWaveOf, shortDate, monthDay, keyDatesFrom, raceSlug,
  applicationRaceLabel, raceOptionLabel,
} from '../lib/candidates.mjs';
import { scoreboard } from '../lib/db/candidates.mjs';
import { OHIO_COUNTIES } from '../lib/ohio-counties.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const FILES = [
  'lib/candidates.mjs',
  'lib/db/candidates.mjs',
  'lib/functions/candidate-apply.mjs',
  'lib/functions/admin-candidate-refer.mjs',
  'app/(site)/2027/races/page.js',
  'app/(site)/2027/races/races-client.js',
  'app/(site)/2027/races/races.css',
  'app/(site)/candidate-apply/page.js',
  'app/(site)/candidate-apply/form.js',
  'app/(site)/candidate-apply/candidate-apply.css',
  'app/(site)/components/KeyDates.js',
  'app/(admin)/admin/candidate/page.js',
  'app/(admin)/admin/candidate/[id]/page.js',
  'app/(admin)/admin/candidate/races/page.js',
  'app/(admin)/admin/candidate/shared.js',
];

const sources = FILES.map((rel) => [rel, readFileSync(join(ROOT, rel), 'utf8')]);

test('no em or en dashes anywhere in Race to 100 copy or code', () => {
  for (const [rel, text] of sources) {
    assert.ok(!/[–—]/.test(text), `${rel} contains an em or en dash`);
  }
});

test('"out", never "openly"; "only", never "first"; no disclaimer', () => {
  for (const [rel, text] of sources) {
    assert.ok(!/\bopenly\b/i.test(text), `${rel} says "openly"`);
    assert.ok(!/first statewide|Ohio's first|the first LGBTQ/i.test(text), `${rel} claims "first"`);
    assert.ok(!/paid for by/i.test(text), `${rel} carries a disclaimer`);
  }
});

test('the identity line is the only-statewide one', () => {
  const page = readFileSync(join(ROOT, 'app/(site)/2027/races/page.js'), 'utf8');
  assert.match(page, /only statewide LGBTQ\+ PAC/);
});

test('no 2027 calendar date is typed into the public UI', () => {
  const ui = sources.filter(([rel]) => rel.startsWith('app/(site)/'));
  for (const [rel, text] of ui) {
    assert.ok(!/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2},? 2027\b/i.test(text), `${rel} hardcodes a 2027 date`);
    assert.ok(!/\b2027-\d{2}-\d{2}\b/.test(text), `${rel} hardcodes a 2027 ISO date`);
  }
});

test('tier vocabulary is complete and uses friendly labels', () => {
  assert.deepEqual(TIER_ORDER, ['protect', 'opportunity', 'pickup', 'pipeline']);
  for (const t of TIER_ORDER) {
    assert.ok(TIER_LABEL[t], `label for ${t}`);
    assert.ok(TIER_SECTION[t]?.title && TIER_SECTION[t]?.intro, `section for ${t}`);
  }
  assert.equal(TIER_LABEL.opportunity, 'Open Seats');
  assert.equal(TIER_LABEL.pickup, 'Competitive');
});

test('help options match the stored keys', () => {
  assert.equal(HELP_OPTIONS.length, 11);
  assert.deepEqual(HELP_KEYS, [
    'petitions', 'filing', 'campaign_plan', 'fundraising', 'messaging', 'compliance',
    'field', 'digital', 'mentor', 'endorsement_process', 'other',
  ]);
  assert.deepEqual(STATUS_ORDER, ['new', 'contacted', 'matched', 'in_program', 'referred_to_endorsement', 'closed']);
});

test('office type is derived from level and office text', () => {
  assert.equal(officeTypeOf({ race_level: 'municipal', office: 'Mayor' }), 'mayor');
  assert.equal(officeTypeOf({ race_level: 'municipal', office: 'Mayor and Council' }), 'mayor');
  assert.equal(officeTypeOf({ race_level: 'municipal', office: 'Council At-Large' }), 'council');
  assert.equal(officeTypeOf({ race_level: 'municipal', office: 'President of Council and Wards 1 to 4' }), 'council');
  assert.equal(officeTypeOf({ race_level: 'municipal', office: 'City Commission' }), 'council');
  assert.equal(officeTypeOf({ race_level: 'school_board', office: 'Board of Education' }), 'school_board');
  assert.equal(officeTypeOf({ race_level: 'township', office: 'Fiscal Officer' }), 'township');
  assert.equal(officeTypeOf({ race_level: 'judicial_trial', office: 'Judge (term begins Jan 1, 2028)' }), 'judge');
  assert.equal(officeTypeOf({ race_level: 'municipal', office: 'City Auditor' }), 'other');
});

test('filing line and wave read the DATE column as a calendar day', () => {
  assert.equal(filingLine({ filing_deadline: '2027-02-03' }), 'File by Feb 3, 2027');
  assert.equal(filingLine({ filing_deadline: '2027-08-04' }), 'File by Aug 4, 2027');
  assert.equal(filingLine({ filing_deadline: null }), 'Filing date to be confirmed');
  assert.equal(filingWaveOf({ filing_deadline: '2027-02-03' }), '2027-02-03');
  assert.equal(filingWaveOf({ filing_deadline: null }), 'tbc');
  assert.equal(monthDay('2027-08-04'), 'August 4');
  // A timestamptz renders in Eastern time: 9 PM UTC on Feb 3 is still Feb 3.
  assert.equal(shortDate('2027-02-03T21:00:00+00:00'), 'Feb 3, 2027');
  // And 1 AM UTC on Feb 4 is still Feb 3 in Ohio.
  assert.equal(shortDate('2027-02-04T01:00:00+00:00'), 'Feb 3, 2027');
});

test('key dates come from the cycles, in order, and drop what is missing', () => {
  const cycles = [
    { slug: '2027-general', election_date: '2027-11-02', petition_filing_deadline: '2027-08-04T20:00:00+00:00' },
    { slug: '2027-primary', election_date: '2027-05-04', petition_filing_deadline: '2027-02-03T21:00:00+00:00' },
    { slug: '2027-columbus-municipal', election_date: '2027-11-02' },
  ];
  const dates = keyDatesFrom(cycles);
  assert.deepEqual(dates.map((d) => d.key), ['primary-filing', 'primary', 'general-filing', 'general']);
  assert.deepEqual(dates.map((d) => shortDate(d.date)), ['Feb 3, 2027', 'May 4, 2027', 'Aug 4, 2027', 'Nov 2, 2027']);
  assert.deepEqual(keyDatesFrom([]), []);
  assert.equal(keyDatesFrom([{ slug: '2027-primary', election_date: '2027-05-04' }]).length, 1);
});

test('race slug and labels', () => {
  assert.equal(raceSlug('Grove City', 'Council Ward 4'), 'grove-city-council-ward-4');
  assert.equal(raceSlug('Franklin County Municipal Court', 'Judge (term begins Jan 2, 2028)'), 'franklin-county-municipal-court-judge-term-begins-jan-2-2028');
  assert.equal(raceOptionLabel({ jurisdiction: 'Akron', office: 'Council Ward 1', filing_deadline: '2027-02-03' }), 'Akron: Council Ward 1 (file by Feb 3, 2027)');
  assert.equal(applicationRaceLabel({ target_race: { jurisdiction: 'Akron', office: 'Council Ward 1' } }), 'Akron: Council Ward 1');
  assert.equal(applicationRaceLabel({ race_other: 'Bexley: Council' }), 'Bexley: Council');
  assert.equal(applicationRaceLabel({ jurisdiction: 'Bexley', office_sought: 'Council' }), 'Bexley: Council');
  assert.equal(applicationRaceLabel({}), 'Race not given');
});

test('scoreboard counts races with a candidate once, and filed / endorsed by recruit status', () => {
  const races = [
    { id: 'a', tier: 'protect', recruit_status: 'open' },
    { id: 'b', tier: 'pickup', recruit_status: 'filed' },
    { id: 'c', tier: 'pickup', recruit_status: 'endorsed' },
    { id: 'd', tier: 'pipeline', recruit_status: 'open' },
  ];
  const apps = [{ target_race_id: 'a' }, { target_race_id: 'a' }, { target_race_id: 'c' }, { target_race_id: null }];
  const s = scoreboard(races, apps);
  assert.equal(s.total, 4);
  assert.equal(s.withApplicant, 2);
  assert.equal(s.filed, 1);
  assert.equal(s.endorsed, 1);
  assert.deepEqual(s.byTier, { protect: 1, pickup: 2, pipeline: 1 });
});

test('all 88 Ohio counties, alphabetical, no duplicates', () => {
  assert.equal(OHIO_COUNTIES.length, 88);
  assert.equal(new Set(OHIO_COUNTIES).size, 88);
  assert.deepEqual([...OHIO_COUNTIES].sort(), OHIO_COUNTIES);
});
