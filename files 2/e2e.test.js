// E2E: Walk the multi-step form in jsdom and verify the payload.
const fs   = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, 'volunteer.html'), 'utf8');
const js   = fs.readFileSync(path.join(__dirname, 'js/volunteer-form.js'), 'utf8');

// Quiet jsdom's "could not load script" noise for the external <script src>s
const vc = new VirtualConsole();
vc.on('error',   () => {});
vc.on('warn',    () => {});
vc.on('jsdomError', () => {});

const dom = new JSDOM(html, { runScripts: 'dangerously', virtualConsole: vc });
const { window } = dom;
const { document } = window;

// jsdom doesn't implement scrollIntoView; stub so the form code can call it freely.
window.HTMLElement.prototype.scrollIntoView = function () {};

// Stub fetch so we capture the payload without hitting the network
let captured = null;
window.fetch = async (url, opts) => {
  captured = { url, body: JSON.parse(opts.body) };
  return {
    ok: true,
    status: 200,
    json: async () => ({ ok: true, id: '00000000-0000-0000-0000-000000000000', mailchimp: { skipped: true } }),
  };
};

// Inject the form JS as a real script so it runs in the jsdom window
const s = document.createElement('script');
s.textContent = js;
document.body.appendChild(s);

// Helpers
const $ = (id) => document.getElementById(id);
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
const setVal = (id, v) => { const e = $(id); e.value = v; e.dispatchEvent(new window.Event('input', { bubbles: true })); };
const checkBox = (selector) => {
  const el = document.querySelector(selector);
  el.checked = true;
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
};
const clickRadio = (selector) => checkBox(selector);

const expectedPct = (n) => Math.round((n / 5) * 100) + '%';

const cases = [];
function check(name, ok, extra) {
  cases.push([name, ok, extra]);
}

(async () => {
  // --- INITIAL STATE ---
  check('initial step is 1',         $('vformProgressText').textContent === 'Step 1 of 5');
  check('initial fill width 20%',    $('vformProgressFill').style.width === '20%');
  check('back btn hidden initially', $('vformBack').hidden === true);
  check('submit btn hidden initially', $('vformSubmit').hidden === true);
  check('success block hidden',      $('vformSuccess').hidden === true);

  // --- STEP 1: try to advance with no data ---
  click($('vformNext'));
  check('blocks advance with empty step 1', $('vformProgressText').textContent === 'Step 1 of 5');
  check('shows error',                       $('vformError').hidden === false);

  // Fill in name only, missing email
  setVal('firstName', 'Zach');
  setVal('lastName',  'Joseph');
  click($('vformNext'));
  check('still blocked without email',       $('vformProgressText').textContent === 'Step 1 of 5');

  // Bad email
  setVal('email', 'not-an-email');
  click($('vformNext'));
  check('still blocked with bad email',      $('vformProgressText').textContent === 'Step 1 of 5');

  // Good email + extras
  setVal('email',    'ZACH@OHIOPRIDE.ORG');
  setVal('phone',    '513-555-0100');
  setVal('pronouns', 'he/him');
  click($('vformNext'));
  check('advances to step 2',                $('vformProgressText').textContent === 'Step 2 of 5');
  check('progress fill at 40%',              $('vformProgressFill').style.width === '40%');
  check('back button now visible',           $('vformBack').hidden === false);

  // --- STEP 2 ---
  setVal('city',   'Cincinnati');
  $('county').value = 'Hamilton';
  setVal('zip',    '45202');
  clickRadio('input[name="registered_voter"][value="yes"]');

  click($('vformNext'));
  check('advances to step 3',                $('vformProgressText').textContent === 'Step 3 of 5');

  // --- STEP 3: pick interests ---
  checkBox('input[name="interests"][value="field_canvassing"]');
  checkBox('input[name="interests"][value="social_amplification"]');
  checkBox('input[name="interests"][value="house_party_host"]');
  click($('vformNext'));
  check('advances to step 4',                $('vformProgressText').textContent === 'Step 4 of 5');

  // --- STEP 4 ---
  checkBox('input[name="skills"][value="writing"]');
  checkBox('input[name="skills"][value="graphic_design"]');
  clickRadio('input[name="time_commitment"][value="weekly"]');
  checkBox('input[name="availability"][value="weekday_evenings"]');
  checkBox('input[name="availability"][value="weekends"]');
  checkBox('#priorCampaign');
  check('prior wrap visible after toggle',   $('priorCampaignWrap').hidden === false);
  setVal('priorCampaignNotes', 'Local council race 2023');
  click($('vformNext'));
  check('advances to step 5',                $('vformProgressText').textContent === 'Step 5 of 5');
  check('progress fill at 100%',             $('vformProgressFill').style.width === '100%');
  check('next btn hidden on step 5',         $('vformNext').hidden === true);
  check('submit btn visible on step 5',      $('vformSubmit').hidden === false);

  // --- STEP 5 ---
  setVal('referralSource',   'Instagram');
  checkBox('input[name="is_founding_member"]');
  setVal('additionalNotes',  'Happy to host a Cincy house party in June.');
  // email_optin starts checked; toggle sms on
  checkBox('input[name="sms_optin"]');

  // SUBMIT
  $('volunteerForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

  // Wait for async fetch to resolve
  await new Promise(r => setTimeout(r, 50));

  // --- VERIFY PAYLOAD ---
  check('fetch was called',              captured !== null);
  check('endpoint correct',              captured && captured.url === '/.netlify/functions/volunteer-submit');

  const p = captured && captured.body;
  if (p) {
    check('first_name',      p.first_name === 'Zach');
    check('last_name',       p.last_name === 'Joseph');
    check('email lowercased',p.email === 'zach@ohiopride.org');
    check('phone',           p.phone === '513-555-0100');
    check('pronouns',        p.pronouns === 'he/him');
    check('city',            p.city === 'Cincinnati');
    check('county',          p.county === 'Hamilton');
    check('zip',             p.zip === '45202');
    check('registered_voter',p.registered_voter === 'yes');
    check('interests array', JSON.stringify(p.interests.sort()) === JSON.stringify(['field_canvassing','house_party_host','social_amplification']));
    check('skills array',    JSON.stringify(p.skills.sort()) === JSON.stringify(['graphic_design','writing']));
    check('availability',    JSON.stringify(p.availability.sort()) === JSON.stringify(['weekday_evenings','weekends']));
    check('time_commitment', p.time_commitment === 'weekly');
    check('prior_campaign_experience', p.prior_campaign_experience === true);
    check('prior_campaign_notes', p.prior_campaign_notes === 'Local council race 2023');
    check('referral_source', p.referral_source === 'Instagram');
    check('is_founding_member', p.is_founding_member === true);
    check('additional_notes', p.additional_notes === 'Happy to host a Cincy house party in June.');
    check('email_optin true', p.email_optin === true);
    check('sms_optin true',   p.sms_optin === true);
    check('honeypot empty',   p.website === '' || p.website === null);
  }

  // After successful submit
  check('form hidden',       $('volunteerForm').hidden === true);
  check('progress hidden',   $('vformProgress').hidden === true);
  check('success shown',     $('vformSuccess').hidden === false);

  // ---- RESULTS ----
  let pass = 0, fail = 0;
  console.log('\n--- E2E test results ---');
  for (const [name, ok] of cases) {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
    ok ? pass++ : fail++;
  }
  console.log(`\n${pass} passed / ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(err => {
  console.error('Test crashed:', err);
  process.exit(2);
});
