-- =============================================================================
-- Post-election refresh, phase 1 (2026-11-05): cycle, results, publish guard,
-- the 2027 quick picks, and the campaign-help field
-- -----------------------------------------------------------------------------
-- The 2026 cycle is over. Three things change on endorsement_applications, all
-- additive, so the migration can stay in place if a phase is rolled back:
--
--   1. A result. `result` is 'won', 'lost', 'pending', or null (not an
--      endorsee, or a race not yet held). `result_note` is a free line for a
--      recount or a certification change, and `result_updated_at` stamps
--      itself whenever either moves. Every 2026 endorsee starts as 'pending'
--      until phase 3 seeds the confirmed results.
--
--   2. A cycle year. The work order asked for `cycle smallint`. This schema
--      already files every application under an election (`cycle_id`, which
--      references election_cycles and is NOT NULL), so `cycle` is DERIVED from
--      that election's date by a trigger rather than typed by the form. It is
--      still stored, because the public view, the results archive, and the
--      home page all group by year and should not need a join to do it.
--      `election_year` stays: the admin race line and the board packet read
--      it, and the form keeps the two in step.
--
--   3. A publish guard. `is_published` used to default to true, which meant a
--      fresh SUBMISSION was "published" the moment it arrived and only the
--      view's status filter kept it off the site. Now nothing can be published
--      unless it is endorsed: the default flips to false, the rows the view
--      was already hiding are flipped (they are listed in the PR), and a check
--      constraint refuses the combination outright. The admin says "Endorse
--      before publishing." when it is attempted.
--
-- Two smaller things ride along because the reopened form needs them:
--
--   - `help_requested text[]` and `help_requested_note`: the optional "Want
--     help with your campaign?" question. Not a questionnaire answer, so not
--     in `responses`; the Screening Committee does not score it.
--   - `endorsement_office_options.quick_pick` / `quick_label`: which offices
--     the form shows as the 2027 "What are you running for?" cards, and the
--     plain-English label on each. Data, so the 2028 slate is an UPDATE.
--
-- public_endorsements gains cycle, result, result_note at the END of its
-- select list, which is what lets CREATE OR REPLACE VIEW keep every grant.
--
-- Rollback (only if it must come out; the columns are harmless in place):
--   restore the previous public_endorsements definition (12 columns, see
--   20260907000000_endorsement_module_refinements.sql), then
--   drop trigger trg_endorsement_fill_cycle / trg_endorsement_stamp_result,
--   drop the two constraints, and drop the six new columns.
-- =============================================================================

-- ── 1. Columns ──────────────────────────────────────────────────────────────
alter table public.endorsement_applications
  add column if not exists cycle               smallint,
  add column if not exists result              text,
  add column if not exists result_note         text,
  add column if not exists result_updated_at   timestamptz,
  add column if not exists help_requested      text[],
  add column if not exists help_requested_note text;

comment on column public.endorsement_applications.cycle is
  'Election year of the cycle this application belongs to. Derived from election_cycles.election_date through cycle_id by trg_endorsement_fill_cycle; stored so public surfaces can group by year without a join.';
comment on column public.endorsement_applications.result is
  'won | lost | pending | null. Null means not an endorsee or no result yet entered. Set in the admin; every public count and badge renders from it.';
comment on column public.endorsement_applications.result_note is
  'Free text beside the result: a recount, a certification change, a margin worth noting. Public through public_endorsements.';
comment on column public.endorsement_applications.result_updated_at is
  'When result or result_note last changed. Stamped by trg_endorsement_stamp_result; never set by hand.';
comment on column public.endorsement_applications.help_requested is
  'What the campaign said it would like help with (Petition signatures, Fundraising, Messaging, Volunteers, Something else). Optional, informational, not scored.';
comment on column public.endorsement_applications.help_requested_note is
  'The free text that goes with help_requested when the campaign ticked Something else.';

alter table public.endorsement_applications
  drop constraint if exists endorsement_result_valid;
alter table public.endorsement_applications
  add constraint endorsement_result_valid
  check (result is null or result in ('won', 'lost', 'pending'));

-- ── 2. cycle is derived from the election, never typed ──────────────────────
create or replace function public.endorsement_fill_cycle()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.cycle is null and new.cycle_id is not null then
    select extract(year from c.election_date)::smallint
      into new.cycle
      from public.election_cycles c
     where c.id = new.cycle_id;
  end if;
  return new;
end;
$$;

comment on function public.endorsement_fill_cycle() is
  'Fills endorsement_applications.cycle from the election the row belongs to when the write left it null. One rule, in SQL: a form cannot file a 2027 race under 2026.';

