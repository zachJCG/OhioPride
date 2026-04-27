# Round 3 PR Bundle — 2026-04-27

Drop-in changes for the [zachJCG/OhioPride](https://github.com/zachJCG/OhioPride) repo. Unpack at the repo root and let Claude Code wire the PR. Every change is additive or idempotent — nothing here deletes or replaces existing migrations.

## What's in this PR

1. **Donor tracker** — store ZIP and derive county from a Supabase lookup table, set explicit `display_order` so the public list reads Zach, Jesse, Nicole, Matt.
2. **Issues + Scorecard wiring** — close the audit gap. `/js/bill-data.js`, `/js/scorecard-data.js`, and `/js/voting-records.js` are still loaded for first-paint, but new shim scripts upgrade them with live Supabase data on page load.
3. **Founding-members tier cards** — Stonewall Sustainer / Founding Member / Pride Builder / Founding Circle / Founding Patron tier-legend cards on `/founding-members` become real ActBlue links pulled from Supabase.
4. **Mobile filter buttons** — defensive CSS fix for `/issues` and `/scorecard` filter pills (touch-action, tap-target, no overlap with mobile-donate-fab).
5. **Project memory** — `CLAUDE.md` at repo root captures the source-of-truth notes so future sessions don't waste time on Drive deadlocks.

## Files in this bundle

```
ohiopride-pr-bundle/
├── CLAUDE.md                                           ← copy to repo root
├── CHANGES.md                                          ← this file
├── supabase/
│   ├── migrations/
│   │   ├── 20260427000000_ohio_zip_county.sql         ← new
│   │   ├── 20260427000001_founding_members_county_from_zip.sql ← new
│   │   ├── 20260427000002_legislators_and_sponsorships.sql     ← new
│   │   ├── 20260427000002_legislative_scorecard.sql   ← DELETE before commit
│   │   └── 20260427000003_founding_tiers_actblue_url.sql       ← new
│   └── seed/
│       └── 20260427_current_donor_reorder.sql         ← run once after migrations
├── netlify/functions/
│   ├── bills.mjs                                      ← new
│   ├── scorecard.mjs                                  ← new
│   ├── zip-county-lookup.mjs                          ← new
│   └── founding-member-tiers.mjs                      ← REPLACES existing (adds actblue_url)
├── js/
│   ├── bill-data-supabase.js                          ← new
│   └── scorecard-data-supabase.js                     ← new
├── css/
│   └── round-3-mobile-and-tier-cta.css                ← append to css/style.css
└── patches/
    └── ohiopride-data.js.loadFoundingMemberTiers.patch
```

> The file `20260427000002_legislative_scorecard.sql` is a no-op stub. Delete it before committing — the real migration is `..._legislators_and_sponsorships.sql` at the same timestamp prefix. (Build env couldn't delete it.)

## Apply order

Migrations: run in filename order. Supabase will pick them up automatically.

```
20260427000000_ohio_zip_county.sql
20260427000001_founding_members_county_from_zip.sql
20260427000002_legislators_and_sponsorships.sql
20260427000003_founding_tiers_actblue_url.sql
```

After migrations land, run the donor reorder seed once:

```
psql $SUPABASE_DB_URL -f supabase/seed/20260427_current_donor_reorder.sql
```

Then deploy the Netlify functions and JS/CSS changes.

## Manual edits required

### 1. `founding-members.html` — wire the new CSS

At the bottom of the existing `<link rel="stylesheet" href="/css/style.css" />` block, append the new CSS file:

```html
<link rel="stylesheet" href="/css/style.css" />
<link rel="stylesheet" href="/css/round-3-mobile-and-tier-cta.css" />
```

(Or, simpler: cat `css/round-3-mobile-and-tier-cta.css` onto the end of `css/style.css` and skip the new link.)

### 2. `js/ohiopride-data.js` — apply the patch

Apply `patches/ohiopride-data.js.loadFoundingMemberTiers.patch`. It only touches the `loadFoundingMemberTiers` function, replacing the inner `<div class="tier-legend-card">` template with one that emits a real `<a>` when `actblue_url` is present (which it will be, after migration `..._founding_tiers_actblue_url.sql` runs).

```bash
git apply patches/ohiopride-data.js.loadFoundingMemberTiers.patch
```

### 3. `issues.html` — load the Supabase shim

Add **after** the existing `bill-data.js` script tag (do not replace it — the static seed renders first paint):

```html
<script src="/js/bill-data.js"></script>
<script src="/js/bill-pipeline.js"></script>
<script src="/js/bill-data-supabase.js" defer></script>   <!-- NEW -->
```

Inside the inline `<script>` block at the bottom of `issues.html`, expose `applyFilters` on `window` so the shim can re-render after upgrading data:

```diff
-      function applyFilters() {
+      window.applyFilters = function applyFilters() {
         var filtered = BILLS.filter((b) => {
            ...
         });
         renderBills(filtered);
         updateStats(filtered);
-      }
+      };
```

(Same change for any per-bill detail pages under `/issues/<slug>.html` if they read `BILLS`.)

### 4. `scorecard.html` — load the Supabase shim

```html
<script src="/js/bill-data.js"></script>
<script src="/js/scorecard-data.js"></script>
<script src="/js/voting-records.js"></script>
<script src="/js/scorecard-data-supabase.js" defer></script>  <!-- NEW -->
<script src="/js/bill-data-supabase.js" defer></script>       <!-- NEW -->
```

Inside the page's render closure, expose a refresh hook:

```js
window.OhioPrideRefreshScorecard = function () {
  // Whatever your existing render-all-from-state function is named.
  applyFilters();
};
```

If the page already calls `applyFilters` after every UI change, just expose that:

```js
window.applyFilters = applyFilters;
```

## Database schema additions

### Tables
- `public.ohio_zip_county` — HUD Q1 2023 ZIP↔county crosswalk (1,359 ZIPs, 88 counties, 2,056 ZIP-county pairs)
- `public.legislators` — replaces `HOUSE_MEMBERS` + `SENATE_MEMBERS` arrays
- `public.legislator_sponsorships` — replaces `LEGISLATOR_SPONSORSHIPS` map
- `public.bill_pipeline_steps` — replaces `BILLS[i].pipelineDates`

### Columns added
- `founding_members.zip` (TEXT, normalised to 5 digits by trigger)
- `founding_members.county_name` (TEXT, derived from ZIP)
- `founding_members.county_fips` (TEXT)
- `founding_members.display_order` (INT, controls public list ordering)
- `bills` gets the issues-page denorm fields: `nickname`, `official_title`, `status_label`, `status_color`, `categories`, `category_labels`, `sponsors_text`, `last_action`, `next_date`, `house_vote`, `chamber`, `current_step`, `url`, `legislature_url`, `text_url`
- `founding_member_tiers.actblue_url`

### Views / functions
- `public.ohio_zip_primary_county` (view) — one row per ZIP, primary county only
- `public.county_for_zip(text)` — normalises input, returns county name
- `public.normalize_zip(text)` — returns 5-digit ZIP or NULL
- `public.legislator_scorecard` (view) — composite score + grade per legislator
- Trigger `trg_founding_members_set_county` — keeps `county_name` in sync with `zip`

## Donor reorder applied

Per the request, this is the public order after running the seed:

| Order | Name              | ZIP   | County     | Amount  |
|-------|-------------------|-------|------------|---------|
| 1     | Zachary V Smith   | 45202 | Hamilton   | $25.00  |
| 2     | Jesse Shepherd    | 45248 | Hamilton   | $25.00  |
| 3     | Nicole Green      | 45420 | Montgomery | $19.69  |
| 4     | Matthew Joseph    | 45420 | Montgomery | $100.00 |

The seed matches by `LOWER(full_name) LIKE '...%'` so suffixes/middle initials don't break it. If a name doesn't match exactly, run:

```sql
SELECT id, full_name, zip, county_name, amount_cents
FROM public.founding_members
ORDER BY contributed_at;
```

then update the four UPDATEs in the seed file with the right `WHERE` clause.

## Backfill (one-time, after schema migrations)

The trigger handles new rows. To backfill existing rows that have a usps zip but no county yet, the migration `20260427000001_founding_members_county_from_zip.sql` runs the backfill at the bottom. No extra step required.

If you want to seed the `legislators` and `legislator_sponsorships` tables from the existing JS files, run:

```bash
node scripts/seed-legislators-from-js.mjs
```

(Script not included in this bundle — happy to generate it if you want a one-shot importer rather than typing the data into the new tables by hand.)

## Verification

After deploy, sanity checks:

```sql
-- ZIP -> county
SELECT public.county_for_zip('45420');  -- 'Montgomery County'
SELECT public.county_for_zip('45202');  -- 'Hamilton County'

-- Donor list
SELECT display_order, full_name, zip, county_name, amount_cents
FROM   public.founding_members
WHERE  display_order IS NOT NULL
ORDER  BY display_order;

-- Tiers expose ActBlue URLs
SELECT slug, name, actblue_url
FROM   public.founding_member_tiers
ORDER  BY display_order;

-- Functions return data
-- (browser)
fetch('/.netlify/functions/bills').then(r => r.json()).then(console.log);
fetch('/.netlify/functions/scorecard').then(r => r.json()).then(console.log);
fetch('/.netlify/functions/zip-county-lookup?zip=45420').then(r => r.json()).then(console.log);
```

Mobile sanity checks (test on a real iPhone if possible):
- /issues — every filter pill registers a tap on first try
- /scorecard — chamber/party/grade pills filter without delay
- /founding-members — each tier-legend card opens ActBlue
- The mobile-donate-fab no longer covers the bottom filter row

## Things deliberately not done in this PR

- No batch backfill of legislators/sponsorships into Supabase. The static JS keeps the page functional in the meantime; a separate import script can land the editorial data in a follow-up PR.
- `/js/bill-data.js` and `/js/scorecard-data.js` aren't deleted yet. They're still loaded as the first-paint fallback. Once Supabase is the source of truth and tested, a follow-up can shrink those files to a `// see /.netlify/functions/...` stub.
- No changes to `/donate/founding-member.html`. Its tier buttons already have ActBlue URLs hardcoded. The migration `..._founding_tiers_actblue_url.sql` mirrors the same URLs into Supabase so the data layer is canonical, but the page keeps its inline buttons as a working fallback.

## Rollback

Each migration is idempotent and additive. To roll back the Round 3 work:

```sql
-- 1. Revert ohiopride-data.js patch (git revert the commit)

-- 2. Drop new schema (DESTRUCTIVE; only run if you're sure)
DROP VIEW  IF EXISTS public.legislator_scorecard;
DROP TABLE IF EXISTS public.legislator_sponsorships;
DROP TABLE IF EXISTS public.legislators;
DROP TABLE IF EXISTS public.bill_pipeline_steps;

ALTER TABLE public.founding_member_tiers DROP COLUMN IF EXISTS actblue_url;

DROP TRIGGER IF EXISTS trg_founding_members_set_county ON public.founding_members;
DROP FUNCTION IF EXISTS public.fn_founding_members_set_county();
DROP FUNCTION IF EXISTS public.normalize_zip(text);
DROP FUNCTION IF EXISTS public.county_for_zip(text);

ALTER TABLE public.founding_members
  DROP COLUMN IF EXISTS zip,
  DROP COLUMN IF EXISTS county_name,
  DROP COLUMN IF EXISTS county_fips,
  DROP COLUMN IF EXISTS display_order;

DROP VIEW  IF EXISTS public.ohio_zip_primary_county;
DROP TABLE IF EXISTS public.ohio_zip_county;
```

ActBlue URLs in the seed are exact mirrors of the URLs already on `/donate/founding-member.html`, so removing them doesn't lose anything that isn't already in the HTML.
