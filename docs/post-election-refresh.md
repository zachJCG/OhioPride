# Post-election site refresh (November 2026)

The 2026 cycle is over. The site is being simplified around three jobs, one
pull request per phase, in this order:

| Phase | Branch | Job |
|---|---|---|
| 1 | `post-election/p1-apply` | Get 2027 candidates to apply. One front door, reopened. |
| 2 | `post-election/p2-clear-fund` | Archive 2026 in place; Giving Tuesday and year-end fundraising. |
| 3 | `post-election/p3-celebrate` | Celebrate the winners; archive the 2026 endorsements. |
| 4 | `post-election/p4-design` | Design refresh across both templates. |

This file is the running record of what each phase changed and why, in the
places the next person will need it. The decisions that are not open
(archive in place, one candidate front door, results are data, no URL moves,
no data deleted) are listed in the work order and are not restated here.

---

## Phase 1: open 2027 applications (2026-11-05)

### Database

Migration `20261105000000_post_election_cycle_results_publish_guard.sql`,
applied live on 2026-11-05. All additive.

**Adjusted to the real schema.** The work order sketched `cycle smallint`
and a bare `incumbent` column. This schema already files every application
under an election (`cycle_id`, NOT NULL, references `election_cycles`) and
already has `is_incumbent`. So:

- `cycle` was added as a stored year, but it is **derived**: the trigger
  `trg_endorsement_fill_cycle` fills it from the election's date when a write
  leaves it null. Backfilled from `cycle_id` for every row (20 endorsees and
  the rest of 2026 under 2026; the three 2027 applications already on file
  under 2027). `election_year` stays because the admin race line and the
  board packet read it; the form writes both.
- `result` (`won` | `lost` | `pending` | null), `result_note`, and
  `result_updated_at`, which `trg_endorsement_stamp_result` stamps whenever
  result or note changes. Every 2026 endorsee is `pending` until phase 3 seeds
  the confirmed results.
- The publish guard. `is_published` now **defaults to false** (it defaulted to
  true, so a fresh submission arrived "published" and only the view's status
  filter kept it off the site), and `endorsement_published_requires_endorsed`
  refuses `is_published = true` on any status but endorsed. Three rows the
  view was already hiding were flipped to false: Shannon G. Hardin
  (submitted, 2027), "TEST Do Not Vote" (submitted, 2026), and the
  "ZZTEST ... DeleteMe" row (submitted, 2027). Nothing public changed.
- `help_requested text[]` and `help_requested_note` for the optional "Want
  help with your campaign?" question. A real column rather than a key in
  `responses`, because `responses` is the questionnaire the committee scores.
- `endorsement_office_options.quick_pick` and `quick_label`: which offices the
  form shows as the step 1 cards and what they are called. A new
  "Township Fiscal Officer" row joined the local catalog. Changing the slate
  for 2028 is an UPDATE, not a deploy.
- `public_endorsements` gained `cycle`, `result`, `result_note` at the end of
  its select list. Same grants, same filter.

The phase 3 `incumbent` column will be the existing `is_incumbent`, tightened
to NOT NULL DEFAULT false, and appended to the view the same way.

### The form (`/endorsement/screening`)

Both 2027 cycles were already open in the database (the 18-month rule), so
the "Applications are closed right now." panel was not showing. What changed
is what shows when the form IS open:

- **Open-state copy above the form**, word for word from the copy deck. The
  year and the two petition deadline lines are built from
  `public_election_cycles` (`applicationYear()` and `deadlineLines()` in
  `lib/election-cycles.mjs`; the form carries the same template inline since
  it is static HTML). The literal strings in the markup are the fallback for a
  failed read and are what the live data renders. `tests/election-cycles.test.mjs`
  pins the two together.
