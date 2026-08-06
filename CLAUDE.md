# Ohio Pride PAC — Project Memory

## Source of truth (read this first)

The **live website files live in a Git repo**, not in this Drive folder.

- **Repo:** https://github.com/zachJCG/OhioPride (public)
- **Default branch:** `main`
- **Clone command:** `git clone --depth 1 https://github.com/zachJCG/OhioPride.git /tmp/OhioPride`

**Always clone the repo first** when the user asks for code changes. Don't try to read site source from Drive — Drive copies (under `Other/OhioPride/` here and `Joseph Carter Group/Internal/OhioPride`) are stale snapshots and frequently lock with `Resource deadlock avoided` from File Stream. Drive is fine for finished docs (PDFs, decks, branded letters); anything that ships to ohiopride.org belongs in the Git repo.

### Standard workflow for site code changes

1. `git clone --depth 1 https://github.com/zachJCG/OhioPride.git /tmp/OhioPride` in the bash sandbox
2. Read whatever files you need from `/tmp/OhioPride/`
3. Build a self-contained patch bundle in `outputs/ohiopride-pr-bundle/`
4. Zip it and return a `computer://` link with a `CHANGES.md`
5. User unpacks it inside their Git checkout and lets Claude Code wire the PR

**If a Drive read fails with `Resource deadlock avoided`, do NOT retry.** Pivot immediately to `git clone` from the repo URL above. The deadlock isn't fixable from inside the session.

## Repo layout (as of 2026-08-06, after the admin overhaul)

**The site is a Next.js app.** Next serves the remaining static pages
untouched and pages move to the App Router one at a time. Things to know
before editing:

- **Two root layouts via route groups.** `app/(site)/` carries the public
  site's layout/components/credits; `app/(admin)/` is the admin console with
  its own chrome (no marketing header/footer). Never add a top-level
  `app/layout.js` back — it would collapse the split.
- **Every remaining static page lives under `public/`.** URLs are unchanged:
  `public/about.html` answers on `/about`. Clean URLs, redirects, and headers
  are generated in `next.config.mjs` by walking `public/`.
- **A ported page beats the static one automatically.** The generated rewrites
  are `afterFiles`, so the moment an `app/.../page.js` exists it wins. That is
  the migration mechanism; see `docs/nextjs-migration.md`.

Top-level pages (under `public/`):
- `index.html`, `about.html`, `board.html`, `connect.html`, `contact.html`, `donate.html`, `donate/founding-member.html`, `founding-members.html`, `issues.html`, `methodology.html`, `privacy.html`, `scorecard.html`, `terms.html` (launch-day was removed 2026-08; `/launch-day` and `/rsvp` redirect to `/`)
- `issues/<bill_id>.html` — one detail page per bill (hb262, sb113, hjr4, etc.)

### Admin console (2026-08 overhaul)

- **Ported to the App Router** under `app/(admin)/admin/`: login, dashboard,
  menu, contacts, endorsements (+ `[id]` candidate pages), users, texting.
  Everything else still serves from `public/admin/` through the old shell
  (`admin-shell.js`) until ported.
- **Supabase connection values** for the browser, the middleware, and every
  caller-JWT server function come from `lib/supabase-public.mjs` (env with a
  public-literal fallback). Do not reintroduce a hard dependency on
  `NEXT_PUBLIC_SUPABASE_*` or `SUPABASE_ANON_KEY`: both were unset in
  production and took the admin down on 2026-08-06.
- **GRANTs are a separate layer from RLS.** `contacts_directory` is
  security_invoker, so a missing `GRANT SELECT ... TO authenticated` on a
  joined table (that was `donors`) breaks the whole module before any policy
  runs.
- **Sessions are cookies** (`@supabase/ssr` format). Root `middleware.js`
  gates `/admin/*` server-side; the static pages share the same session via a
  format-compatible cookie storage adapter inlined in `admin-shell.js` and
  `admin-auth.js`. New env: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Contacts is the one people module** (`/admin/contacts`, reads
  `public.contacts_directory`): donors, founding members, volunteers, network,
  newsletter, review queue, duplicate merge, ActBlue CSV import
  (`/api/admin-contacts-import`). `/admin/donors` and
  `/admin/fundraising/donors` redirect into it.
- **Endorsements** are status-based (submitted/under_review/endorsed/
  declined/withdrawn — there are no stage/decision columns live). Votes
  upsert `endorsement_reviews` on (application_id, reviewer_email); packet
  PDFs come from `/api/endorsement-pdf` (@react-pdf/renderer).
- **Removed modules (2026-08-06, DB + code):** c4 companies, launch day,
  admin email/news, call time. Their tables live in the locked `archive`
  schema; `admin_emails` is retired — access truth is `admin_users` +
  `admin_user_roles` + `role_permissions` only. Fundraising events
  (`/admin/events`) and elections are hidden until their migrations are
  applied (tables do not exist in production).
- The 2026-08-06 applied-DB reference and advisor status live in `docs/db/`.
  After the launch-day removal deploys, run
  `docs/db/post-code-merge/drop_launch_signups.sql`.

JS (in `js/`):
- `bill-data.js` — static `BILLS` array (TO BE REPLACED by Supabase fetch)
- `scorecard-data.js` — static `HOUSE_MEMBERS` / `SENATE_MEMBERS` / `LEGISLATOR_SPONSORSHIPS` (TO BE REPLACED)
- `voting-records.js` — static roll calls + exception map (TO BE REPLACED)
- `news-statements.js` — static news items
- `bill-pipeline.js` — pipeline component
- `bill-detail.js` — bill detail page logic
- `enhancements.js`, `main.js`, `site-template.js`, `ohiopride-data.js`

