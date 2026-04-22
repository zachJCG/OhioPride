-- =============================================================================
-- Ohio Pride PAC - Migration 2: Configuration Tables
-- -----------------------------------------------------------------------------
-- Adds three reference tables that currently live as hardcoded HTML:
--
--   sponsorship_tiers       - corporate sponsorship ladder (for the future
--                             Ohio Pride Action c(4) sponsorship page)
--   founding_member_tiers   - the $19.69/mo - $250+ founding-member ladder
--                             currently hardcoded on /founding-members
--   site_leadership         - Director, Treasurer, and any other officer
--                             names + titles used in the footer disclaimer
--                             across every page
--
-- It also REPLACES the founding_member_tier() function from migration 1 with
-- a lookup against the new founding_member_tiers table, so tier assignment
-- actually matches your real program (monthly vs one-time, the named tiers
-- Stonewall Sustainer / Founding Member / Pride Builder / Founding Circle /
-- Founding Patron).
--
-- Finally, it seeds the three currently-public founding members (Nicole
-- Green, Zachary Smith, Jesse Shepherd) so the /founding-members page does
-- not go blank the moment the client swaps to read from Supabase.
-- =============================================================================


-- =============================================================================
-- TABLE: sponsorship_tiers
-- -----------------------------------------------------------------------------
-- One row per corporate sponsorship level. Priced in cents (integer) so we
-- never hit floating point rounding errors. `is_recurring` distinguishes
-- one-time sponsorships from annual commitments. `benefits` is a jsonb array
-- of bullet-point strings, mirroring the way sponsorship pages usually list
-- "what you get" under each tier.
--
-- NOTE: Ohio law (ORC 3599.03) prohibits corporate treasury contributions to
-- state PACs, so this table is designed to feed the forthcoming Ohio Pride
-- Action 501(c)(4) sponsorship page, NOT the PAC page. The `entity` column
-- is there to enforce that distinction at the data layer. Rows default to
-- 'c4' because that is the only entity that can legally accept corporate
-- sponsorship.
-- =============================================================================
create table if not exists public.sponsorship_tiers (
  id              uuid          primary key default gen_random_uuid(),
  name            text          not null,                       -- e.g. "Founding Partner"
  slug            text          not null unique,                -- url-safe identifier, e.g. "founding-partner"
  amount_cents    integer       not null check (amount_cents > 0),
  is_recurring    boolean       not null default true,          -- annual commitment vs one-time
  recurrence      text          not null default 'annual'       -- annual | monthly | one_time
                    check (recurrence in ('annual', 'monthly', 'one_time')),
  entity          text          not null default 'c4'           -- which legal entity offers this tier
                    check (entity in ('pac', 'c4', 'c3')),
  tagline         text,                                         -- short descriptor shown under the name
  benefits        jsonb         not null default '[]'::jsonb,   -- array of strings, rendered as bullets
  is_featured     boolean       not null default false,         -- pin to top / highlight visually
  display_order   integer       not null default 100,           -- lower = earlier on the page
  is_active       boolean       not null default true,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now()
);

comment on table public.sponsorship_tiers is
  'Corporate sponsorship tiers. `entity` enforces legal separation between PAC, c(4), and c(3) programs.';
comment on column public.sponsorship_tiers.entity is
  'Which legal entity offers the tier. Corporate sponsorship is c(4) only due to ORC 3599.03.';

create index if not exists sponsorship_tiers_active_order_idx
  on public.sponsorship_tiers (entity, is_active, display_order);

drop trigger if exists set_sponsorship_tiers_updated_at on public.sponsorship_tiers;
create trigger set_sponsorship_tiers_updated_at
  before update on public.sponsorship_tiers
  for each row execute function public.set_updated_at();


