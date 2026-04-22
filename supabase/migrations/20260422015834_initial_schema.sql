-- =============================================================================
-- Ohio Pride PAC - Initial Schema Migration
-- -----------------------------------------------------------------------------
-- Creates two tables (board_members, founding_members), a safe public view for
-- the homepage progress bar, and Row Level Security policies that let the
-- anonymous web client read only what's meant to be public while keeping the
-- service_role key (used server-side by Netlify functions and the ActBlue sync
-- job) fully capable of writes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------
-- pgcrypto gives us gen_random_uuid() for primary keys. It's already available
-- on Supabase but the `create extension if not exists` is idempotent and makes
-- the migration portable to a local Postgres instance.
create extension if not exists pgcrypto;

-- citext (case-insensitive text) is used for the founding_members.email column
-- below. Must be declared BEFORE any table that uses the type, otherwise the
-- column definition fails with "type citext does not exist" on fresh branches.
-- The Supabase branching integration caught this on the first run of PR #30.
create extension if not exists citext;


-- =============================================================================
-- TABLE: board_members
-- -----------------------------------------------------------------------------
-- One row per person serving on the Ohio Pride PAC board. This replaces the
-- hardcoded `boardMembers` JavaScript array currently embedded in /board.html.
--
-- The `role` column is a free-text display label ("Director", "Treasurer",
-- "Board Member", etc). The `chip` column is a short machine-readable key that
-- the front-end uses to style the badge on each card (is-director, is-comms,
-- etc) - we keep both because the display label and the style key don't map
-- 1:1 forever (e.g. two people could share the "Board Member" label but we
-- still want styling flexibility).
--
-- `bio` is a jsonb array of paragraph strings. This matches the existing
-- front-end contract (each bio is rendered as multiple <p> tags) and avoids
-- forcing a rich-text editor decision today. Later we can migrate to markdown
-- in a single text column without breaking the API.
-- =============================================================================
create table if not exists public.board_members (
  id             uuid          primary key default gen_random_uuid(),
  name           text          not null,
  role           text          not null default 'Board Member',
  chip           text          not null default '',         -- '', is-director, is-treasurer, is-secretary, is-comms
  img_path       text,                                      -- e.g. /assets/board/zach-joseph.png
  bio            jsonb         not null default '[]'::jsonb, -- array of paragraph strings
  display_order  integer       not null default 100,        -- lower = earlier in the grid
  is_active      boolean       not null default true,       -- soft-delete / off-board flag
  city           text,                                      -- optional, for future filtering
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now()
);

comment on table public.board_members is
  'Ohio Pride PAC board members. Public-readable via RLS; write-restricted to service_role.';
comment on column public.board_members.chip is
  'Short style key used by the front-end to color the title chip on each card.';
comment on column public.board_members.bio is
  'JSON array of paragraph strings. Front-end renders each element as a <p>.';

create index if not exists board_members_active_order_idx
  on public.board_members (is_active, display_order);


-- =============================================================================
-- TABLE: founding_members
-- -----------------------------------------------------------------------------
-- One row per founding-member contribution. This is the source of truth for
-- the 1,969 progress bar on the homepage and /founding-members.
--
-- Two privacy concepts live here, and the distinction matters:
--
--   1. `is_public` controls whether the person consented to being listed by
--      name anywhere on the public site. Default is FALSE - opt-in only.
--   2. `display_name` is a caller-provided name that may differ from the real
--      name on the contribution (first name + last initial, "Anonymous", etc).
--      The public view NEVER exposes `full_name` or `email`.
--
-- We also store the ActBlue identifiers so the sync job is idempotent: the
-- unique constraint on actblue_contribution_id means re-running the sync
-- against the same contribution updates instead of duplicating.
--
-- Tier is derived from `amount_cents`, not stored, so if tier cut-offs ever
-- change we do not have to backfill. See the `founding_member_tier()` helper
-- below.
-- =============================================================================
create table if not exists public.founding_members (
  id                         uuid          primary key default gen_random_uuid(),
  full_name                  text          not null,           -- private, internal only
  email                      citext,                           -- private, internal only (see note)
  display_name               text,                             -- e.g. "Zach J." or "Anonymous" - what the public sees
  amount_cents               integer       not null check (amount_cents > 0),
  actblue_contribution_id    text          unique,             -- idempotency key for sync
  actblue_receipt_id         text,                             -- human-readable receipt number from ActBlue
  contributed_at             timestamptz   not null default now(),
  is_public                  boolean       not null default false, -- consent flag for public listing
  is_vetted                  boolean       not null default false, -- internal vetting flag before public reveal
  notes                      text,                             -- internal notes, never exposed
  created_at                 timestamptz   not null default now(),
  updated_at                 timestamptz   not null default now()
);

