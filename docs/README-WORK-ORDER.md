# Election cycles and deadline enforcement

Delivered 2026-09-09 (v1) and revised 2026-09-10 against the v2 work order,
which supersedes v1. The endorsement application used to be an always-open form
with no idea which election it belonged to. Every application now belongs to a
statewide election cycle and a race level, every cycle has an application
window, and that window is enforced in the database.

Read the v2 section first. The v1 section below it is kept because the schema
it describes is what v2 is a delta on.

---

# v2, 2026-09-10

## The idea v2 corrects

**A cycle is a statewide container, always.** v1 gave `election_cycles` a
`jurisdiction` column and seeded a city-specific cycle into it. That was the
wrong axis. Every contest in Ohio, statewide executive through school board,
hangs off the same three or four Secretary of State dates per year, so the
cycle is keyed to the election date and nothing else. Where a race happens is a
fact about the applicant, and it moved to
`endorsement_applications.jurisdiction` as free text the candidate types.

No city, county, candidate, or race is named in the schema, the seed, or any
UI. The one exception is the rollback script, which has to restore the value v1
stored in order to be a rollback.

## The three window rules

Set by the board on 2026-09-10. They replace the two dates the v2 work order
flagged CONFIRM, and they are rules rather than per-cycle judgment calls, so a
future cycle gets them by default.

| | Rule | Why |
|---|---|---|
| **Open** | 18 months before Election Day | A candidate deciding to run two years out can apply the moment they decide |
| **Close** | when early voting starts | An endorsement that lands after ballots are being cast has spent most of its value |
| **Announce** | not before the filing deadline has passed | Board doctrine: no final action until the field is set |

The stored closing instant is midnight Eastern at the top of the first early
voting day, which makes the day before early voting the last full day to
submit.

"The filing deadline" is not the same column for every cycle. Ohio runs two
petitions: the party petition (declaration of candidacy) 90 days out, and the
independent nominating petition the day before the primary. An independent who
files appears on the **general** ballot, not the primary one. So a general
takes the later of the two and a primary takes the party petition alone. This
is `filingDeadline()` in `lib/election-cycles.mjs`, and it is why the 2027
primary card reads February 3 and not May 3, which is a date after the primary
has been held.

## The three cycles, as seeded and live

All three are published and all three are open, because the 18-month rule puts
every opening date in the past.

| slug | Election Day | Opens | Board review round | Closes | Filing deadline shown |
|---|---|---|---|---|---|
| `2026-general` | Nov 3, 2026 | May 3, 2025 | none | Oct 6, 2026 12:00 AM ET | May 4, 2026 4:00 PM ET |
| `2027-primary` | May 4, 2027 | Nov 4, 2025 | Dec 4, 2026 5:00 PM ET | Apr 6, 2027 12:00 AM ET | Feb 3, 2027 4:00 PM ET |
| `2027-general` | Nov 2, 2027 | May 2, 2026 | Dec 4, 2026 5:00 PM ET | Oct 5, 2027 12:00 AM ET | Aug 4, 2027 4:00 PM ET |

`2027-primary` carries forward to `2027-general`, for the nonpartisan races
that hold no primary. The card says so.

**The December 4, 2026 round is statewide.** It is `early_review_close_at` on
both 2027 cycles, so any candidate in any 2027 race who wants early
consideration submits by then. It is not a gate: the form stays open until the
closing date. This is what preserves the commitment made in writing to the
campaigns that declared early, without a city-scoped cycle to carry it.

## What changed since v1

**Database** (applied live 2026-09-10)

- `election_cycles`: dropped `jurisdiction`; renamed `filing_deadline` to
  `petition_filing_deadline`; added `independent_deadline`,
  `early_review_close_at`, and `carries_forward_to`.
- Two new check constraints: a cycle cannot carry forward to itself, and a
  review round has to fall inside the window it is a round of.
- New enums `race_level` (ten levels) and `ballot_path` (four).
- `requires_descriptive_only(race_level)` is the one definition of which races
  get descriptive-only handling, and `descriptive_only` is a computed column on
  `endorsement_applications` so the admin badge cannot drift from it.
- `endorsement_applications` gained `race_level`, `ballot_path`, and
  `jurisdiction`, plus an index on `(cycle_id, race_level)`.
- `endorsement_office_options` gained `race_level`, which is the prefill.
- Both views rebuilt on the new columns; `admin_election_cycles` gained
  `judicial_count`.
- The city-scoped cycle was **retired, not deleted**: its application moved to
  `2027-general` (a mayoral race is decided on that ballot anyway), and it is
  unpublished and force-closed with a note on the record.

**Public site**

