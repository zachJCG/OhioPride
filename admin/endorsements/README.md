# Ohio Pride PAC :: Endorsement System

Supabase-backed candidate endorsement workflow. Wired against the live
`Ohio Pride` Supabase project (ref `dkdxefzhttkmjhdbkvqn`).

## Pages

| Path                              | Audience       | What it does                                             |
|-----------------------------------|----------------|----------------------------------------------------------|
| `/endorsement/screening`          | Public         | Multi-step questionnaire. Inserts into `endorsement_applications` as anon. |
| `/endorsement/screening/thank-you`| Public         | Confirmation page after submit.                          |
| `/endorsements`                   | Public         | Lists endorsed candidates from `public_endorsements` view. |
| `/admin/endorsements/login`       | Admin          | Email + password sign-in via Supabase Auth.              |
| `/admin/endorsements`             | Admin          | List, filter, sort all applications. Authorized via `is_admin()`. |
| `/admin/endorsements/detail`      | Admin          | Detail view for one application. Update `status` and `reviewer_notes`. |

## Supabase wiring

- All pages use the published anon key (already pasted in the inline `CONFIG`
  block at the top of each `index.html`).
- RLS policies (live in Supabase, mirrored in
  `supabase/migrations/20260505000000_endorsement_system.sql`) enforce:
  - anon may `INSERT` only with `status = 'submitted'` and no reviewer fields.
  - anon may `SELECT` only rows where `status = 'endorsed'`.
  - authenticated users may `SELECT`/`UPDATE` all rows iff
    `is_admin()` returns true (their JWT email is in `public.admin_emails`).
- No service-role key is ever exposed to the browser.

## One-time Supabase Auth setup

1. **Authentication > Providers > Email**: enable email + password sign-in
   (and disable "Confirm email" if you want admins to be usable as soon as
   the account is created).
2. **Authentication > Users**: create one user per board member with their
   email and an initial password, then share the credential out-of-band.
3. **Storage**: create a private bucket named `endorsement-pdfs` (used by the
   Phase 4 PDF generator; the storage RLS policies in the migration kick in
   once the bucket exists).
4. **`admin_emails`**: insert the email(s) of every staffer who needs admin
   access. Already seeded with `zach@ohiopride.org`.

## Adding an admin

```sql
insert into public.admin_emails (email, added_by)
values ('newadmin@ohiopride.org', 'manual')
on conflict (email) do nothing;
```

That's it. The next time they sign in with their email and password,
`is_admin()` returns true for their JWT and the dashboard renders.

## Local / preview verification

1. Visit `/endorsements` &mdash; should render the empty-state copy ("No
   endorsements yet"), since `public_endorsements` is empty until a row in
   `endorsement_applications` flips to `status = 'endorsed'`.
2. Visit `/endorsement/screening` &mdash; submit a test row. The form
   redirects to `/endorsement/screening/thank-you`.
3. Visit `/admin/endorsements` &mdash; should redirect to the login page.
4. Sign in with a seeded admin email and the password set for that user
   in Supabase Auth.
5. After signing in, you land back on the list with your test row.
6. Open the row, change `status` to `endorsed`, save. Refresh `/endorsements`
   &mdash; the candidate now appears.

## Phase 4 / 5 (not in this PR)

The PDF generator (`/.netlify/functions/generate-endorsement-pdf`) and the
Resend-backed email triggers from PR #74's bundle are intentionally out of
scope for this PR. The "Generate PDF" button on the detail page shows a
friendly toast until that function is deployed.