comment on table public.founding_members is
  'Founding members contributing to the 1,969-person campaign. Contains PII; public access goes through the founding_members_public view only.';
comment on column public.founding_members.is_public is
  'Consent flag. FALSE by default. Only rows where is_public AND is_vetted are exposed publicly.';
comment on column public.founding_members.actblue_contribution_id is
  'Idempotency key for the ActBlue sync job. Unique so re-running the sync does not create duplicates.';

create index if not exists founding_members_contributed_at_idx
  on public.founding_members (contributed_at desc);

create index if not exists founding_members_public_idx
  on public.founding_members (is_public, is_vetted)
  where is_public and is_vetted;


-- =============================================================================
-- FUNCTION: founding_member_tier(amount_cents)
-- -----------------------------------------------------------------------------
-- Derives the display tier from the contribution amount. Tiers mirror the
-- copy on /founding-members (the $50-to-$2,500+ ladder). Stored as a function
-- so the site, the sync job, and any reporting query all compute the tier the
-- same way.
-- =============================================================================
create or replace function public.founding_member_tier(cents integer)
returns text
language sql
immutable
as $$
  select case
    when cents >= 250000 then 'Founders Circle'        -- $2,500+
    when cents >= 100000 then 'Leadership'             -- $1,000+
    when cents >=  50000 then 'Champion'               -- $500+
    when cents >=  25000 then 'Advocate'               -- $250+
    when cents >=  10000 then 'Ally'                   -- $100+
    when cents >=   5000 then 'Friend'                 -- $50+
    else 'Supporter'
  end
$$;


-- =============================================================================
-- VIEW: founding_members_public
-- -----------------------------------------------------------------------------
-- The safe, PII-free projection that the website reads. Only rows where the
-- member has consented AND has been vetted are included. No email, no
-- full_name, no internal notes.
--
-- Consumer pattern on the client:
--
--   supabase.from('founding_members_public').select('*')
--     .order('contributed_at', { ascending: false })
--
-- For the homepage progress counter, consumers call
-- founding_members_progress() instead (below) - it avoids returning rows at
-- all when we only want the count.
-- =============================================================================
create or replace view public.founding_members_public as
select
  id,
  coalesce(nullif(display_name, ''), 'Anonymous') as display_name,
  public.founding_member_tier(amount_cents)      as tier,
  contributed_at
from public.founding_members
where is_public = true
  and is_vetted = true;


-- =============================================================================
-- FUNCTION: founding_members_progress()
-- -----------------------------------------------------------------------------
-- Returns a single row with the counts the progress bar needs. Called by the
-- web client via supabase.rpc('founding_members_progress'). Returns ALL rows
-- (including non-public ones) because the aggregate count itself is public -
-- the individual identities are what we protect.
--
-- `goal` is hardcoded to 1969 here, honoring the Stonewall year. If that ever
-- changes we update it in one place.
-- =============================================================================
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
  select
    count(*)::integer                                            as member_count,
    1969                                                         as goal,
    coalesce(sum(amount_cents), 0)::bigint                       as total_cents,
    least(
      round((count(*)::numeric / 1969) * 100, 2),
      100
    )                                                            as percent_to_goal
  from public.founding_members
$$;


-- =============================================================================
-- updated_at trigger
-- -----------------------------------------------------------------------------
-- Standard Postgres pattern: bump updated_at on every UPDATE. We apply it to
-- both tables so the values stay honest without relying on every caller to
-- remember.
-- =============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_board_members_updated_at on public.board_members;
create trigger set_board_members_updated_at
  before update on public.board_members
  for each row execute function public.set_updated_at();

drop trigger if exists set_founding_members_updated_at on public.founding_members;
create trigger set_founding_members_updated_at
  before update on public.founding_members
  for each row execute function public.set_updated_at();


-- =============================================================================
-- Row Level Security
-- -----------------------------------------------------------------------------
-- The access model:
--
--   * anon role (the key shipped in the website bundle):
--       - board_members:   SELECT where is_active = true
--       - founding_members: NO direct access (reads go through the view +
--                           RPC instead, which run as the view owner)
--
--   * service_role (used only server-side by Netlify functions, NEVER
--     shipped to the browser):
--       - full CRUD on both tables
--
-- The view founding_members_public and the function founding_members_progress
-- are SECURITY INVOKER by default, which is fine because they run with the
-- caller's privileges - and we explicitly grant SELECT / EXECUTE to anon on
-- them so public traffic can reach the sanitized data.
-- =============================================================================

alter table public.board_members    enable row level security;
alter table public.founding_members enable row level security;

-- board_members: anyone can read active members
drop policy if exists "board_members read active" on public.board_members;
create policy "board_members read active"
  on public.board_members
  for select
  to anon, authenticated
  using (is_active = true);