- **Step 1 quick picks.** "What are you running for?" now leads with Mayor;
  City or village council; Township trustee or fiscal officer; Board of
  education; Municipal court judge; Special election; Something else. The
  five office cards come from the catalog's `quick_pick` rows and prefill the
  office on step 2 (still editable). "Special election" and "Something else"
  reveal the four office-type cards, so every office in the catalog remains
  reachable. The work order listed "Special election" under both questions;
  here it presets "Which election?" rather than standing in for an office.
- **"Which election?"** replaced the "Election" select. Options are the open
  cycles as "May 4, 2027 primary" and "November 2, 2027 general" (from the
  data), plus "Special election", which reveals an optional date. A special
  election is filed under the next open cycle on or after its date (or the
  soonest open cycle while the date is unset) so the insert policy's window
  check still applies; `is_special_election` is set, `election_year` and
  `cycle` take the special date's year, and the date itself rides in
  `responses.special_election_date` so the admin shows it.
- **"Want help with your campaign?"** on step 4, optional, five boxes, with a
  free line when "Something else" is ticked. Shown on the admin candidate
  page as "Wants help with" and in the staff email.
- New submissions insert with `is_published = false` stated explicitly and
  `cycle` set to the election year; the trigger would fill `cycle` anyway.
- The judicial neutrality note, the notify hop (`/api/endorsement-notify`)
  and `return=minimal` are unchanged.

### Elsewhere

- `/apply` is a real **301** to `/endorsement/screening` (statusCode, not
  `permanent`, which Next sends as a 308). `/apply/:position` stays a rewrite
  to the internship form. `scripts/check-routes.mjs` asserts both.
- `/endorsements` "Which elections we are taking applications for." carries
  the 2027 copy, the same deadline lines and calendar link, and an
  "Apply for endorsement" button to `/apply`. The cycle cards stay.
- Admin: trying to publish a non-endorsed application says
  **"Endorse before publishing."** (both before the write and if the database
  refuses it), and leaving the endorsed status unpublishes in the same patch
  so the reopen path cannot trip the constraint.
- `lib/seo.mjs`: the form's description now says 2027 municipal, township,
  school board, and special elections.

### Review fixes, same day (`20261105010000_post_election_phase1_review_fixes.sql`)

- **Views are read surfaces.** Supabase's default privileges gave anon and
  authenticated INSERT/UPDATE/DELETE on every view, and eleven views in this
  schema are auto-updatable and owner-privileged, so the public anon key
  could have edited or deleted an endorsed candidate's application through
  `public_endorsements`. DML is revoked on every view in `public`; SELECT is
  unchanged. No application code writes through a view. When a new view is
  created, revoke DML on it in the same migration.
- **Leaving endorsed** now clears `is_published`, `result` and `result_note`
  in the status trigger, so a plain `set status = 'withdrawn'` no longer
  trips the publish guard and a declined candidate cannot keep a result.
- **`cycle` follows a change of election** (`cycle_id`) or a staff
  correction of `election_year`.
- **The anon insert policy pins** `is_published`, `result`, `result_note`
  and `result_updated_at`.
- Form: load errors land in the visible grid; a declined office switch
  leaves the quick pick alone; a restored draft re-derives the help note and
  special election fields; the deadline list is always rebuilt from the
  data; a special election dated after every open election files under the
  latest one; the three-column card rule applies on desktop.
- `/endorsements`: the literal 2027 copy renders only when the cycles could
  not be read. A successful read with nothing open says so.
- Admin: the Endorse confirm no longer promises publication; publishing is
  the tick below it.

---

## Phase 2: clear, archive, fundraise (2026-11-05)

### Archive in place

- **One list.** `lib/archived-paths.mjs` exports `ARCHIVED_PATHS` (the
  governor guide and its other-candidates page, `/vote`, `/dragoutthevote`,
  `/pride`, `/pride/signup`, `/volunteer/events`). It imports nothing, so
  `next.config.mjs`, `lib/seo.mjs` and a client component can all read it.
