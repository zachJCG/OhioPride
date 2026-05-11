# Ohio Pride PAC — ActBlue Report Backfill (2026-05-11)

Bundle covers the ActBlue Custom Report `ohio-pride-pac-214738-custom-report-all-2026-04-12-2026-05-11.csv` (27 contributions, **$1,369.69** total). Every contribution in the report is marked **`is_public = true`** and **`is_vetted = true`** per Director instruction.

## What's in this bundle

```
supabase/migrations/20260511020000_actblue_report_backfill.sql
admin/donors/index.html
```

## How to apply

Unzip inside your local Git checkout of `OhioPride` so the files land at the repo paths shown above, then let Claude Code raise the PR.

```bash
cd ~/path/to/OhioPride
unzip /path/to/ohiopride-pr-bundle.zip -d .
git checkout -b 20260511-actblue-report-backfill
git add supabase/migrations/20260511020000_actblue_report_backfill.sql admin/donors/index.html
git commit -m "ActBlue report backfill (4/12–5/11) + admin/donors expanded view"
git push -u origin 20260511-actblue-report-backfill
```

Netlify will preview-deploy the branch. The Supabase branching integration will run the migration against the preview branch DB before merge.

## Migration: 20260511020000_actblue_report_backfill.sql

### Schema changes

Adds 32 new columns to `public.founding_members` to capture the full ActBlue report payload. All `add column if not exists` so it's safe to re-run.

| Column | Type | Purpose |
| --- | --- | --- |
| `address_line1` | text | Donor street address |
| `state` | text | Donor state (US two-letter) |
| `country` | text | Donor country |
| `occupation` | text | Donor occupation |
| `employer` | text | Donor employer |
| `phone` | text | Donor phone |
| `employer_address_line1` | text | Employer street |
| `employer_city` | text | |
| `employer_state` | text | |
| `employer_zip` | text | |
| `employer_country` | text | |
| `refcode` | text | ActBlue refcode (e.g. `website_founding_member`) |
| `refcode_2` | text | Secondary refcode |
| `contribution_form_url` | text | Form URL |
| `form_owner_email` | text | |
| `form_branding_name` | text | |
| `recipient_committee` | text | Filed name on receipts |
| `payment_method` | text | Apple Pay / Google Pay / Card |
| `card_type` | text | VISA / MasterCard / Discover / Amex |
| `actblue_fee_cents` | integer | ActBlue fee in cents |
| `stripe_fee_text` | text | Raw Stripe fee string (`$0.78`) |
| `via_mobile` | boolean | |
| `is_actblue_express` | boolean | |
| `is_refunded` | boolean | |
| `is_cancelled_recurring` | boolean | |
| `recurring_upsell_shown` | boolean | |
| `recurring_upsell_succeeded` | boolean | |
| `recurring_amount_cents` | integer | |
| `recurring_type` | text | e.g. `monthly` |
| `recurring_duration` | text | e.g. `unlimited` |
| `initial_recurring_at` | timestamptz | |
| `text_message_opt_in` | text | `opt_in` / `opt_out` / `unknown` |

### Data changes

1. Reconciles the four pre-seeded rows (Jesse Shepherd, Nicole Green, Matthew Joseph, Samuel Dorf) to their ActBlue Lineitem IDs by name + amount + recurrence so the unique-key upsert below targets the existing rows.
2. Upserts all 27 ActBlue lineitems by `actblue_contribution_id` with full donor + payment + recurrence detail. **All marked `is_public = true, is_vetted = true`.**
3. Re-touches `zip` on every backfilled row to force the existing `fn_founding_members_set_county` trigger to fill `county_name` / `county_fips`.
4. Mirrors `county_name` into the legacy `county` column (strips trailing " County") where it's null, so both legacy and new code paths read the correct value.
5. Assigns sequential `display_order` to any public+vetted row missing one, ordered by `contributed_at`. Existing 1–4 (Zach, Jesse, Nicole, Matt) are preserved.
6. Assigns sequential `founding_number` to any public+vetted row missing one.
7. Appends a `notes` line recording the backfill source on the 23 newly-inserted rows.

### Idempotency

