# Remaking ohiopride.org as Next.js on Vercel

Status: **phase 0 landed, July 30, 2026**, plus the shared layout and the
first ported page. The repo is a Next.js app that serves the existing static
site unchanged; `/credits` is now a real route and renders pixel-identical to
the static page it replaced. The remaining phase 1 work is the gated pages,
which needs the migration below applied.

All four decisions are made:

1. **Gated content lives in Supabase.** Table `public.gated_pages`, migration
   `20260730120000_gated_pages.sql` (written, **not yet applied**). RLS on,
   no anon or authenticated policy, service-role read only.
2. **Shared password for `/PRTraining`.** The media-prep page is low stakes.
   `/governor-guide` was the other candidate for this and no longer needs it:
   it came off the gate and went public, so the magic-link work it was going
   to justify is not currently needed by any page.
3. JavaScript, not TypeScript.
4. Incremental, not big bang.

Phase 1 is unblocked except for one step that touches production state:
applying the migration to Supabase. See "What Zach needs to do".

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

### Phase 1: chrome and the gated pages (next)

Ordered so the risky part is first and provable:

1. Apply `20260730120000_gated_pages.sql`, then seed the guide's current body
   into it. The body is the plaintext the encrypted page is built from; it is
   not in the repo, so seeding runs from the working copy, once.
2. `middleware.js`: `/governor-guide` requires a Supabase session whose email
   is in `admin_emails` (the check `/admin` already makes, moved server side);
   `/PRTraining` requires a cookie set by a password form reading
   `PRTRAINING_PASSWORD`. Unauthenticated requests never reach the route, so
   the body is never sent.
3. `app/governor-guide/page.js` renders the stored body server side. The
   generated rewrite for `public/governor-guide.html` stops firing the moment
   this route exists, so the cutover is the commit that adds the file.
4. Delete the encrypted `public/governor-guide.html`, and once `/PRTraining`
   moves too, `scripts/encrypt-page.mjs` with it.
5. ~~`app/layout` rebuilt from `js/site-template.js`~~ **done.**
   `app/components/SiteHeader.js` (client, for the menu and dropdown) and
   `app/components/SiteFooter.js` (server) emit the same class names as
   `public/js/site-template.js`, so both the ported and unported pages share
   `public/css/site-template.css`. Keep the two in step until the static
   pages are gone. The footer resolves leadership and the legally required
   disclaimer on the server now, so the disclaimer is in the first byte of
   HTML instead of being patched in after load; the layout revalidates hourly
   so a `site_leadership` edit still lands without a deploy.

Open Graph tags and an indexable robots directive stay off until
`gated_pages.is_public` flips, which remains a deliberate act after counsel
signs off.

### Porting a page: the recipe

`/credits` is the worked example (`app/credits/`). Every page port is these
six steps, and the last one is what makes it safe:

1. `app/<route>/page.js`, with the body as JSX and the `<head>` contents
   moved into an exported `metadata` object. Drop the `#site-header` and
   `#site-footer` divs and the `site-template.js` script tag: the layout
   supplies all three.
2. Move the page's `<style>` block into `app/<route>/<route>.css` and import
   it from the page. Plain CSS, not a CSS module: the class names are shared
   with the static pages until those are deleted, and module hashing breaks
   that.
3. Keep `<main id="main">` on the outermost element so the layout's skip link
   still has a target.
4. Turn repeated markup into data where it is obviously a list. The credits
   entries became an array, which is what lets that content move to Supabase
   later without touching the markup.
5. Delete `public/<route>.html` and add the clean URL to `PORTED` in
   `next.config.mjs`, so the old `.html` link still redirects.
6. **Diff it against the original.** Serve `public/` on another port, screenshot
   both at the same width with `reducedMotion: 'reduce'` (the header gradient
   animates, so without this the diff is noise), and compare. `/credits` came
   out at zero differing pixels. Anything above a handful means something was
   lost in translation.

Then `npm run check:routes`, which asserts the ported page still answers both
its clean URL and its old `.html` URL.

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

1. **Review the phase 0 preview before merging.** A merge to `main` is a
   production deploy. `BASE=<preview-url> npm run check:routes` asserts the
   55 route behaviours automatically; then click through a few pages.
2. **Nothing to change in the Vercel dashboard up front.** `vercel.json` sets
   `"framework": "nextjs"`, and the existing env vars (`SUPABASE_*`,
   `MAILERLITE_*`, `RESEND_*`, `ACTBLUE_*`) carry over untouched. The build
   command becomes `next build` automatically.
3. **Apply `20260730120000_gated_pages.sql`** when you want phase 1 to start.
   This is the only step that changes production state, which is why it is
   not done already.
4. **Add `PRTRAINING_PASSWORD`** as a Vercel env var during phase 1.
5. **Retire the current guide password.** It is short enough to brute-force
   offline and the encrypted blob is in a public repo, so it should be
   treated as compromised and never reused; phase 1 removes the blob
   entirely, which closes this out.

Phases 2 and 3 are best taken a page at a time. Any Claude Code session can
execute a phase from this document on a fresh branch.
