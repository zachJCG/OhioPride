# Ohio Pride PAC — ohiopride.org

LGBTQ+ political action committee for the State of Ohio. This repo hosts the
public-facing website at https://www.ohiopride.org.

## Stack (Next.js rebuild — Round 4)

- **Framework:** [Next.js 15](https://nextjs.org) (App Router, TypeScript, React 19)
- **Hosting:** [Vercel](https://vercel.com) (production + previews)
- **Database:** [Supabase](https://supabase.com) (Postgres + RLS)
- **Donations:** [ActBlue](https://secure.actblue.com) — synced hourly via Vercel Cron
- **Email:** [Resend](https://resend.com) — contact-form notifications
- **Legacy CSS/JS:** preserved verbatim under `/public/css` and `/public/js`

> Migrated from a static HTML/Netlify deployment in May 2026. The original
> ~28K lines of hand-authored markup are preserved as page-body fragments in
> `/content` and rendered through a thin server-component shell so we keep
> URL/visual parity while moving the architecture under Next.js.

## Getting started

```bash
# Install deps
npm install

# Copy env template and fill in real values from the team password manager
cp .env.example .env.local

# Run dev server (http://localhost:3000)
npm run dev

# Production build
npm run build && npm start
```

### Required environment variables

| Variable                       | Where used                                  |
| ------------------------------ | ------------------------------------------- |
| `SUPABASE_URL`                 | Server components + every `/api/*` route    |
| `SUPABASE_SERVICE_ROLE_KEY`    | Server-only — keep out of the client bundle |
| `ACTBLUE_USERNAME`             | `/api/actblue-sync` cron handler            |
| `ACTBLUE_PASSWORD`             | `/api/actblue-sync` cron handler            |
| `RESEND_API_KEY`               | `/api/contact` (form submission email)      |
| `RESEND_FROM_EMAIL`            | Optional — defaults to Resend onboarding    |
| `CRON_SECRET`                  | Optional — restricts `/api/actblue-sync`    |

Set the same keys in the Vercel project **Settings → Environment Variables**.

## Project layout

```
src/
  app/
    layout.tsx              # Shared <html>, header, footer
    page.tsx                # /
    <route>/page.tsx        # /about, /board, /connect, /contact, /donate,
                            # /donate/founding-member, /founding-members,
                            # /issues, /launch-day, /methodology, /privacy,
                            # /scorecard, /terms
    issues/[slug]/page.tsx  # /issues/<bill-id> — driven by content/issues/*
    api/                    # Route handlers (replace netlify/functions)
      board-members/route.ts
      bills/route.ts
      founding-member-tiers/route.ts
      founding-members-progress/route.ts
      public-members/route.ts
      scorecard/route.ts
      site-leadership/route.ts
      zip-county-lookup/route.ts
      contact/route.ts          # NEW (replaces Netlify Forms + submission-created hook)
      actblue-sync/route.ts     # Vercel Cron (hourly) — replaces Netlify scheduled fn
    sitemap.ts
    robots.ts
    not-found.tsx
  components/
    SiteHeader.tsx          # Sticky nav (client component for mobile toggle)
    SiteFooter.tsx          # Server-rendered with live disclaimer
    PageBody.tsx            # Renders extracted page HTML + scripts
  lib/
    supabase.ts             # Server-side service-role client
    site-leadership.ts      # Server-side leadership/disclaimer loader
    page-content.ts         # Build-time HTML + meta loader
content/
  pages/                    # Body HTML + meta JSON for each top-level page
  issues/                   # Body HTML + meta JSON for each bill page
public/
  css/                      # Original brand stylesheet (preserved as-is)
  js/                       # Original interaction JS (preserved as-is)
  assets/                   # Logos and board headshots
netlify/                    # Legacy — kept during transition. Delete after Vercel cutover.
supabase/
  migrations/               # Postgres schema (unchanged)
```

### Why the page bodies live in `/content`

The migration was scoped as parity-first, not redesign. To avoid translating
~28K lines of markup into JSX in a single sweep, each original `*.html` page
was split in two during the cutover:

- `<slug>.html` — innerHTML of the original `<body>` minus the JS-injected
  header/footer placeholders and inline `<script>` tags.
- `<slug>.meta.json` — extracted `<title>`, `<meta>`, OG/Twitter, JSON-LD,
  inline `<style>` blocks, plus a list of `<script src>` and inline JS bodies.

`PageBody.tsx` rehydrates that pair: page-specific styles render as
`<style>` tags, JSON-LD as `<script type="application/ld+json">`, the body
HTML via `dangerouslySetInnerHTML`, and the original scripts via `next/script`
with `strategy="afterInteractive"`.

Future refactors can rewrite individual pages into native JSX one at a time
without disturbing the rest of the site.

## API compatibility

The old client JS (`/js/ohiopride-data.js`, `/js/launch-signup.js`,
`/js/bill-data-supabase.js`, `/js/scorecard-data-supabase.js`) still calls
`/.netlify/functions/<name>`. `next.config.mjs` rewrites those paths to
`/api/<name>` so the existing scripts work without modification.

## Vercel deployment

- Connect the repo to Vercel; Production from `main`, previews on PRs.
- Set the env vars above.
- `vercel.json` declares the `/api/actblue-sync` hourly cron.
- DNS cutover plan: keep the Netlify deploy live until Vercel passes pre-launch
  QA (build + typecheck + browser checks + form smoke tests).

## Scripts

| Script             | What it does                          |
| ------------------ | ------------------------------------- |
| `npm run dev`      | Dev server with hot reload            |
| `npm run build`    | Production build                      |
| `npm start`        | Run the production build              |
| `npm run lint`     | ESLint via `next lint`                |
| `npm run typecheck`| TypeScript-only validation            |