* Column adds use `if not exists`.
* The 4 pre-seed reconciliation `update`s are guarded by `actblue_contribution_id is null` so they never overwrite already-attached IDs.
* The 27-row upsert uses `on conflict (actblue_contribution_id) do update set ...`.
* Display order / founding number assignment only runs against rows with `null` values, preserving any previously-assigned numbers.
* Notes append is scoped to the 23 newly-inserted IDs so re-running it would re-append — if you re-run this migration after merge, delete or comment out section 7.

### What stays in the existing schema

* The `founding_members_public` view (PII-free projection) is untouched.
* The 88-county `county` check constraint is untouched.
* The `founding_member_tier(cents, recurrence, refcode)` function is untouched.
* RLS policy stays the same: `service_role` writes, anon reads via the view only.

## Admin UI: `admin/donors/index.html`

Self-contained replacement for the admin Donors page that surfaces every new column.

### What changed

* New columns in the table: **Refcode**, **Payment**, **Occupation / Employer**. ZIP and ActBlue order number are now shown as sub-text under City / County.
* Each row has a **`+` expand button** that reveals a full Donor Detail block grouped into three sections:
  * **Contribution** — lineitem id, order number, paid-at, amount, full recurring metadata, refcodes, form details
  * **Donor** — full name, display name, email, phone, address, occupation, employer, employer address, elected office + jurisdiction
  * **Payment & Flags** — payment method, card type, ActBlue + Stripe fees, mobile/Express flags, refund + cancellation flags, recurring-upsell flags, text-opt-in, founding number, display order
* New **Refcode** filter dropdown auto-populated from the data so you can isolate `founding_member` vs `founding_patron` vs `donate_100` etc.
* Search now matches address, phone, employer, occupation, and refcode in addition to the original fields.
* Stats grid logic preserved (Members / Total Raised / On Public Roster / Toward 1,969).
* Public + Vetted toggles preserved.

### What didn't change

* Auth, RLS, and the `founding_members_public` view are all untouched.
* No new dependencies; same `@supabase/supabase-js@2` script tag.
* No CSS file changes — the small set of expand-button + detail-grid rules is scoped inline at the top of `admin/donors/index.html`.

## Quick verification after applying

```sql
-- Should return 27 rows
select count(*) from public.founding_members
where actblue_contribution_id is not null;

-- Should return 0 unmatched ZIPs
select full_name, zip, county, county_name
from public.founding_members
where actblue_contribution_id is not null
  and (county is null or county_name is null);

-- Public roster size after this migration
select count(*) from public.founding_members_public;

-- Tier breakdown
select public.founding_member_tier(amount_cents, recurrence) as tier, count(*)
from public.founding_members
where actblue_contribution_id is not null
group by 1 order by 2 desc;
```

Expected tier counts for the 27-row report (using current cut-offs):

| Tier | Count |
| --- | ---: |
| Founding Patron / Advocate ($250) | 2 (Brian Sharp, Karen Brownlee) |
| Leadership ($100) | 3 (Matt Joseph, Martin Gehres, Jeffrey Lox) |
| Friend ($50) | 1 (Kyle Brown) |
| Founding Member ($25) | 20 |
| Stonewall Sustainer ($19.69/mo) | 1 (Nicole Green) |

Total raised in this batch: **$1,369.69**.

## Elected officials flagged

The migration sets `elected_office` + `jurisdiction` for any donor who currently holds office, so the public roster can show an elected-official badge:

* Matthew Joseph — City Commissioner, City of Dayton
* Samuel Dorf — City Council, City of Oakwood
* Ross Widenor — City Council President, City of Munroe Falls
* Nickie J. Antonio — State Senator, Ohio Senate
* Martin Gehres — Clerk of Court, City of Dayton

Brian Sharp donated $250 but his Land Bank seat is an appointment rather than an elected office, so `elected_office` is left null. Flip it on in the admin UI if you want him badged.

## Risks / things to know

* Matthew Joseph's row currently reads `$25 one-time` from seed migration `20260427000500_matt_joseph_back_to_founding_member.sql`. The ActBlue report shows **$100 one-time** on 4/27. The upsert overwrites him with the real ActBlue value. If that conflicts with anything you've publicly communicated, flip his `is_public` off and edit before re-publishing.
* The new columns are populated only for the 27 rows from this report. Pre-existing rows (Zach Smith, others) will have NULL in the new fields until the next ActBlue sync touches them.
* The admin Donors page now SELECTs ~50 columns. Still well within Supabase's per-row size limit, but the wire payload is bigger — keep an eye if the table grows past a few thousand rows.