-- =============================================================================
-- TABLE: founding_member_tiers
-- -----------------------------------------------------------------------------
-- One row per named tier in the founding-member ladder. This is the lookup
-- table that replaces the if-then-else amount-based function from
-- migration 1.
--
-- The critical design choice here: tier matching is based on BOTH
-- `amount_cents` AND `recurrence`, because a $100 monthly contribution is
-- the Founding Circle tier, but a $100 one-time contribution is not any
-- named tier. Without the recurrence dimension, we could not tell those
-- apart.
--
-- `match_mode` controls the matching logic:
--   'exact'          - amount_cents must equal this row's amount_cents
--   'at_least'       - amount_cents >= this row's amount_cents
--
-- Example: Founding Patron is "$250+ one-time", so match_mode='at_least'
-- with amount_cents=25000 and recurrence='one_time'.
--
-- The `actblue_refcode_prefix` lets us tag contributions that came in via a
-- tier-specific ActBlue link (e.g. `refcode=founding_stonewall_sustainer`)
-- even if the dollar amount was unusual, overriding amount-based matching.
-- =============================================================================
create table if not exists public.founding_member_tiers (
  id                        uuid          primary key default gen_random_uuid(),
  name                      text          not null,                           -- e.g. "Stonewall Sustainer"
  slug                      text          not null unique,                    -- e.g. "stonewall-sustainer"
  amount_cents              integer       not null check (amount_cents > 0),
  recurrence                text          not null                            -- monthly | one_time
                              check (recurrence in ('monthly', 'one_time')),
  match_mode                text          not null default 'exact'            -- exact | at_least
                              check (match_mode in ('exact', 'at_least')),
  actblue_refcode_prefix    text,                                             -- optional override match
  description               text,                                             -- short display string
  benefits                  jsonb         not null default '[]'::jsonb,       -- array of strings
  display_order             integer       not null default 100,
  is_active                 boolean       not null default true,
  created_at                timestamptz   not null default now(),
  updated_at                timestamptz   not null default now()
);

comment on table public.founding_member_tiers is
  'Named tiers in the 1,969 founding-member campaign. Replaces amount-only logic from migration 1.';
comment on column public.founding_member_tiers.match_mode is
  'exact = dollar amount must equal; at_least = dollar amount >= this threshold. Combined with recurrence to classify a contribution.';

create index if not exists founding_member_tiers_active_order_idx
  on public.founding_member_tiers (is_active, display_order);

drop trigger if exists set_founding_member_tiers_updated_at on public.founding_member_tiers;
create trigger set_founding_member_tiers_updated_at
  before update on public.founding_member_tiers
  for each row execute function public.set_updated_at();