-- board_members: only service_role writes
drop policy if exists "board_members service_role writes" on public.board_members;
create policy "board_members service_role writes"
  on public.board_members
  for all
  to service_role
  using (true)
  with check (true);

-- founding_members: NO anon SELECT policy is created on purpose.
-- With RLS enabled and no permissive policy for anon, direct reads are denied.
-- The public view sits above this table and is the only public-facing
-- surface.

-- founding_members: only service_role writes / reads
drop policy if exists "founding_members service_role all" on public.founding_members;
create policy "founding_members service_role all"
  on public.founding_members
  for all
  to service_role
  using (true)
  with check (true);

-- Grants for the view and RPC
grant select on public.founding_members_public to anon, authenticated;
grant execute on function public.founding_members_progress() to anon, authenticated;
grant execute on function public.founding_member_tier(integer) to anon, authenticated;


-- =============================================================================
-- SEED: board_members
-- -----------------------------------------------------------------------------
-- Copied directly from the `boardMembers` array in /board.html as of
-- April 2026. Running this migration against a fresh database reproduces the
-- current board exactly. Idempotent - re-running is safe because we match on
-- name.
-- =============================================================================
insert into public.board_members (name, role, chip, img_path, display_order, bio) values
(
  'Zachary R. Joseph, MBA',
  'Director',
  'is-director',
  '/assets/board/zach-joseph.png',
  10,
  '[]'::jsonb
),
(
  'David Donofrio',
  'Treasurer',
  'is-treasurer',
  '/assets/board/david-donofrio.png',
  20,
  jsonb_build_array(
    'David Donofrio is a lifelong central Ohioan with deep roots in political organizing and public service. A former Ohio Legislative Service Commission Fellow, David went on to make history as the first openly gay member elected to the South-Western City School District Board of Education, where he advocated for inclusive policies and equitable resource allocation.',
    'David has held leadership roles with the Stonewall Democrats of Central Ohio and currently serves as Secretary of the Ohio Democratic Party''s Pride Caucus. He is active with Pride in Grove City and the Columbus Gay Men''s Chorus, contributing to LGBTQ+ visibility and community building across the metro area.',
    'He brings years of organizational governance, financial stewardship, and grassroots political experience to his role as Treasurer of Ohio Pride.'
  )
),
(
  'Ross Widenor, PMP',
  'Secretary',
  'is-secretary',
  '/assets/board/ross-widenor.png',
  30,
  jsonb_build_array(
    'Ross Widenor, PMP, serves as Council President of the Munroe Falls City Council, first elected in 2021 and re-elected in 2025 with endorsement from the LGBTQ+ Victory Fund. Originally from southwest Pennsylvania, Ross earned a BS and MS in Chemical Engineering from Case Western Reserve University before building a career in sustainability and strategic planning at Bridgestone Americas. He lives in Munroe Falls with his husband, Anthony, and their terrier, Mileena.',
    'A certified Project Management Professional, Ross founded Widenor Consulting LLC and was named a Summit County "30 for the Future" honoree for his regional impact. He leads the Core Team of the Summit of Sustainability Alliance, a county-wide consortium advancing shared environmental goals. His prior service includes Chair of the Finance and Audit Committee in Munroe Falls, Chair of the city''s Parks and Recreation Board, and a seat on the Board of Akron Metro RTA.',
    'Ross brings a rare combination to Ohio Pride: elected governance experience, disciplined project and financial management, and a proven record of building coalitions across organizations and sectors.'
  )
),
(
  'Ari Childrey',
  'Communications Director',
  'is-comms',
  '/assets/board/ari-childrey.png',
  40,
  jsonb_build_array(
    'Ari Childrey is a community advocate and trailblazing leader in Ohio''s LGBTQ+ movement. She made history as the first openly transgender woman to serve on a city council in Ohio, representing the 4th Ward on the St. Marys City Council. In 2025, Ari received the Equality Ohio Emerging Leader Award in recognition of her organizing and advocacy work.',
    'Ari helped build Northwest Ohio Trans Advocacy as a grassroots network of local advocates supporting transgender Ohioans in rural and underserved communities. She serves as Vice Chair of the Ohio Democratic Party''s Pride Caucus and has been a candidate for the Ohio House of Representatives in District 84 in both 2024 and 2026.',
    'Across western Ohio, Ari organizes Pride events, mentors emerging LGBTQ+ leaders, and advocates for accessible political processes for all candidates. She brings grassroots communications expertise and a statewide network to Ohio Pride.'
  )
),
(
  'Ariel Marry Ann',
  'Board Member',
  '',
  '/assets/board/ariel-marry-ann.png',
  100,
  jsonb_build_array(
    'Ariel Marry Ann is a Black trans woman, theatre artist, and advocate based in Cincinnati. She studied Women''s and Gender Studies at the University of Cincinnati and works in public health, bringing an intersectional lens to both her professional and creative life.',
    'Ariel is the Producing Artistic Director of InBocca Performance and serves as co-Vice President of the League of Cincinnati Theatres. Her creative work centers the visibility and celebration of trans people of color through storytelling, original performance, and community organizing. She has reached audiences across Ohio and beyond with her writing, speaking, and stage productions.',
    'Ariel brings lived experience, creative vision, and arts leadership to the Ohio Pride board, strengthening the organization''s connection to Cincinnati and the broader cultural community.'
  )
),
(
  'Brian Sharp',
  'Board Member',
  '',
  '/assets/board/brian-sharp.png',
  100,
  jsonb_build_array(
    'Brian Sharp is the Director of Business and Market Development at Berkshire Hathaway HomeServices Professional Realty, where he leads growth strategy across the State of Ohio. He studied at Sinclair Community College, Wright State University, and Hondros College, building expertise in real estate, business development, and community investment.',
    'Brian serves on the Montgomery County Land Bank Board of Directors, working to revitalize neighborhoods and strengthen local economies. He was named 2025 Dayton Heart Ball Chair by the American Heart Association and is a member of the LGBTQ+ Real Estate Alliance.',
    'His career spans real estate, civic engagement, and nonprofit leadership in the Miami Valley. Brian brings that broad coalition-building experience and professional network to the Ohio Pride board.'
  )
),
(
  'Chrisondra Goodwine, J.D.',
  'Board Member',
  '',
  '/assets/board/chrisondra-goodwine.png',
  100,
  jsonb_build_array(
    'Chrisondra Goodwine is an attorney, educator, and public administrator with deep roots in West Dayton. She attended Dayton Public Schools at every level and went on to earn a Bachelor of Arts from the University of Akron, a Juris Doctor from the University of Dayton School of Law, an MBA from Capella University, and a Master of Public Administration from Capella.',
    'Chrisondra serves as Township Administrator of Jefferson Township and as President of the Dayton Public Schools Board of Education, where she has been a vocal champion of equity and community investment. She co-founded Dayton Black Pride and made history as one of the first openly LGBTQ+ Black women elected to public office in the Dayton area.',
    'Her decades of experience in education policy, municipal governance, and civil rights advocacy make her a cornerstone of the Ohio Pride board.'
  )
),
(
  'Dalma Grandjean, J.D.',
  'Board Member',
  '',
  '/assets/board/dalma-grandjean.png',
  100,
  jsonb_build_array(
    'Dalma Grandjean is a retired attorney and former Law Director for the City of Riverside. Born in Germany to Hungarian parents, she grew up in the Dayton area and earned her Juris Doctor summa cum laude from the University of Dayton School of Law.',
    'Over her career, Dalma built a distinguished practice in family law, military divorce, and international domestic relations as a shareholder at Altick & Corwin Co., LPA. She also served as a linguist at Wright-Patterson Air Force Base, leveraging her multilingual background in service to the military community. She was named Barrister of the Month by the Dayton Bar Association for her contributions to the profession.',
    'Dalma brings decades of legal expertise, municipal government experience, and a steadfast commitment to justice and equality to the Ohio Pride board.'
  )
),
(
  'Eli Bohnert, MPH',
  'Board Member',
  '',
  '/assets/board/eli-bohnert.png',
  100,
  jsonb_build_array(
    'Eli Bohnert is a public health professional and political strategist based in Columbus. He holds a Master of Public Health from The Ohio State University.',
    'Eli was a candidate for the Ohio House of Representatives in 2024 and previously served as President of the Stonewall Democrats of Central Ohio. He remains active as a Franklin County Democratic Party Central Committee member, Vice Chair of Political Affairs for the Hilliard Democrats, and was elected to two terms on the West Scioto Area Commission.',
    'His combination of public health expertise, campaign experience, and deep ties to progressive organizing in Franklin County strengthens Ohio Pride''s reach in the Columbus metro area.'
  )
),
(
  'Keara Dever, J.D.',
  'Board Member',
  '',
  '/assets/board/keara-dever.png',
  100,
  jsonb_build_array(
    'Keara Dever was born and raised in Buffalo, New York. She earned her undergraduate degree from Duquesne University and her Juris Doctor from the University of Dayton School of Law. While in law school, she found her calling through the immigration clinic, fostering a deep commitment to serving society''s most vulnerable populations.',
    'Keara opened her own practice in 2023, focusing on immigration, criminal defense, and family law. She serves as an Acting Judge in Kettering Municipal Court and co-founded the Dayton Bar Association''s LGBTQ+ affinity group, creating a professional community for queer attorneys in the Miami Valley.',
    'Active in local politics throughout the Dayton region, Keara brings legal expertise, judicial experience, and a passion for equal justice to the Ohio Pride board.'
  )
)
on conflict do nothing;