- **Three things derive from it.** `headers()` in `next.config.mjs` sends
  `X-Robots-Tag: noindex, follow` for each path; `allStaticPages()` in
  `lib/seo.mjs` marks each registry entry `noindex` and `archived`, which is
  what drops it from the sitemap and writes the robots meta; and
  `scripts/build-seo.mjs` writes a `<meta name="ohp-archived" content="true">`
  marker that `public/js/site-template.js` reads to render the banner under
  the nav (or at the top of the body on `/dragoutthevote`, which mounts only
  the footer). `app/(site)/components/ArchiveBanner.js` renders the same
  markup for any ported route from the list directly. `npm run check:seo`
  fails if a listed path is not a registry page or lacks the marker.
- **Body copy on archived pages is frozen** and they are exempt from the dash
  sweep. The only in-page edit is `/pride/signup`, whose form is gone: the
  closed note from the copy deck points at `/signup`. The endpoint it posted
  to, `/api/pride-volunteer-submit`, was shared with no live page, and its
  table is untouched.
- `/pride-hour` and `/sunday-funday` (and their `.html` spellings) are real
  301s to `/events` now; `check:routes` asserts 301.

### `/archive`, `/events`, nav

- `/archive` is a new App Router page (`app/(site)/archive/`), registered in
  `APP_ROUTES`. Three groups from the work order; the "2026 endorsements"
  group is behind `SHOW_ENDORSEMENTS_2026 = false` until phase 3 ships
  `/endorsements/2026`. The two 2026 Pride Hours (flyers under
  `public/assets/img/events/`) live there as past events.
- `/events` is the copy deck's empty state plus the host block, and links to
  `/archive` for past events.
- **Primary nav is five items**: Endorsements, Apply (`/apply`, lit on the
  form it lands on through `data-ohp-active` / `activeFor`), Scorecard,
  About, Donate. The Info dropdown is gone from both templates; its CSS
  stays for phase 4 to tidy. **Footer**: Issues, Founding Members,
  Volunteer, Elected Resources, Board; Connect, Contact, Archive; Brand,
  Privacy, Terms, Credits, Admin; plus Leadership and the disclaimer, which
  is unchanged. The expired governor guide promo (`guide-popup.js`) is
  deleted with both loaders.

### Home, donate, copy

- Home: the governor band (with its countdown JS and CSS), "Four jobs. One
  mission." and the scorecard teaser are gone; the apply block from the copy
  deck sits above the slate, and the donate block carries the new body and a
  direct ActBlue link with `website_home_donate`. The slate grid stays until
  phase 3; its CTA goes to `/apply`.
- `/donate`: the copy deck intro under the H1 and a founding member meter
  (the shared `.goal-block` fed by `OhioPride.loadProgress`, so it is the
  same request the home page makes). `/donate/founding-member`: the 2026
  line is now "Today, we are building political power that lasts."
- `/about`: "only statewide", every `&mdash;` rewritten, and the critical
  moment section drops the 2026 election pitch for the copy deck line plus a
  link to `/endorsements`. `/scorecard` and `/issues` carry a
  "136th General Assembly (2025 to 2026)" label. `/volunteer` drops the
  Summer and Fall 2026 block and the 2026 term labels (the radio values are
  pinned by the `intern_applications` CHECK constraint, so only labels
  changed). `/elected-resources` ends with the apply CTA.
- Endorsements: the "Donate to the Campaign" button and the five `donate`
  URLs in `lib/endorsement-content.mjs` are gone. No early-voting or
  Election Day CTA existed on those pages. "Why we endorsed" and the pull
  quotes stay.
- Brand v2.2: "Build the bench" replaces the 2026 urgency pillar, the
  governor's race line is removed from `/brand` and `brand.json`, the
  caption example is the 2027 application one, and `npm run brand:build`
  rebuilt the kit with the new version string.
- Dash sweep: every live page, the shared templates, `lib/seo.mjs` (the
  default image alt, the contact and events descriptions, the bill
  description template) and the generator's own marker comment. Archived
  pages keep theirs.

