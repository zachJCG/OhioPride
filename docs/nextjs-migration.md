# Remaking ohiopride.org as Next.js on Vercel

Status: **phase 0 landed, July 30, 2026.** The repo is a Next.js app that
serves the existing static site unchanged. Phases 1 to 3 are still ahead, and
phase 1 is blocked on two decisions listed below.

Decided and done: JavaScript, not TypeScript (decision 3); incremental, not
big bang (decision 4). Still open: where gated content lives (decision 1) and
password versus magic links (decision 2). Both are phase 1 blockers.

## What Next.js buys us (and what it does not)

Gains:

- **A real server-side gate for internal pages.** `/governor-guide` and
  `/PRTraining` currently ship as AES-encrypted blobs that decrypt in the
  browser (`scripts/encrypt-page.mjs`). With Next.js, middleware checks a
  cookie before the route ever renders, and editing the page stops being an
  encrypt-and-commit dance.
- **One shared layout.** Header, footer, and nav come from a layout
  component instead of `js/site-template.js` mounting into
  `<div id="site-header">` after page load.
- **Server-rendered data pages.** Scorecard, issues, founding members, and
  board render with data already in the HTML instead of fetch-after-load,
  which also helps SEO and CLS.
- **Incremental adoption.** Vercel keeps serving the root `api/` directory
  as serverless functions alongside a Next.js app, so every `/api/*`
  endpoint, the ActBlue cron, and the Supabase wiring stay exactly as they
  are through the whole migration.

One thing Next.js does NOT fix: this repo is public. A gated Next.js page
protects the URL, but if the page's content is written in the component,
the content is still readable in GitHub. Internal-page content has to live
outside the repo. The clean answer is a Supabase table read server-side at
request time (service key, RLS locked), which is decision 1 below.

## Decisions needed before the first commit

1. **Where gated content lives.** Recommended: a `gated_pages` table in
   Supabase (slug, html/markdown, updated_at), rendered server-side behind
   the middleware gate. Alternatives: make the repo private (changes the
   open-source posture), or keep the encrypt-page mechanism (works today,
   stays awkward to edit).
2. **Password or people.** A shared password in `GOVERNOR_GUIDE_PASSWORD`
   is the smallest change from today. Per-person access via Supabase Auth
   magic links (the `/admin` pattern already in the repo) is stronger and
   auditable. Recommended: magic links for anything under a coordination
   firewall; the shared password is fine for media-prep pages.
3. **JavaScript or TypeScript.** The whole repo is vanilla JS; staying JS
   keeps every contributor able to read it. TS is fine if preferred.
4. **Big bang or incremental.** Recommended: incremental, phases below.
   The static pages keep deploying unchanged until each one is ported.

## Phases

### Phase 0: scaffold without breaking anything (done)

- Next 15 App Router, JavaScript. Every static page and asset moved under
  `public/`; `app/layout.js` is the (so far unused) root layout.
- `next.config.mjs` generates the clean-URL rewrites by walking `public/`,
  so adding a bill page needs no config edit. Redirects and headers ported
  from `vercel.json`, which now carries only the framework and the cron.
- The functions moved out of the root `api/` directory to
  `lib/functions/*.mjs`, re-exported as route handlers from
  `app/api/<name>/route.js`. Under a framework preset the framework owns
  `/api/*`, so keeping a root `api/` alongside it invites a routing
  conflict; this removes the ambiguity and makes the endpoints runnable
  under `npm run dev`, which they never were before.
- Two real bugs fell out of the port, both fixed:
  `zip-county-lookup.mjs` built its Supabase client at module scope, so
  importing it without credentials threw and would equally have thrown on
  a cold start with a missing env var; and the `/prtraining` redirect
  looped forever, because Next matches redirect sources case-insensitively
  and the rule matched its own destination.
- Verified by a 52-check parity suite against `next start`
  (`scripts/check-routes.mjs`): clean URLs, folder index pages, canonical
  `.html` redirects with no loops, every configured redirect and rewrite,
  static assets, security and cache headers, `/api/*` reachability, and
  404s. `npm run check:brand` still passes.

### Phase 1: chrome and the gated pages

- `app/layout` rebuilt from `js/site-template.js` and
  `css/site-template.css` (wordmark rules live in `docs/brand-system.md`).
- `/governor-guide` becomes the first real route: middleware gate, content
  from the gated-content store, `X-Robots-Tag` kept, Open Graph tags added
  only when the page goes public. Retire the encrypted blob and
  `scripts/encrypt-page.mjs` once `/PRTraining` moves too.

### Phase 2: data-driven public pages

- Scorecard, issues plus bill pages, founding members, board, credits.
  These already fetch from `/api/*`; the port moves that fetch server-side
  and deletes the static fallback arrays in `js/bill-data.js`,
  `js/scorecard-data.js`, `js/voting-records.js` (the round-3 goal).

### Phase 3: forms, then admin last

- Volunteer, connect, newsletter, pride forms: keep posting to the same
  `/api/*` endpoints at first; migrating them to server actions is
  optional polish, not required.
- `/admin/*` moves last. It is Supabase-auth-gated, works as-is, and is
  the most complex surface with the least public payoff.

## What Zach needs to do (nothing else moves without these)

1. Make the calls on decisions 1 through 4 above.
2. In the Vercel dashboard, nothing up front: the framework preset flips
   to Next.js automatically on the first deploy containing the app, and
   the existing project env vars (`SUPABASE_*`, `MAILERLITE_*`,
   `RESEND_*`, `ACTBLUE_*`) carry over. Add `GOVERNOR_GUIDE_PASSWORD`
   (or nothing, if we go magic-links).
3. Rotate the governor-guide password when the gate moves server-side.
   The current shared password is short enough to brute-force offline,
   and the encrypted blob sits in a public repo; a long passphrase costs
   nothing. (This is worth doing even if the Next.js work waits.)
4. Review each phase on its Vercel preview URL before it merges; a merge
   to `main` is a production deploy.

Phase 0 plus the governor-guide route in Phase 1 is roughly a day of
work; phases 2 and 3 are best taken a page at a time. Any Claude Code
session can execute a phase from this document on a fresh branch.
