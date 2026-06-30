# Handoff for Claude Code — Commit the June 2026 Pride Sign-Up Imports

**Repo:** `zachJCG/OhioPride`  ·  **Supabase project:** `dkdxefzhttkmjhdbkvqn`

## Context

Pride sign-up rows from the June 2026 scans were inserted into `public.signup_sheet_imports`
**directly on the remote database via the Supabase MCP**, in two passes:

- **2026-06-23:** 152 rows from the two June 23 scans (table 132 → 284).
- **2026-06-30:** 7 new rows from a June 30 re-scan (table 284 → 291). 11 of that scan's 18 rows were already on file and were skipped.

This PR is for **version-control parity only** — committing the migrations so the repo's migration history matches prod.

The migration files are already written (in the project folder, next to this file):

```
20260623000000_import_pride_signups_jun2026.sql   (152 rows, Jun 23)
20260630000000_import_pride_signups_jun30.sql     (7 rows, Jun 30)
```

Both are **idempotent** — every row is guarded with `WHERE NOT EXISTS (... citext email ...)`, so applying again inserts nothing new and is safe in CI.

## Task

1. Create a branch, e.g. `data/pride-signups-jun2026`.
2. Move both migrations into the repo's migrations directory using the project's existing convention
   (most likely `supabase/migrations/`). Keep or re-stamp the timestamp prefixes to fit the existing
   sequence; do not reorder earlier migrations. Keep them in date order (Jun 23 before Jun 30).
3. Do **not** run them against production — already applied. If CI runs `supabase db push` / `db reset`
   against a shadow or preview DB, the idempotent guards make that safe.
4. Open a PR titled **"Data: import June 2026 Pride sign-ups (159 rows)"** with this body:
   - Adds the June 2026 Columbus + central/SW-Ohio Pride sign-up rows to `signup_sheet_imports` (152 on Jun 23, 7 on Jun 30).
   - Already applied to prod via MCP; committed for parity. Idempotent (NOT EXISTS on email).
   - All rows `needs_review = true`; `contact_id` null (linked later via the Contacts module).
   - The Jun 11 scans were duplicates of the Jun 15 batch; the Jun 30 scan was largely a re-scan of the Jun 23 sheets (only 7 new rows).

## Guardrails

- This touches **data only** — no schema/DDL, no RLS changes. If your review expects a schema diff, there isn't one.
- Do not modify `founding_members`, `contacts`, `volunteers`, or any view. Scope is strictly `signup_sheet_imports` inserts.
- If the team prefers seed data over a migration, the same files can live under `supabase/seed/` instead; they are plain idempotent SQL either way.

> Separate, larger handoff: the volunteers-vs-contacts split and the `/admin` sign-up-sheet preview
> are described in **`volunteers-contacts-split-FOR-CODE.md`** in this same folder. That is the schema/app
> change; this file is data-import parity only.

## Verify After Merge (optional)

```sql
select count(*) from public.signup_sheet_imports;                                            -- expect 291
select count(*) from public.signup_sheet_imports where imported_at::date = date '2026-06-23'; -- expect 152
select count(*) from public.signup_sheet_imports where imported_at::date = date '2026-06-30'; -- expect 7

-- zero duplicate emails (only null repeats, = phone-only rows)
select email, count(*) from public.signup_sheet_imports
group by email having count(*) > 1;                                                           -- expect only {null, 3}
```
