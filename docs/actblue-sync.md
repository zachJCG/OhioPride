# ActBlue auto-sync

Every hour, `/api/actblue-sync` pulls the last day or so of contributions from
ActBlue and reconciles them into the founding member roster, the giving
history, and the contacts spine. The Members page in the admin shows when it
last ran and has a **Sync now** button that calls the same code.

Before 2026-09-08 the cron called an endpoint ActBlue answers with 404, with
username/password variables that were never set, so it had never ingested a
contribution. Everything on the roster was entered by hand or by one-off
imports. This document describes the rewrite.

## Setup (Vercel → Settings → Environment Variables)

| Variable | Required | What it is |
|----------|----------|------------|
| `ACTBLUE_CLIENT_UUID` | **yes** | The client UUID from ActBlue (entity dashboard → API credentials). |
| `ACTBLUE_CLIENT_SECRET` | **yes** | The matching client secret. Treat like a password. |
| `CRON_SECRET` | strongly recommended | Any long random string. Vercel sends it as `Authorization: Bearer …` on cron calls; the endpoint refuses unauthenticated calls once it is set. Without it, anyone can trigger a sync (harmless, but it hits the ActBlue API). |
| `ACTBLUE_SYNC_AUTO_PUBLISH` | no | `true` to insert new founding members already vetted and public. Default: private until an admin vets them on the Members page. |
| `ACTBLUE_FOUNDING_REFCODE_MATCH` | no | Default `founding`. A refcode containing it is a founding-member contribution. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | **yes** | Already set. |

`ACTBLUE_USERNAME` / `ACTBLUE_PASSWORD` are read as a fallback for the two
credential variables, so an older pair keeps working, but use the new names.

After adding variables, redeploy (Deployments → ⋯ → Redeploy). The next cron
tick, or **Sync now** on `/admin/members`, runs the first sync.

Credentials never go in the repo, in a doc, or in a chat. If a secret has been
pasted anywhere it should not have been, rotate it in ActBlue and update the
Vercel variable.

## What one run does

1. **Window.** Incremental runs start 24 hours before the last successful
   run's end (never less than 48 hours back, never more than 180 days). With
   no prior run, the first sync looks back 180 days, so history self-heals on
   the first tick.
2. **Three exports** for that window, through ActBlue's CSV API (request,
   poll, download): `paid_contributions`, `refunded_contributions`,
   `cancelled_recurring_contributions`.
3. **Reconcile** (all in `lib/actblue.mjs`, shared with the admin CSV import):
   - **Founding members are people, not payments.** A founding refcode
     contribution with Recurrence Number 1 creates one `founding_members` row
     per email. Monthly installments (Recurrence Number 2+) and any further
     founding-tier gift from the same email go to `donors` only, linked
     through the contact. Founding numbers therefore follow people, in join
     order.
   - **Matching** is by ActBlue Lineitem ID, then Receipt ID (older imports
     keyed rows on the receipt; the lineitem is adopted so the next run matches
     on the stable key), then email. Nothing is inserted twice.
   - **Admin-curated fields are never touched** after a row exists:
     `display_name`, `is_public`, `is_vetted`, `notes`, `elected_office`,
     `jurisdiction`, `public_quote`, `founding_number`. ActBlue-owned fields
     (email, city, state, ZIP, phone, address, employer, occupation, refcode)
     fill blanks only.
   - **Every payment** becomes a `donors` row keyed on the lineitem (source
     `actblue`), including event-form contributions and QR-code gifts.
   - **Contacts** are enriched fill-never-overwrite and tagged with the
     `donor` role (plus `founding_member`) and the `actblue` source.
   - **Refunds** stamp `refunded_at` on the payment. A refunded membership
     payment stops counting toward 1,969 and leaves the public roster; the row
     is kept and the Members page shows a Refunded badge.
   - **Cancellations** flip `recurrence` to `cancelled` and stamp
     `recurring_cancelled_at` on the series.
4. **Log** the run in `public.actblue_sync_runs`: window, counts, a bounded
   plan (ids and actions, no names), and any row-level problems.

Dates in ActBlue exports are US Eastern wall-clock; the sync converts them to
real instants (DST-aware). The rows already on the roster follow the same
convention: on 2026-09-08 a dry run matched 145 existing founding rows to
their ActBlue payments and the stored timestamps agreed to the second.

