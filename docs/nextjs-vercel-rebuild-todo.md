# OhioPride.org Next.js + Vercel Rebuild TODO

## Goal
Rebuild the current site in Next.js first, preserve URLs, then improve the scorecard/issues/data architecture.

## Fastest Practical Build Order
1. Create Next.js/Vercel skeleton.
2. Rebuild homepage + global layout.
3. Migrate static pages.
4. Rebuild issues tracker.
5. Rebuild issue detail pages.
6. Rebuild scorecard.
7. Rebuild founding members.
8. Add contact/RSVP APIs.
9. Add SEO/sitemap/robots.
10. QA + DNS cutover.

> Avoid starting with Supabase, admin dashboards, authentication, or automated legislature scraping.
> Start with typed data files, ship the improved app, then add database/admin layers.

## Phase 0: Repo + Migration Setup
- Create/confirm GitHub repo access.
- Create branch `nextjs-vercel-rebuild`.
- Add main branch protection + required PR review.
- Connect repo to Vercel.
- Configure preview deployments for PRs.
- Configure production deployment from `main`.

## Phase 1: Create Next.js App
- Initialize with TypeScript, App Router, Tailwind, ESLint, Prettier, `src/` directory.
- Install core dependencies: `next`, `react`, `react-dom`, `typescript`, `tailwindcss`, `clsx`, `lucide-react`, `zod`, `date-fns`.
- Add `.nvmrc`/`.node-version`.
- Add `README.md`, `.env.example`, `.env.local`.

Suggested structure:

```txt
src/
  app/
  components/
  content/
  data/
  lib/
  types/
  styles/
  utils/
public/
```

## Phase 2: Route Map Preservation
Create routes:
- `/`
- `/about`
- `/board`
- `/contact`
- `/donate`
- `/founding-members`
- `/issues`
- `/issues/[slug]`
- `/scorecard`
- `/methodology`
- `/launch-day`
- `/privacy`
- `/terms`

Add redirects only where needed and canonical URLs for every public page.

## Phase 3: Content Migration
Migrate first:
- Home
- About
- Board
- Donate
- Contact
- Terms
- Privacy
- Launch Day
- Methodology

## Phase 4: Data Model
Start with typed JSON/TS files.

Create types:
- `src/types/issue.ts`
- `src/types/legislator.ts`
- `src/types/scorecard.ts`
- `src/types/member.ts`
- `src/types/event.ts`
- `src/types/board.ts`

## Phase 5: Data Files
Create:
- `src/data/issues.ts`
- `src/data/legislators.ts`
- `src/data/scorecard.ts`
- `src/data/founding-members.ts`
- `src/data/board.ts`
- `src/data/events.ts`

Minimum migration:
- Existing issue tracker bills.
- Scorecard entries.
- Board members.
- Founding members.
- Launch event details.
- Donation links.
- Legal notices.

## Phase 6: Design System
Create base UI components, layout components, and site-specific components for home/issues/scorecard/members/forms.

## Phase 7: Page Builds
Implement all major public pages and details:
- Homepage
- About
- Board
- Donate
- Founding Members
- Contact
- Launch Day
- Issues tracker + issue detail
- Scorecard + scorecard detail
- Methodology

## Phase 8: Forms + Backend
Create route handlers:
- `src/app/api/contact/route.ts`
- `src/app/api/rsvp/route.ts`
- `src/app/api/newsletter/route.ts`

Implement validation, spam protection, success/error states, and notifications.

## Phase 9: Database Decision
Option A (MVP): static TS data files.
Option B (later): Supabase tables + RLS + protected writes.

## Phase 10: SEO
- Global metadata in `src/app/layout.tsx`.
- Dynamic metadata for issues/scorecard/events.
- Add `src/app/sitemap.ts` and `src/app/robots.ts`.
- Add JSON-LD for organization/event/breadcrumbs/pages.

## Phase 11: Performance
- Server components by default.
- Client components only for interaction.
- Static generation where possible; ISR for issues/scorecard.
- Optimize images, mobile nav, CLS.

## Phase 12: Accessibility
- Semantic headings, one `h1` per page.
- Skip link.
- Focus states.
- Labeled controls.
- Keyboard-accessible nav + filters.
- Contrast and screen reader checks.

## Phase 13: Analytics + Tracking
Track pageviews and events:
- `donate_click`
- `founding_member_click`
- `rsvp_submit`
- `contact_submit`
- `scorecard_filter`
- `issue_filter`
- `legislator_share`
- `bill_share`

## Phase 14: Admin Workflow
MVP: edit data in code -> PR preview -> merge.
Later: protected `/admin`, editors, exports, audit logs.

## Phase 15: Testing
- Unit tests: score/grade/filter/form/url logic.
- Integration tests: forms + filters + dynamic pages.
- E2E (later): Playwright critical flows.

## Phase 16: Deployment Checklist
Configure Vercel project settings + env vars.
Keep Netlify live until Vercel production is fully tested.

## Phase 17: Pre-Launch QA
- Content QA
- SEO QA
- Technical QA (`build`, `lint`, `typecheck`, Lighthouse, browser checks, forms, links)

## Phase 18: DNS Cutover
- Add domain to Vercel.
- Verify DNS/SSL/apex/www/canonical behavior.
- Keep Netlify as temporary rollback.

## Phase 19: Post-Launch
First 24 hours: deployment/form/analytics/404/share checks.
First week: redirects, indexing, performance, mobile, conversion path iteration.

## Suggested GitHub Milestones
1. **Site Parity**
2. **Data Features**
3. **Forms + Conversion**
4. **Launch Readiness**
