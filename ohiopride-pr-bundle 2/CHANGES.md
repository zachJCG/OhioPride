# OhioPride PR Bundle: Admin Console Rebuild + Volunteer Confirmation

**Date:** 2026-05-10
**Branch suggestion:** `feat/admin-console-v1`
**Author:** Zach (via Cowork)

## Summary

This bundle does two things:

1. **Confirms the /volunteer flow is wired end-to-end** — the public form,
   the Netlify function, the Supabase table, and the admin volunteers list
   were all already in place from the 2026-05-10 volunteers migration.
   No fix was needed for the public submission path; this bundle layers
   on the new admin shell and a per-volunteer detail drawer.
2. **Rebuilds `/admin/dashboard`** as a CAO360-style one-stop console,
   with a persistent sidebar, role-aware navigation, KPI cards, an
   endorsement pipeline widget, recent activity feed, county coverage,
   and quick actions — all driven by a new aggregated Netlify function
   gated by Supabase RLS.

It also lays the groundwork for the "permission-based structure with
customizable dashboards per user role" future state by introducing a
proper roles + permissions schema.

---

## What ships

### Database (new migration)

`supabase/migrations/20260510010000_admin_roles_and_permissions.sql`

Adds:

- `public.admin_roles` — catalog of 8 roles (super_admin, board_member,
  treasurer, endorsements_chair, volunteer_lead, comms_lead,
  legislative_lead, volunteer).
- `public.role_permissions` — module/action grid per role.
- `public.admin_users` — humans who can sign in; replaces the binary
  `admin_emails` allowlist over time (legacy `admin_emails` is preserved
  for back-compat and auto-promoted to `super_admin`).
- `public.admin_user_roles` — many-to-many user/role link.
- `public.admin_dashboard_prefs` — per-user dashboard layout JSON, so
  each board member can rearrange widgets later.
- Functions: `current_admin_user()`, `has_permission(module, action)`,
  `touch_admin_last_seen()`.
- `public.is_admin()` is upgraded to accept either the legacy
  `admin_emails` row OR an active `admin_users` row, so every existing
  RLS policy (`volunteers`, `endorsement_applications`, storage buckets,
  etc.) keeps working with zero changes.

**Backwards compatible:** the existing `admin_emails` table is preserved.
Anyone currently in `admin_emails` is auto-inserted into `admin_users`
as a `super_admin` on first run.

### Frontend: admin shell

- `admin/admin-shell.css` — persistent sidebar (collapsible),
  sticky top bar with breadcrumbs + user menu, KPI/widget grid
  primitives, pipeline cells, county coverage bars, quick-action
  cards, right-side detail drawer, toast.
- `admin/admin-shell.js` — boots the shell on any `/admin/*` page
  that has `<body class="admin-shell">` and a `#shell-root` div.
  Handles session check, loads the caller's roles/permissions,
  filters the sidebar to only modules they can see, exposes
  `window.AdminShell` API (`can()`, `openDrawer()`, `closeDrawer()`,
  `toast()`), and emits `admin-shell-ready` so each page renders
  its own body inside the shell.

### Frontend: pages

- `admin/dashboard/index.html` — **rebuilt**. Greeting card,
  4 KPI cards (filtered by permission), endorsement pipeline widget,
  quick-action grid, recent activity feed, top-counties coverage bar.
  All data comes from the new `admin-dashboard` Netlify function.
- `admin/volunteers/index.html` — **rebuilt** on the new shell.
  Same table + filters + status updates as before, plus:
  - clickable rows that open a right-side detail drawer with the
    full volunteer record (contact, location, interests, skills,
    availability, prior campaigns, opt-ins, notes, submission time);
  - per-page top-right "Export CSV" button that respects the
    current filters.
  - deep-linkable: `/admin/volunteers?id=<uuid>` auto-opens that
    volunteer's drawer (matches the recent-activity feed links on
    the dashboard).
- `admin/board/index.html`, `admin/bills/index.html`,
  `admin/legislators/index.html`, `admin/news/index.html`,
  `admin/launch/index.html`, `admin/users/index.html`,
  `admin/settings/index.html` — **new stubs** so the sidebar links
  resolve. Each is a 6-line page that opts into the shell and shows
  a "module coming soon" empty state. Hot-swap when ready.

### Backend (Netlify function)

