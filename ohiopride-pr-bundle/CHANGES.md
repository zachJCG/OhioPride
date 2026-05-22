# Ohio Pride PAC — Post-Launch Update Bundle
**Date:** 2026-05-22
**Author:** Zach (via Claude)

## TL;DR
1. Seed Jeff Givan (OH House District 78) into the existing endorsement system so he appears on `/endorsements`.
2. Swap the launch-day countdown on the homepage for an endorsement spotlight + volunteer CTA.
3. Seed 106 new ActBlue contributions (May 2026) into `founding_members`.
4. Endorsement Instagram graphic (1080×1080) included as a static asset.

**Heads up on spelling:** the candidate's surname is **Givan**, not Gavin. All copy and seed data uses the correct spelling.

---

## 1. SQL migrations

Apply in this order via the Supabase SQL editor (or branching) — both files are idempotent.

### `supabase/migrations/20260522000000_endorsement_seed_jeff_givan.sql`
- Inserts one row into `public.endorsement_applications` with `status = 'endorsed'`.
- Fields: candidate name, pronouns (he/him), office, district, party, website, bio, attestation, all Section 2 yes/no positions answered affirmatively, reviewer notes.
- Includes a second UPDATE block in case the row already exists from a public-form submission — it'll be promoted to endorsed without clobbering reviewer edits.
- After running, the row flows automatically through `public.public_endorsements` view → `/endorsements` page (no function change needed; the page reads the view via supabase-js).

**Sanity check:**
```sql
SELECT candidate_name, office_sought, district, party, election_year
FROM   public.public_endorsements;
-- Expect: Jeff Givan | Ohio House of Representatives | District 78 | Democrat | 2026
```

### `supabase/migrations/20260522000100_actblue_contributions_seed_may.sql`
- 106 rows from `ohio-pride-pac-214738-contributions-2026_5 (4).csv` (May 1 – May 22).
- Inserts into `public.founding_members` keyed on `actblue_contribution_id` (the ActBlue Receipt ID, e.g. `AB392073004`).
- `is_public` and `is_vetted` default to **false** — nothing appears on the public roster until you opt each donor in via the admin tools.
- Recurrence detected from `Recurring Type` / `Recurring Total Months` columns. Out-of-state donors (IL, KS, MD, NV, WA) come in with `county_name = NULL` automatically.
- An `UPDATE founding_members SET zip = zip` at the end forces the county trigger to recompute for any row whose zip was just populated.

**Reconciliation note:** the original `SEED_*` rows for Nicole Green, Zachary Smith, and Jesse Shepherd have placeholder `actblue_contribution_id` values, so the upsert won't dedupe them. If any of those donors appear in this CSV you'll have two rows for the same person. The CHANGES file includes the dedupe query.

**Sanity check:**
```sql
SELECT
  count(*) AS new_rows,
  sum(amount_cents)/100.0 AS dollars,
  count(*) FILTER (WHERE recurrence = 'monthly') AS recurring
FROM public.founding_members
WHERE actblue_contribution_id LIKE 'AB%'
  AND contributed_at >= '2026-05-01';
-- Expect: 106 rows, ~$6,428.14, ~14 recurring
```

---

## 2. Homepage patch

### `patches/index.html`
Drop-in replacement for `/index.html` at the repo root.

Three diffs vs. the current file:
1. **Section swap (lines 529-572 → new ~426-447):** the `<section class="launch-day-callout">` countdown block is replaced with an endorsement spotlight card (same `.launch-day-card` surface so existing styles still apply).
2. **CSS cleanup (lines 174-278 removed):** the `.launch-countdown`, `.countdown-unit`, and all `@keyframes countdown*` blocks are deleted — about 105 lines of now-unused styles.
3. **Script removal (lines 698-762 removed):** the inline IIFE that drives the countdown is deleted.

Net delta: **-188 lines**, no JS runtime changes elsewhere.

**Copy on the new section:**
- Section label: "First Endorsement of 2026"
- Headline: "We're standing with Jeff Givan for Ohio House."
- Meta: "Ohio House District 78 · Allen + Auglaize Counties · November 2026"
- Body: short bio + stakes
- Primary CTA: **Volunteer for the Campaign** → `/volunteer`
- Secondary CTA: **Read the Endorsement** → `/endorsements`

The hero buttons (including "Launch Day RSVP") were intentionally left alone — that's a follow-up if you want to repoint them now that launch day's behind us.

---

## 3. Instagram graphic

### `givan-endorsement-ig-square.png` (1080 × 1080)
Brand-locked to the tokens in `/css/brand-tokens.css`:
- Navy `#0F2233` background with subtle top-left radial wash
- Light blue `#73D7EE` accents and CTA pill
- Wordmark top-left in tri-color (Ohio @ 65% / Pride white / PAC light blue)
- "FIRST ENDORSEMENT OF 2026" eyebrow
- "We stand with JEFF GIVAN." — name rendered through the 135° Progress Pride gradient
- District meta + 3-line body
- CTA pill: "VOLUNTEER AT OHIOPRIDE.ORG"
- Compliance disclaimer in the footer band

Note: rendered with a one-off script because the Drive-hosted `ohio-pride-social` skill assets were deadlocked during this session. The output still follows the brand-engine layout system. If you want story / portrait / FB / LinkedIn variants, the same script can be parameterized — let me know.

---

## How to apply this bundle

```bash
cd /path/to/OhioPride
# 1. Migrations
cp /path/to/this/bundle/supabase/migrations/*.sql supabase/migrations/

# 2. Homepage
cp /path/to/this/bundle/patches/index.html index.html

# 3. Run migrations via Supabase SQL editor or branching workflow
#    (in dependency order: 20260522000000_*.sql then 20260522000100_*.sql)

# 4. Commit and open PR
git checkout -b post-launch-givan-endorsement
git add supabase/migrations/20260522000000_endorsement_seed_jeff_givan.sql \
        supabase/migrations/20260522000100_actblue_contributions_seed_may.sql \
        index.html
git commit -m "Post-launch: endorse Jeff Givan, swap countdown for volunteer CTA, seed May ActBlue"
git push origin post-launch-givan-endorsement
```

---

## Open items for you

- **Confirm Jeff's pronouns** (defaulted to he/him based on public coverage). If different, update the seed row before running.
- **Confirm Jeff's campaign email** — seed uses `campaign@jeffgivan4ohio.com` as a placeholder. Replace with the real address.
- **Decide on hero "Launch Day RSVP" button** — likely should now point to `/endorsements` or `/volunteer`.
- **Opt-in pass on the 106 new founding members** — none are public/vetted yet by design.
- **Reconcile** the legacy `SEED_NICOLE_GREEN / SEED_ZACHARY_SMITH / SEED_JESSE_SHEPHERD` rows if any of those donors appear in the May CSV.