- Cycle cards lead with the next board review round when one is still ahead,
  because an 18-month window makes the cycle's own deadline read as "no hurry"
  when there is a round in eight weeks.
- Cards print the petition filing deadline beside the application deadline.
  They are different dates doing different jobs.
- The carry-forward note appears on a cycle that has one.
- The two standing lines from the work order are below the cycle list: the one
  about not endorsing candidates who have not applied, and the one telling
  candidates to confirm their own filing dates with their county board. That
  second line is how charter variation is handled; there is no per-jurisdiction
  logic anywhere.

**Application form**

- Three new fields: level of race (required, prefilled from the office the
  candidate picked, still editable), jurisdiction (optional free text), and
  which petition they are filing (optional).
- Choosing a judicial level shows the descriptive-only notice before the
  candidate answers anything.
- "District / jurisdiction" is now just "District", since jurisdiction is its
  own field.

**Admin**

- The queue filters by race level rather than the coarser endorsement path, and
  badges judicial applications "Descriptive only" from the computed column.
- Cycle rows show the petition, independent, review-round and carry-forward
  dates, and the review round is editable.

## How to verify it

**The gate is real.** Take a cycle id from the public view. Note
`Prefer: return=minimal`: anon has INSERT but no SELECT, so asking for the row
back fails before RLS is consulted and tells you nothing.

```
curl -s "https://dkdxefzhttkmjhdbkvqn.supabase.co/rest/v1/public_election_cycles?select=slug,id,is_open" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON"

curl -i -X POST "https://dkdxefzhttkmjhdbkvqn.supabase.co/rest/v1/endorsement_applications" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d '{"candidate_name":"Test","office_sought":"Test","email":"t@example.com","attestation":true,"status":"submitted","cycle_id":"<id>"}'
```

Run on 2026-09-10, all against the live database:

| Case | Result |
|---|---|
| Open, published cycle | **201** |
| Same body, cycle force-closed | 401 / 42501 |
| Unpublished, force-closed cycle | 401 / 42501 |
| `cycle_id` that does not exist | 401 / 42501 |
| No `cycle_id` at all | 401 / 42501 |
| Open cycle, `"was_late": true` | 401 / 42501 |

The positive control matters: without it a refusal proves only that the policy
refuses everything. Delete any row a 201 creates.

**Database-level rules**, all verified 2026-09-10 and rolled back:

| Check | Result |
|---|---|
| Override with no note | refused by the DB, not just the form |
| `is_open_override = false` on a date-open cycle | `is_open` false |
| `is_open_override = true` on a date-expired cycle | `is_open` true |
| Review round outside the window | refused |
| Cycle carrying forward to itself | refused |
| `requires_descriptive_only()` | true for both judicial levels, false for the other eight |
| `carries_forward_to` | resolves `2027-primary` to `2027-general` |

**Contrast**, computed against the actual tokens rather than eyeballed. The
closed and upcoming cards recede by dropping the card background, never the
type, which is why the muted state scores higher than the open one:

| | Ratio |
|---|---|
| Open card body text | 6.63:1 |
| Open card values | 14.13:1 |
| Open card state pill | 8.42:1 |
| Closed card body text | 7.05:1 |
| Closed card values | 15.02:1 |
| Standing lines on the page | 7.53:1 |

**Timezone.** Deadlines are stored as instants and rendered in Eastern with the
zone in the string. A machine set to UTC sees the same deadline the database
enforces, because the browser only formats what the database computed.

**Endorsed-candidate list unchanged.** None of `grid.js`, the site's
`shared.js`, `[slug]/page.js`, `lib/endorsements.mjs`,
`lib/endorsement-content.mjs` or `lib/endorsement-race.mjs` were touched, and
`public_endorsements` still returns 19 rows rendering 19 cards.

**Rollback.** `docs/db/rollback/20260910000000_election_cycles_v2_down.sql`,
top to bottom. It drops `race_level`, `ballot_path` and `jurisdiction`, so
export them first; the query is in the file header, along with the exact
statement that puts the retired cycle's application back.

## Decisions this work order did not cover

1. **`race_level` is prefilled from the office catalog, not asked cold.** The
   work order specified an applicant-supplied select. The repo already has an
   office catalog the candidate picks from, and it answers the level for 28 of
   30 offices, so `endorsement_office_options` carries the mapping and the
   select arrives filled in. It stays editable, and once the applicant touches
   it the prefill stops reaching in. Asking someone to classify a race they
   just named is how you get a wrong answer.

2. **`office_sought` was already applicant-supplied and stayed a catalog
   select.** The work order lists it as a text column to add. It exists, it is
   `not null`, and turning it into free text would break the race line, the
   admin, and the office labels on the public profiles.

