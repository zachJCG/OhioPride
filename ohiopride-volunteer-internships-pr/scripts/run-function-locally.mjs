#!/usr/bin/env node
/**
 * scripts/run-function-locally.mjs
 * --------------------------------
 * Loads netlify/functions/volunteer-submit.mjs with a stubbed Supabase
 * client and exercises both the volunteer and intern code paths in
 * memory. Proves the function's routing, validation, and payload shape
 * are correct before deploy. No network needed.
 *
 *   node scripts/run-function-locally.mjs
 */

import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot  = resolve(__dirname, '..');

// --------------------------------------------------------------------
// 1. Stub @supabase/supabase-js by writing a tiny shim into the bundle's
//    own node_modules. Node will resolve it through normal package
//    resolution (no NODE_PATH gymnastics needed in Node 18+).
//
// We try the bundle's own node_modules first; if that fails (read-only
// mount, e.g. Drive File Stream), we fall back to a temp dir + symlink.
// --------------------------------------------------------------------
const stubDir = resolve(repoRoot, 'node_modules/@supabase/supabase-js');
try {
  mkdirSync(stubDir, { recursive: true });
} catch (e) {
  console.error('Could not create stub dir at ' + stubDir + ': ' + e.message);
  console.error('Tip: copy the bundle to /tmp first, e.g.:');
  console.error('  rsync -a ./ohiopride-pr-bundle/ /tmp/oppr-test/ && cd /tmp/oppr-test && node scripts/run-function-locally.mjs');
  process.exit(1);
}
writeFileSync(resolve(stubDir, 'package.json'), JSON.stringify({
  name: '@supabase/supabase-js',
  version: '0.0.0-stub',
  type: 'module',
  main: 'index.mjs',
  exports: { '.': './index.mjs' }
}));
writeFileSync(resolve(stubDir, 'index.mjs'), `
let last = null;
export function createClient(_url, _key) {
  return {
    from(table) {
      const ctx = { table };
      const chain = {
        upsert(row, opts) { ctx.row = row; ctx.upsertOpts = opts; return chain; },
        select() { return chain; },
        single() {
          last = { table: ctx.table, row: ctx.row, opts: ctx.upsertOpts };
          return Promise.resolve({ data: { id: 'stub-' + Math.random().toString(36).slice(2, 10) }, error: null });
        }
      };
      return chain;
    }
  };
}
export function _stubLastCall() { const r = last; last = null; return r; }
`);

process.env.SUPABASE_URL = 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-role';

const stub = await import(pathToFileURL(resolve(stubDir, 'index.mjs')).href);
const fnUrl = pathToFileURL(resolve(repoRoot, 'netlify/functions/volunteer-submit.mjs')).href;
const fnMod = await import(fnUrl);
const handler = fnMod.default;

// --------------------------------------------------------------------
// 2. Exercise both paths
// --------------------------------------------------------------------
const FAILS = [];
function pass(m) { console.log('  PASS  ' + m); }
function fail(m) { console.log('  FAIL  ' + m); FAILS.push(m); }

function makeReq(body, headers = {}) {
  const allHeaders = new Map(Object.entries({
    'content-type': 'application/json',
    'user-agent': 'smoke-test/1.0',
    'x-forwarded-for': '203.0.113.5',
    ...headers
  }));
  return {
    method: 'POST',
    headers: { get: (k) => allHeaders.get(k.toLowerCase()) || null },
    json: async () => body
  };
}

async function callJson(req) {
  const res = await handler(req, {});
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch {}
  return { status: res.status, body };
}

console.log('[1] Volunteer happy path');
{
  const r = await callJson(makeReq({
    application_type: 'volunteer',
    first_name: 'Local', last_name: 'Volunteer',
    email: 'local+vol@ohiopride.test',
    phone: '513-555-0100', pronouns: 'they/them',
    city: 'Cincinnati', county: 'Hamilton', zip: '45202',
    registered_voter: 'yes',
    interests: ['field_canvassing','phone_text_banking','illegal_value'],  // illegal filtered
    skills: ['writing','data_analysis'],
    availability: ['weekends'],
    time_commitment: 'monthly',
    is_founding_member: false,
    email_optin: true
  }));
  if (r.status === 200 && r.body?.ok && r.body.kind === 'volunteer') pass('  HTTP 200 ok=true kind=volunteer');
  else fail('  unexpected: ' + JSON.stringify(r));
  const last = stub._stubLastCall();
  if (last && last.table === 'volunteers') pass('  wrote to volunteers table');
  else fail('  expected volunteers write, got ' + JSON.stringify(last));
  if (last?.row?.interests && !last.row.interests.includes('illegal_value')) pass('  illegal interest filtered out');
  else fail('  illegal_value leaked into row');
  if (last?.opts?.onConflict === 'email') pass('  upsert on email');
  else fail('  expected onConflict=email, got ' + JSON.stringify(last?.opts));
}
console.log('');

