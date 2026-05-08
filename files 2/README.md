# Phase 3 — Multi-Step Volunteer Form

Status: form built and tested end-to-end against a real DOM. 45 of 45 E2E checks pass.
Sends a payload that exactly matches the Phase 1 function whitelist.

---

## What's in this drop

```
phase3/
  volunteer.html            (replaces the Phase 2 version)
  js/
    volunteer-form.js       (new file)
  e2e.test.js               (jsdom-driven E2E test, optional)
```

`volunteer.html` is a full-file replacement, not a patch. The Phase 2 version had a placeholder; this version embeds the actual form.

`volunteer-form.js` is a new file at `/js/volunteer-form.js`. The page already loads it via the script tag added in this drop.

---

## What the form does

A 5-step single-page form, dark-themed, fully responsive, fully keyboard-accessible:

| Step | Title | Required | Optional |
|------|-------|----------|----------|
| 1 | About you | First name, last name, email | Phone, pronouns |
| 2 | Where you live | (none) | City, county (88 dropdown), ZIP, registered voter |
| 3 | How you want to help | (none) | 8 card-style multi-selects |
| 4 | Skills and availability | (none) | 15 skill chips, time commitment, availability, prior campaign experience |
| 5 | Wrap up | (none) | Referral source, founding member flag, free-text notes, email/SMS opt-in |

Behaviors:

- Progress bar fills with the pride gradient (20% → 40% → 60% → 80% → 100%)
- Step counter and percent display side by side
- Continue button validates the current step before advancing
- Step 1 blocks on missing name or email, and on malformed email (clear inline error)
- Step 2 blocks only if a ZIP is entered and isn't 5 digits
- Steps 3-5 always advance (every field is optional)
- Back button restores the previous step's data (state stays in the DOM)
- Pressing Enter in any text input (except textareas) advances the step
- "I have volunteered for a campaign before" reveals a "Which one?" textarea
- Honeypot field (`website`) hidden via CSS off-screen positioning
- On submit: button disables, label changes to "Signing you up...", POSTs to `/.netlify/functions/volunteer-submit`
- On success: form and progress bar hide, success state appears with two CTAs (Founding Member, Scorecard)
- On failure: error banner appears, button re-enables, user can retry
- Focus moves to the new step heading on each transition (screen-reader friendly)
- `<noscript>` fallback shows the email address if JS is disabled

---

## What ships in volunteer.html

The structure of the page is identical to Phase 2 (hero, intro, role grid). What changed:

- `<div id="volunteer-form-container">` now contains the actual form, the progress bar, and the success state instead of the email fallback
- ~250 lines of inline `<style>` for the form-specific UI (dark inputs, card-checkboxes, chip-checkboxes, radio cards, progress bar, success block, error banner)
- One new `<script src="/js/volunteer-form.js" defer></script>` at the bottom

Form values exactly match the Phase 1 function whitelist. Verified: all 8 interest values, all 15 skill values, all 3 availability values, all 4 time-commitment values, all 3 registered-voter values, all 88 county names.

---

## Deploy steps

1. Replace `volunteer.html` at repo root with this drop
2. Add `js/volunteer-form.js` at `/js/volunteer-form.js`
3. Commit + push to `main`
4. Wait for the Netlify build
5. Run the post-deploy verification below

No Supabase or Netlify env changes needed. Phase 1 already wired the backend.

---

## Post-deploy verification

### Quick smoke (60 seconds)

1. Visit `https://www.ohiopride.org/volunteer`
2. Open browser console, watch for errors
3. Click "Continue" without filling Step 1 — should see an error banner
4. Fill Step 1 with a real name and email
5. Click Continue all the way through, leaving everything blank on Steps 2-5
6. Submit
7. Confirm you see the "You are in" success state
8. Check Supabase: `select * from volunteers order by created_at desc limit 1;`
9. Delete the test row

### Full QA (10 minutes)

| Check | Expected |
|---|---|
| Step 1 with empty fields | Error: "We need your first and last name." |
| Step 1 with no email | Error: "We need an email so we can follow up." |
| Step 1 with `not-an-email` | Error: "That email address looks off..." |
| Step 2 with ZIP `abc` | Error: "ZIP should be 5 digits..." |
| Step 2 with valid 5-digit ZIP | Advances to Step 3 |
| Step 3 cards | Click toggles cyan border + light fill |
| Step 4 skill chips | Click toggles cyan border + light fill |
| Step 4 prior-campaign toggle | Reveals "Which one?" textarea |
| Back button on Steps 2-4 | Returns to previous step with data preserved |
| Press Enter in any input on Steps 1-4 | Advances (does not submit) |
| Press Enter in a textarea | Adds a newline (does not submit) |
| Mobile (375px width) | Buttons stack, two-column grids collapse to one |
| Tab through the form | Focus order matches visual order |
| Screen reader on step change | Announces the new step heading |
| Honeypot test (curl with `website: "spam"`) | Returns 200 + `id: "bot_silent"`, no Supabase row |
| Submit with full payload | New row in `volunteers` table |
| Submit then refresh | Form is back to Step 1 (no localStorage caching) |

### Inspect a real submission

```sql
select first_name, last_name, email, county, interests, skills,
       time_commitment, availability, registered_voter, is_founding_member,
       email_optin, sms_optin, created_at
from public.volunteers
order by created_at desc
limit 5;
```

---

## Local testing (optional)

```bash
cd phase3
npm install jsdom
node e2e.test.js
```

Loads the actual HTML, runs the actual JS, walks the form click-by-click, and verifies the POST payload matches what Phase 1 expects. 45 cases, all should pass.

---

## Phase 3 complete when

- [x] Multi-step form renders and walks through all 5 steps
- [x] Validation blocks correctly on Step 1 and Step 2 ZIP
- [x] Form values match Phase 1 function whitelist exactly
- [x] Submit POSTs the correct payload to `/.netlify/functions/volunteer-submit`
- [x] Success state replaces form on success
- [x] Error banner shows on failure
- [x] All 45 E2E checks pass locally
- [ ] Deployed and live at `/volunteer`
- [ ] One real submission landed in Supabase
- [ ] Smoke test passes from a phone

Once those last three are checked, `/volunteer` is live and we are ready for Phase 4 (admin tooling: CSV export of `volunteers_admin`, optional Mailchimp wiring, optional notification email if you change your mind).
