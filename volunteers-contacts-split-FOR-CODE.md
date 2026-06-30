# Handoff for Claude Code — Separate Volunteers from Contacts, Preserve Signup Source, and Mirror the Sign-Up Sheet in /admin

**Repo:** `zachJCG/OhioPride`  ·  **Supabase project:** `dkdxefzhttkmjhdbkvqn`  ·  **Prepared:** June 30, 2026

> This is the schema + app change. The separate data-import parity PR is in `pride-signups-jun2026-FOR-CODE.md` and is independent of this work.

---

## 1. Goal (what Zach wants)

1. **`contacts` is the master email listserv.** It grows over time and is the source of truth for who we can email.
2. **Volunteers and contacts got merged.** People who only signed a paper sheet were loaded into the `volunteers` table and tagged with the `volunteer` role. **Separate true volunteers (people who filled out the web `/volunteer` form, or explicitly opted in to volunteer) from general contacts (people who only signed a paper list).**
3. **Break out the source of every signup.** Each contact must carry where they came from (which sheet, event, or form), so the listserv stays segmentable as we keep adding data.
4. **In `/admin`, the Contacts grid's record preview should mirror the physical sign-up sheet** — show the row exactly as captured on paper (#, Name, Email, Phone, ZIP) plus the scan locator, confidence, and review notes.

---

## 2. Current Data Model (confirmed in prod, June 30 2026)

**`contacts`** — master record / email listserv. Key columns:
`id uuid`, `email citext`, `first_name`, `last_name`, `full_name`, `name`, `phone`, `address1/2`, `city`, `county`, `region`, `state` (default `OH`), `zip`, `roles text[]`, `sources text[]`, `source text`, `tags text[]`, `email_optin bool`, `sms_optin bool`, `do_not_contact bool` (default false), `needs_review bool`, `review_reason`, `notes`, `merged_into uuid`, `is_merged bool`, `created_at`, `updated_at`.

**`volunteers`** — currently a MIX of web-form volunteers and paper-signup imports. Key columns:
`id uuid`, `first_name` (NOT NULL), `last_name` (NOT NULL), `email text` (NOT NULL), `phone`, `pronouns`, `city`, `county`, `zip`, `ohio_house_district`, `ohio_senate_district`, `registered_voter`, `interests text[]`, `skills text[]`, `availability text[]`, `time_commitment`, `prior_campaign_experience bool`, `referral_source`, `is_founding_member bool`, `email_optin bool` (default true), `sms_optin bool`, `status text` (default `new`), `tags text[]`, `tshirt_size`, `contact_id uuid`.

**`signup_sheet_imports`** — OCR'd rows from the paper Pride sign-up sheets. Key columns:
`id uuid`, `source_file`, `page_no`, `row_no`, `raw_name`, `raw_email`, `raw_phone`, `raw_zip`, `name`, `email citext`, `phone`, `zip`, `confidence` (`high`/`medium`/`low`), `needs_review bool` (default true), `contact_id uuid`, `notes`, `imported_at`.

**`founding_members`** — ActBlue contributions; has `contact_id`.

**Counts now:** contacts **390** · volunteers **93** · signup_sheet_imports **291** (288 with email, 129 linked to a contact) · founding_members **156**.

---

## 3. The Problem, In Numbers

The `volunteers` table (93 rows) breaks down by `referral_source` as:

| Origin | Rows | What it really is |
|---|---|---|
| `Pride sign-up sheet — June 2026` | 48 | paper signup → **contact**, not a volunteer |
| `Cincinnati Tea Dance 2026 (paper sign-up)` | 14 | paper signup → **contact** |
| `Pride in the CLE 2026 (paper sign-up)` | 7 | paper signup → **contact** |
| `pride_signup` | 1 | paper signup → **contact** |
| Instagram / News / Facebook / Google search / "a friend" / Buckeye Flame / word of mouth / Zach / Adam / Social | 14 | web `/volunteer` form → **true volunteer** |
| `NULL` | 9 | unknown → **review queue** |

So **~70 of the 93 "volunteers" are really list contacts**, ~14 are true volunteers, and 9 are unknown.

This propagated into `contacts`:

- **93** contacts carry the `volunteer` role, but only ~14–23 of them ever actually volunteered.
- **129** contacts carry the `signup` role (the paper Pride sign-up people).
- **18** contacts carry **both** `volunteer` and `signup`.
- The single `contacts.source` text column disagrees with the `contacts.sources[]` array (e.g., `source = 'donor'` for 146 rows vs `sources[]` contains `donor` for 155). `sources[]` is the complete history; `source` is an inconsistent "primary."

Current `contacts.roles[]` distribution: `founding_member` 155, `donor` 155, `signup` 129, `volunteer` 93, `network` 23, `launch_signup` 16, `press` 15, `newsletter` 4.

---

## 4. Canonical Taxonomy (define once, use everywhere)

**`roles[]`** — what this person is to us (a person can have several):
`contact` (base, everyone), `signup`, `volunteer`, `donor`, `founding_member`, `newsletter`, `launch_signup`, `network`, `press`, `board`.

**`sources[]`** — every intake channel this person came through (full history):
`pride_signup_sheet`, `cincinnati_tea_dance_2026`, `pride_in_the_cle_2026`, `volunteer_form`, `actblue_donation`, `founding_member`, `launch_signup`, `newsletter_form`, `network`, `press`.

**`source`** (singular) — the **primary / earliest** source only, chosen by a fixed priority. Recommended priority (first match wins): `founding_member` > `actblue_donation` > `volunteer_form` > `pride_signup_sheet` > `cincinnati_tea_dance_2026` > `pride_in_the_cle_2026` > `launch_signup` > `newsletter_form` > `network` > `press`. Treat `source` as derived from `sources[]`; never set it by hand.

**The rule that fixes the merge:**
> The `volunteer` role belongs ONLY to people who came through the web `/volunteer` form (or explicitly opted in to volunteer). **Signing a paper sheet at a Pride table or event makes you a `contact`/`signup`, not a `volunteer`.**

---

## 5. Step 1 — Classify the `volunteers` Table by Intake Channel

Add an explicit channel so the Volunteers admin view stops showing paper-signup people.

```sql
alter table public.volunteers
  add column if not exists intake_channel text
  check (intake_channel in ('web_form','paper_signup','unknown'));

-- Backfill from referral_source patterns
update public.volunteers
set intake_channel = case
  when referral_source is null then 'unknown'
  when referral_source ilike any (array[
       '%sign-up%','%signup%','%paper%','%tea dance%','%pride in the cle%','pride_signup'])
    then 'paper_signup'
  else 'web_form'
end;
```

Expected after backfill: `paper_signup` ~70, `web_form` ~14, `unknown` ~9.

**Decision (see §10):** for the ~70 `paper_signup` rows, recommend **keeping them in the table but excluding them from the Volunteers admin view** (`where intake_channel = 'web_form'` or `'unknown'`), since their data is already represented in `contacts`/`signup_sheet_imports`. Do not delete — preserve provenance.

---

## 6. Step 2 — Correct `contacts` Roles and Sources

Two safe, reviewable passes. **Run the SELECT preview first, eyeball it, then run the UPDATE.**

**6a. Strip the over-applied `volunteer` role** from contacts whose only volunteer linkage is a paper signup:

```sql
-- PREVIEW: contacts that will lose the 'volunteer' role
select c.id, c.name, c.email, c.roles, c.sources
from contacts c
where 'volunteer' = any(c.roles)
  and not exists (                       -- has NO true web-form volunteer row
    select 1 from volunteers v
    where v.contact_id = c.id and v.intake_channel = 'web_form')
  and not exists (                       -- and didn't explicitly opt in elsewhere
    select 1 from volunteers v
    where v.contact_id = c.id and v.intake_channel = 'unknown');

-- APPLY
update contacts c
set roles   = array_remove(roles, 'volunteer'),
    sources = array_remove(array_remove(sources, 'volunteer'), 'volunteer_form'),
    updated_at = now()
where 'volunteer' = any(c.roles)
  and not exists (select 1 from volunteers v where v.contact_id = c.id and v.intake_channel = 'web_form')
  and not exists (select 1 from volunteers v where v.contact_id = c.id and v.intake_channel = 'unknown');
```

