# Ohio Pride PAC :: Volunteer + Internships PR Bundle

Generated 2026-05-11. Drop these files into your `OhioPride` checkout, then let Claude Code wire the PR.

## What this PR does

1. **Rebuilds `/volunteer`** as a single page with two paths in one form:
   - **Volunteer** (5 steps: about / location / interests / skills + availability / wrap-up)
   - **Intern or Fellow** (5 steps: about / location / position + term / academic / statement + materials)
2. **The submit button is hidden until the progress bar reaches 100%** (the very last step). It's labeled "Sign me up" on the volunteer path and "Submit application" on the intern path.
3. **Adds an Internships showcase section** above the form with the five 2026 positions from `ohiopride team positions.pdf`. Each card has Show Details + Apply. Apply switches the form into intern mode, pre-selects the position, and scrolls down.
4. **Single endpoint, two destinations:** `/.netlify/functions/volunteer-submit` now routes by `application_type`:
   - `"volunteer"` -> `public.volunteers` (UPSERT on `email`)
   - `"internship"` -> `public.intern_applications` (UPSERT on `(email, position)`)
5. **New admin module `/admin/internships`** — same look + interactions as `/admin/volunteers` (stat cards, filters, sortable table, status select, side-drawer detail, CSV export).
6. **Rebuilds `/admin/donors`** on the modern admin shell (sidebar, top bar, drawer, toast). Same data, same toggles, same behavior — just the new chrome.
7. **Schema:**
   - `supabase/migrations/20260511000000_intern_applications.sql` — new table + RLS + indexes + admin view.
   - `supabase/migrations/20260511000100_internships_role_permissions.sql` — adds the `internships` module to `super_admin`, `volunteer_lead`, and read-only to `board_member` / `treasurer` / `endorsements_chair` / `comms_lead` / `legislative_lead`.
8. **Adds a deep-link `/internships`** that lands users on the intern path of the form. `/apply/<position>` pre-selects the role.

## Files in this bundle

```
ohiopride-pr-bundle/
  CHANGES.md                                          (this file)
  volunteer.html                                      (overhauled)
  netlify.toml.patch                                  (additions only)
  js/
    volunteer-form.js                                 (rewritten — branching paths)
    intern-positions.js                               (NEW — position catalog + showcase)
  netlify/functions/
    volunteer-submit.mjs                              (rewritten — routes by application_type)
  admin/
    admin-shell.js                                    (patched — adds Internships nav + briefcase icon)
    volunteers/index.html                             (UNCHANGED — included for reference)
    internships/index.html                            (NEW — modeled on volunteers)
    donors/index.html                                 (rewritten on admin shell)
  supabase/migrations/
    20260510000000_volunteers.sql                     (UNCHANGED — included for reference)
    20260511000000_intern_applications.sql            (NEW)
    20260511000100_internships_role_permissions.sql   (NEW)
  scripts/
    validate-shape.mjs                                (offline shape sanity test)
    run-function-locally.mjs                          (in-memory function smoke test)
    smoke-test-volunteer-submit.mjs                   (live end-to-end smoke after deploy)
```

## How to apply

Inside your `OhioPride` checkout:

```bash
# 1. Copy files over the existing tree.
rsync -a path/to/ohiopride-pr-bundle/{volunteer.html,js,admin,netlify,supabase} ./

# 2. Patch netlify.toml by hand using netlify.toml.patch (just three new
#    [[redirects]] blocks — keep all your existing rules in place).

# 3. Apply the new migrations to Supabase.
#    Either via the Supabase CLI:
#      supabase db push
#    or by pasting both new migration files into the SQL editor in order:
#      20260511000000_intern_applications.sql
#      20260511000100_internships_role_permissions.sql

# 4. Sanity check from the bundle (no network):
node scripts/validate-shape.mjs        # 22 shape checks
node scripts/run-function-locally.mjs  # 13 in-memory function checks

# 5. After deploying, run the live end-to-end test:
ENDPOINT=https://www.ohiopride.org/.netlify/functions/volunteer-submit \
SUPABASE_URL=https://dkdxefzhttkmjhdbkvqn.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \
node scripts/smoke-test-volunteer-submit.mjs --cleanup
```

## Why submit was failing before

Most likely one of:
1. Migration `20260510000000_volunteers.sql` not yet applied in prod (table doesn't exist) — function returns 500, fetch() rejects, generic error banner shows.
2. `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` missing or wrong on Netlify — function returns 500.
3. RLS denying the service-role insert (the migration is correct, but only after it runs).

This PR doesn't change the original volunteer write path other than to add a discriminator. If `volunteers` was working before, it still does. If the intern path returns 500, check that `20260511000000_intern_applications.sql` was applied.

## Tests I ran in-bundle

```
[scripts/validate-shape.mjs]
  ALL SHAPE CHECKS PASSED  (22/22)

[scripts/run-function-locally.mjs]
  Volunteer happy path                  ok=true kind=volunteer, illegal interest filtered, upsert on email
  Intern happy path                     ok=true kind=internship, position+term routed, upsert on (email,position)
  Intern path missing position          400 position_required
  Volunteer path bad email              400 valid_email_required
  Intern path bad URL                   400 invalid_url
  Honeypot                              200 ok kind=honeypot, no DB write
  ALL FUNCTION CHECKS PASSED  (13/13)
```

## What I did NOT touch

- `/admin/endorsements` still uses its own light-theme stylesheet (`admin/endorsements/admin.css`) and the older `admin-auth.js` flow. It is the only remaining admin page outside the new shell. Migrating it is straightforward but more disruptive — its detail page is large (849 lines). Recommend a follow-up PR. Until then it lives at the same URL and works as before.
- `/admin/login` is intentionally outside the shell.
- The existing `volunteers` table, RLS policies, and indexes are untouched. The original volunteer columns are unchanged.

## Breakage check

- The volunteer payload sent by the new `js/volunteer-form.js` is a strict superset of what the old function expected (it adds `application_type: "volunteer"` to the body). The function ignores unknown fields, so old callers (if any) still work.
- The new `volunteer-submit.mjs` returns the same `{ ok, id }` shape it always did, plus a new `kind` field. Existing client code that ignores extra keys is unaffected.
- `admin-shell.js` only added one nav item and one icon; no removals.
