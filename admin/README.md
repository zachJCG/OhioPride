# Ohio Pride PAC :: Admin System

This directory hosts the board/staff admin system. It is **noindex** and
sits behind Supabase Auth + an `admin_emails` allowlist.

## Routes

| Path                      | Module                    | Status        |
|---------------------------|---------------------------|---------------|
| `/admin`                  | Dashboard hub             | Live          |
| `/admin/login`            | Magic-link sign-in        | Live          |
| `/admin/endorsements`     | Endorsement applications  | Live (PR #79) |
| `/admin/endorsements/login`| Endorsements module login| Live (PR #79) |
| `/admin/endorsements/detail`| Application detail view | Live (PR #79) |
| `/admin/donors`           | Donor database            | Placeholder   |
| `/admin/volunteers`       | Volunteer database        | Placeholder   |

The endorsements module shipped earlier and has its own login. Both logins
authenticate the same Supabase user and the same allowlist; they just
land you in different places after sign-in. New modules should use
`/admin/login` (the canonical login) and the shared shell.

## Files

| File                          | Purpose                                        |
|-------------------------------|------------------------------------------------|
| `admin/admin-shell.css`       | Shared chrome (header, subnav, cards, alerts). |
| `admin/admin-shell.js`        | `window.AdminShell.protect()` and `mountLogin()`. |
| `admin/index.html`            | Dashboard hub.                                 |
| `admin/login/index.html`      | Canonical magic-link login.                    |
| `admin/donors/index.html`     | Placeholder for the donor module.              |
| `admin/volunteers/index.html` | Placeholder for the volunteer module.          |
| `admin/endorsements/*`        | Endorsement module (PR #79). Has its own CSS.  |

## Auth (magic link)

The login page calls `supabase.auth.signInWithOtp({ email })`. Supabase
emails a one-time link. Clicking it returns the user to `/admin` (or to
the `?next=` path the shell preserved) with tokens in the URL hash.
`@supabase/supabase-js` reads them, persists the session, and we clean
up the hash.

```
Browser ── signInWithOtp ──► Supabase Auth
   ▲                              │
   │  emailRedirectTo             ▼
   └────────── Magic email ──── Click link
                                  │
                                  ▼
                          /admin#access_token=…
                                  │
                              session persisted
```

### Adding password auth later

The shell is structured so that swapping in `signInWithPassword(email, password)`
is a contained change to `/admin/login` and a small extension of
`admin-shell.js`. The session shape, the allowlist check, and the chrome
do not change.

## Authorization

We do **not** trust the JWT alone. After session restore the shell runs:

```js
client.from('admin_emails')
  .select('email')
  .eq('email', session.user.email)
  .maybeSingle();
```

`public.admin_emails` has RLS enabled with a SELECT policy that fires
only when `is_admin()` returns `true`. So:

- Allowed admin → row comes back → shell reveals the page.
- Anyone else → empty result or RLS error → shell signs them out and
  shows an "Access denied" blocker.

No private data renders before this round-trip succeeds. To add or
revoke an admin, insert/delete a row in `public.admin_emails` (Supabase
SQL editor or a migration).

## Browser keys only

Every admin page ships with the **anon/publishable** Supabase key. The
service-role key never reaches the browser. Server-side functions in
`netlify/functions/*` use the service-role key from Netlify env vars
where elevated access is required (for example `actblue-sync.mjs`).

## Supabase Auth setup

One-time setup in the Supabase dashboard:

1. **Authentication → URL Configuration** — add the site URL (e.g.
   `https://ohiopride.org`) and redirect URLs:
   - `https://ohiopride.org/admin`
   - `https://ohiopride.org/admin/endorsements`
   - any preview/staging origins you want to allow.
2. **Authentication → Providers → Email** — enable the `Email` provider
   with magic-link delivery.
3. **Authentication → Email Templates** — confirm the magic-link
   template uses your branded sender.
4. **public.admin_emails** — insert a row for each authorized admin
   email (lowercased).

## Future split PRs

This PR ships only the foundation. Planned follow-ups:

1. **Donors module** — wire `/admin/donors` to `founding_members`
   (search, recurrence, ActBlue contribution lookup, exports). Will need
   an admin SELECT policy on `founding_members`.
2. **Volunteers module** — schema + intake + admin list at
   `/admin/volunteers`.
3. **Endorsements consolidation** — migrate
   `/admin/endorsements/*` from its own login + CSS onto `admin-shell`,
   so all modules share one chrome and one login.
4. **Password auth** — optional `signInWithPassword` path on
   `/admin/login`, controlled by a flag.