drop trigger if exists trg_endorsement_fill_cycle on public.endorsement_applications;
create trigger trg_endorsement_fill_cycle
  before insert or update of cycle_id, cycle on public.endorsement_applications
  for each row execute function public.endorsement_fill_cycle();

-- Backfill. Every row has a cycle_id, so this reaches every row; the literal
-- 2026 fallback below it is belt and braces for a row whose cycle has no date.
update public.endorsement_applications a
   set cycle = extract(year from c.election_date)::smallint
  from public.election_cycles c
 where c.id = a.cycle_id
   and a.cycle is null;

update public.endorsement_applications
   set cycle = 2026
 where cycle is null;

-- ── 3. result_updated_at stamps itself ──────────────────────────────────────
create or replace function public.endorsement_stamp_result()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.result is distinct from old.result
     or new.result_note is distinct from old.result_note then
    new.result_updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_endorsement_stamp_result on public.endorsement_applications;
create trigger trg_endorsement_stamp_result
  before update of result, result_note on public.endorsement_applications
  for each row execute function public.endorsement_stamp_result();

-- 2026 endorsees start as pending until results are entered (phase 3 seeds
-- the confirmed results on top of this).
update public.endorsement_applications
   set result = 'pending'
 where cycle = 2026
   and status = 'endorsed'
   and result is null;

-- ── 4. Publish guard: nothing is public unless endorsed ─────────────────────
-- Only touches rows the public view already hides (status <> 'endorsed').
update public.endorsement_applications
   set is_published = false
 where is_published = true
   and status is distinct from 'endorsed';

alter table public.endorsement_applications
  alter column is_published set default false;

comment on column public.endorsement_applications.is_published is
  'Whether an ENDORSED candidate shows on the public site. Defaults to false since 2026-11-05 and cannot be true on any other status (endorsement_published_requires_endorsed). Reopening an endorsement clears it.';

alter table public.endorsement_applications
  drop constraint if exists endorsement_published_requires_endorsed;
alter table public.endorsement_applications
  add constraint endorsement_published_requires_endorsed
  check (is_published is not true or status is not distinct from 'endorsed');

-- ── 5. The public view, with the new columns appended ───────────────────────
-- Same twelve columns in the same order as 20260907000000, then the three new
-- ones at the end: that is the shape CREATE OR REPLACE VIEW accepts, and it
-- keeps the existing grants to anon and authenticated.
create or replace view public.public_endorsements as
  select id,
         candidate_name,
         pronouns,
         office_sought,
         district,
         election_year,
         website,
         bio,
         is_out,
         coalesce(endorsed_at, reviewed_at, updated_at) as endorsed_at,
         endorsement_path::text                         as endorsement_path,
         county,
         cycle,
         result,
         result_note
    from public.endorsement_applications
   where status = 'endorsed'
     and is_published;

comment on view public.public_endorsements is
  'The only public surface for endorsements: endorsed and published rows, with the cycle year and the election result. Anon has no SELECT on the table itself.';

-- ── 6. 2027 quick picks on the application form ─────────────────────────────
alter table public.endorsement_office_options
  add column if not exists quick_pick  smallint,
  add column if not exists quick_label text;

comment on column public.endorsement_office_options.quick_pick is
  'Order of this office among the "What are you running for?" cards on the application form. Null means the office is reachable only through "Something else". Update these when the slate changes; no deploy needed.';
comment on column public.endorsement_office_options.quick_label is
  'Plain-English label for the quick-pick card. The catalog label stays what office_sought records.';

insert into public.endorsement_office_options
  (id, path, label, race_level, active, sort_order, requires_county, requires_district, is_judicial_office)
values
  (gen_random_uuid(), 'local', 'Township Fiscal Officer', 'township', true, 31, false, false, false)
on conflict (path, label) do nothing;

update public.endorsement_office_options set quick_pick = 1, quick_label = 'Mayor'
 where path = 'local'    and label = 'Mayor';
update public.endorsement_office_options set quick_pick = 2, quick_label = 'City or village council'
 where path = 'local'    and label = 'City / Village Council';
update public.endorsement_office_options set quick_pick = 3, quick_label = 'Township trustee or fiscal officer'
 where path = 'local'    and label = 'Township Trustee';
update public.endorsement_office_options set quick_pick = 4, quick_label = 'Board of education'
 where path = 'local'    and label = 'Board of Education / School Board';
update public.endorsement_office_options set quick_pick = 5, quick_label = 'Municipal court judge'
 where path = 'judicial' and label = 'Municipal Court';