**6b. Make sure every paper-signup contact carries the right `signup` role and event source.** Map the volunteer-table paper rows and the `signup_sheet_imports` rows onto contacts:

```sql
-- Event-source label for paper rows that live in the volunteers table
update contacts c
set roles   = (select array(select distinct unnest(c.roles || array['signup','contact']))),
    sources = (select array(select distinct unnest(c.sources || array[
                 case
                   when v.referral_source ilike '%tea dance%'       then 'cincinnati_tea_dance_2026'
                   when v.referral_source ilike '%pride in the cle%' then 'pride_in_the_cle_2026'
                   else 'pride_signup_sheet'
                 end]))),
    updated_at = now()
from volunteers v
where v.contact_id = c.id and v.intake_channel = 'paper_signup';

-- signup_sheet_imports → contacts already get 'pride_signup_sheet' in §8 link step
```

**6c. Recompute the singular `source`** from `sources[]` by the priority in §4 (one deterministic statement; ask if you want it spelled out as a CASE ladder).

---

## 7. Step 3 — Preserve the Signup Source (the core ask)

After §6, the source lives in two places and is queryable forever:

- **`contacts.sources[]`** = every channel the person came through (the durable, segmentable history).
- **`contacts.source`** = the single primary channel (for grid columns / quick filters).
- The **row-level provenance** stays in `signup_sheet_imports` (scan file, page, row, confidence, notes) and in `volunteers.referral_source` / `intake_channel`.

No data is thrown away: separating volunteers from contacts is a **re-tagging**, not a deletion. A person who signed a sheet AND later volunteers ends up with `sources = {pride_signup_sheet, volunteer_form}` and `roles = {contact, signup, volunteer}`.

---

## 8. Step 4 — Link `signup_sheet_imports` → `contacts` (idempotent)

129 of 291 sheet rows are linked; 162 (including the new June 30 rows) are not. Upsert by email, then set `contact_id`.

```sql
-- 8a. Create contacts for sheet rows that don't have one yet (by citext email)
insert into public.contacts (email, name, phone, zip, roles, sources, source, needs_review, notes)
select s.email, s.name, s.phone, s.zip,
       array['contact','signup'], array['pride_signup_sheet'], 'pride_signup_sheet',
       true, 'Auto-created from signup_sheet_imports '||s.id::text
from public.signup_sheet_imports s
where s.email is not null
  and s.contact_id is null
  and not exists (select 1 from public.contacts c where c.email = s.email)
on conflict do nothing;

-- 8b. Link every sheet row to its contact and ensure the role/source are present
update public.signup_sheet_imports s
set contact_id = c.id
from public.contacts c
where s.email = c.email and s.contact_id is null;

update public.contacts c
set roles   = (select array(select distinct unnest(c.roles || array['contact','signup']))),
    sources = (select array(select distinct unnest(c.sources || array['pride_signup_sheet']))),
    updated_at = now()
where exists (select 1 from public.signup_sheet_imports s where s.contact_id = c.id);
```

The 3 phone-only sheet rows (null email) can't be matched on email — leave `contact_id` null and surface them in the review queue.

---

## 9. Step 5 — /admin Contacts Grid: Mirror the Sign-Up Sheet as the Record Preview

**Behavior:** in the `/admin` Contacts grid, expanding (or hovering the preview on) a contact shows a **Sign-Up Sheet card** that mirrors the paper layout the person actually filled in:

```
┌ Sign-Up Sheet — Scanned Jun 23, 2026 12:57 PM · p.17 · row 4 ─────────┐
│  #   NAME                EMAIL                     PHONE        ZIP     │
│  4   Michaela Smith      michaeladufeau@gmail.com  203-242-6481 43068  │
│                                                                        │
│  Confidence: LOW   ·   Needs review: yes                               │
│  Notes: name vs email mismatch; verify                                 │
└────────────────────────────────────────────────────────────────────────┘
```

