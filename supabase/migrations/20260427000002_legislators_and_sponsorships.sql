-- =============================================================================
-- 20260427000002_legislators_and_sponsorships.sql
-- Closes the gap that lets /issues and /scorecard read live data from
-- Supabase instead of /js/bill-data.js + /js/scorecard-data.js +
-- /js/voting-records.js.
--
-- Adds:
--   * public.legislators                 -- mirror of HOUSE_MEMBERS / SENATE_MEMBERS
--   * public.legislator_sponsorships     -- mirror of LEGISLATOR_SPONSORSHIPS
--   * public.bill_pipeline_steps         -- mirror of BILLS[].pipelineDates / currentStep
--   * adds a few denormalised fields to public.bills used by /issues
--   * public.scorecard view              -- composite score per legislator
--
-- Compatible with existing migrations 1-5. Idempotent.
-- =============================================================================

-- ---------------------------------------------------------------------
-- 1. Legislators
-- ---------------------------------------------------------------------
create table if not exists public.legislators (
    id              text primary key,                       -- 'h-1', 's-23'
    chamber         text not null check (chamber in ('house','senate')),
    district        integer not null,
    full_name       text not null,
    party           text check (party in ('D','R','I')),
    counties        text[] default '{}',                    -- counties represented (optional)
    headshot_url    text,
    statehouse_url  text,
    contact_email   text,
    contact_phone   text,

    -- Editorial subscores from /js/scorecard-data.js (-5..+5 each)
    floor_subscore       integer not null default 0 check (floor_subscore between -5 and 5),
    committee_subscore   integer not null default 0 check (committee_subscore between -5 and 5),
    sponsorship_subscore integer not null default 0 check (sponsorship_subscore between -5 and 5),
    notes                text,

    is_active   boolean not null default true,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),

    unique (chamber, district)
);

create index if not exists legislators_chamber_district_idx on public.legislators (chamber, district);
create index if not exists legislators_party_idx            on public.legislators (party);

drop trigger if exists set_legislators_updated_at on public.legislators;
create trigger set_legislators_updated_at
    before update on public.legislators
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 2. Sponsorships (mirror of LEGISLATOR_SPONSORSHIPS in scorecard-data.js)
-- ---------------------------------------------------------------------
create table if not exists public.legislator_sponsorships (
    legislator_id text not null references public.legislators(id) on delete cascade,
    bill_slug     text not null references public.bills(slug)     on delete cascade on update cascade,
    role          text not null check (role in ('primary','co')),
    primary key (legislator_id, bill_slug)
);

create index if not exists legislator_sponsorships_bill_slug_idx on public.legislator_sponsorships (bill_slug);

-- ---------------------------------------------------------------------
-- 3. Bill pipeline steps (mirror of BILLS[].pipelineDates + currentStep)
--    Stored as one row per (bill, step) so we can also record the date.
-- ---------------------------------------------------------------------
create table if not exists public.bill_pipeline_steps (
    bill_slug     text not null references public.bills(slug) on delete cascade on update cascade,
    step_index    integer not null check (step_index between 0 and 8),
    step_label    text,
    happened_on   date,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    primary key (bill_slug, step_index)
);

create index if not exists bill_pipeline_steps_bill_idx on public.bill_pipeline_steps (bill_slug);

drop trigger if exists set_bill_pipeline_steps_updated_at on public.bill_pipeline_steps;
create trigger set_bill_pipeline_steps_updated_at
    before update on public.bill_pipeline_steps
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 4. Add issues-page denorm fields to bills if they're not there
--    (status_label, status_color, categories, sponsors_text, last_action,
--     next_date, chamber, current_step, url, legislature_url, text_url)
-- ---------------------------------------------------------------------
alter table public.bills
    add column if not exists nickname        text,
    add column if not exists official_title  text,
    add column if not exists status_label    text,
    add column if not exists status_color    text,
    add column if not exists categories      text[]   default '{}',
    add column if not exists category_labels text[]   default '{}',
    add column if not exists sponsors_text   text,
    add column if not exists last_action     text,
    add column if not exists next_date       text,
    add column if not exists house_vote      text,
    add column if not exists chamber         text     check (chamber in ('house','senate','joint') or chamber is null),
    add column if not exists current_step    integer,
    add column if not exists url             text,
    add column if not exists legislature_url text,
    add column if not exists text_url        text;

-- ---------------------------------------------------------------------
-- 5. Composite scorecard view
--    Mirrors calcScore() in /js/scorecard-data.js:
--        score = clamp(0, 100, round(50 + (vf * 4) + (vc * 4) + (s * 2)))
-- ---------------------------------------------------------------------
create or replace view public.legislator_scorecard as
select
    l.id                                                                  as legislator_id,
    l.full_name,
    l.chamber,
    l.district,
    l.party,
    l.counties,
    l.headshot_url,
    l.floor_subscore,
    l.committee_subscore,
    l.sponsorship_subscore,
    greatest(
        0,
        least(
            100,
            round(50 + (l.floor_subscore * 4) + (l.committee_subscore * 4) + (l.sponsorship_subscore * 2))
        )
    )::integer                                                            as composite_score,
    case
        when greatest(0, least(100, round(50 + (l.floor_subscore * 4) + (l.committee_subscore * 4) + (l.sponsorship_subscore * 2)))) >= 95 then 'A+'
        when greatest(0, least(100, round(50 + (l.floor_subscore * 4) + (l.committee_subscore * 4) + (l.sponsorship_subscore * 2)))) >= 88 then 'A'
        when greatest(0, least(100, round(50 + (l.floor_subscore * 4) + (l.committee_subscore * 4) + (l.sponsorship_subscore * 2)))) >= 78 then 'A-'
        when greatest(0, least(100, round(50 + (l.floor_subscore * 4) + (l.committee_subscore * 4) + (l.sponsorship_subscore * 2)))) >= 60 then 'B'
        when greatest(0, least(100, round(50 + (l.floor_subscore * 4) + (l.committee_subscore * 4) + (l.sponsorship_subscore * 2)))) >= 38 then 'C'
        when greatest(0, least(100, round(50 + (l.floor_subscore * 4) + (l.committee_subscore * 4) + (l.sponsorship_subscore * 2)))) >= 18 then 'D'
        else 'F'
    end                                                                   as grade,
    l.notes
from public.legislators l
where l.is_active;

-- ---------------------------------------------------------------------
-- 6. RLS: anon SELECT, service_role full
-- ---------------------------------------------------------------------
alter table public.legislators              enable row level security;
alter table public.legislator_sponsorships  enable row level security;
alter table public.bill_pipeline_steps      enable row level security;

drop policy if exists "legislators read all" on public.legislators;
create policy "legislators read all" on public.legislators for select using (true);

drop policy if exists "legislator_sponsorships read all" on public.legislator_sponsorships;
create policy "legislator_sponsorships read all" on public.legislator_sponsorships for select using (true);

drop policy if exists "bill_pipeline_steps read all" on public.bill_pipeline_steps;
create policy "bill_pipeline_steps read all" on public.bill_pipeline_steps for select using (true);

-- service_role gets implicit full access via Supabase, no extra policy needed.