### Fundraising banners and sync

- `public/js/season-banners.js`: Giving Tuesday (Dec 1, 2026) and year end
  (Dec 26 to 31, 2026), America/New_York written as fixed `-05:00` offsets,
  dismissible per browser session, loaded by both templates and skipped on
  donate, admin and the application form. `tests/season-banners.test.mjs`
  pins the windows with a mocked clock and the copy deck strings. Styles are
  shared with the archive banner in `site-template.css`.
- Refcodes: `website_home_donate`, `website_givingtuesday_2026`,
  `website_yearend_2026`. Every existing `website_donate_*` and
  `website_founding_*` link is untouched.
- ActBlue sync: the hourly sync already ingests every paid contribution
  regardless of refcode (refcode only decides whether a founding seat is
  minted), so no code change was needed for the new refcodes. One fix:
  `lib/actblue.mjs` now recognises ActBlue's custom report header
  "Order Number" as the receipt column. The sync still needs
  `ACTBLUE_CLIENT_UUID`, `ACTBLUE_CLIENT_SECRET` and `CRON_SECRET` set in
  Vercel, which they are not as of 2026-11-05.
- Analytics was already on both templates (`/js/vercel-insights.js` and
  `<Analytics />`); nothing to add beyond enabling it in the dashboard.

### Phase 2 review fixes (same day)

An adversarial review of the phase 2 diff (six lenses, three skeptics per
finding) and a separate verification of the dash sweep turned up these,
all fixed before merge:

- **`/volunteer` internships came off the page, not just the year.** The
  work order removes the Summer and Fall 2026 positions block and the 2026
  position options in the form. The positions section, the "Intern or
  Fellow" tab and its three form steps are gone, and `intern-positions.js`
  with them. The term radios had to go too: their values are pinned to
  `summer_2026` / `fall_2026` by the `intern_applications` CHECK constraint,
  so relabelling them would have filed 2027 applicants under 2026.
  `?path=internship` and `/internships` now land on the volunteer form
  (`setPath` refuses a path whose steps are not on the page). The endpoint
  and `intern_applications` are untouched; bringing the program back is
  restoring the markup from git history and a migration for new terms.
- `/api/pride-volunteer-submit` answers **410** for new posts; the table
  stays. `/volunteer` no longer links to the archived run of show as
  "Upcoming". The two run-of-show pages joined `ARCHIVED_PATHS`.
- Season banners remove themselves at the end of their window and check
  again when the next opens; focus moves to the page on dismiss; the CTA
  focus ring is navy; the first banner under the nav clears the pride
  stripe. The banner test no longer reads the real clock (it would have
  crashed on December 1).
- The `/donate` meter starts empty, writes "{count} of 1,969 founding
  members" from the live count, and stays hidden if the count cannot be
  read. No fill is hard coded.
- Seven endorsee profiles ended with "Volunteer with Ohio Pride in District
  N"; they now end with "Read all endorsements" like the rest.
- The 22 bill pages built from `bill-data.js` carry the 136th General
  Assembly label under the bill number (the three hand-written ones and the
  enacted archive already said so).
- `/Sunday-Funday` is a 301 in `vercel.json` (`statusCode`), `/archive` has
  the site share card, the `/events` description fits, and
  `tests/actblue.test.mjs` pins the "Order Number" receipt alias (used only
  when there is no "Receipt ID" column; exact header match).
- `scripts/check-routes.mjs` now asserts the phase 2 acceptance items: the
  noindex header and archived marker on every archived path, `/archive`,
  the `/events` empty state, `/pride/signup` without a form, the 410, and
  the `/donate` meter.

**Pre-existing, not changed here:** `/scorecard` loads `/js/share.js`,
which has never been in the repo (the page falls back on its own slug
builder). The admin pages still contain em dashes; they are internal and
outside the live-page sweep.

---

## Phase 3: celebrate winners, archive the 2026 endorsements (2026-11-05)

