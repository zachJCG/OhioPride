# Ohio Pride PAC — Supabase Migration Deployment Guide

## What this deployment does, and why

This deployment moves the dynamic content on ohiopride.org out of hardcoded HTML and JavaScript arrays and into a Supabase Postgres database. The goal is operational, not technical. Today, every time someone is added to the board, every time a founding-member tier price changes, every time an officer turns over, someone has to edit an HTML file and push a deploy. After this migration, those changes become database row edits, which means they can be made by a non-developer through the Supabase dashboard and they propagate to every page on the site automatically.

The migration happens in two rounds, and the rounds matter. Round 1 moves the two tables that are operationally most painful right now: the board grid on `/board` and the founding-member progress bar on `/founding-members`. Round 2 moves three configuration tables that are less urgent but share the same architectural pattern: the founding-member tier ladder, the corporate sponsorship tier ladder (for the forthcoming Ohio Pride Action c(4) entity), and the site-wide officer leadership block used in the compliance disclaimer. Doing them in two rounds lets you deploy Round 1, verify that the architecture works end-to-end in production, and then come back and apply Round 2 once you have confidence in the pattern.

The two rounds can be deployed together as one operation, or separated by any amount of time. Round 2 depends on Round 1 having run, because Round 2's migration file references tables, functions, and triggers that Round 1 creates. But there is no other cross-coupling: the Round 1 Netlify functions continue to work unchanged after Round 2 runs, and Round 2 introduces no breaking changes to the Round 1 schema.

## What is in this drop

The drop contains eight files organized into the three directory structures that mirror where they need to live in your repository. The `supabase/migrations/` directory contains two SQL migration files that need to be run in order against your Supabase project. The `netlify/functions/` directory contains six JavaScript Netlify functions: one scheduled (the hourly ActBlue sync) and five on-demand HTTP endpoints that the website calls when pages load. The `public/js/` directory contains two client-side JavaScript files that replace existing hardcoded behaviors on the website.

There is one additional thing to know about the file layout. The two client-side files, `ohiopride-data.js` and `site-template.js`, are already present on your site today in some form. The `site-template.js` in this drop is a **modified version** of the one currently deployed. Its changes are narrow: the "Leadership" block in the footer and the "Paid for by" disclaimer both gain `data-ohp-disclaimer` and `data-ohp-directors` attributes so the leadership loader can find and populate them. The existing hardcoded values remain in the file as fallback text, so if the database fetch fails, the footer still renders a complete, legally valid disclaimer. The file is safe to swap in wholesale.

## Dependencies that need to be installed once

Before any of the Netlify functions will work, your repository needs the Supabase JavaScript client. From the root of your site repo, run:

```bash
npm install @supabase/supabase-js
```

This adds one line to your `package.json` and pulls down the dependency. Netlify will install it automatically on every build once it is listed as a dependency. If you already have this installed from an earlier deployment, the command is safe to re-run — npm will do nothing if the package is already at the requested version.

## Deployment steps, in order

### Step 1: Run the migrations against Supabase

The two migration files in `supabase/migrations/` need to be applied to your Supabase project in filename order. The filename timestamps sort them correctly: `20260421000000_initial_schema.sql` runs first, then `20260422000000_configuration_tables.sql`.

The simplest way to run them is through the Supabase dashboard: open the SQL editor, paste the contents of the first file, click Run, wait for the success message, then paste the second file and run that. Both files are idempotent — they use `create table if not exists`, `create index if not exists`, and `on conflict do nothing` throughout — so if anything fails partway and you need to re-run, nothing breaks and nothing duplicates. If you are using the Supabase CLI or MCP, the files follow the standard timestamp-prefix naming convention and can be applied with `supabase db push`.

After both migrations finish, verify in the Supabase dashboard that the following objects exist. You should see five tables in the `public` schema: `board_members` (seeded with ten rows, one per current board member), `founding_members` (seeded with three rows for Nicole Green, Zachary Smith, and Jesse Shepherd), `founding_member_tiers` (seeded with five rows matching your live site), `sponsorship_tiers` (seeded with seven rows for the future c(4) program), and `site_leadership` (seeded with two rows for Director and Treasurer). You should also see one view called `founding_members_public` and three functions called `founding_member_tier`, `founding_members_progress`, and `set_updated_at`. Row Level Security should be enabled on all five tables, which you can verify by opening any table in the dashboard and looking at the RLS toggle.

