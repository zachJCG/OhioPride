# Scorecard Clean Reset — 2026-05-27

## What this PR does

Resets the back-end data behind https://ohiopride.org/scorecard so it is a clean 1:1 mirror of the floor votes, committee votes, and sponsorships currently shown on the page. After this lands, `/admin/legislators/` and `/scorecard` are driven by the same canonical evidence, scored by the published methodology, with no legacy noise behind the curtain.

## Files

- `supabase/migrations/20260527000000_scorecard_clean_reset.sql` — the migration
- `scripts/expected-scores-after-reset.csv` — every legislator's expected post-reset subscores, composite, and grade (math simulated in Python against the migration's seed)

## What the migration does, in order

1. Removes the duplicate House district 51 row (Sara P. Carruthers — no longer in office; Jodi Salvo is the current OH-51 representative).
2. Truncates the four scorecard evidence/derived tables:
   - `roll_calls`
   - `legislator_vote_exceptions`
   - `legislator_sponsorships`
   - `score_snapshots`
3. Re-inserts the seven historical/companion bills the scorecard references but the catalog may not carry yet: `hb6`, `hb467-135`, `hb507`, `sb53`, `sb1-135`, `sb34-135`, `hb602-135`. Each gets the correct stance and 135th/136th-GA tag.
4. Re-seeds 30 roll calls. Every floor passage, concurrence, override, and substantive committee report visible on /scorecard, sourced verbatim from the live `/.netlify/functions/scorecard` payload.
5. Re-seeds 15 legislator vote exceptions. Only documented party-line crossovers and recorded absences. Dropped one no-op row (H-1 on `hb249-h-pass` with no notes) that simply duplicated the D party-line default.
6. Re-seeds 50 sponsorships across 26 bills. All primary and co-sponsor attributions visible on the current scorecard.
7. Recomputes every active legislator's subscores via `public.compute_legislator_scorecard()` and writes a fresh `is_current = true` row into `score_snapshots`. Updates `legislators.{floor,committee,sponsorship}_subscore` from those snapshots so `legislator_scorecard` returns coherent values.
8. Sanity-asserts the end state: 99 House + 33 Senate = 132 active legislators, no duplicate districts, no orphan roll-call or sponsorship rows. Migration fails loudly if any of those is wrong.

## Expected end state

| Item                       | Before | After |
| -------------------------- | ------ | ----- |
| Active legislators         | 133    | 132   |
| House active (1–99)        | 100    | 99    |
| Senate active (1–33)       | 33     | 33    |
| Roll calls                 | 30     | 30    |
| Vote exceptions            | 16     | 15    |
| Sponsorships               | 50     | 50    |
| Bills referenced (slugs)   | 28     | 28    |

## Expected grade distribution after publish

| Grade | Count | Examples                                                                 |
| ----- | ----- | ------------------------------------------------------------------------ |
| A+    | 2     | Karen Brownlee (H-28, D), Nickie J. Antonio (S-23, D)                    |
| A     | 13    | Most Ds with at least one tracked sponsorship                            |
| A−    | 28    | Baseline Ds with no sponsorships (party-line votes on the 8 anti-bills + 1 pro-bill) |
| C     | 1     | Jamie Callender (H-57, R) — crossed party line on 5 anti-LGBTQ bills    |
| D     | 1     | Louis W. Blessing, III (S-8, R) — crossed on HB 8 + SB 1                |
| F     | 87    | Republicans on full anti-LGBTQ voting record                             |

Verify against `scripts/expected-scores-after-reset.csv` after the migration runs.

## How to apply

In your local checkout of the repo:

```bash
cp supabase/migrations/20260527000000_scorecard_clean_reset.sql \
   /path/to/OhioPride/supabase/migrations/
cd /path/to/OhioPride
git checkout -b scorecard-clean-reset
git add supabase/migrations/20260527000000_scorecard_clean_reset.sql
git commit -m "Clean reset of scorecard back-end data to 1:1 mirror of /scorecard"
git push -u origin scorecard-clean-reset
# Open PR; CI/Supabase deploy applies the migration on merge.
```

If you run migrations through Supabase CLI locally first:

```bash
supabase db reset                       # or supabase db push, depending on flow
# Then spot-check: composite scores in the legislator_scorecard view should
# match scripts/expected-scores-after-reset.csv to the row.
```

## Why these specific drops

- **Sara P. Carruthers (H-51)** — no longer in office; the active OH-51 representative in the 136th GA is Jodi Salvo. Two rows on one district inflate the roster count and break Top 5 / Bottom 5 ordering when both rank together.
- **H-1 / `hb249-h-pass` exception with no notes** — duplicates the party-line resolver default. The resolver already produces `N` for a D on an anti bill, so this row is dead data. Carrying it forward implies an editorial decision was made when none was; the methodology says only crossovers and recorded absences belong in exceptions.

## Adding new bills going forward

After this lands, the workflow for new evidence is:

1. Insert the bill into `public.bills` (slug, label, ga, stance, etc.) — via `/admin/bills/` or SQL.
2. Insert each `roll_calls` row as it happens — committee report, floor passage, concurrence, override.
3. Insert any `legislator_vote_exceptions` for crossovers — only when a member breaks the party-line default.
4. Insert `legislator_sponsorships` (primary or co) as bills are introduced.
5. From `/admin/legislators/`, click "Publish scorecard" on the affected members (or call `select public.publish_scorecard_all();` to refresh everyone).

The published scorecard at /scorecard refreshes from `/.netlify/functions/scorecard` and will reflect the new evidence within the cache window (5 min default).

## What this does NOT change

- Schema. No table or column adds; everything reuses the structure already in place from migrations `20260424000000_scorecard.sql`, `20260427000002_legislators_and_sponsorships.sql`, and `20260521000000_scorecard_admin_schema.sql`.
- Public-read RLS policies. Anonymous reads on `bills`, `roll_calls`, `legislator_vote_exceptions`, `legislator_sponsorships`, and the `legislator_scorecard` view are unchanged.
- Admin write paths. `/admin/legislators/` continues to write through the same tables.
- The Netlify function `scorecard.mjs` or the scorecard front-end JavaScript. No code changes needed.
