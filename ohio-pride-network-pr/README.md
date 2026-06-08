# Ohio Pride PAC — Donor Pipeline Fix + Networking Module (Drop-in PR Bundle)

Two changes in one bundle:

1. **Donor pipeline fix** — the prospect boards showed no data even though rows exist. Root cause is an auth-session problem, not missing data. This bundle ships the correct authenticated Supabase clients and a pipeline data layer.
2. **Networking module** — a regionally-focused relationship + warm-intro tracker: who can connect us to whom, business-card quick capture, and a "how do we get to X" path view. The database side is **already live in production**; this bundle adds the frontend and commits the migration for repo history.

This README is written for **Claude Code** to wire the drop-in into the GitHub repo. A human can follow it too.

---

## TL;DR for Claude Code

```
You are wiring this bundle into the Ohio Pride admin app (Next.js App Router + TypeScript,
Supabase backend, Netlify-hosted). Do the following in order:

1. Confirm the app uses the Next.js App Router and @supabase/ssr. If @supabase/ssr is
   missing, run: npm i @supabase/ssr @supabase/supabase-js
2. Copy the files from src/ into the repo's src/ (or app root if the repo doesn't use src/).
   MERGE — do not blindly overwrite — lib/supabase/* and middleware.ts if they already exist.
3. Reconcile path alias "@/..." with the repo's tsconfig. If the repo uses a different alias
   or no src/ dir, adjust the imports in the copied files.
4. The Supabase migration in supabase/migrations/ is ALREADY APPLIED to production. Commit it
   for history. Only run it against fresh dev branches.
5. Verify the pipeline fix using the "Verification" section below.
6. Add a nav link to /admin/networking in the admin sidebar.
7. Open a PR titled "Fix donor pipeline reads + add networking module".
```

---

## Part 1 — The donor pipeline "no data showing" fix

### Diagnosis (confirmed against the live database)

- The pipeline views (`prospects_pipeline`, `pac_pipeline`, `c4_pipeline`, `fundraising_dashboard`, and the `*_by_stage` / `*_summary` views) are all declared **`security_invoker = on`**.
- The underlying tables (`prospects`, `pac_prospects`, `c4_prospects`, …) have RLS `SELECT` policies that require `has_permission('<module>','read')`.
- `has_permission()` reads the signed-in user's email from `auth.jwt()`. **If a request has no authenticated session, `auth.jwt()` is NULL → the policy returns false → the view returns ZERO rows** — even though the data is right there (168 prospects, 31 PAC, 97 c4 confirmed present).

So "we committed data already but nothing shows" = the frontend is querying Supabase **without the user's session attached**. In the Next.js App Router this happens when a Server Component (or server action) uses a plain anon `createClient()` instead of a cookie-aware SSR client.

> Note: the Director account (super_admin) is *whitelisted* inside `has_permission()`, so the only way it sees nothing is if the query runs with **no session at all** (anon). That points squarely at the client wiring, which is what this bundle fixes.

### What the fix ships

| File | Purpose |
|---|---|
| `src/lib/supabase/server.ts` | Cookie-aware server client. Use in all Server Components / actions that read RLS data. |
| `src/lib/supabase/client.ts` | Browser client for Client Components. |
| `src/lib/supabase/middleware.ts` | `updateSession()` — refreshes the auth token each request. |
| `src/middleware.ts` | Root middleware that calls `updateSession`. **Merge** with any existing middleware. |
| `src/lib/data/pipeline.ts` | Authenticated reads of the existing pipeline views + a `pipelineHealthCheck()`. |

### Wiring steps

1. **Find the broken read.** Search the repo for where the prospect board fetches data:
   ```bash
   grep -rn "prospects_pipeline\|pac_pipeline\|c4_pipeline\|fundraising_dashboard" src/ app/
   grep -rn "createClient\|createBrowserClient\|createServerClient" src/ app/ lib/
   ```