-- =============================================================================
-- TABLE: site_leadership
-- -----------------------------------------------------------------------------
-- The single source of truth for the officer names used in:
--
--   * The standard disclaimer on letterhead, emails, and filings
--     ("Paid for by Ohio Pride PAC. Zachary R. Joseph, Director.
--       David Donofrio, Treasurer.")
--   * The footer "Leadership" column in site-template.js
--   * Any future contact-us or about-us leadership blocks
--
-- Because this is operationally critical (the disclaimer is legally
-- required on PAC communications), rows have `entity` to keep PAC/c(4)/c(3)
-- officers separate once the other entities exist.
--
-- This table is deliberately narrow: the bios and photos still live in
-- board_members. site_leadership is just the title-assignment layer,
-- linking an officer role to a human.
-- =============================================================================
create table if not exists public.site_leadership (
  id                uuid          primary key default gen_random_uuid(),
  entity            text          not null default 'pac'
                      check (entity in ('pac', 'c4', 'c3')),
  title             text          not null,                       -- e.g. "Director", "Treasurer"
  full_name         text          not null,                       -- as it appears in disclaimers
  board_member_id   uuid          references public.board_members(id) on delete set null,
  email             citext,
  is_required_on_disclaimer  boolean not null default false,      -- include in "Paid for by" line?
  display_order     integer       not null default 100,
  is_active         boolean       not null default true,
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now()
);

comment on table public.site_leadership is
  'Officer-role assignments. Feeds the standard disclaimer and the footer leadership block.';
comment on column public.site_leadership.is_required_on_disclaimer is
  'If true, this person is listed on the "Paid for by" disclaimer. Director and Treasurer are required by Ohio PAC rules.';

create index if not exists site_leadership_entity_order_idx
  on public.site_leadership (entity, is_active, display_order);

drop trigger if exists set_site_leadership_updated_at on public.site_leadership;
create trigger set_site_leadership_updated_at
  before update on public.site_leadership
  for each row execute function public.set_updated_at();


-- =============================================================================
-- FUNCTION: founding_member_tier() - REPLACED
-- -----------------------------------------------------------------------------
-- Replaces the amount-only function from migration 1 with a lookup against
-- founding_member_tiers that considers BOTH amount and recurrence.
--
-- Matching order:
--   1. If refcode is provided and starts with a tier's actblue_refcode_prefix,
--      that tier wins.
--   2. Otherwise, find rows matching recurrence AND amount_cents (either
--      match_mode='exact' equal or match_mode='at_least' <=), preferring the
--      highest-threshold at_least match.
--   3. If nothing matches, return 'Supporter' as a generic fallback.
--
-- This function is IMMUTABLE-safe-ish but technically STABLE because it
-- reads from a table. We mark it STABLE so the query planner can optimize
-- repeated calls within the same transaction.
-- =============================================================================
create or replace function public.founding_member_tier(
  cents       integer,
  recurrence  text default 'one_time',
  refcode     text default null
)
returns text
language plpgsql
stable
as $$
declare
  match_name text;
begin
  -- 1. Refcode override, if present and recognized
  if refcode is not null and refcode <> '' then
    select name into match_name
    from public.founding_member_tiers
    where is_active
      and actblue_refcode_prefix is not null
      and actblue_refcode_prefix <> ''
      and refcode like (actblue_refcode_prefix || '%')
    order by display_order asc
    limit 1;

    if match_name is not null then
      return match_name;
    end if;
  end if;

  -- 2. Exact amount + recurrence match wins over at_least matches
  select name into match_name
  from public.founding_member_tiers
  where is_active
    and founding_member_tiers.recurrence = founding_member_tier.recurrence
    and match_mode = 'exact'
    and amount_cents = cents
  order by display_order asc
  limit 1;

  if match_name is not null then
    return match_name;
  end if;

  -- 3. At-least match: highest threshold the amount clears
  select name into match_name
  from public.founding_member_tiers
  where is_active
    and founding_member_tiers.recurrence = founding_member_tier.recurrence
    and match_mode = 'at_least'
    and amount_cents <= cents
  order by amount_cents desc
  limit 1;

  if match_name is not null then
    return match_name;
  end if;

  return 'Supporter';
end;
$$;


-- =============================================================================
-- VIEW: founding_members_public (REPLACED)
-- -----------------------------------------------------------------------------
-- Update the public view to use the new tier function signature. Because the
-- view only stores one row per contribution, we use contributed_at heuristics
-- to guess recurrence: if the same email has multiple contributions with the
-- same amount within the last 90 days, we call it 'monthly', otherwise
-- 'one_time'. This is a heuristic; the ActBlue sync can set a definitive
-- `recurrence` column later if we add one.
--
-- For now we keep it simple and just pass 'one_time' - the sync function
-- will be updated separately to write a `recurrence` column on each row.
-- =============================================================================
-- (View uses the new function automatically via the function signature
--  default, so no redefinition is strictly needed. But if we later add a
--  recurrence column to founding_members, uncomment and update this view.)


-- =============================================================================
-- RLS + GRANTS for the three new tables
-- =============================================================================
alter table public.sponsorship_tiers        enable row level security;
alter table public.founding_member_tiers    enable row level security;
alter table public.site_leadership          enable row level security;

-- Public read of active rows
drop policy if exists "sponsorship_tiers read active" on public.sponsorship_tiers;
create policy "sponsorship_tiers read active"
  on public.sponsorship_tiers
  for select
  to anon, authenticated
  using (is_active = true);

drop policy if exists "founding_member_tiers read active" on public.founding_member_tiers;
create policy "founding_member_tiers read active"
  on public.founding_member_tiers
  for select
  to anon, authenticated
  using (is_active = true);

drop policy if exists "site_leadership read active" on public.site_leadership;
create policy "site_leadership read active"
  on public.site_leadership
  for select
  to anon, authenticated
  using (is_active = true);

-- Service-role writes only
drop policy if exists "sponsorship_tiers service_role writes" on public.sponsorship_tiers;
create policy "sponsorship_tiers service_role writes"
  on public.sponsorship_tiers for all to service_role using (true) with check (true);

drop policy if exists "founding_member_tiers service_role writes" on public.founding_member_tiers;
create policy "founding_member_tiers service_role writes"
  on public.founding_member_tiers for all to service_role using (true) with check (true);

drop policy if exists "site_leadership service_role writes" on public.site_leadership;
create policy "site_leadership service_role writes"
  on public.site_leadership for all to service_role using (true) with check (true);

-- Explicit execute grant on the replaced function
grant execute on function public.founding_member_tier(integer, text, text) to anon, authenticated;


-- =============================================================================
-- SEED: founding_member_tiers
-- -----------------------------------------------------------------------------
-- Copied from the live /founding-members page as of April 2026.
-- =============================================================================
insert into public.founding_member_tiers
  (name, slug, amount_cents, recurrence, match_mode, actblue_refcode_prefix, description, display_order)
values
  ('Stonewall Sustainer', 'stonewall-sustainer', 1969, 'monthly',  'exact',
     'founding_stonewall_', '$19.69 per month, honoring the year of the Stonewall uprising.', 10),
  ('Founding Member',     'founding-member',     2500, 'one_time', 'exact',
     'founding_member_',    '$25 one-time contribution.', 20),
  ('Pride Builder',       'pride-builder',       5000, 'monthly',  'exact',
     'founding_builder_',   '$50 per month.', 30),
  ('Founding Circle',     'founding-circle',    10000, 'monthly',  'exact',
     'founding_circle_',    '$100 per month.', 40),
  ('Founding Patron',     'founding-patron',    25000, 'one_time', 'at_least',
     'founding_patron_',    '$250 or more, one-time.', 50)
on conflict (slug) do nothing;


-- =============================================================================
-- SEED: sponsorship_tiers (for Ohio Pride Action c(4))
-- -----------------------------------------------------------------------------
-- The seven-tier "Founding Partners" corporate membership program, modeled
-- on the Equality Florida Gemstone Council. These amounts mirror the program
-- you designed for the c(4); adjust in place if the final program differs.
--
-- NOTE: The PAC cannot accept corporate sponsorship. These rows are tagged
-- entity='c4' so they only appear on the Ohio Pride Action sponsorship page
-- once that site exists, and never on an ohiopride.org PAC surface.
-- =============================================================================
insert into public.sponsorship_tiers
  (name, slug, amount_cents, is_recurring, recurrence, entity, tagline, display_order, is_featured)
values
  ('Onyx Partner',    'onyx-partner',        250000, true, 'annual', 'c4',
     'Entry-level annual corporate partnership.',          70, false),
  ('Silver Partner',  'silver-partner',      500000, true, 'annual', 'c4',
     'Growing visibility across Ohio Pride programs.',     60, false),
  ('Gold Partner',    'gold-partner',       1000000, true, 'annual', 'c4',
     'Statewide recognition and program participation.',   50, false),
  ('Sapphire Partner','sapphire-partner',   2500000, true, 'annual', 'c4',
     'Premier event presence and policy engagement.',      40, true),
  ('Ruby Partner',    'ruby-partner',       5000000, true, 'annual', 'c4',
     'Anchor partnership with strategic convening.',       30, true),
  ('Emerald Partner', 'emerald-partner',    7500000, true, 'annual', 'c4',
     'Leading-tier partnership with year-round platform.', 20, true),
  ('Diamond Partner', 'diamond-partner',   10000000, true, 'annual', 'c4',
     'Presenting partner, top billing, strategic counsel.',10, true)
on conflict (slug) do nothing;


-- =============================================================================
-- SEED: site_leadership
-- -----------------------------------------------------------------------------
-- The two officers currently required on the Ohio Pride PAC disclaimer.
-- -----------------------------------------------------------------------------
insert into public.site_leadership
  (entity, title, full_name, is_required_on_disclaimer, display_order, board_member_id)
select 'pac', 'Director', 'Zachary R. Joseph', true, 10, bm.id
  from public.board_members bm where bm.name = 'Zachary R. Joseph, MBA'
on conflict do nothing;

insert into public.site_leadership
  (entity, title, full_name, is_required_on_disclaimer, display_order, board_member_id)
select 'pac', 'Treasurer', 'David Donofrio', true, 20, bm.id
  from public.board_members bm where bm.name = 'David Donofrio'
on conflict do nothing;


-- =============================================================================
-- SEED: founding_members (the three currently live on the site)
-- -----------------------------------------------------------------------------
-- Nicole Green, Zachary Smith, Jesse Shepherd are already publicly listed on
-- /founding-members. Seeded here so the public list and the progress count
-- do not go blank when the client swap happens. Amounts are placeholders
-- matching the displayed tier; the ActBlue sync will reconcile the true
-- amount on the next run.
-- =============================================================================
insert into public.founding_members
  (full_name, display_name, amount_cents, contributed_at, is_public, is_vetted,
   actblue_contribution_id, notes)
values
  ('Nicole Green',    'Nicole Green',    1969, '2026-03-01T12:00:00Z', true, true,
     'SEED_NICOLE_GREEN', 'Seeded from live site list; reconcile with ActBlue on next sync.'),
  ('Zachary Smith',   'Zachary Smith',   2500, '2026-03-01T12:00:00Z', true, true,
     'SEED_ZACHARY_SMITH', 'Seeded from live site list; reconcile with ActBlue on next sync.'),
  ('Jesse Shepherd',  'Jesse Shepherd',  2500, '2026-03-01T12:00:00Z', true, true,
     'SEED_JESSE_SHEPHERD', 'Seeded from live site list; reconcile with ActBlue on next sync.')
on conflict (actblue_contribution_id) do nothing;