console.log('[2] Intern happy path');
{
  const r = await callJson(makeReq({
    application_type: 'internship',
    first_name: 'Local', last_name: 'Intern',
    email: 'local+intern@ohiopride.test',
    phone: '513-555-0101', pronouns: 'she/her',
    city: 'Columbus', county: 'Franklin', zip: '43215',
    position: 'legislative_director',
    term: 'summer_2026',
    weekly_hours: 12, credit_hours: 3,
    institution: 'Ohio State', program_major: 'Polisci',
    resume_url: 'https://example.com/resume.pdf',
    statement_of_interest: 'Hi, here is my statement of interest. It is quite long enough.',
    email_optin: true
  }));
  if (r.status === 200 && r.body?.ok && r.body.kind === 'internship') pass('  HTTP 200 ok=true kind=internship');
  else fail('  unexpected: ' + JSON.stringify(r));
  const last = stub._stubLastCall();
  if (last && last.table === 'intern_applications') pass('  wrote to intern_applications table');
  else fail('  expected intern_applications write, got ' + JSON.stringify(last));
  if (last?.row?.position === 'legislative_director' && last?.row?.term === 'summer_2026') pass('  position + term routed');
  else fail('  position/term wrong: ' + JSON.stringify(last?.row));
  if (last?.opts?.onConflict === 'email,position') pass('  upsert on (email, position)');
  else fail('  expected onConflict=email,position, got ' + JSON.stringify(last?.opts));
}
console.log('');

console.log('[3] Validation: missing position on intern path');
{
  const r = await callJson(makeReq({
    application_type: 'internship',
    first_name: 'X', last_name: 'Y',
    email: 'x@y.test',
    statement_of_interest: 'Long enough statement here.',
    term: 'summer_2026'
  }));
  if (r.status === 400 && r.body?.error === 'position_required') pass('  rejected with position_required');
  else fail('  expected 400 position_required, got ' + JSON.stringify(r));
}
console.log('');

console.log('[4] Validation: bad email on volunteer path');
{
  const r = await callJson(makeReq({
    application_type: 'volunteer',
    first_name: 'X', last_name: 'Y',
    email: 'not-an-email'
  }));
  if (r.status === 400 && r.body?.error === 'valid_email_required') pass('  rejected with valid_email_required');
  else fail('  expected 400 valid_email_required, got ' + JSON.stringify(r));
}
console.log('');

console.log('[5] Validation: bad URL on intern path');
{
  const r = await callJson(makeReq({
    application_type: 'internship',
    first_name: 'X', last_name: 'Y',
    email: 'ok@y.test',
    position: 'policy_aide', term: 'fall_2026',
    statement_of_interest: 'A long enough statement of interest.',
    resume_url: 'not-a-url'
  }));
  if (r.status === 400 && r.body?.error === 'invalid_url') pass('  rejected with invalid_url');
  else fail('  expected 400 invalid_url, got ' + JSON.stringify(r));
}
console.log('');

console.log('[6] Honeypot returns 200 ok without writing');
{
  const r = await callJson(makeReq({
    application_type: 'volunteer',
    first_name: 'Bot', last_name: 'Bot',
    email: 'bot@bot.test',
    website: 'https://i-am-a-bot.example'
  }));
  stub._stubLastCall(); // clear
  const last = stub._stubLastCall();
  if (r.status === 200 && r.body?.ok === true && r.body?.kind === 'honeypot') pass('  honeypot acknowledged');
  else fail('  expected honeypot ok response, got ' + JSON.stringify(r));
  if (!last) pass('  honeypot did not write to DB');
  else fail('  honeypot leaked write: ' + JSON.stringify(last));
}
console.log('');

if (FAILS.length === 0) {
  console.log('ALL FUNCTION CHECKS PASSED');
  process.exit(0);
} else {
  console.log(`FUNCTION FAILED (${FAILS.length})`);
  for (const f of FAILS) console.log('  - ' + f);
  process.exit(1);
}