2. **Replace anon/server reads** in those Server Components with `getPipeline()/getPipelineSummary()/getFundraisingDashboard()` from `src/lib/data/pipeline.ts`, which use the authenticated server client.
3. **Ensure middleware is active** so the session refreshes (so reads aren't anon). If a `middleware.ts` already exists, copy the `updateSession(request)` call and the `matcher` into it instead of overwriting.
4. If the board is a **Client Component** doing its own fetch, switch it to `@/lib/supabase/client` (which reads the cookie session) or move the fetch to the server.

### Verification

Add a temporary debug route or run in any authenticated server context:

```ts
import { pipelineHealthCheck } from '@/lib/data/pipeline';
// In a Server Component / route handler:
const health = await pipelineHealthCheck();
console.log(health);
// Expect: { authenticatedAs: 'zach@josephcartergroup.com',
//           visibleRows: { prospects_pipeline: 168, pac_pipeline: 31, c4_pipeline: 97 } }
```

- `authenticatedAs: null` → the session still isn't attached. Middleware isn't running on that route, or the read happens before login. Re-check step 3.
- `authenticatedAs` set but `visibleRows` all 0 → the signed-in user lacks `read` on those modules (only happens for non-super-admins). Grant via `role_permissions`.
- Counts > 0 → **fixed.** Remove the debug route.

---

## Part 2 — Networking module

### What it does

- **Contacts** (`network_contacts`): people in the network, tagged by **region/county** (Ohio's regional focus), with `is_target` (someone we want to reach) and `is_connector` (someone who opens doors), warmth, influence tier, "how they help", and "the ask".
- **Introductions** (`network_introductions`): directed edges — *connector → target*, with relationship label, strength (1–5), and status (potential → requested → made). This is the "who can connect me to whom" graph.
- **Paths to targets** (`network_target_paths` view): for each target, every viable connector path ranked by strength. Answers **"how do we get to this person?"**
- **Business-card capture** (`network_business_cards`): snap a card on your phone → uploaded to a private Storage bucket → jot notes → (optionally paste fields you parsed with Claude on your phone) → lands in an inbox → promote to a full contact.
- **Regional rollup** (`network_by_region` view): counts of contacts/targets/connectors/actions-due per region.

### Database — ALREADY LIVE

The migration `supabase/migrations/20260608120000_networking_module.sql` was applied to the production project (`dkdxefzhttkmjhdbkvqn`) on 2026-06-08 and smoke-tested. It created:

- Tables: `network_contacts`, `network_introductions`, `network_activities`, `network_business_cards`
- Views (security_invoker): `network_contacts_directory`, `network_intro_paths`, `network_target_paths`, `network_by_region`
- RLS: 16 policies using `has_permission('networking', …)`
- `role_permissions` for module `networking` (super_admin: full; treasurer + board_member: read/write; comms_lead + legislative_lead: read)
- Private Storage bucket `network-cards` + 4 object policies

**Action for Claude Code:** commit the migration file as-is (so the repo history matches prod and dev branches can recreate it). Do **not** re-run it against production; it is idempotent if you ever need to.

### Frontend files

| File | Purpose |
|---|---|
| `src/types/networking.ts` | Types + the Ohio regional taxonomy (`REGIONS`). |
| `src/lib/data/networking.ts` | Authenticated read layer (directory, target paths, region rollup, contact detail, card inbox, signed card-image URLs). |
| `src/app/(admin)/admin/networking/actions.ts` | Server Actions: create contact, add introduction, log activity, capture card, promote card. |
| `.../networking/page.tsx` | Home: regional rollup + paths-to-targets + filterable directory. |
| `.../networking/[id]/page.tsx` | Contact detail: ways-in / they-can-open, activity log, add-path form. |
| `.../networking/capture/page.tsx` | Card capture form + inbox with promote action. |
| `.../networking/_components/*` | `RegionFilterBar`, `ContactList`, `TargetPaths`, `CaptureForm`, `AddIntroForm`. |

### Wiring steps

1. **Route group:** files assume an `(admin)` route group with auth already enforced (it's reinforced by the middleware's `/admin` gate). If the repo's admin routes live elsewhere (e.g. `app/admin/...` with no group), move the `networking/` folder to match and fix imports.
2. **Styling:** components use Tailwind utility classes and the brand navy `#0F2233` / light-blue `#73D7EE`. If the repo uses a component library (shadcn, etc.), swap primitives as desired — logic is independent of styling.
3. **Nav:** add a sidebar link to `/admin/networking` (and optionally a "Capture card" quick action). Gate it on `has_permission('networking','read')` if the nav is permission-aware.
4. **Storage:** the `network-cards` bucket is private. `CaptureForm` uploads client-side; the detail page renders a 1-hour signed URL. No extra config needed.
5. **Permissions for other users:** super_admin (Zach) already has full access. To let another board member in, ensure their `admin_user_roles` includes a role with `networking` read/write (board_member already does).

### How the card capture works (your phone flow)

1. Open `/admin/networking/capture` on your phone.
2. Tap the photo field → camera → snap the card. It uploads to the private bucket.
3. Type a quick note (where you met, what they can unlock).
4. *(Optional)* In Claude chat on your phone, send the card photo and ask it to return JSON like
   `{"full_name":"…","title":"…","organization":"…","email":"…","phone":"…"}`, then paste that into the **Parsed fields** box.
5. Save → it's in the inbox. Later, hit **Promote → contact** to create the full `network_contacts` record (auto-linked to the card image and notes).

---

## File tree

```
ohio-pride-network-pr/
├── README.md
├── .env.example
├── supabase/
│   └── migrations/
│       └── 20260608120000_networking_module.sql      # already applied to prod
└── src/
    ├── middleware.ts                                  # MERGE with existing
    ├── lib/
    │   ├── supabase/{server,client,middleware}.ts     # the pipeline fix
    │   └── data/{pipeline,networking}.ts
    ├── types/networking.ts
    └── app/(admin)/admin/networking/
        ├── page.tsx
        ├── actions.ts
        ├── [id]/page.tsx
        ├── capture/page.tsx
        └── _components/
            ├── RegionFilterBar.tsx
            ├── ContactList.tsx
            ├── TargetPaths.tsx
            ├── CaptureForm.tsx
            └── AddIntroForm.tsx
```

## Dependencies

```bash
npm i @supabase/ssr @supabase/supabase-js
```

## Suggested commit / PR

```
git checkout -b fix/pipeline-reads-and-networking
# copy files in, reconcile aliases/middleware
git add .
git commit -m "Fix donor pipeline reads (auth session) + add regional networking module"
git push -u origin fix/pipeline-reads-and-networking
```

PR description: link this README, note the migration is already live in prod, and paste the `pipelineHealthCheck()` output as proof the pipeline now returns rows.