CSS: `css/style.css`, `css/site-template.css`

API functions. The implementations live in `lib/functions/*.mjs` and are
exported as App Router route handlers by one-line wrappers in
`app/api/<name>/route.js`. They are plain web handlers,
`(Request) => Response`, so the wrapper just re-exports them as GET and POST.
There is deliberately no root `api/` directory: under a framework preset the
framework owns `/api/*`, and keeping both invites a routing conflict.
Endpoints (`/api/<name>`):
- `actblue-sync.mjs` — hourly cron; ingests ALL ActBlue contributions (founding refcodes -> `founding_members`, rest -> `donors` with source `actblue`), maps employer/occupation/address, dedupes on the email + receipt pair
- `board-members.mjs` — feeds `/board`
- `founding-member-tiers.mjs` — feeds tier cards on `/founding-members` and `/donate/founding-member`
- `founding-members-progress.mjs` — 1,969 progress bar
- `public-members.mjs` — public donor roster, grouped by tier
- `site-leadership.mjs` — footer disclaimer block
- `submission-created.js` — legacy form handler
- `admin-contacts-import.mjs` — ActBlue CSV reconciliation for /admin/contacts
- `admin-user-manage.mjs` — invite / set_password / update_email / send_password_reset
- `admin-dashboard.mjs` — aggregated stats for /admin/dashboard
- `app/api/endorsement-pdf/route.js` — candidate packet PDF (implementation lives in the route; it needs JSX)

Supabase migrations (`supabase/migrations/`, all dated 2026-04-22 onward):
- `20260422015834_initial_schema.sql` — `board_members`, `founding_members` (+ `display_name`, `is_public`, `is_vetted`, `actblue_contribution_id`), `founding_member_tier()` fn, `founding_members_public` view, `founding_members_progress()` rpc
- `20260422020014_configuration_tables.sql` — `founding_member_tiers`, `sponsorship_tiers`, `site_leadership`
- `20260422060000_founding_members_recurrence.sql` — adds `recurrence` to `founding_members`, replaces `founding_member_tier()` to take recurrence
- `20260424000000_scorecard.sql` — `bills`, `roll_calls`, `legislator_vote_exceptions`. NO `legislators` table yet.
- `20260424100000_scorecard_grading.sql` — grading helpers
- `20260424110000_news_statements.sql` — news_statements

## What is and isn't already in Supabase

| Surface              | In DB?  | Page reads from DB?         |
|----------------------|---------|------------------------------|
| Board members        | Yes     | Yes (`board-members.mjs`)    |
| Founding member tiers| Yes     | Yes (`founding-member-tiers.mjs`) |
| Public donor roster  | Yes (view) | Yes (`public-members.mjs`)|
| Progress bar         | Yes (rpc) | Yes (`founding-members-progress.mjs`) |
| Site leadership      | Yes     | Yes (`site-leadership.mjs`)  |
| Bills catalog        | Yes     | **No** — pages still use `js/bill-data.js` |
| Roll calls           | Yes     | **No** — pages still use `js/voting-records.js` |
| Legislators          | **No**  | Static `js/scorecard-data.js` |
| Sponsorships         | **No**  | Static `LEGISLATOR_SPONSORSHIPS` map |

This is the gap closed by Round 3 (PR bundle 20260427-issues-scorecard-supabase).

## Founding member donor reference (for tracker)

Public donor display order is set explicitly via `display_order` column on `founding_members`. Order is **not** by donation date or amount.

| order | name              | amount  | zip   | county      |
|-------|-------------------|---------|-------|-------------|
| 1     | Zachary V Smith   | $25.00  | 45202 | Hamilton    |
| 2     | Jesse Shepherd    | $25.00  | 45248 | Hamilton    |
| 3     | Nicole Green      | $19.69  | 45420 | Montgomery  |
| 4     | Matthew Joseph    | $100.00 | 45420 | Montgomery  |

`county` is **derived from ZIP**, not free-text. Lookup table is `public.ohio_zip_county` (HUD Q1 2023 crosswalk, 1,359 Ohio ZIPs).

## Standing platform decisions

- **DB:** Supabase (Postgres). RLS enabled by default; public read where pages need it.
- **Hosting:** Vercel. Functions in `api/*.mjs` (Node ESM, web handler signature); config in `vercel.json` (cleanUrls, redirects, headers, hourly `actblue-sync` cron).
- **Donations:** ActBlue. Donor sync runs via `api/actblue-sync.mjs` (Vercel cron) into `founding_members`.
- **Frontend:** Next.js (App Router, JavaScript, no TypeScript) wrapping the existing plain HTML + vanilla JS pages, which are served from `public/` until each one is ported. Pages fetch from the `/api/*` route handlers, which proxy to Supabase using the service-role key (kept server-side). Run it with `npm run dev`; `npm run build` must pass before a PR lands.

## Things to never do

- Don't pull live ActBlue donor PII into the repo or a shared doc.
- Don't read/write site code from Drive — always treat the Git repo as source of truth.
- Don't put county into `founding_members` as free text. It's derived from ZIP via the trigger in migration `20260427000001_founding_members_county_from_zip.sql`.
- Don't ship Donor zips/addresses on the public roster — only first name, last initial, city, county.

## Useful queries

```sql
-- Donor roster, in display order, with derived county
SELECT display_order, first_name, last_initial, usps_city, county_name, amount
FROM   public.founding_members
ORDER  BY display_order;

-- ZIP -> primary county
SELECT public.county_for_zip('45420');  -- Montgomery County

-- Legislator scorecard
SELECT * FROM public.legislator_scorecard ORDER BY chamber, district;
```