3. **The city-scoped cycle was retired rather than deleted.** It carries a real
   application and belongs in the record. Deleting the row would have been
   cleaner for "three cycles" and worse for the minutes.

4. **`descriptive_only` is a computed column in SQL.** The alternative was a
   JavaScript list of judicial levels for the admin badge, which is exactly the
   kind of second definition the work order forbids elsewhere.

5. **The race-level filter replaced the endorsement-path filter** in the admin
   queue rather than joining it. Two office filters that compose is a worse
   answer than one authoritative filter.

6. **`election_type` still tolerates `municipal`** so the retired cycle's row
   stays valid. No new cycle may use it: the seed uses only primary, general
   and special.

7. **The work order's branch guidance is stale.** It says the App Router
   migration is in flight on `claude/third-candidate-exclusion-weku57` (PR
   #203). That migration has landed on `main`; the admin and the ported public
   pages are already on the App Router, and this work matches that pattern.

8. **`party` and `committee` from the endorsement page work order have no home
   in the profile template** and were not added. No endorsement page displays
   either.

## Still open, for Zach

**Two things the board should look at.**

- **The 2026 general now closes October 6, 2026 at 12:00 AM ET**, not September
  30. That is the new rule (close when early voting starts) applied literally.
  It is six days later than the v1 date and leaves the board no slack between
  the last application and the first ballot. If you want a working margin, the
  close wants to be a few days before early voting rather than at it.
- **The 2027 primary now closes April 6, 2027**, not February 19. Same rule.
  Board doctrine allows action from February 3, so a candidate applying in
  April would be voted on within a month of the May 4 primary. That is legal
  under the rules as written and tight in practice.

Both are editable from `/admin/endorsements/cycles` without a deploy.

**"Close when early voting starts" was read as the instant early voting
opens**, so the deadline is midnight ET at the top of that day and the previous
day is the last full day to submit. The other reading, that the early voting
day is itself still submittable, would put the deadline at the end of that day.
Say which you meant and it is a one-field change.

**Dates should be re-verified against the county boards before anything is
promoted.** The seeded statutory dates are transcribed from the work order, not
independently confirmed against a county board of elections.

**Out of scope, as instructed and not built:** per-race deadlines inside a
cycle, reminder emails, public display of who has applied, the Preferred tier,
automatic derivation of statutory dates from `election_date`, and anything
touching the scorecard or `/admin/compliance`. `/admin/compliance` was
confirmed untouched by diff.

---

# v1, 2026-09-09

The original delivery. Its schema is what v2 above is a delta on; where the two
disagree, v2 is current.

## What changed

**Database** (applied live, see `docs/db/CHANGES-2026-09-09.md`)

- `public.election_cycles`, one row per election, with the enforced window,
  the Ohio board of elections dates, a three-state override, and a published
  flag.
- `cycle_is_open()` is the only definition of open. The public page, the form,
  the admin, and the insert gate all reach it; nothing recomputes the rule.
- `endorsement_applications` gained `cycle_id` (not null), `submitted_at`, and
  `was_late`.
- The anon INSERT policy now requires a published, open cycle.

**Public site**

- `/endorsements` gained an "Apply for Endorsement" section: one card per
  published cycle, in three states, with the deadline as text in Eastern time.
- The application form offers only open cycles. One open cycle is stated rather
  than put in a menu of one. Zero open cycles removes the form and explains
  why.
- The confirmation page states the election and the date submitted.

**Admin**

- `/admin/endorsements/cycles` lists every cycle with its computed state,
  application count, and days remaining, and edits the close date, the
  override, the note, and whether it is published.
- The endorsements queue filters by election and badges anything accepted late.

## Decisions v1 made that still hold

1. **The insert gate replaces the existing anon policy rather than joining it.**
   The work order specified a second policy. Permissive policies are OR'd, so
   the original ungated policy would have kept letting closed cycles through.

2. **The gate calls a SECURITY DEFINER wrapper** instead of sub-selecting the
   cycles table inline, so enforcement does not depend on anon retaining SELECT
   on `election_cycles`.

3. **`admin_election_cycles` was added.** The public view only carries published
   cycles, so the admin had no way to see the state of an unpublished one
   without recomputing the open rule client side, which the work order
   forbids.

4. **The form derives `election_year` and `is_special_election` from the cycle**
   rather than asking separately. Both columns still feed the race line on the
   admin and the board packet, so they are kept in step rather than dropped.

5. **The application form's year dropdown is gone.** It offered 2026 through
   2030 regardless of whether we were taking applications for any of them.
