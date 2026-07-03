# Ohio Pride PAC :: Endorsement System

Supabase-backed candidate endorsement workflow. Wired against the live
`Ohio Pride` Supabase project (ref `dkdxefzhttkmjhdbkvqn`).

## Pages

| Path                              | Audience       | What it does                                             |
|-----------------------------------|----------------|----------------------------------------------------------|
| `/endorsement/screening`          | Public         | Multi-step questionnaire. Inserts into `endorsement_applications` as anon. |
| `/endorsement/screening/thank-you`| Public         | Confirmation page after submit.                          |
| `/endorsements`                   | Public         | Lists endorsed candidates from `public_endorsements` view. |
| `/admin/endorsements/login`       | Admin          | Magic-link sign-in via Supabase Auth.                    |
| `/admin/endorsements`             | Admin          | ATS-style review console: list/filter/sort applications, per-member voting, reviewer assignment, pipeline progression, and the director decision/push controls (all in the slide-out drawer). |
| `/admin/endorsements/detail`      | Admin          | Legacy deep link — redirects into the console drawer (`?id=`). |

## Review workflow (ATS for the board)

Migration `supabase/migrations/20260703000000_endorsement_review_workflow.sql`
adds the tracking layer on top of `endorsement_applications`:

| Object | Purpose |
|--------|---------|
| `endorsement_applications.stage` | Internal pipeline: `new → screening → board_review → voting → endorsed / declined`, plus side states `tabled` / `withdrawn`. A trigger keeps the public `status` (and therefore `public_endorsements` / `/endorsements`) derived from `stage`. |
| `endorsement_reviews` | One vote + recommendation per board member. Vote scale: `endorse, lean_endorse, neutral, lean_decline, decline, abstain, recuse`. Unique per `(application_id, reviewer_email)`. |
| `endorsement_assignments` | Which board members are assigned to weigh in on an application. |
| `endorsement_activity` | Append-only progression timeline (votes, stage moves, assignments, director pushes, decisions). |

### Who can do what (RLS)

- **`endorsements:read`** (board members, chair, director, …) — read every
  application, every vote, and the timeline; **cast / update their own vote**
  (their `reviewer_email` is pinned to their JWT email — they can't vote as
  anyone else, and can't change the application itself).
- **`endorsements:write`** (`endorsements_chair`, `super_admin` / director) —
  move the `stage`, assign reviewers, record the decision, edit reviewer
  notes, and **"Push endorsement"** — publish the endorsement whenever the
  vote makes the outcome clear, regardless of how many members have voted.

Application UPDATE is now gated on `endorsements:write` (previously any active
admin). Board members influence the outcome through their vote, not by editing
the record.

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

1. **Authentication > URL Configuration > Redirect URLs**: add
   `https://ohiopride.org/admin/endorsements` (and any preview URL you want
   magic links to land on, e.g. `https://deploy-preview-XXX--ohiopride.netlify.app/admin/endorsements`).
2. **Authentication > Providers > Email**: enable magic links if not already on.
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

That's it. The next time they sign in via magic link, `is_admin()` returns
true for their JWT and the dashboard renders.

## Local / preview verification

1. Visit `/endorsements` &mdash; should render the empty-state copy ("No
   endorsements yet"), since `public_endorsements` is empty until a row in
   `endorsement_applications` flips to `status = 'endorsed'`.
2. Visit `/endorsement/screening` &mdash; submit a test row. The form
   redirects to `/endorsement/screening/thank-you`.
3. Visit `/admin/endorsements` &mdash; should redirect to the login page.
4. Sign in with a seeded admin email. Magic link arrives via Supabase Auth.
5. After clicking the link, you land back on the list with your test row.
6. Open the row, change `status` to `endorsed`, save. Refresh `/endorsements`
   &mdash; the candidate now appears.

## Phase 4 / 5 (not in this PR)

The PDF generator (`/.netlify/functions/generate-endorsement-pdf`) and the
Resend-backed email triggers from PR #74's bundle are intentionally out of
scope for this PR. The "Generate PDF" button on the detail page shows a
friendly toast until that function is deployed.
