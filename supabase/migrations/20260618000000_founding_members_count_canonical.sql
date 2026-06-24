-- =============================================================================
-- 20260618000000_founding_members_count_canonical.sql
-- -----------------------------------------------------------------------------
-- Fixes the "X of 1,969 Founding Members" discrepancy and stops it recurring.
--
-- THE BUG
--   The headline founding-member count was computed three different ways:
--     * homepage + /donate/founding-member  -> founding_members_progress() RPC,
--       which did count(*) over EVERY founding_members row;
--     * /founding-members                   -> length of the public roster
--       (founding_members_public view, is_public AND is_vetted only).
--   Because count(*) counts contribution ROWS, not PEOPLE, it:
--     * counted donors not yet vetted (every hourly ActBlue sync bumped the
--       homepage number but not the directory),
--     * counted refunded / cancelled-recurring contributions,
--     * counted a recurring monthly donor once per monthly charge.
--   So the two surfaces never agreed, and the homepage number drifted upward
--   on its own every month.
--
-- THE FIX (single source of truth, de-duplicated by PERSON)
--   1. founding_member_key() - one canonical person identity used everywhere.
--      Keyed on full_name + email TOGETHER, because:
--        * a recurring donor's monthly charges share the same name AND email,
--          so they collapse to one person; but
--        * a shared contact email used by two different donors (e.g. a
--          consulting firm address) keeps two distinct names = two people.
--   2. founding_members_public - now returns ONE row per person.
--   3. founding_members_progress() - counts DISTINCT people, over the same
--      eligible population the roster shows (is_public AND is_vetted, not
--      refunded, not cancelled). member_count == roster size, on every page.
--   4. founding_number - reassigned one-per-person (recurring/duplicate rows
--      hold NO number), and a trigger keeps it that way for every future
--      insert/update so a recurring gift can never consume a new number.
--
-- Idempotent: re-running reproduces the same numbers for the same data.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Canonical person identity.
--    A person is identified by (full_name, email) together. When both are
--    blank we fall back to the row id so two distinct anonymous rows never
--    merge.
-- -----------------------------------------------------------------------------
create or replace function public.founding_member_key(
  p_full_name text,
  p_email     text,
  p_id        uuid
)
returns text
language sql
immutable
as $$
  select case
    when coalesce(nullif(trim(p_full_name), ''), nullif(trim(p_email), '')) is null
      then p_id::text
    else lower(trim(coalesce(p_full_name, ''))) || '|' || lower(trim(coalesce(p_email, '')))
  end
$$;

comment on function public.founding_member_key(text, text, uuid) is
  'Canonical founding-member identity (full_name + email). Collapses a single
   donor''s recurring/duplicate contributions to one person while keeping two
   different donors who share a contact email separate.';

grant execute on function public.founding_member_key(text, text, uuid) to anon, authenticated;


-- -----------------------------------------------------------------------------
-- 2. Public roster view: one row per person.
--    Drives /founding-members. DISTINCT ON the person key, keeping the row
--    that carries the founding_number (then the earliest contribution).
-- -----------------------------------------------------------------------------
drop view if exists public.founding_members_public;
create view public.founding_members_public as
select
  id,
  founding_number,
  display_name,
  tier,
  city,
  state,
  county,
  elected_office,
  jurisdiction,
  public_quote,
  contributed_at
from (
  select distinct on (public.founding_member_key(full_name, email::text, id))
    id,
    founding_number,
    coalesce(nullif(display_name, ''), 'Anonymous')  as display_name,
    public.founding_member_tier(amount_cents, recurrence) as tier,
    city,
    state,
    county,
    elected_office,
    jurisdiction,
    public_quote,
    contributed_at
  from public.founding_members
  where is_public = true
    and is_vetted = true
    and coalesce(is_refunded, false) = false
    and coalesce(is_cancelled_recurring, false) = false
  order by
    public.founding_member_key(full_name, email::text, id),
    founding_number nulls last,
    contributed_at,
    id
) d;

comment on view public.founding_members_public is
  'Public-facing founding members, one row per person (recurring/duplicate
   contributions collapsed). Excludes PII. Source of truth for the roster.';

grant select on public.founding_members_public to anon, authenticated;


