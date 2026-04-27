# Ohio Pride PAC, Admin Runbook

How to keep the public site current. Written for whoever holds the keys: Zach, the Treasurer, or any board member with Supabase access.

The site is built around four data-driven features. Everything else is static HTML. If you are updating people, bills, votes, or members, you are working in Supabase.

| Feature | Live Source | Where the page lives |
|---|---|---|
| Founding Members | `public.founding_members_public` (view) | `/founding-members.html` |
| Board Members | `public.board_members` | `/board.html` (see Audit doc for current wiring status) |
| Issues | `public.bills` + `public.bill_issue_tags` | `/issues.html` and `/issues/<bill>.html` |
| Scorecard | `public.legislators` + `public.score_snapshots` | `/scorecard.html` |

Anything else on the site is static HTML and gets edited like any other web page.

---

## 1. Founding Members

### Adding a new member

The normal path is **ActBlue → `actblue-sync.mjs` → `public.founding_members`**. You should not be inserting rows by hand unless you are seeding or correcting.

If a contribution comes in:

1. The sync job creates a row with `is_public = false` and `is_vetted = false`. The row is invisible to the public page.
2. Confirm the contributor consents to being listed publicly. (Default is private. We do not publish anyone who has not consented.)
3. In Supabase Studio, open the row and set:
   - `is_public = true`
   - `is_vetted = true`
   - `display_name` (how the name should appear publicly, e.g. "Sarah K." or full name)
   - `city` (optional)
   - `county` (must be one of the 88 Ohio counties, no "County" suffix)
   - `elected_office` (optional, e.g. "City Commissioner")
   - `jurisdiction` (optional, e.g. "City of Dayton")
   - `public_quote` (optional, one-line "why I joined")
4. Run the founding-number assigner, only needed if the row does not already have one:
   ```sql
   WITH ordered AS (
     SELECT id, ROW_NUMBER() OVER (ORDER BY contributed_at, full_name) AS rn
     FROM public.founding_members
     WHERE is_public = true AND is_vetted = true AND founding_number IS NULL
   ),
   nextstart AS (SELECT COALESCE(MAX(founding_number), 0) AS base FROM public.founding_members)
   UPDATE public.founding_members fm
      SET founding_number = ns.base + o.rn
     FROM ordered o, nextstart ns
    WHERE fm.id = o.id;
   ```
5. Refresh the live site. The new member shows up automatically.

### Manual insert (rare, e.g. seeding a known confirmed member)

```sql
INSERT INTO public.founding_members
  (full_name, display_name, amount_cents, recurrence,
   city, county, elected_office, jurisdiction,
   is_public, is_vetted, contributed_at, notes)
VALUES
  ('Full Name', 'Display Name', 10000, 'monthly',
   'Dayton', 'Montgomery', 'City Commissioner', 'City of Dayton',
   true, true, now(),
   'Confirmed by [who]. Reason for manual entry.');
```

Then run the founding-number assigner above.

### Marking someone as elected (after a win)

```sql
UPDATE public.founding_members
SET elected_office = 'State Representative',
    jurisdiction = 'OH-30'
WHERE full_name = 'First Last';
```

The Elected pin and the "Founding Members In Office" strip on the public page update on next load.

### Removing or hiding a member

Do not delete rows. Set:

```sql
UPDATE public.founding_members SET is_public = false WHERE id = '<uuid>';
```

The contribution record stays for accounting; the public listing disappears.

---

## 2. Board Members

Stored in `public.board_members`. The site reads from this table.

### Adding a board member

```sql
INSERT INTO public.board_members
  (name, role, chip, bio, display_order, is_active, city)
VALUES
  ('Full Name', 'Board Member', 'board-default',
   '["Paragraph one.", "Paragraph two."]'::jsonb,
   100, true, 'Cleveland');
```

`role` is the title shown on the card (Director, Treasurer, Board Member, etc.). `chip` is a CSS-class hint for the colored badge. `bio` is a JSON array of paragraph strings.

### Reordering the board

Lower `display_order` = appears first.

```sql
UPDATE public.board_members SET display_order = 10 WHERE name = 'Zachary R. Joseph';
UPDATE public.board_members SET display_order = 20 WHERE name = 'David Donofrio';
```

### Retiring a board member

```sql
UPDATE public.board_members SET is_active = false WHERE name = 'First Last';
```

The card disappears on next page load. The row is preserved for history.

### Officer changes (Director / Treasurer)

Edit `public.site_leadership`. The Director and Treasurer rows feed the "Paid for by" disclaimer and the footer.

```sql
UPDATE public.site_leadership SET full_name = 'New Treasurer Name' WHERE title = 'Treasurer';
```

---

## 3. Issues (Bills)

Stored in `public.bills`. Tags are in `public.bill_issue_tags`. Sponsors are in `public.bill_sponsors`. Roll-call votes are in `public.bill_votes` and `public.legislator_votes`.