### Database (`20261105020000_post_election_phase3_results.sql`)

- **`incumbent` is a new admin-only column**, as the work order specified,
  not a reuse of `is_incumbent`. `is_incumbent` is the questionnaire answer
  to "Are you a current or former officeholder?": nullable, filled by the
  public form, and read by the incumbent-only questions, the admin badges and
  the board packet. A school board member who wins a council seat is an
  officeholder but did not hold that seat, so one column cannot drive both.
  `incumbent` means "held this seat going in" and only the admin sets it.
- `result_updated_at` is stamped on a change to `incumbent` as well (it
  flips the public badge). Leaving endorsed clears it with the result. The
  anon insert policy pins it. A new check, `endorsement_result_requires_endorsed`,
  keeps a result or incumbency off any row that is not endorsed.
- **Seed (7.1):** 13 won, 4 of them incumbents (Cockley, Miranda,
  Brownlee, Keith), 7 lost. Rows are matched on id AND on the editorial
  name key the profile slug resolves through, and the migration aborts
  without writing if the counts are not exactly 20 / 13 / 4 / 7. A fresh
  database with no 2026 endorsees skips the seed.
- `public_endorsements` gains `incumbent` and `race_level` at the end
  (CREATE OR REPLACE keeps the grants; DML stays revoked).
- **Deploy order:** the migration must be applied before this code ships.
  The read path selects `incumbent` and `race_level`; without them the view
  answers 400 and every endorsement page shows its error state.

### One set of rules

`lib/endorsement-results.mjs` (import-free, tested) owns the badge
(Re-elected / Elected / Not elected / Result pending), the profile line,
the three groups, ballot order (statewide, senate, house, county, judicial,
then last name), seat labels and counts. `getEndorsementResults(cycle)` in
`lib/endorsements.mjs` is the single source for `/endorsements`,
`/endorsements/2026` and `/api/endorsement-results`, so no two surfaces can
count differently. No result, count or name is written anywhere in code.

### Pages

- `/endorsements/2026` (new): copy deck H1, intro with `{total}` and `{won}`
  from data, the three groups, portrait cards with the badge and "View
  profile", the 2027 apply CTA. Share card from `npm run og:build`
  (`scripts/build-og-cards.mjs`, text only, official wordmark).
- `/endorsements`: "Elected with Ohio Pride." winners wall under the hero
  and "See 2026 results"; the grid lists the current cycle only, so the 2026
  slate lives on the results page. Old `#slug` links still redirect.
- Profiles: the copy deck result line under the name, "All 2026
  endorsements" back link, "Ran against" once a race is decided, and the
  closing CTA points at the results page.
- Admin: an Election result card on the endorsement record (Not set,
  Result pending, Elected, Not elected; Incumbent in this seat; a public
  note), explicit save, logged, gated on `endorsements:write`. The
  questionnaire badge now reads "Officeholder" and says nothing when the
  question was not answered.
- Home: the winners hero replaces the evergreen hero only when a 2026 race
  is won; no JavaScript, a failed request, or no winners all leave the
  evergreen hero. The 2026 slate grid and the stats band are gone; the
  evergreen strip sits at the bottom in winners mode.
- `/archive` lists the 2026 endorsements group; `llms.txt` is the copy deck
  site list; the sitemap carries `/endorsements/2026` once.

### Checks

`check:seo` asserts every registered share card exists at 1200x630.
`check:routes` checks the results API contract and then every profile line,
the `/endorsements/2026` and `/endorsements` counts, and the sitemap against
the API's own data, never against names or numbers written in the check.

### Not changed, for Zach

- The deck's "{won} candidates" has no singular; one winner would read
  "1 candidates".
- Job Perry displays as "Job Esau Perry", as filed; the 7.1 table spells it
  "Job Perry". Adding `name: 'Job Perry'` to his editorial entry changes it.
- Endorsee profile copy is still written in the campaign's future tense.
