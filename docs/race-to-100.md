# Race to 100: 2027 candidate recruitment

Built 2026-10-08 against the `candidate_recruitment_and_target_races_2027`
migration, which was already applied and seeded in production (100 target
races, 25 per tier). This work is UI and API only; no schema change shipped
with it.

## What is where

| Surface | Path | Notes |
|---|---|---|
| Public race list | `app/(site)/2027/races/` | Server rendered from `public_target_races`, revalidates every 5 minutes. Filters live in the query string (`tier`, `region`, `type`, `wave`, `q`). `/2027` redirects here. |
| Recruitment form | `app/(site)/candidate-apply/` | Five steps, autosaved to sessionStorage, `?race=<slug>` pre-selects a race. Posts to `/api/candidate-apply`. |
| Submission API | `lib/functions/candidate-apply.mjs` | zod validation, honeypot, 2 second minimum fill time, service-role insert, contact link, activity row, staff email. |
| Referral API | `lib/functions/admin-candidate-refer.mjs` | "Refer to endorsement process". Server side because `authenticated` has no INSERT policy on `endorsement_applications`. |
| Admin list | `app/(admin)/admin/candidate/page.js` | New first, filters, bulk assign / status / CSV. |
| Admin detail | `app/(admin)/admin/candidate/[id]/page.js` | Application as submitted, status, assignment, mentor match, race, next action, referral, notes, timeline. |
| Race grid | `app/(admin)/admin/candidate/races/page.js` | Scoreboard, inline edit, add race, applicants per race. |
| Vocabulary and helpers | `lib/candidates.mjs` | Tier, status, help, filing wave labels; date formatting; `getTargetRaces()`; JSDoc typedefs for `TargetRace`, `CandidateApplication`, `CandidateActivity`, `HelpNeeded`. |
| Queries | `lib/db/candidates.mjs` | Every query takes a supabase client, so the browser (caller JWT) and the API (service role) share them. `scoreboard()` is pure and feeds both the race grid and the dashboard tile. |
| Counties | `lib/ohio-counties.mjs` | The 88 counties for the form's select. |
| Key dates | `app/(site)/components/KeyDates.js` | Shared by the race list and the form's success screen. |

The repo is JavaScript by decision (`docs/nextjs-migration.md`), so the
`.tsx` / `.ts` names in the work order became `.js` / `.mjs`, and the typed
exports are JSDoc typedefs in `lib/candidates.mjs` rather than generated
TypeScript.

## Rules the code enforces

- **Dates come from the database.** The key dates strip reads
  `election_cycles` (`2027-primary`, `2027-general`) through
  `public_election_cycles`; card filing lines read `target_races.filing_deadline`.
  Filing wave chips are built from whatever dates the data holds, so a new
  deadline appears as a chip on its own. Nothing date-shaped is typed into the
  UI. `tests/candidates.test.mjs` checks this.
- **Copy rules:** "out", never "openly"; "only statewide LGBTQ+ PAC", never
  "first"; no em or en dashes; no "Paid for by" outside the site footer. The
  same test file greps every Race to 100 source file for these.
- **Non-out incumbents are never named on the public page.** The view exposes
  `incumbent_name` for every row; the card only renders it for Protect tier
  rows with `incumbent_is_out`, and search ignores the name otherwise.
- **A race is public only when `is_public AND is_vetted`.** That is the view's
  WHERE clause and the RLS read policy. The race grid shows "Public but not
  vetted" so nobody wonders why a row is missing from the site.
- **Every staff action writes an activity row** (`status_change`,
  `assignment`, `mentor_match`, `referral`, plus manual `note` / `call` /
  `email` / `meeting`). The timeline is the audit trail.
- **Notifications are best effort.** Once the application row exists the API
  answers 200 with its id whatever happens to the contact link, the activity
  row, or the email. Recipients: `zach@ohiopride.org` (override with
  `NOTIFY_CANDIDATE_TO`) plus every active `endorsements_chair` in
  `admin_users`.

## Permissions

`role_permissions` module `candidates`:

| Role | read | write | admin |
|---|---|---|---|
| super_admin, endorsements_chair | yes | yes | yes |
| board_member, volunteer_lead | yes | yes | no |

- read: see the list, detail and race grid, nav item and dashboard tile
- write: change status, assign, match a mentor, set the race, refer, notes
- admin: edit or add target races

RLS on all three tables is `is_admin()`, so the `write` / `admin` split is a
UI gate on top of a database that already refuses non-admins. The referral
endpoint checks `has_permission('candidates', 'write')` under the caller's
JWT before using the service role.

## Deviations from the work order, and why

1. **Referral creates `status = 'submitted'`, not `'draft'`.**
   `endorsement_applications.status` has a CHECK constraint allowing only
   submitted / under_review / endorsed / declined / withdrawn, and
   `submitted_by_kind` allows only candidate / campaign_staff / pac_staff.
   The referral therefore inserts `status = 'submitted'`,
   `is_published = false`, `submitted_by_kind = 'pac_staff'`,
   `attestation = false`, and a `reviewer_notes` line saying it was referred
   from the recruitment application and the questionnaire is incomplete. It
   lands in the Screening Committee queue, which is what a referral is for.
   If a true draft state is wanted, widen the CHECK constraint by migration
   and change one string in `lib/functions/admin-candidate-refer.mjs`.
2. **The nav badge is a small extension to AdminShell.** Nav items can carry
   `badge: '<name>'`; `BADGES` in `AdminShell.js` maps the name to a head
   count query. Only `candidates_new` exists today.
3. **Office type "Other".** The filter chips are Mayor / Council / School
   Board / Township / Judge as specified, plus Other, which only appears when
   a seat fits none of them (city auditor, for example). Without it those
   seats would be reachable only under All.

## Open items for Zach

- **Elected official flag for the mentor typeahead.** There is no single
  field today. The typeahead reads `network_contacts` with tag `elected`,
  `legislator` or `former-elected-official`, sector starting
  `Government / Elected`, or a title naming an office; that finds 6 people
  now. `contacts` has no `elected_official` role yet (the query is in place
  for when it does). The 46 serving officials need either tagging in
  Networking or the follow-up migration the work order describes
  (`contacts.is_elected_official`, `contacts.elected_office`) plus a backfill.
  Freeform mentor names work in the meantime and are badged "Not in CRM".
- **35 races have no confirmed filing date** (`needs_verification = true` on
  45). The public card prints "Filing date to be confirmed" and the footnote;
  `/admin/candidate/races` is where they get cleared.
- Rank 11 (Stow, Kyle Herman) is a founding board member of Ohio Pride
  Action; the existing conflict-of-interest rule applies to any endorsement
  decision there.
- `RESEND_API_KEY` must be set in Vercel for the staff email to send; without
  it the API logs a warning and the application is still saved.

## Checking it

```
npm test                 # includes tests/candidates.test.mjs
npm run check:seo        # /2027/races and /candidate-apply are in APP_ROUTES
npm run build
npm start & node scripts/check-routes.mjs   # asserts both pages and the /2027 redirect
```
