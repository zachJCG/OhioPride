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
