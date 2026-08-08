# Ohio Pride PAC :: Endorsement System

Supabase-backed candidate endorsement workflow, wired against the live
`Ohio Pride` Supabase project (ref `dkdxefzhttkmjhdbkvqn`).

## The process, in one place

**Apply → Screening Committee review → Board vote → notify.** Four steps, and
**no candidate interview** — the Screening Committee works from the application
and the public record. That sequence is written down in exactly three places,
and they must not drift apart:

| Where | What it drives |
|---|---|
| `ENDORSEMENT_PROCESS` in `lib/endorsements.mjs` | `/endorsements` and the confirmation page |
| `.apply-steps` in `public/endorsement/screening/index.html` | the strip above the application form |
| `endorsement_path_meta.process_note` (Supabase) | the per-office note inside the form |

The column was called `interview_note` until 2026-08-08. If you find interview
language anywhere in this flow, it is a bug.

## Pages

| Path | Audience | What it does |
|---|---|---|
| `/endorsement/screening` | Public | Multi-step questionnaire (still static HTML under `public/`). Inserts into `endorsement_applications` as anon; the question set is loaded from the `endorsement_*` catalog tables, so changing a question needs no deploy. |
| `/endorsement/screening/thank-you` | Public | App Router. Confirmation, with the four steps and step one marked done. |
| `/endorsements` | Public | App Router, server rendered from the `public_endorsements` view. Card grid, office/year filters, and the "How endorsements work" explainer. |
| `/endorsements/<slug>` | Public | App Router. One candidate, with its own title, meta description, and OG card. Statically generated at build and revalidated every 10 minutes, so a new endorsement appears without a deploy. |
| `/admin/endorsements` | Admin | The queue: **Needs your vote / Open / All**, grouped by status, with the board packet export. |
| `/admin/endorsements/<id>` | Admin | One candidate: vote bar, board tally, questionnaire, assignments, decision panel, activity trail. |

`/admin/endorsements/login` and `/admin/endorsements/detail` are legacy URLs and
redirect (see `next.config.mjs`).

## Adding an endorsement

1. `/admin/endorsements/<id>` → **Record the decision** → **Endorsed**. This
   stamps `endorsed_at` (a database trigger does it) and, because
   `is_published` defaults to true, publishes the candidate.
   Untick **Show on the public endorsements page** to hold an announcement.
2. Drop the campaign photo in `public/assets/endorsements/<slug>.jpg`.
3. Add an entry to `lib/endorsement-content.mjs` — photo, one-line `summary`
   for the card, and the `profile` statement. Read the rule at the top of that
   file first: **the card summary and the profile must not restate each other.**
4. Add the candidate's URL to `public/sitemap.xml`.

A candidate with no editorial entry still renders: initial-letter avatar, their
own bio clearly attributed to them, and a "statement coming soon" line.

## Data model

| Object | Purpose |
|---|---|
| `endorsement_applications` | One row per application. `status` is `submitted → under_review → endorsed / declined`, plus `withdrawn`. There is no `stage` column; the admin drives `status` directly. |
| `endorsement_applications.endorsed_at` | When the Board endorsed. Stamped by `trg_endorsement_stamp_endorsed_at` on the status change and cleared if the row is reopened. **This is the date the public page shows** — it used to be `updated_at`, so fixing a typo in a bio moved the endorsement date. |
| `endorsement_applications.is_published` | Whether an endorsed candidate shows publicly. Lets a decision be recorded before it is announced. |
| `endorsement_reviews` | One vote + recommendation per board member. Votes are `endorse`, `decline`, `abstain` — nothing else. Unique per `(application_id, reviewer_email)`. |
| `endorsement_assignments` | Which board members are assigned to weigh in. |
| `endorsement_activity` | Append-only timeline: votes, status moves, assignments. |
| `endorsement_path_meta`, `endorsement_office_options`, `endorsement_questions` | The application form's catalog: office types, offices, and the per-path question set. |
| `public_endorsements` | The **only** public surface. Owner-privileged view over the published columns of `status='endorsed' AND is_published` rows. |

### Questionnaire answers span three eras

`lib/endorsement-answers.mjs` is the single reader, shared by the admin
candidate page and the PDF packet:

1. `responses` keyed to the path's question catalog (every application since
   the path-aware form).
2. The legacy `q1..q10` columns. Some of those rows also carry a `legacy_q*`
   mirror in `responses`, but the mirror lost the `q*_explanation` text, so the
   columns win and the mirror is suppressed. **Do not drop those columns** —
   the mirror is not a complete substitute and the original prompts are no
   longer recoverable.
3. Anything else left in `responses`, rendered last so nothing a candidate
   wrote silently disappears.

## Who can do what (RLS)

- **anon** — may `INSERT` an application with `status='submitted'` and no
  reviewer fields. **No `SELECT` on `endorsement_applications` at all** (closed
  2026-08-08: the published anon key could read campaign emails, phone numbers,
  typed signatures, conflict disclosures, internal reviewer notes, and
  endorsements that had not been announced yet). Public reads go through
  `public_endorsements`, which is owner-privileged and therefore unaffected.
- **`endorsements:read`** (board members, chair, director) — read every
  application, vote, and timeline entry, and cast/update **their own** vote
  (`reviewer_email` is pinned to their JWT email).
- **`endorsements:write`** (`endorsements_chair`, `super_admin`) — record the
  decision, publish/unpublish, assign reviewers, edit reviewer notes.

Board members influence the outcome through their vote, not by editing the
record.

## Supabase wiring

- Public connection values come from `lib/supabase-public.mjs` (env with a
  public-literal fallback). Do not reintroduce a hard dependency on
  `NEXT_PUBLIC_SUPABASE_*` — both were unset in production and took the admin
  down on 2026-08-06.
- `/endorsements` reads the view with the anon key from the server. No anon key
  and no supabase-js CDN bundle ship to the browser from that page any more.
- The service-role key is never exposed to the browser.
- The PDF packet (`/api/endorsement-pdf`) runs on the caller's JWT; RLS and
  `has_permission('endorsements','read')` gate the data.

## Verifying a change

```bash
npm run build && npm start &
node scripts/check-routes.mjs
```

The suite asserts real page copy for `/endorsements`,
`/endorsements/jeff-givan`, and the confirmation page, plus the folder-index
redirects. `/endorsements/index.html` has to redirect: without it the URL falls
through to `/endorsements/[slug]` and 404s as an unknown candidate.