- `netlify/functions/admin-dashboard.mjs` — `GET /.netlify/functions/admin-dashboard`.
  Accepts `Authorization: Bearer <supabase JWT>`, runs `is_admin()`
  via RPC, and returns the dashboard payload:
  - `kpis` (volunteer/endorsement/donor/bill counts + 7/30-day deltas)
  - `pipeline` (endorsement status histogram)
  - `top_counties` (top 6 by volunteer count)
  - `recent` (mixed activity feed across volunteers, endorsements,
    and founding members)
  - All reads parallelized via `Promise.allSettled` so a missing
    table (e.g. `bills` if you haven't seeded it) degrades gracefully.

### Config

- `netlify.toml.patch` — 7 additional `[[redirects]]` rules to expose
  `/admin/board`, `/admin/bills`, `/admin/legislators`, `/admin/news`,
  `/admin/launch`, `/admin/users`, `/admin/settings` as clean URLs.
  Append these to the existing redirects block in `netlify.toml`.

---

## What this does NOT change

- `volunteer.html` and `js/volunteer-form.js` are untouched. The form
  was already functioning. Submissions hit `/.netlify/functions/volunteer-submit`,
  which writes to `public.volunteers` and the admin view reads back from
  that table under RLS. Verified by reading every file in the chain.
- `admin/admin-auth.js` is untouched. Existing pages that still use
  it (login, donors, endorsements list, endorsement detail) keep
  working — they coexist alongside the new shell. Migrate them one
  at a time to the shell when convenient.
- `admin/admin-shared.css` is untouched. The new shell layers on top.

---

## Verification

The end-to-end volunteer path is:

```
[ /volunteer ]  --(POST JSON)-->  [ /.netlify/functions/volunteer-submit ]
                                              |
                                              v (service-role key)
                                  [ public.volunteers ]
                                              |
                                  RLS: anon INSERT only, admin SELECT/UPDATE
                                              |
                                              v
[ /admin/volunteers ]  --(anon-key + auth JWT)-->  table read via is_admin()
```

All pieces are present in the repo at HEAD (verified):

- `volunteer.html` (709 lines), form with id `volunteerForm`, posts
  to `/.netlify/functions/volunteer-submit`.
- `js/volunteer-form.js` (262 lines), multi-step JS handler with
  validation, honeypot, success state.
- `netlify/functions/volunteer-submit.mjs` (165 lines), POST handler
  with email + zip validation, allowed-value filtering, honeypot,
  service-role upsert on email.
- `supabase/migrations/20260510000000_volunteers.sql`, schema +
  indexes + RLS + column-level INSERT grants.
- `admin/volunteers/index.html` (this PR rebuilds it on the shell;
  the table read/update logic moves to use `admin-shell` APIs).

---

## Install order

1. **Supabase:** paste
   `supabase/migrations/20260510010000_admin_roles_and_permissions.sql`
   into the SQL editor and run once. Confirm with:
   ```sql
   select email, full_name from public.admin_users order by created_at;
   select * from public.admin_roles order by sort_order;
   select * from public.role_permissions limit 10;
   ```
2. **Repo:** unpack this bundle inside your `OhioPride/` checkout
   (root-relative paths). Files only add or overwrite; nothing is
   deleted.
3. **netlify.toml:** append the 7 redirects from `netlify.toml.patch`
   to the existing `[[redirects]]` section.
4. **Commit + push.** Netlify deploys; visit `/admin/dashboard`.

After ship:

- Add new humans via SQL (one-liner per user):
  ```sql
  insert into public.admin_users (email, full_name, title)
    values ('newperson@example.org', 'New Person', 'Volunteer Lead');
  insert into public.admin_user_roles (user_id, role_slug)
    values ((select id from public.admin_users where email='newperson@example.org'),
            'volunteer_lead');
  ```
- The `/admin/users` page is stubbed and ready for a real CRUD UI on
  top of the new tables — that's the next session's work.

---

## Open follow-ups (for the next session)

- Build `/admin/users` UI on top of `admin_users` + `admin_user_roles`
  (invite by email, assign role, deactivate). Schema already supports
  it.
- Build `/admin/settings` UI that reads/writes `admin_dashboard_prefs`
  so each user can pick which dashboard widgets show + their order.
- Migrate `admin/donors/index.html` and `admin/endorsements/index.html`
  to the new shell (mechanical: change `<body>` class, replace meta
  bar with `<div id="shell-root">`, drop `admin-auth.js`, use
  `admin-shell-ready` event). Their existing data logic stays.
- Build out the `/admin/bills`, `/admin/legislators`, `/admin/news`
  modules — the data is already in Supabase, just needs UI.
- Wire a recurring `is_active = true` flag on `public.bills` if it
  doesn't exist; the dashboard function reads it for the "Active
  bills" KPI and falls back to 0 if missing.

---

## Risks / things to watch

- **Existing admin_emails row for `zach@ohiopride.org`.** The migration
  backfills this into `admin_users` as `super_admin`. If you've added
  other emails to `admin_emails` (e.g. for Treasurer or other board
  members) they'll all come in as `super_admin`. That's the safe
  default — narrow them down per role after install if needed.
- **Service-role key.** `admin-dashboard.mjs` reads with the caller's
  Supabase JWT (not the service-role key), so RLS still applies and
  it is safe to expose. The function only requires `SUPABASE_URL`
  and `SUPABASE_ANON_KEY` env vars, both already set in Netlify.
- **CAO360 source files.** Drive locked on every read of the CAO360
  TSX files. The dashboard pattern was rebuilt from the directory
  listing (AdminLayout, KPICard, StatusPill, pages list) plus
  standard SaaS dashboard idioms, not a pixel-perfect copy. Easy
  to iterate from here.