- The **grid columns** should mirror the sheet's columns: `Name · Email · Phone · ZIP`, plus a `Source` chip and a `Confidence` chip.
- The **preview/expand** pulls the originating row from `signup_sheet_imports` via `contact_id`, and shows the scan locator (`source_file`, `page_no`, `row_no`) so staff can open that PDF page in Drive, plus `confidence`, `needs_review`, and `notes`.
- For contacts whose source is **not** a paper sheet (volunteer form, donation, etc.), the preview should mirror **that** intake record instead (volunteer-form fields, or ActBlue donation), defaulting to the sign-up-sheet card for `pride_signup_sheet` contacts. Keep one component with a per-source template.

**Backing view** (gives the grid one clean read for the sheet preview):

```sql
create or replace view public.admin_contact_signup_preview as
select
  c.id              as contact_id,
  c.name, c.email, c.phone, c.zip,
  c.roles, c.sources, c.source,
  c.email_optin, c.do_not_contact, c.needs_review,
  s.id              as signup_row_id,
  s.source_file, s.page_no, s.row_no,
  s.name  as sheet_name,
  s.email as sheet_email,
  s.phone as sheet_phone,
  s.zip   as sheet_zip,
  s.confidence,
  s.notes as sheet_notes
from public.contacts c
left join lateral (
  select * from public.signup_sheet_imports s
  where s.contact_id = c.id
  order by s.imported_at desc
  limit 1
) s on true;
```

(If a contact has multiple sheet rows, this shows the most recent; switch to an array/aggregate if you want all of them.)

---

## 10. Decisions for You (Zach)

1. **The 9 `unknown` (null referral) volunteers** — treat as true volunteers, or hold in a review queue? *Recommend: review queue (don't email as "volunteers" until confirmed).*
2. **The ~70 paper-signup rows in the `volunteers` table** — keep-and-hide (flag `intake_channel='paper_signup'`, exclude from the Volunteers view) or physically remove? *Recommend: keep-and-hide for provenance.*
3. **Does signing a paper sheet ever imply volunteering?** *Recommend: no. A sheet = email-list consent only. Volunteering requires the web form or an explicit checkbox.*
4. **`contacts.source` vs `sources[]`** — OK to treat `source` as a derived "primary" and stop writing it by hand? *Recommend: yes.*

---

## 11. Guardrails

- `contacts` is the source of truth for the email list. **Never delete** to dedupe — use `is_merged` / `merged_into`.
- All re-tagging is additive/corrective; preserve `signup_sheet_imports` and `volunteers.referral_source` for provenance.
- Keep every UPDATE reviewable: run the SELECT preview first.
- No RLS changes implied. If the Volunteers admin view is RLS-scoped, just add the `intake_channel` filter.
- Re-runnability: the link step (§8) is idempotent (NOT EXISTS / on conflict). The role fixes (§6) are safe to re-run because `array_remove` / `distinct unnest` are stable.

---

## 12. The Email Listserv Query (how we send)

The canonical "who can we email" set, now cleanly segmentable by source:

```sql
select c.email, c.name, c.source, c.sources
from public.contacts c
where c.email is not null
  and c.do_not_contact = false
  and coalesce(c.email_optin, true) = true;          -- paper opt-in + web opt-in
-- segment examples:
--   volunteers only:        where 'volunteer' = any(roles)
--   pride-sheet contacts:   where 'pride_signup_sheet' = any(sources)
--   exclude volunteers:     where not ('volunteer' = any(roles))
```

Future scans: append to `signup_sheet_imports` (idempotent on email) → run §8 to sync into `contacts`. The grid and the listserv stay correct as the data grows.

---

## 13. Verify When Done

```sql
-- No contact tagged volunteer unless they have a web_form/unknown volunteer row
select count(*) from contacts c
where 'volunteer' = any(roles)
  and not exists (select 1 from volunteers v where v.contact_id = c.id and v.intake_channel in ('web_form','unknown'));
-- expect 0

-- Every emailable sheet row is linked to a contact
select count(*) from signup_sheet_imports where email is not null and contact_id is null;  -- expect 0

-- Every contact has at least one source
select count(*) from contacts where cardinality(sources) = 0;  -- expect 0

-- Spot check the preview view
select * from admin_contact_signup_preview where source = 'pride_signup_sheet' limit 10;
```
