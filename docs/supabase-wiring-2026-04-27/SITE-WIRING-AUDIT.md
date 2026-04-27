# Ohio Pride PAC, Site Wiring Audit

Snapshot date: 2026-04-27. Goal: confirm every dynamic feature reads live from Supabase, so future updates are data work rather than code work.

## Headline

| Feature | Live source today | Future-proof for Zach without a code change? |
|---|---|---|
| Founding Members | Supabase `founding_members_public` view | Yes |
| Launch-Day RSVP | Supabase `launch_signups` (after 2-line patch documented in `LAUNCH-DAY-FORM-PATCH.md`) | Yes |
| Board Members | Pending file inspection (file currently locked by Drive sync) | Likely yes via `board_members.is_active`, needs confirmation |
| Issues | Static JS file `/js/bill-data.js` (not Supabase) | **No, code change required to update bills today** |
| Scorecard | Static JS files `/js/scorecard-data.js`, `/js/voting-records.js` (not Supabase) | **No, code change required to update votes today** |

The Supabase tables for issues and scorecard are populated and current (26 bills, 133 legislators, 132 score snapshots). What is missing is the front-end fetch on the public pages. Until they are wired, edits to the public site require editing JS files even though the database has the right data.

---

## What Is Wired Live

### 1. Founding Members
- Page: `/founding-members.html`
- Source: `public.founding_members_public` view via Supabase REST + anon key
- Fields exposed: `founding_number`, `display_name`, `tier`, `city`, `county`, `elected_office`, `jurisdiction`, `public_quote`, `contributed_at`
- Activate / hide: `is_public` and `is_vetted` flags on `public.founding_members`
- Elected badge: derives from `elected_office IS NOT NULL`
- Status: shipped today

### 2. Launch-Day RSVP (after 2-line patch)
- Page: `/launch-day.html`
- Source: `public.launch_signups` via Supabase REST + anon key
- Anon role can INSERT, cannot SELECT. Service role only for export.
- Status: table + module shipped, HTML patch pending Drive sync unlock. Patch instructions in `LAUNCH-DAY-FORM-PATCH.md`.

---

## What Is Not Wired Live (Action Items)

### 3. Issues / Bills
- Page: `/issues.html` and `/issues/<bill>.html`
- Today: pulls from `/js/bill-data.js` (a hand-edited JS array of bill objects)
- Database: `public.bills` (26 rows), `public.bill_issue_tags` (90 rows), `public.bill_sponsors`, `public.bill_votes`, `public.legislator_votes`, `public.bill_actions` are all populated and current
- **What to add:** a fetch on issues pages against `public.bills` (or a new `bills_public` view) that returns the same shape `bill-data.js` exposes today
- **Effort:** medium. Same pattern as founding-members. Suggested view:
  ```sql
  CREATE VIEW public.bills_public AS
  SELECT id, bill_number, slug, general_assembly, title, official_title,
         stance, category, status, chamber_of_origin,
         introduced_on, last_action_on, last_action_text, next_expected_action,
         summary, what_it_does, impact, legal_risks,
         official_bill_url, bill_text_pdf_url,
         tracker_stance, equality_impact_note,
         is_featured, is_active
    FROM public.bills
   WHERE is_active = true;
  ```
- **Then:** front-end fetch + render. Once shipped, every change to a bill (status, vote, new bill) is a Supabase update, not a deploy.

### 4. Scorecard
- Page: `/scorecard.html`
- Today: pulls from `/js/scorecard-data.js` (hand-edited HOUSE_MEMBERS / SENATE_MEMBERS arrays) and `/js/voting-records.js`
- Database: `public.legislators` (133 rows), `public.score_snapshots` (132 rows), `public.legislator_votes` (15 rows but growing), `public.bill_sponsors` (24 rows) are all populated
- **What to add:** a `legislators_public` view that joins the latest `score_snapshots` row per legislator, exposing the fields the page currently consumes from the JS file
- **Effort:** medium-high. Score-snapshot recompute trigger should fire on insert into `legislator_votes` or `bill_sponsors` so the snapshot row matches the votes. Audit whether the recompute path is automated or manual.
- **Activate / deactivate after elections:** the `legislators.is_active` flag and `term_end_year` already exist. Once the page reads from the view instead of the static array, flipping `is_active = false` on someone who lost re-election will hide them from the live scorecard automatically. Until then, you have to edit the JS file.

### 5. Board Members
- Page: `/board.html`
- File currently locked by Drive sync, could not confirm wiring this session
- Database: `public.board_members` has 10 rows with the right shape (name, role, chip, bio, display_order, is_active, city)
- **What to verify:** open `board.html`, search for `BOARD_MEMBERS` (static array) vs `fetch(` (live). If static, wire the same way as founding-members. If live, no work needed.
- **If static, the migration is small.** Same pattern as founding-members. Estimated 30 minutes including a smoke test.

---

## Recommended Build Order

1. **Verify board.html wiring** when the file unlocks. If already live, mark complete.
2. **Wire issues pages to Supabase.** Highest ongoing-edit value: every committee hearing, floor vote, status change is a database update only.
3. **Wire scorecard to Supabase.** This is the post-election big one. Once shipped, election-night updates are flipping `is_active` and inserting new `legislators` rows, no code edits.
4. **Add a recompute helper.** A small SQL function `recompute_score_snapshot(legislator_id, methodology_id)` triggered on `legislator_votes` insert keeps the scorecard accurate without manual SQL.

---

## Activate / Deactivate Cheat Sheet

| Object | How you hide it from the public site |
|---|---|
| Founding Member | `UPDATE public.founding_members SET is_public = false WHERE id = '<uuid>';` |
| Board Member | `UPDATE public.board_members SET is_active = false WHERE name = 'X';` |
| Bill | `UPDATE public.bills SET is_active = false WHERE bill_number = 'X';` |
| Legislator (post-election) | `UPDATE public.legislators SET is_active = false, term_end_year = 2026 WHERE full_name = 'X';` |

Each of these works in the database today. The bills and scorecard ones do not yet take effect on the public site because the front-end is still reading static JS files. That is the gap.

---

## Files Shipped Today

- `/founding-members.html` (Supabase-backed, with directory + filters + Matt Joseph)
- `/js/launch-signup.js` (drop-in form handler)
- `/SQL Migration/20260427000000_founding_members_directory_fields.sql`
- `/SQL Migration/20260427000100_founding_members_seed_directory_data.sql`
- `/SQL Migration/20260427000200_launch_signups.sql`
- `/SQL Migration/ADMIN-RUNBOOK.md`
- `/SQL Migration/LAUNCH-DAY-FORM-PATCH.md`
- `/SQL Migration/SITE-WIRING-AUDIT.md` (this file)

## Migrations Applied to Supabase Today

- `founding_members_directory_fields`
- `founding_members_seed_directory_data`
- `launch_signups`