## Endpoint

`GET|POST /api/actblue-sync`

Auth, one of:

- `Authorization: Bearer <CRON_SECRET>` (the Vercel cron)
- `Authorization: Bearer <Supabase access token>` for an admin whose role has
  `donors:write` (the Members page button)
- no header, only while `CRON_SECRET` is unset (the response carries a warning)

Parameters (query string, or JSON body on POST):

| Param | Meaning |
|-------|---------|
| `dry_run=1` | Read ActBlue and log the plan, write nothing. The Members page **Preview** button. |
| `since=YYYY-MM-DD` (+ `until=`) | Backfill that range instead of the incremental window. Chunked to 180-day requests; two years max per call. |
| `types=paid,refunded,cancelled` | Subset of exports to run. Default all three. |
| `force=1` | Ignore a run that looks like it is still in progress. |

Responses: `200` with counts on success, `409` if a run is in progress,
`502` when ActBlue failed (the run row keeps the error), `500` for missing env
or a database failure. A backfill example:

```
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://ohiopride.org/api/actblue-sync?since=2026-04-01&dry_run=1"
```

The route runs on the Node runtime with `maxDuration = 300`; the handler keeps
its own 270-second budget so the run row is always closed.

## Admin surfaces

- **Members** (`/admin/members`): the sync card (last run, Preview, Sync now,
  history), Refunded / Cancelled monthly filters and badges, and phone, ZIP,
  address, refcode and refund date in the drawer.
- **Contacts** person drawer: giving history marks refunded payments and
  installment numbers.
- **Contacts → Import CSV**: contribution exports now go through the same
  reconciliation; the result shows founding members added / updated.
- **Dashboard**: the founding members tile says when ActBlue last synced.

## Database

Migration `20260908000000_actblue_sync_runs_and_refunds.sql` (applied live
2026-09-08, see `docs/db/CHANGES-2026-09-08.md`):

- `founding_members`: `phone`, `address1`, `zip`, `refcode`,
  `actblue_donor_id`, `refunded_at`, `recurring_cancelled_at`
- `donors`: `fee_cents`, `recurrence_number`, `kind`, `actblue_donor_id`,
  `refunded_at`, `recurring_cancelled_at`
- `founding_member_tiers.actblue_url` (the 2026-04-27 migration that never
  reached production; `/api/founding-member-tiers` was returning 500)
- `founding_members_progress()`, `founding_members_public`, and
  `contacts_directory` ignore refunded rows
- `donor_sync_founding_member()` carries the new fields into the fan-out row,
  filling blanks only
- `fill_oh_county()` falls back from city to ZIP
- `public.actblue_sync_runs` with RLS (`donors:read` to select)

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| Members page says "The server is missing ACTBLUE_CLIENT_UUID…" | Variables not set, or set without a redeploy. |
| Run failed with `actblue csv request failed (401)` | Wrong UUID/secret, or the credential was revoked in ActBlue. |
| Run failed with `not ready before deadline` | ActBlue took too long to build a large export. Re-run; a backfill can be split with `since`/`until`. |
| Public count on ohiopride.org did not move after a sync | The CDN caches `/api/founding-members-progress` for a minute. The count includes unvetted members; the public *roster* lists only vetted ones, so new members stay off the list until vetted unless `ACTBLUE_SYNC_AUTO_PUBLISH` is on. |

## What the first run will do

A zero-write dry run on 2026-09-08 (180-day window, 234 ActBlue payments
against the live tables) planned:

- 3 new founding members (two $25 Founding Members, one $100/mo Founding
  Circle) that had never been entered;
- 139 existing founding rows re-keyed from receipt id to ActBlue lineitem id,
  with ZIP, address, refcode and phone filled in where blank (about 145 rows
  each for ZIP and address, 61 for phone);
- 65 new giving-history rows: mostly monthly installments that were never
  recorded (52), plus event-form and QR-code contributions and a few repeat
  gifts from existing members;
- 1 monthly series marked cancelled;
- no refunds (the one refunded payment ActBlue lists was never on the roster).

Nothing is deleted, no admin-curated field changes, and every write is
idempotent: running it again is a no-op.
| `already_running` (409) | A run started less than 15 minutes ago. Wait, or pass `force=1`. |
