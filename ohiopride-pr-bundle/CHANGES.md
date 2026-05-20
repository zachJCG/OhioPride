# Ohio Pride PAC — Scorecard ↔ Bills reconciliation
PR bundle prepared 2026-05-20. Target: shippable before Friday.

## What this PR does

Locks /scorecard, /admin/legislators, /issues, and /admin/bills onto one shared Supabase source of truth, and gives an intern a usable add/edit UI for new bills. Math stays exactly as published on /methodology.

## What was already in place (verified, no change needed)

| Surface | Source | Notes |
|---|---|---|
| /scorecard (public) | scorecard.mjs → public.legislator_scorecard view | View prefers most-recent score_snapshots row, falls back to stored subscores. |
| /issues (public) | bills.mjs → public.bills | Reads via /js/bill-data-supabase.js shim, falls back to static bill-data.js on fetch fail. |
| /admin/legislators (admin) | compute_legislator_scorecard() + RPC publish_scorecard, publish_scorecard_all | Working publish button. Roll-call/exception/sponsorship upsert + delete already wired. |
| Scoring math | 50 + Vf×4 + Vc×4 + S×2, clamped 0–100. EVENT_WEIGHTS override 1.25, pass/concur 1.00, committee 0.75, amend 0.50, intro 0.25. Grade bands A+ ≥95, A ≥88, A- ≥78, B ≥60, C ≥38, D ≥18, F ≥0. | Identical across js/scorecard-data.js, js/voting-records.js, public.event_weight(), public.legislator_scorecard view, public.compute_legislator_scorecard(), and /methodology page. |

## What was broken

1. /admin/bills was read-only and referenced columns that do not exist on public.bills (bill_number, chamber_of_origin, introduced_on, last_action_on, is_featured, what_it_does, equality_impact_note, legal_risks, official_bill_url, bill_text_pdf_url, enacted_text_url). Result: sparse grid, no way for the intern to add or edit a bill.
2. Per-bill /issues/<slug>.html pages loaded only the static /js/bill-data.js. Edits in Supabase never reached the bill detail pages.

## What this PR ships

```
supabase/migrations/20260520120000_bills_admin_alignment.sql
  - ALTER TABLE public.bills ADD missing admin columns (idempotent)
  - Backfills bill_number ← label, chamber_of_origin ← chamber,
    category ← categories[1]
  - Creates public.bills_canonical view (shared shape for /issues + /admin/bills)
  - Grants INSERT/UPDATE/DELETE on bills to authenticated (gated by
    bills:write RLS policy from 20260520020000)
  - Helper function public.suggest_bill_slug(text)

admin/bills/index.html
  - + New Bill button in toolbar
  - Edit button on every row
  - Modal form: slug, bill_number, title, stance, status, chamber_of_origin,
    GA, category, introduced_on, last_action_on, is_featured, summary,
    what_it_does, equality_impact_note, legal_risks, official_bill_url,
    bill_text_pdf_url
  - Auto-suggests slug from bill_number while creating
  - Insert / Update / Delete via authenticated supabase client
  - Mirrors bill_number → label and chamber_of_origin → chamber on save so
    the public bills.mjs (which reads the legacy columns) sees the new value

issues/<23 files>.html
  - Append <script src="/js/bill-data-supabase.js" defer></script>
    right after the existing /js/bill-data.js tag
  - Affected: hb136, hb155, hb172, hb190, hb196, hb249, hb262, hb300,
    hb306, hb327, hb457, hb602, hb693, hb796, hb798, hjr4,
    sb113, sb211, sb274, sb34, sb70, sb71
  - Skipped (no bill-data binding to upgrade): hb112, hb838, hb96

scripts/verify-scorecard-math.sql
  - Run in Supabase SQL editor after applying migrations to confirm math
    agrees across the legislators table, compute_legislator_scorecard(),
    legislator_scorecard view, EVENT_WEIGHTS multipliers, and grade bands

INTERN_RUNBOOK.md
  - The four-page → four-table map
  - Daily workflows: add a bill, log a roll call, add a sponsor,
    publish the scorecard, handle a status change
```

## Deployment order

1. Apply migration:
   ```
   supabase db push
   ```
   Or paste `supabase/migrations/20260520120000_bills_admin_alignment.sql` into the Supabase SQL editor.
2. Replace `admin/bills/index.html` and the 23 patched `issues/<slug>.html` files.
3. Deploy to Netlify (`git push` or trigger a build).
4. Run `scripts/verify-scorecard-math.sql` in the Supabase SQL editor. Every `ok` column should be `true`.
5. Smoke test (manual):
   - Open /admin/bills, click + New Bill, create a throwaway bill (slug `test1`). Confirm it appears at /issues immediately after a hard refresh.
   - Edit that bill from /admin/bills. Refresh /issues, confirm the title updated.
   - Delete the bill from /admin/bills. Refresh /issues, confirm it's gone.
   - Open /admin/legislators, change one subscore, click Publish, refresh /scorecard, confirm the new grade appears.

## Risks and dependencies

- Migration is idempotent. If applied twice nothing breaks, but rerun verify-scorecard-math.sql afterwards.
- The RLS write policies on `public.bills` were already created in 20260520020000 (`"bills admin write"`). The intern must have a Supabase user with `bills:write` permission.
- The static `js/scorecard-data.js` still contains baseline numbers from April 2026. The Supabase shim overrides them on page load, so the public scorecard always shows live data. First paint may briefly show the static numbers; that's by design (fail-open).
- bills.mjs reads the legacy column names (`label`, `chamber`, `last_action`, `text_url`). The admin save flow mirrors `bill_number → label` and `chamber_of_origin → chamber` so the public site stays consistent. We intentionally did not rewrite bills.mjs in this PR to keep blast radius small.

## What I deliberately did not do (post-Friday work)

- Pipeline step editor in /admin/bills (currentStep, pipeline_dates). Currently static.
- Bulk import of bills from a CSV. Intern can paste rows but it's one at a time.
- Replacing 26 hand-coded per-bill /issues/<slug>.html pages with one dynamic /issues/bill.html?slug=… template. Discussed and deferred to keep SEO and OG cards intact.
- News & Public Statements re-enable. The methodology page already says News was retired in April 2026.
