# Ohio Pride PAC :: Road Tour Admin Dashboard

Drop-in bundle for `ohiopride.org/admin/pride`. Backs the four-tab event/volunteer assignment workflow generated from the Coordinator Workbook.

## What's already done on Supabase (project `dkdxefzhttkmjhdbkvqn`)

1. `public.pride_event_volunteers` table (assignment join) — confirm / tentative / decline / remove, RLS gated by `public.is_admin()`.
2. `public.pride_event_volunteers_v` and `public.pride_event_roster_v` helper views (security_invoker).
3. Seed: 12 demo volunteers in `pride_volunteers` (source='seed_workbook'), 19 assignments distributed across the four statuses on Tier-1 events so every tab has data.
4. `auth.users` row for `admin@ohiopride.org` (email confirmed) with bcrypt-hashed password and matching `auth.identities` row.
5. `admin@ohiopride.org` added to `public.admin_emails` — grants Super Admin via the legacy fallback path in `admin-shell.js`.

## What ships in this bundle

```
ohiopride-admin-pride/
├── admin/pride/index.html         # New page at /admin/pride
├── admin/pride/pride.js           # Dashboard logic
├── patches/admin-shell.pride.patch  # Adds Pride nav item + module to legacy super_admin synth
├── supabase/migrations/20260519000000_pride_event_volunteers.sql
└── README.md
```

## Deploy steps

1. Copy `admin/pride/` into the live site repo at the same path (`/admin/pride/index.html` + `/admin/pride/pride.js`).
2. Apply the small patch in `patches/admin-shell.pride.patch` to `admin/admin-shell.js` (two hunks: nav entry + legacy synth list).
3. Commit `supabase/migrations/20260519000000_pride_event_volunteers.sql` so the local and remote schemas stay in sync. The migration is already applied to the live project.
4. Push. The page is reachable at `https://ohiopride.org/admin/pride` after deploy.

## Admin credentials (rotate immediately)

```
Email:    admin@ohiopride.org
Password: OhioPride!Adm1n#2026
```

This is a placeholder. Sign in at `/admin/login`, then have the user change the password via Supabase Studio → Auth → Users, or by sending a password reset email.

## Notes / Assumptions

- The user wrote `adadm@ohipride.org` in the request. Read as a typo for `admin@ohiopride.org` (matches the `ohiopride.org` domain in use everywhere else). If the actual intended address is different, update both `auth.users.email` and `public.admin_emails.email`.
- The four-tab UX (Confirmed / Tentative / Declined / Removed) is built around `status` transitions. "Remove" is a soft state that preserves audit history; the small `×` button is an explicit hard delete with a confirm.
- Seed assignments are tagged `set_by = 'seed@ohiopride.org'`. Filter them out with `WHERE set_by <> 'seed@ohiopride.org'` if you want a clean board before launch.

## Sanity SQL

```sql
-- Roster overview
SELECT event_date, name, city, confirmed_count, tentative_count, declined_count, removed_count
FROM pride_event_roster_v
WHERE pac_priority
ORDER BY event_date;

-- All assignments for a single event
SELECT first_name, last_name, role, status, set_at
FROM pride_event_volunteers_v
WHERE event_slug = 'cleveland-march-2026-06-06';

-- Strip seed data when ready
DELETE FROM pride_event_volunteers WHERE set_by = 'seed@ohiopride.org';
DELETE FROM pride_volunteers       WHERE source = 'seed_workbook';
```
