-- ============================================================
-- Ohio Pride Admin — Elections module schema
-- Five tables, all namespaced election_* and admin-only via RLS.
-- Deliberately self-contained: never joined to pac_prospects /
-- c4_prospects, so the PAC/c4 firewall stays intact.
--
-- NOTE: public.is_admin() already exists in this project
-- (20260510010000_admin_roles_and_permissions.sql) and is the
-- canonical, search_path-hardened version. We intentionally do NOT
-- redefine it here — re-creating it from the build packet would drop
-- its `set search_path = public` hardening. We simply reuse it.
-- ============================================================

-- ---- Campaigns ----
create table if not exists public.election_campaigns (
  id              text primary key,            -- slug, e.g. 'hardin-primary-27'
  name            text not null,
  candidate       text,
  office          text,
  jurisdiction    text,
  election_date   date,
  election_kind   text,                        -- 'primary' | 'general'
  status          text default 'planning',     -- planning | active | complete
  goal_volunteers int,
  goal_sites      int,
  goal_precincts  int,
  coverage_target int,
  notes           text,
  created_at      timestamptz default now()
);

-- ---- Polling locations (campaign-scoped snapshot) ----
create table if not exists public.election_polling_locations (
  id               bigint generated always as identity primary key,
  campaign_id      text references public.election_campaigns(id) on delete cascade,
  lid              text,                        -- BOE location id
  name             text not null,
  address          text,
  city             text,
  zip              text,
  tier             text,                        -- A | B | C
  precinct_count   int,
  precincts        text[],
  wards            text[],
  quadrant         text,                        -- NE | NW | SE | SW
  lat              double precision,
  lon              double precision,
  addr_confidence  text,                        -- HIGH | CHECK
  target_per_shift int default 1,
  created_at       timestamptz default now(),
  unique (campaign_id, lid)
);

-- ---- Precincts (campaign-scoped) ----
create table if not exists public.election_precincts (
  id             bigint generated always as identity primary key,
  campaign_id    text references public.election_campaigns(id) on delete cascade,
  precinct_id    text not null,
  precinct_name  text,
  lid            text,
  ward           text,
  tier           text,
  unique (campaign_id, precinct_id)
);

-- ---- Volunteers ----
create table if not exists public.election_volunteers (
  id                 bigint generated always as identity primary key,
  campaign_id        text references public.election_campaigns(id) on delete cascade,
  full_name          text not null,
  email              text,
  phone              text,
  preferred_quadrant text,
  shift_pref         text,                      -- am | pm | all | flexible
  can_captain        boolean default false,
  status             text default 'signed_up',  -- signed_up | confirmed | trained | declined
  source             text,                      -- road_tour | web | referral
  notes              text,
  created_at         timestamptz default now()
);
create index if not exists idx_evol_campaign on public.election_volunteers(campaign_id);

-- ---- Assignments (volunteer -> location / shift / role) ----
create table if not exists public.election_assignments (
  id           bigint generated always as identity primary key,
  campaign_id  text references public.election_campaigns(id) on delete cascade,
  location_lid text,
  volunteer_id bigint references public.election_volunteers(id) on delete cascade,
  role         text default 'greeter',          -- lead | greeter | floater
  shift        text default 'am',               -- am | pm | all
  status       text default 'assigned',         -- assigned | confirmed
  created_at   timestamptz default now(),
  unique (campaign_id, location_lid, volunteer_id, shift)
);
create index if not exists idx_easn_campaign on public.election_assignments(campaign_id);
create index if not exists idx_easn_location on public.election_assignments(campaign_id, location_lid);

-- ---- RLS: admins only (same model the shell already enforces) ----
alter table public.election_campaigns         enable row level security;
alter table public.election_polling_locations enable row level security;
alter table public.election_precincts         enable row level security;
alter table public.election_volunteers        enable row level security;
alter table public.election_assignments       enable row level security;

-- Policies (idempotent: drop-if-exists then create).
drop policy if exists "elections admin all" on public.election_campaigns;
create policy "elections admin all" on public.election_campaigns
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "elections admin all" on public.election_polling_locations;
create policy "elections admin all" on public.election_polling_locations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "elections admin all" on public.election_precincts;
create policy "elections admin all" on public.election_precincts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "elections admin all" on public.election_volunteers;
create policy "elections admin all" on public.election_volunteers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "elections admin all" on public.election_assignments;
create policy "elections admin all" on public.election_assignments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