-- -----------------------------------------------------------------------------
-- 3. Progress RPC: distinct people, same eligible population as the roster.
--    member_count == number of rows in founding_members_public, so the
--    "X of 1,969" headline is identical on every page.
--    total_cents sums every valid contribution (recurring charges are real
--    dollars), so fundraising totals stay honest.
-- -----------------------------------------------------------------------------
create or replace function public.founding_members_progress()
returns table (
  member_count    integer,
  goal            integer,
  total_cents     bigint,
  percent_to_goal numeric
)
language sql
stable
as $$
  with eligible as (
    select
      public.founding_member_key(full_name, email::text, id) as person_key,
      amount_cents
    from public.founding_members
    where is_public = true
      and is_vetted = true
      and coalesce(is_refunded, false) = false
      and coalesce(is_cancelled_recurring, false) = false
  )
  select
    count(distinct person_key)::integer                              as member_count,
    1969                                                             as goal,
    coalesce(sum(amount_cents), 0)::bigint                           as total_cents,
    least(round((count(distinct person_key)::numeric / 1969) * 100, 2), 100) as percent_to_goal
  from eligible
$$;

comment on function public.founding_members_progress() is
  'Single source of truth for the 1,969 progress counter. Counts DISTINCT
   eligible people (is_public AND is_vetted, not refunded/cancelled), matching
   founding_members_public exactly.';

grant execute on function public.founding_members_progress() to anon, authenticated;


-- -----------------------------------------------------------------------------
-- 4a. One-time reconciliation: assign founding_number one-per-person.
--     The guard trigger is dropped first (it is recreated in 4b) so these bulk
--     updates run uninterrupted on both the first apply and any re-apply.
--     Deterministic and idempotent: clears every number, then numbers each
--     eligible person 1..N in contribution order, placing the number on that
--     person's earliest eligible contribution. Recurring / duplicate rows keep
--     founding_number = NULL.
-- -----------------------------------------------------------------------------
drop trigger if exists founding_members_assign_number_trg on public.founding_members;

update public.founding_members
   set founding_number = null
 where founding_number is not null;

with eligible as (
  select
    id,
    public.founding_member_key(full_name, email::text, id) as person_key,
    contributed_at,
    full_name
  from public.founding_members
  where is_public = true
    and is_vetted = true
    and coalesce(is_refunded, false) = false
    and coalesce(is_cancelled_recurring, false) = false
),
reps as (
  -- earliest eligible contribution per person
  select distinct on (person_key) person_key, id, contributed_at, full_name
  from eligible
  order by person_key, contributed_at, id
),
numbered as (
  select id, row_number() over (order by contributed_at, full_name, id) as num
  from reps
)
update public.founding_members fm
   set founding_number = n.num
  from numbered n
 where fm.id = n.id
   and n.num <= 1969;


-- -----------------------------------------------------------------------------
-- 4b. Guard trigger: keep founding_number one-per-person going forward.
--     * A contribution from a person who already holds a number (recurring /
--       duplicate) never gets a new number.
--     * A brand-new eligible person gets the next number (capped at 1969).
--     * Ineligible rows (unvetted, private, refunded, cancelled) hold none,
--       so new donors can't inflate the count before they are vetted.
-- -----------------------------------------------------------------------------
create or replace function public.founding_members_assign_number()
returns trigger
language plpgsql
as $$
declare
  v_key        text;
  v_has_number boolean;
  v_next       integer;
begin
  if new.is_public is true
     and new.is_vetted is true
     and coalesce(new.is_refunded, false) = false
     and coalesce(new.is_cancelled_recurring, false) = false then

    v_key := public.founding_member_key(new.full_name, new.email::text, new.id);

    select exists (
      select 1
      from public.founding_members
      where id <> new.id
        and founding_number is not null
        and public.founding_member_key(full_name, email::text, id) = v_key
    ) into v_has_number;

    if v_has_number then
      -- Recurring / duplicate contribution: reuse the person's existing slot.
      new.founding_number := null;
    elsif new.founding_number is null then
      select coalesce(max(founding_number), 0) + 1
        into v_next
        from public.founding_members;
      if v_next <= 1969 then
        new.founding_number := v_next;
      end if;
    end if;
  else
    -- Not eligible for a public number yet.
    new.founding_number := null;
  end if;

  return new;
end;
$$;

drop trigger if exists founding_members_assign_number_trg on public.founding_members;
create trigger founding_members_assign_number_trg
  before insert or update on public.founding_members
  for each row execute function public.founding_members_assign_number();
