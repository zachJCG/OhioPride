#!/usr/bin/env node
/**
 * scripts/validate-shape.mjs
 * --------------------------
 * Offline sanity check that the three layers of the volunteer/intern flow
 * agree on column names and enum values:
 *
 *   1. SQL migrations      (supabase/migrations/2026051000000*_volunteers.sql,
 *                           supabase/migrations/20260511000000_intern_applications.sql)
 *   2. Netlify function    (netlify/functions/volunteer-submit.mjs)
 *   3. Browser form        (volunteer.html, js/volunteer-form.js)
 *
 * No network. No supabase. Just file reads + regex. Run from the repo root:
 *   node scripts/validate-shape.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot  = resolve(__dirname, '..');

function read(rel) {
  const p = resolve(repoRoot, rel);
  if (!existsSync(p)) throw new Error('Missing file: ' + rel);
  return readFileSync(p, 'utf8');
}

const FAILS = [];
const log = {
  pass: (m) => console.log('  PASS  ' + m),
  fail: (m) => { console.log('  FAIL  ' + m); FAILS.push(m); }
};

function assertContainsAll(label, source, needles) {
  const missing = needles.filter(function (n) { return source.indexOf(n) === -1; });
  if (missing.length) log.fail(`${label} missing: ${missing.join(', ')}`);
  else log.pass(label);
}

// ---------------------------------------------------------------------
console.log('[1] SQL migrations exist');
const volSql    = read('supabase/migrations/20260510000000_volunteers.sql');
const internSql = read('supabase/migrations/20260511000000_intern_applications.sql');
const internRoles = read('supabase/migrations/20260511000100_internships_role_permissions.sql');
log.pass('  volunteers migration');
log.pass('  intern_applications migration');
log.pass('  internships role_permissions migration');
console.log('');

// ---------------------------------------------------------------------
console.log('[2] volunteers table covers payload columns');
assertContainsAll('  volunteers SQL has all volunteer columns', volSql, [
  'first_name','last_name','email','phone','pronouns',
  'city','county','zip','registered_voter',
  'interests','skills','availability','time_commitment',
  'prior_campaign_experience','prior_campaign_notes',
  'referral_source','is_founding_member','additional_notes',
  'email_optin','sms_optin','status'
]);
console.log('');

// ---------------------------------------------------------------------
console.log('[3] intern_applications table covers payload columns');
assertContainsAll('  intern SQL has all intern columns', internSql, [
  'first_name','last_name','email','phone','pronouns',
  'city','county','zip',
  'position','term','start_date_pref','weekly_hours','credit_hours',
  'institution','program_major','class_year',
  'faculty_sponsor_name','faculty_sponsor_email',
  'resume_url','portfolio_url','statement_of_interest',
  'prior_experience','why_ohio_pride','referral_source',
  'is_founding_member','email_optin','sms_optin','status'
]);
assertContainsAll('  intern SQL has position enum', internSql, [
  "'chief_of_staff'",
  "'graphics_social_media'",
  "'volunteer_coordinator'",
  "'legislative_director'",
  "'policy_aide'"
]);
assertContainsAll('  intern SQL has term enum', internSql, [
  "'summer_2026'", "'fall_2026'", "'either'"
]);
assertContainsAll('  intern SQL has status enum', internSql, [
  "'new'", "'contacted'", "'interviewing'", "'offered'", "'hired'", "'declined'", "'withdrawn'"
]);
console.log('');

// ---------------------------------------------------------------------
console.log('[4] Netlify function references the right tables and enums');
const fn = read('netlify/functions/volunteer-submit.mjs');
assertContainsAll('  function targets both tables', fn, [
  ".from('volunteers')",
  ".from('intern_applications')"
]);
assertContainsAll('  function honours allowed positions', fn, [
  "'chief_of_staff'", "'graphics_social_media'", "'volunteer_coordinator'",
  "'legislative_director'", "'policy_aide'"
]);
assertContainsAll('  function honours allowed terms', fn, [
  "'summer_2026'","'fall_2026'","'either'"
]);
assertContainsAll('  function returns kind discriminator', fn, [
  "kind: 'volunteer'", "kind: 'internship'"
]);
console.log('');

// ---------------------------------------------------------------------
console.log('[5] Browser form posts the expected payload');
const html = read('volunteer.html');
const js   = read('js/volunteer-form.js');

assertContainsAll('  HTML has tab toggles', html, [
  'data-path="volunteer"','data-path="internship"'
]);
assertContainsAll('  HTML has submit only at end', html, [
  'class="btn btn-primary vform-submit" id="vformSubmit" hidden'
]);
assertContainsAll('  HTML has step 5 paths', html, [
  'data-step="5" data-path="volunteer"',
  'data-step="5" data-path="internship"'
]);
assertContainsAll('  HTML has internships section anchor', html, [
  'id="internships"', 'id="internGrid"'
]);
assertContainsAll('  JS posts to right endpoint', js, [
  "'/.netlify/functions/volunteer-submit'"
]);
assertContainsAll('  JS branches by application_type', js, [
  "application_type: 'volunteer'",
  "application_type: 'internship'"
]);
assertContainsAll('  JS exposes setPath()', js, [
  'window.VolunteerForm', "setPath: setPath"
]);
assertContainsAll('  JS hides submit until 100%', js, [
  'submitBtn.hidden = !atFinish'
]);
console.log('');

// ---------------------------------------------------------------------
console.log('[6] Admin pages exist and use the shell');
const adminVol    = read('admin/volunteers/index.html');
const adminIntern = read('admin/internships/index.html');
const adminDonors = read('admin/donors/index.html');
const shellJs     = read('admin/admin-shell.js');

assertContainsAll('  /admin/volunteers reads from volunteers',  adminVol,    [".from('volunteers')"]);
assertContainsAll('  /admin/internships reads from intern_applications', adminIntern, [".from('intern_applications')"]);
assertContainsAll('  /admin/donors reads from founding_members', adminDonors, [".from('founding_members')"]);
assertContainsAll('  All three use admin-shell',                  adminVol + adminIntern + adminDonors, [
  '<script src="/admin/admin-shell.js"></script>'
]);
assertContainsAll('  Shell nav has internships entry', shellJs, [
  "id: 'internships'", "icon: 'briefcase'"
]);
console.log('');

// ---------------------------------------------------------------------
if (FAILS.length === 0) {
  console.log('ALL SHAPE CHECKS PASSED');
  process.exit(0);
} else {
  console.log(`SHAPE FAILED (${FAILS.length})`);
  for (const f of FAILS) console.log('  - ' + f);
  process.exit(1);
}