### Adding a new tracked bill

```sql
INSERT INTO public.bills
  (bill_number, slug, general_assembly, title, stance, category, status,
   chamber_of_origin, introduced_on, summary, what_it_does, impact,
   tracker_stance, equality_impact_note, is_active, on_seed_list)
VALUES
  ('HB 999', 'hb999', 136,
   'Plain-English title for public use',
   'anti', 'anti_trans', 'in_committee',
   'house', '2026-04-15',
   'One-paragraph summary.', 'What it does.', 'Who it impacts.',
   'restricts_equality', 'One-line plain-English impact note.',
   true, true);
```

Then tag it with one or more issue families:

```sql
INSERT INTO public.bill_issue_tags (bill_id, issue_family_id, is_primary)
SELECT b.id, f.id, true
  FROM public.bills b, public.issue_families f
 WHERE b.bill_number = 'HB 999' AND f.slug = 'trans-rights';
```

### Updating bill status

```sql
UPDATE public.bills
   SET status = 'passed_house',
       last_action_on = '2026-05-01',
       last_action_text = 'Passed House 62-31'
 WHERE bill_number = 'HB 999';
```

### Adding a roll-call vote

See `actblue-sync.mjs`-style scripts in `/SQL Migration/` for examples; simplest is to insert into `public.bill_votes` then `public.legislator_votes` for each member's position. Run the score recompute (see Scorecard section) afterward.

### Deactivating a bill (e.g. session ended, no longer relevant)

```sql
UPDATE public.bills SET is_active = false WHERE bill_number = 'HB 999';
```

---

## 4. Scorecard (Legislators)

Stored in `public.legislators`. Score history lives in `public.score_snapshots`. Methodologies in `public.scoring_methodologies`.

### Adding a legislator (new term, new appointment)

```sql
INSERT INTO public.legislators
  (full_name, last_name, first_name, chamber, party, district,
   term_start_year, term_end_year, is_active, official_url, contact_email)
VALUES
  ('Last, First', 'Last', 'First', 'house', 'D', 30,
   2027, 2029, true,
   'https://ohiohouse.gov/...', 'contact@ohiohouse.gov');
```

### Marking a legislator as inactive after an election

Two flags matter: `is_active` and `term_end_year`.

```sql
UPDATE public.legislators
   SET is_active = false,
       term_end_year = 2026
 WHERE full_name = 'Last, First';
```

The site should hide inactive legislators from the current scorecard while preserving their historical scores via `score_snapshots`. (See Audit doc: this filter needs to be confirmed live on `scorecard.html`.)

### Recomputing scores after adding votes

Score snapshots are written by a recompute job. The pattern is documented in the seed migration `seed_score_snapshots_from_scorecard_js`. After material changes (new vote, sponsorship, bill reclassification), insert a new row in `public.score_snapshots` for the affected legislators.

---

## 5. RSVP / Signup Forms (Launch Day, future events)

Stored in `public.launch_signups`. The form module is `/js/launch-signup.js`. To attach a new RSVP form anywhere on the site:

1. Use the standard fields: `email`, `first_name`, `last_name`, optional `organization`, optional `title`.
2. Add `data-launch-form data-source="event-name"` to the `<form>` tag.
3. Include `<script src="/js/launch-signup.js" defer></script>`.

Submissions go straight to Supabase. Email notifications continue through Netlify Forms if `data-netlify="true"` is on the form.

To export RSVPs:

```sql
SELECT first_name, last_name, email, organization, title, source, created_at
  FROM public.launch_signups
 WHERE source = 'launch-day-rsvp'
 ORDER BY created_at;
```

---

## 6. Common "Where is X?" Cheatsheet

| You want to | Edit |
|---|---|
| Add or hide a founding member | `public.founding_members` |
| Mark a founding member as elected | `public.founding_members.elected_office` + `jurisdiction` |
| Add or retire a board member | `public.board_members` (`is_active` flag) |
| Change Director or Treasurer | `public.site_leadership` |
| Add a tracked bill | `public.bills` + `public.bill_issue_tags` |
| Update bill status | `public.bills` (`status`, `last_action_on`, `last_action_text`) |
| Add or retire a legislator | `public.legislators` (`is_active`, `term_end_year`) |
| Record a vote | `public.bill_votes` + `public.legislator_votes` |
| Pull RSVP list | `public.launch_signups` |
| Change "Paid for by" line | `public.site_leadership` |

---

## 7. Safety Notes

- **Never delete contribution rows.** Use `is_public = false` to hide.
- **Counties are validated.** If you misspell a county the row will reject. The 88 are checked exactly.
- **Founding numbers are unique.** Do not reassign a number once the member has been published.
- **Anon API key in HTML is fine.** It is intended for client-side use. RLS policies enforce the actual security boundary.
- **PII never leaves the public view.** `full_name`, `email`, and internal `notes` are excluded from `founding_members_public`. Do not loosen that.
