# Round 4 — Scorecard & Issues data migration + admin dashboard

Date: 2026-05-10
Branch suggestion: `migrate/scorecard-and-issues-to-supabase`

## What this PR does

Closes the last "static JS as source of truth" gap on the public site, and
gives the admin dashboard a place to manage that data without touching code.

Specifically:

1. **Seeds Supabase** with the data still living in `js/bill-data.js` and
   `js/scorecard-data.js` (legislators, sponsorships, bill pipeline steps,
   denormalized issue-page columns on `public.bills`). Idempotent so re-runs
   don't blow away admin edits.

2. **Adds two admin pages**: `/admin/scorecard` and `/admin/issues`. Both
   load current state from Supabase, let the admin make edits with a live
   score-impact preview, and queue changes until **Save & Publish** flushes
   them through service-role-backed Netlify functions.

3. **Adds two admin CRUD Netlify functions** (`admin-scorecard.mjs`,
   `admin-issues.mjs`) that verify the caller's JWT against
   `public.admin_emails`, then write with the service role.

4. **Wires both new pages into the admin dashboard.**

No public surface has changed — `bills.mjs` and `scorecard.mjs` (already in
prod) keep serving `/issues` and `/scorecard`. After the seed migration runs,
the `-supabase.js` shims that are already loaded on those pages start
returning real data, replacing the static JS fall-through.

The user explicitly excluded a public news-statements shim from this round.
`news_statements` is already in DB and seeded; an admin editor for it can
ship in a follow-up if needed.

## Files

```
supabase/migrations/
  20260510120000_seed_scorecard_and_issues.sql   — new

netlify/functions/
  admin-scorecard.mjs                              — new
  admin-issues.mjs                                 — new

admin/dashboard/index.html                         — adds 2 cards
admin/scorecard/index.html                         — new
admin/issues/index.html                            — new
```

## How to apply

```bash
# 1. Drop the bundle into your local checkout
cd /path/to/OhioPride
unzip /path/to/ohiopride-pr-bundle.zip -d .
git checkout -b migrate/scorecard-and-issues-to-supabase
git add supabase/migrations/20260510120000_seed_scorecard_and_issues.sql \
        netlify/functions/admin-scorecard.mjs \
        netlify/functions/admin-issues.mjs \
        admin/dashboard/index.html \
        admin/scorecard/index.html \
        admin/issues/index.html

# 2. Push the migration
supabase db push    # or paste the SQL into the Supabase SQL editor

# 3. Deploy
git commit -m "migrate: scorecard + issues data from JS to Supabase; admin dashboard"
git push origin migrate/scorecard-and-issues-to-supabase
# Open PR; Netlify will deploy a preview.
```

## What the admin dashboard can do (post-deploy)

Visit `/admin/scorecard` (signed in via the existing admin login):

- **Legislators tab** — table of all 132 legislators with editable Floor (Vf),
  Committee (Vc), Sponsorship (S) subscores. Score and grade recompute live
  per the v6 formula: `clamp(0, 100, round(50 + 4·Vf + 4·Vc + 2·S))`. A Δ
  column shows the change vs. the saved baseline.
- **Roll Calls tab** — add a roll call (bill + chamber + stage + date + tally),
  then log per-legislator yea/nay/excused exceptions against it. The schema
  for `roll_calls` + `legislator_vote_exceptions` already supports the v6
  evidence model.
- **Sponsorships tab** — add or remove sponsorships per legislator-bill pair,
  with a column showing the score impact (`+2 to S` / `−1 to S` etc.).

Visit `/admin/issues`:

- Card-per-bill editor for the 25 tracked bills + any added in-session.
- All denorm fields on `public.bills` are editable (label, title, summary,
  status, sponsors, categories, URLs).
- Pipeline timeline editor: 0–8 steps per bill, each with optional date
  and label.
- "Add Bill" button creates a new bill. "Archive Bill" soft-deletes
  (`is_active = false`) without losing roll calls or sponsorships tied to it.

In both pages, edits stage into an in-memory change list. A sticky bottom bar
shows pending count and a single **Save & Publish** button commits everything
in one batch. Public pages pick up new data on their next 5-minute cache
refresh — no rebuild required.

## What this PR does **not** do

- It does **not** add committee subscores to the seed. The source JS only
  has Floor (`v`) and Sponsorship (`s`); committee is the column the admin
  fills in going forward.
- It does **not** add an admin UI for `news_statements` (per scope cut).
- It does **not** delete `js/bill-data.js` / `js/scorecard-data.js`. They
  stay as first-paint fallback in case the Netlify function 500s. The
  `-supabase.js` shims overwrite them at runtime.
- It does **not** change the public composite-score formula or RLS policy.

## Verification done in-session

- `node --check` on both `.mjs` functions: passes.
- `node --check` on the inline `<script>` block in each admin page: passes.
- SQL paren balance: 86/86.
- Seed migration row counts: 3 new bills, 25 denorm upserts, 59 pipeline
  steps, 132 legislators, 18 sponsorships.

## Known follow-ups

- Admin "Log Per-Member Vote" uses `prompt()` for now. A modal with the
  full chamber roster + bulk yea/nay buttons is the right next iteration.
- Roll calls staged in-session are referenced by a `tmp-…` client ID for
  exception-logging; once published, page reload picks up the real UUIDs.
  Cleaner: function should return the new IDs in the same response so the
  UI doesn't need the reload.
- `bill_pipeline_steps.step_label` can drift from `current_step` on the
  parent bill. A small consistency check in `admin-issues.mjs` could
  auto-sync them on publish.
