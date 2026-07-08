# ohiopride.org

Public website + admin backend for **Ohio Pride PAC**. Plain HTML/CSS/vanilla JS
(no framework, no build step), hosted on **Vercel**, backed by **Supabase**
(Postgres + Auth + RLS).

## Stack

| Layer      | How it works                                                              |
|------------|---------------------------------------------------------------------------|
| Hosting    | Vercel, static files from the repo root. `cleanUrls: true` serves `/about` from `about.html`. |
| Functions  | `api/*.mjs` — Vercel Node functions (`handler(req, res)`). Shared helpers in `api/_lib/` (not routed). |
| Data       | Supabase Postgres. Public reads go through the functions (service-role key stays server-side); admin endpoints verify the caller's Supabase JWT. |
| Auth       | Supabase Auth; client-side gating in `admin/admin-auth.js` / `admin-shell.js`, server-side checks via `is_admin()` / `has_permission()` RPCs. |
| Donations  | ActBlue. `api/actblue-sync.mjs` polls the CDS CSV hourly (Vercel cron in `vercel.json`, Pro plan required). |
| Email      | Resend for form notifications (`api/contact-submit.mjs`); MailerLite for newsletter/campaigns (`api/_lib/mailerlite.mjs`). |
| Forms      | contact / connect / launch-day POST JSON to `/api/contact-submit` → `public.contact_submissions` + Resend notification. |

## Layout

- `*.html`, `issues/`, `admin/`, `volunteer/`, `pride/`, `signup/`, `endorsement*/` — pages
- `js/`, `css/`, `assets/` — front-end
- `api/` — serverless functions (deployed); `api/_lib/` — shared server code
- `vercel.json` — headers, redirects, rewrites (incl. legacy `/.netlify/functions/*` → `/api/*`), crons
- `supabase/migrations/` — schema history (applied to the live project)
- `scripts/` — maintenance / verification scripts (not deployed; see `.vercelignore`)
- `docs/` — internal docs and runbooks (not deployed)
- `netlify/` + `netlify.toml` — **legacy parachute only**; Netlify stays deployed but idle for 48h after DNS cutover, then both get deleted

## Environment variables (Vercel dashboard)

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`,
`ACTBLUE_USERNAME`, `ACTBLUE_PASSWORD`, `ACTBLUE_FORM_SLUG`,
`ACTBLUE_FOUNDING_REFCODE_PREFIX`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`,
`MAILERLITE_API_KEY`, `MAILERLITE_FROM_EMAIL`, `MAILERLITE_FROM_NAME`,
optional `MAILERLITE_*_GROUP` overrides, `CRON_SECRET`, `SITE_URL`.

Keep the service-role key **Production-scoped only**. The Supabase anon key is
hardcoded client-side by design (safe behind RLS).

## Local checks

```bash
npm install
npm run check:brand          # brand consistency scan
node --check api/*.mjs       # syntax-check the functions
vercel dev                   # run static site + functions locally
```
