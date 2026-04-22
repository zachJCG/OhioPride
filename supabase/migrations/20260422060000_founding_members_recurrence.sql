-- =============================================================================
-- Ohio Pride PAC — Migration 6: founding_members.recurrence
-- -----------------------------------------------------------------------------
-- Closes a gap between how we classify tiers and what we store. The
-- founding_member_tier() function needs both (amount_cents, recurrence) to
-- distinguish Stonewall Sustainer ($19.69 monthly) from a hypothetical $19.69
-- one-time contribution. Until now the founding_members table had no
-- recurrence column, so the founding_members_public view called the classifier
-- with the default 'one_time' for every row. Anyone who actually gave monthly
-- at a tier amount landed in the "Supporter" fallback bucket.
--
-- Nicole Green in the seed data is the canonical example: she gave $19.69/mo
-- (Stonewall Sustainer) but appeared on the public list as "Supporter" because
-- the view couldn't tell the backend she was recurring.
--
-- Three changes:
--
--   1. Add founding_members.recurrence, constrained to 'monthly' | 'one_time',
--      defaulting to 'one_time' to match current data.
--   2. Replace the founding_members_public view so it passes the column to the
--      tier classifier.
--   3. Update the seeded Nicole Green row to recurrence = 'monthly' so the
--      /founding-members page renders her under Stonewall Sustainer.
--
-- Depends on migrations 1-2.
-- =============================================================================

alter table public.founding_members
  add column if not exists recurrence text not null default 'one_time'
    check (recurrence in ('monthly', 'one_time'));

comment on column public.founding_members.recurrence is
  'Contribution cadence, needed by the tier classifier to distinguish monthly from one-time contributions at the same dollar amount.';


-- Replace the public view so it passes recurrence to founding_member_tier.
-- Drop first because the column list is changing shape conceptually even
-- though PostgreSQL would accept a CREATE OR REPLACE with the same columns.
drop view if exists public.founding_members_public;

create view public.founding_members_public as
select
  id,
  coalesce(nullif(display_name, ''), 'Anonymous') as display_name,
  public.founding_member_tier(amount_cents, recurrence) as tier,
  contributed_at
from public.founding_members
where is_public = true and is_vetted = true;

comment on view public.founding_members_public is
  'Public projection of founding_members. Exposes only display_name, derived tier, and contributed_at. Never leaks email, full_name, amount, or internal notes.';

grant select on public.founding_members_public to anon, authenticated;


-- Backfill Nicole Green. She is a monthly $19.69 Stonewall Sustainer; the
-- seed data shipped her with the default recurrence='one_time' and therefore
-- a "Supporter" tier. Scoped UPDATE so other seed rows stay as-is.
update public.founding_members
   set recurrence = 'monthly'
 where full_name = 'Nicole Green'
   and amount_cents = 1969;
