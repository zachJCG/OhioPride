# Election cycles and deadline enforcement

Delivered 2026-09-09 against the work order of the same date. The endorsement
application used to be an always-open form with no idea which election it
belonged to. Every application now belongs to an election cycle, every cycle
has an application window, and that window is enforced in the database.

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

## How to verify it

Nothing below needs a deploy or an admin login except where it says so.

**The gate is real.** A direct POST with a closed cycle must be refused. Take a
cycle id from the public view, and note `Prefer: return=minimal`: anon has
INSERT but no SELECT, so asking for the row back fails before RLS is consulted
and tells you nothing.

```
curl -s "https://dkdxefzhttkmjhdbkvqn.supabase.co/rest/v1/public_election_cycles?select=slug,id,is_open" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON"

curl -i -X POST "https://dkdxefzhttkmjhdbkvqn.supabase.co/rest/v1/endorsement_applications" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d '{"candidate_name":"Test","office_sought":"Test","email":"t@example.com","status":"submitted","cycle_id":"<a closed cycle>"}'
```

An open cycle returns 201. A closed one, an unpublished one, a missing
`cycle_id`, or `"was_late": true` all return 42501. Delete any row a 201
created.

**The override works both ways.** In `/admin/endorsements/cycles`, set a
date-expired cycle to "Force open" with a note: it starts accepting
applications. Set a date-open cycle to "Force closed": it stops. Saving an
override with an empty note is refused, by the database as well as the form.

**The page reads correctly.** `/endorsements` shows the four seeded cycles. As
of delivery: 2026 General and 2027 Columbus Municipal open, 2027 Primary and
2027 General not open yet. The endorsed candidate list above it is unchanged.

**Timezone.** Deadlines are stored as instants and rendered in Eastern with the
zone in the string. A machine set to UTC sees the same 5:00 PM ET deadline the
database enforces, because the browser only formats what the database computed.

**Rollback.** `docs/db/rollback/20260909000000_election_cycles_down.sql`, top to
bottom. It has been run end to end in a transaction. It drops `cycle_id` and
`was_late`, so export any late acceptances first; the query is in the file
header.

## Decisions this work order did not cover

1. **The insert gate replaces the existing anon policy rather than joining it.**
   The work order specified a second policy. Permissive policies are OR'd, so
   the original ungated policy would have kept letting closed cycles through.

2. **The gate calls a SECURITY DEFINER wrapper** instead of sub-selecting the
   cycles table inline, so enforcement does not depend on anon retaining SELECT
   on `election_cycles`.

3. **The backfill is not blanket.** The work order said to put every existing
   row on `2026-general`. Two are 2027 races, one of them the Columbus mayoral
   application whose December 4 deadline is the committed one. Rows were
   matched to the election they are actually for.

4. **`admin_election_cycles` was added.** The public view only carries published
   cycles, so the admin had no way to see the state of an unpublished one
   without recomputing the open rule client side, which the work order
   forbids.

5. **The form derives `election_year` and `is_special_election` from the cycle**
   rather than asking separately. Both columns still feed the race line on the
   admin and the board packet, so they are kept in step rather than dropped.

6. **The application form's year dropdown is gone.** It offered 2026 through
   2030 regardless of whether we were taking applications for any of them.

## Still open, for Zach

**Two application windows are policy calls, not statute.** They are seeded and
live, and editable from the admin without a deploy:

- **2026 General closes September 30, 2026 at 5:00 PM ET.** In-person absentee
  opens October 6, so an endorsement after that lands while ballots are being
  cast. This leaves the Board about a week.
- **2027 Primary closes February 19, 2027 at 5:00 PM ET.** Board doctrine is no
  final action before the February 3 filing deadline, so this gives the Board
  all of March, ahead of early voting on April 6.

The Columbus municipal window of December 4, 2026 is committed in writing and
was seeded exactly as specified.

**Dates should be re-verified against the county boards before anything is
promoted.** The work order's own sources say charter municipalities vary. The
seeded dates are transcribed from the work order, not independently confirmed
against Franklin, Cuyahoga, or Summit county boards.

**Out of scope, as instructed and not built:** per-race deadlines inside a
cycle (a `cycle_races` table would be needed), reminder emails, public display
of who has applied, the Preferred tier, and anything touching the scorecard or
`/admin/compliance`.
