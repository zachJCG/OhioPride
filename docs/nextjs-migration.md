# Remaking ohiopride.org as Next.js on Vercel

Status: proposal, July 30, 2026. The site already runs on Vercel as plain
HTML plus `api/*.mjs` functions. This is the staged path to a Next.js app
without ever breaking production, and the list of decisions and dashboard
steps only Zach can do.

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

### Phase 0: scaffold without breaking anything

- `npx create-next-app@latest` in the repo root (App Router, no src dir),
  with the existing `*.html`, `css/`, `js/`, `assets/` moved under
  `public/` so URLs keep resolving while pages are unported.
- Port the redirects and headers from `vercel.json` into `next.config.mjs`
  (`redirects()`, `headers()`); keep `vercel.json` only for the cron.
  Clean URLs for the not-yet-ported HTML files become explicit rewrites
  (`/about` to `/about.html` and so on); generate the list from the repo
  root at build time rather than typing 40 rules by hand.
- `api/` stays where it is. No function changes.
- Ship it on a preview branch and click through every page before merging.

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