### Step 2: Set environment variables on Netlify

The Netlify functions read configuration from environment variables, which you set in the Netlify dashboard under Site settings, then Environment variables. Do not put any of these in git. The reason is that two of them — the Supabase service role key and the ActBlue password — grant full write access to the database and full read access to every contribution that has ever come through your ActBlue, respectively. Keeping them out of git keeps them out of the hands of anyone who can clone the repository.

You need to set six variables. `SUPABASE_URL` is the HTTPS URL of your Supabase project, which you can find under Settings, then API, in the Supabase dashboard. It looks like `https://abcdefgh.supabase.co`. `SUPABASE_SERVICE_ROLE_KEY` is also under Settings, then API; it is specifically the key labeled "service_role secret", not the anon key. `ACTBLUE_USERNAME` and `ACTBLUE_PASSWORD` come from the ActBlue administrative interface under Integrations, then Contribution Data Service; these are API credentials, not your ActBlue login. `ACTBLUE_FORM_SLUG` should be set to `ohio-pride-pac`, matching the slug in your actual ActBlue donation URLs. And `ACTBLUE_FOUNDING_REFCODE_PREFIX` should be set to `founding_`, which is the convention the sync function uses to distinguish founding-member contributions from other donations on the same ActBlue form.

### Step 3: Commit the files to your repository

Drop the eight files into their matching paths in the `ohiopride-web` repository, then commit and push to `main`. Netlify auto-deploys on every push to `main`, so this single commit triggers the deploy. The build should succeed on the first try because the Netlify functions are self-contained and the migrations have already been applied to Supabase.

One thing to watch for during this first deploy: if you had a previous version of `site-template.js` or `ohiopride-data.js` in the repository, Git will show those files as modified, not added. That is correct and expected. The Round 2 `site-template.js` is specifically a small modification of what you have deployed today, and the Round 2 `ohiopride-data.js` merges the Round 1 additions with all the new Round 2 loaders into one file.

### Step 4: Add the ActBlue sync cron to netlify.toml

The hourly ActBlue sync is a scheduled function, which in Netlify terminology means it runs on a cron rather than in response to HTTP requests. You register the schedule in `netlify.toml` at the root of your repository. If you do not already have a `netlify.toml`, create one; if you have one, add the block below without removing anything that is already there:

```toml
[[scheduled.functions]]
  path = "/.netlify/functions/actblue-sync"
  schedule = "@hourly"
```

Netlify re-reads `netlify.toml` on every deploy, so the schedule becomes active after your next push.

### Step 5: Swap the hardcoded client code on the two affected pages

This is the only step that requires hand-editing two HTML files in your repository. The edits are small and both pages gain the same pattern: remove the hardcoded data block, add a script tag pointing to `ohiopride-data.js`, and add a small inline script that calls the right loader on DOMContentLoaded.

For `/founding-members.html`, there are four separate pieces of content to replace. The tier-legend cards near line 222 that currently hardcode five `<div class="tier-legend-card">` blocks should be emptied out — keep the wrapping `<div class="tier-grid reveal-stagger" id="tierGrid">` container (add the `id="tierGrid"` if it is not already there) but remove its children. The tier-group member list near line 251, which currently hardcodes Nicole Green, Zachary Smith, and Jesse Shepherd into `<div class="tier-group">` blocks, should also be emptied, keeping only the wrapping `<div class="member-list reveal" id="memberList">` container with the new `id` added. The inline `<script>` at the bottom of the page that sets `FOUNDING_MEMBER_COUNT = 3` should be deleted entirely. And at the bottom of the page, just before the closing `</body>` tag, add:

```html
<script src="/js/ohiopride-data.js" defer></script>
<script defer>
  document.addEventListener('DOMContentLoaded', function () {
    OhioPride.loadProgress('#goalFill', '#progressText');
    OhioPride.loadFoundingMemberTiers('#tierGrid');
    OhioPride.loadPublicMembers('#memberList');
  });
</script>
```

For `/board.html`, the edit is simpler because the whole file currently runs as one big inline script. Find the block that starts `var boardMembers = [` near line 470 and ends `grid.appendChild(card)` near line 650, and delete that entire block. In its place, add:

```html
<script src="/js/ohiopride-data.js" defer></script>
<script defer>
  document.addEventListener('DOMContentLoaded', function () {
    OhioPride.loadBoard('#boardGrid');
  });
</script>
```

The `<div id="boardGrid">` container, all the CSS for `.board-card`, the name-strip marquee logic, and the intersection-observer scroll animations all stay unchanged.

For every page that uses the shared site-template footer (which is nearly every page today), no edits are needed. The updated `site-template.js` handles the leadership loading automatically as long as `ohiopride-data.js` is loaded on the page. If you want to be certain the footer disclaimer updates on pages that do not already load `ohiopride-data.js`, add this line to every page's `<head>` alongside the existing `site-template.js` tag:

```html
<script src="/js/ohiopride-data.js" defer></script>
```

### Step 6: Smoke test each endpoint

Before you consider the migration done, hit each of the six Netlify function URLs directly in a browser and verify the JSON response looks correct. Visiting `https://ohiopride.org/.netlify/functions/founding-members-progress` should return a JSON object with `member_count: 3`, `goal: 1969`, and a small non-zero `total_cents` reflecting the seeded members. Visiting `/.netlify/functions/board-members` should return ten members in an array. `/.netlify/functions/founding-member-tiers` should return five tiers. `/.netlify/functions/public-members` should return three members grouped into tiers. `/.netlify/functions/site-leadership` should return the Director and Treasurer and a pre-assembled disclaimer string. And `/.netlify/functions/actblue-sync` can be triggered manually from the Netlify Functions UI; it should return `rows_written: 0` until real ActBlue contributions start arriving, because the seeded rows have synthetic contribution IDs that no live ActBlue CSV will contain.

Then load `/board` and `/founding-members` in a browser and make sure they render identically to how they did before the migration. If anything is missing or broken, check the browser's developer console for network errors on the function URLs — that will tell you whether the issue is on the Netlify side or the client side.

## What the migration deliberately does not do yet

A few things are intentionally left for later rounds, either because they are not operationally urgent or because they require design decisions that have not been made yet.

The sponsorship tier page is not wired up on the PAC site. The table is seeded with the seven-tier Onyx-through-Diamond program, but the rows are tagged `entity='c4'` and will never appear on an Ohio Pride PAC surface. When the Ohio Pride Action c(4) website comes online, adding a sponsorship page there is a matter of creating a new Netlify function that queries `sponsorship_tiers` with the entity filter, and a new client-side loader that mirrors `loadFoundingMemberTiers()`. That work is maybe two hours and reuses every pattern already established here.

The founding-member page's "tier-group" member list is wired up to `public-members`, but the sync function does not yet populate a dedicated `recurrence` column on contributions. Right now the tier classifier falls back to treating all contributions as one-time when the ActBlue CSV recurrence fields are empty. Once you see real data flowing through ActBlue and can confirm which specific column name your ActBlue account uses for recurrence (the variants vary by account), a three-line change to the sync function will fix that. The seed data for Nicole, Zachary, and Jesse currently lands in the "Supporter" fallback tier because their seeded amounts do not exactly match any named tier threshold; once you know which tiers they should be listed under, you can update their rows directly in the Supabase dashboard.

Endorsements, scorecard entries, event listings, and press mentions are all natural future additions using the same pattern. Each would be a new table, a new Netlify function, a new client-side loader method on `ohiopride-data.js`, and a small HTML edit to the page that uses it. After Round 1 and Round 2, these are copy-paste.

## A note on what to do if something goes wrong

Every piece of this migration is designed to fail open. If the Netlify function is down, the website shows whatever hardcoded fallback content is in the HTML. If the Supabase database is down, the Netlify functions return 500 and the client-side loaders silently keep the fallback visible. If the ActBlue sync fails, the next hourly run tries again with a 48-hour lookback window, so one failed run does not cost you any data. The only thing that would cause a visible problem on the website is a bug in one of the client-side loaders that removes content before the fetch completes and then cannot recover. The loaders are written to render new content only on successful fetch, so that failure mode should not happen, but if it does, rolling back means restoring the previous `ohiopride-data.js`, `site-template.js`, and the two HTML files — no database changes are needed to revert.
