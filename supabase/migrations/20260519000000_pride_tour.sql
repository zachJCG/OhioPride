-- =====================================================================
-- 20260519000000_pride_tour.sql
-- Ohio Pride Road Tour 2026: /pride landing page + /pride/signup form.
--
-- Three tables + one public view:
--   - public.pride_events        catalog of every 2026 Pride stop (public read)
--   - public.pride_volunteers    road-tour volunteer signups (PII, no public read)
--   - public.pride_tour_status   single-row "where are we now" indicator
--   - public.pride_events_public view (clean, ordered, is_public only)
--
-- Architecture (matches the rest of the site, per CLAUDE.md):
--   Reads  -> /.netlify/functions/pride-events       (service-role key)
--   Writes -> /.netlify/functions/pride-volunteer-submit (service-role key)
--   Admin read-back -> /admin/* via is_admin() (defined by the
--   20260510010000_admin_roles_and_permissions migration).
--
-- RLS keeps anon INSERT on pride_volunteers as defense-in-depth even
-- though the Netlify function uses the service-role key, mirroring the
-- pattern established in 20260510000000_volunteers.sql.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Shared updated_at touch helper (reuses public.set_updated_at if present)
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- =====================================================================
-- 1. pride_events
-- =====================================================================
create table if not exists public.pride_events (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- identity
  slug text not null unique,
  name text not null,

  -- location
  city   text not null,
  region text not null check (region in ('NE','NW','SE','SW','Central')),
  venue   text,
  address text,
  lat numeric(9,6) not null,
  lng numeric(9,6) not null,

  -- timing (store all times in UTC; render in America/New_York client-side)
  event_date     date not null,
  start_time_utc timestamptz,
  end_time_utc   timestamptz,

  -- classification
  event_type text not null check (event_type in (
    'parade','march','festival','parade_and_festival',
    'rally','mixer','kickoff','fundraiser','5k','interfaith','community','other'
  )),

  -- organizing org
  organizer     text,
  organizer_url text,

  -- description and copy
  description text,
  notes       text,

  -- PAC strategy
  pac_priority  boolean not null default false,
  pac_attending boolean not null default false,
  pac_role text check (pac_role in ('marching','tabling','both','scouting','none'))
    default 'none',

  -- registration
  registration_deadline date,
  registration_url      text,
  registration_status text check (
    registration_status in ('open','closed','late_add','passed','tbd')
  ) default 'tbd',

  -- audience
  attendance_estimate integer,

  -- display
  is_public     boolean not null default true,
  display_order integer not null default 0
);

comment on table public.pride_events is
  'Catalog of 2026 Ohio Pride road-tour events. Public read of is_public rows via pride_events_public; admin write via is_admin().';

create index if not exists pride_events_event_date_idx    on public.pride_events (event_date);
create index if not exists pride_events_region_idx        on public.pride_events (region);
create index if not exists pride_events_pac_attending_idx on public.pride_events (pac_attending);

drop trigger if exists trg_pride_events_updated_at on public.pride_events;
create trigger trg_pride_events_updated_at
  before update on public.pride_events
  for each row execute function public.set_updated_at();

alter table public.pride_events enable row level security;

drop policy if exists "pride_events_public_read"        on public.pride_events;
drop policy if exists "pride_events_admin_all"          on public.pride_events;

-- Public can read only public rows.
create policy "pride_events_public_read"
  on public.pride_events for select
  to anon, authenticated
  using (is_public = true);

-- Admins (legacy admin_emails or active admin_users) can do everything.
create policy "pride_events_admin_all"
  on public.pride_events for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Public, clean, ordered shape for the client.
create or replace view public.pride_events_public as
select
  id, slug, name, city, region, venue, address, lat, lng,
  event_date, start_time_utc, end_time_utc, event_type,
  organizer, organizer_url, description, notes,
  pac_priority, pac_attending, pac_role,
  registration_deadline, registration_url, registration_status,
  attendance_estimate, display_order
from public.pride_events
where is_public = true
order by event_date asc, display_order asc;

grant select on public.pride_events_public to anon, authenticated;

-- =====================================================================
-- 2. pride_volunteers
-- =====================================================================
create table if not exists public.pride_volunteers (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- contact
  first_name text not null,
  last_name  text not null,
  email      text not null,
  phone      text,

  -- geography
  city text,
  zip  text,
  preferred_region text check (
    preferred_region in ('NE','NW','SE','SW','Central','Anywhere')
  ),

  -- engagement
  events_interested text[] not null default '{}',  -- pride_events.slug values
  roles_interested  text[] not null default '{}',
  can_travel       boolean not null default false,
  has_vehicle      boolean not null default false,
  vehicle_capacity integer,

  -- logistics
  tshirt_size text check (
    tshirt_size in ('XS','S','M','L','XL','2XL','3XL','4XL')
  ),
  accessibility_needs     text,
  emergency_contact_name  text,
  emergency_contact_phone text,

  -- meta
  how_heard text,
  notes     text,
  consent_communications boolean not null default false,
  source text not null default 'website_pride_signup',

  -- ops
  is_verified boolean not null default false,
  is_vetted   boolean not null default false
);

comment on table public.pride_volunteers is
  'Road-tour volunteer signups from /pride/signup. Anon role can INSERT (consent required) but cannot SELECT. Read access is admin-only via is_admin().';

create unique index if not exists pride_volunteers_email_idx
  on public.pride_volunteers (lower(email));
create index if not exists pride_volunteers_region_idx
  on public.pride_volunteers (preferred_region);
create index if not exists pride_volunteers_created_at_idx
  on public.pride_volunteers (created_at desc);

alter table public.pride_volunteers enable row level security;

drop policy if exists "pride_volunteers_anon_insert"           on public.pride_volunteers;
drop policy if exists "pride_volunteers_admin_select"          on public.pride_volunteers;
drop policy if exists "pride_volunteers_admin_update"          on public.pride_volunteers;

-- The Netlify function uses the service-role key (bypasses RLS), but we
-- still allow direct anon inserts so the table stays usable from any
-- future client without re-policying. Consent + basic shape enforced.
create policy "pride_volunteers_anon_insert"
  on public.pride_volunteers for insert
  to anon, authenticated
  with check (
    consent_communications = true
    and length(first_name) between 1 and 100
    and length(last_name)  between 1 and 100
    and email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  );

create policy "pride_volunteers_admin_select"
  on public.pride_volunteers for select
  to authenticated
  using (public.is_admin());

create policy "pride_volunteers_admin_update"
  on public.pride_volunteers for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Column-level INSERT grants for anon. Excludes ops columns
-- (is_verified / is_vetted) which default false and are admin-only.
grant insert (
  first_name, last_name, email, phone,
  city, zip, preferred_region,
  events_interested, roles_interested,
  can_travel, has_vehicle, vehicle_capacity,
  tshirt_size, accessibility_needs,
  emergency_contact_name, emergency_contact_phone,
  how_heard, notes, consent_communications, source
) on public.pride_volunteers to anon, authenticated;

-- =====================================================================
-- 3. pride_tour_status (single row)
-- =====================================================================
create table if not exists public.pride_tour_status (
  id integer primary key default 1,
  current_event_id uuid references public.pride_events(id) on delete set null,
  next_event_id    uuid references public.pride_events(id) on delete set null,
  status_message   text,
  updated_at timestamptz not null default now(),
  constraint pride_tour_status_singleton check (id = 1)
);

insert into public.pride_tour_status (id, status_message)
values (1, 'Launch week. First road stop coming up.')
on conflict (id) do nothing;

alter table public.pride_tour_status enable row level security;

drop policy if exists "pride_tour_status_public_read"   on public.pride_tour_status;
drop policy if exists "pride_tour_status_admin_write"   on public.pride_tour_status;

create policy "pride_tour_status_public_read"
  on public.pride_tour_status for select
  to anon, authenticated
  using (true);

create policy "pride_tour_status_admin_write"
  on public.pride_tour_status for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- =====================================================================
-- 4. Seed pride_events
-- ---------------------------------------------------------------------
-- Sourced from the May 19, 2026 "Ohio Pride Month 2026 Road Tour"
-- research report. Slug pattern: {city}-{event-type}-{yyyy-mm-dd}.
-- lat/lng are city-center approximations where a precise venue
-- coordinate was not given (acceptable for a campaign visual; the
-- linear projection in projection.js does not need survey accuracy).
-- pac_priority / pac_attending follow the report's PAC-priority flags
-- and the staged deployment recommendations.
-- =====================================================================
insert into public.pride_events (
  slug, name, city, region, venue, address,
  lat, lng, event_date, event_type,
  organizer, organizer_url, registration_deadline, registration_url,
  registration_status, attendance_estimate,
  pac_priority, pac_attending, pac_role, display_order, description
) values

-- ---- LAUNCH (tour stop #1) ----
('columbus-rally-2026-05-22',
 'Ohio Pride PAC Launch','Columbus','Central','Ohio Statehouse North Plaza','1 Capitol Square, Columbus, OH 43215',
 39.961200,-82.998800,'2026-05-22','rally',
 'Ohio Pride PAC','https://ohiopride.org',null,null,
 'open',null,true,true,'both',1,
 'Public launch of Ohio Pride PAC on Harvey Milk Day. The first stop of the 2026 road tour. Sign up here for every event on the calendar.'),

-- ---- Late May bookend ----
('tiffin-kickoff-2026-05-31',
 'Seneca Proud Pride Month Kickoff','Tiffin','NW','Hedges-Boyer Park','491 Coe St, Tiffin, OH 44883',
 41.114500,-83.178200,'2026-05-31','kickoff',
 'Seneca Proud',null,null,null,
 'open',null,true,true,'tabling',5,
 'Pride Month kickoff in Rep. Gary Click''s district. High political value despite modest size.'),
('youngstown-community-2026-05-30',
 'Youngstown Community Pride','Youngstown','NE','Wick Park','Elm Street, Youngstown, OH 44505',
 41.109800,-80.649500,'2026-05-30','community',
 'Youngstown Community Pride',null,null,null,
 'open',null,false,true,'scouting',6,
 'Distinct from the larger Pride Youngstown June 27 festival. Mahoning Valley walk-up presence opportunity.'),

-- ---- WEEK 1: June 6 (Major Day #1) ----
('cleveland-march-2026-06-06',
 'Pride in the CLE','Cleveland','NE','Public Square to Mall B & C','Public Square, Cleveland, OH 44114',
 41.499500,-81.695400,'2026-06-06','parade_and_festival',
 'LGBT Community Center of Greater Cleveland','https://lgbtcleveland.org/pride',
 null,'https://lgbtcleveland.org/pride',
 'late_add',42000,true,true,'both',10,
 'Cleveland''s annual Pride march and festival. 2026 rebranded as a march to return to protest roots. March staging 10am, step-off 11am from Public Square; festival 11am to 6pm on Mall B & C.'),
('dayton-parade_and_festival-2026-06-06',
 'Dayton Pride','Dayton','SW','Downtown Dayton','Jefferson and 2nd Street, Dayton, OH 45402',
 39.758900,-84.191600,'2026-06-06','parade_and_festival',
 'Greater Dayton LGBT Center','https://pride.daytonlgbtcenter.org',
 '2026-05-16','https://pride.daytonlgbtcenter.org',
 'passed',null,true,true,'marching',11,
 'Two-day Dayton Pride. Parade 11am at Jefferson and 2nd Street, festival follows on St. Clair St. Parade registration deadline passed; late-add asks only.'),
('athens-parade_and_festival-2026-06-06',
 'Athens Pride','Athens','SE','W. Union St. / Alden Library','W. Union St., Athens, OH 45701',
 39.329200,-82.101300,'2026-06-06','parade_and_festival',
 'Southeastern Ohio Rainbow Alliance','https://www.seorainbow.org/athens-pride-fest.html',
 null,'https://www.seorainbow.org/athens-pride-fest.html',
 'open',null,true,true,'both',12,
 'Athens street fair 10am to 3pm on W. Union St. and parade from Alden Library, step-off 11am. HD-94. Open registration.'),
('delaware-festival-2026-06-06',
 'Delaware Ohio Pride','Delaware','Central','Boardman Arts Park','Delaware, OH 43015',
 40.298700,-83.068000,'2026-06-06','festival',
 'Delaware Ohio Pride','https://delawareohiopride.org',null,null,
 'open',null,false,true,'tabling',13,
 'Delaware County Pride, 10am to 5pm at Boardman Arts Park.'),
('westerville-festival-2026-06-06',
 'Westerville Pride Festival','Westerville','Central','21 S. State Street','21 S. State Street, Westerville, OH 43081',
 40.126200,-82.929100,'2026-06-06','festival',
 'Westerville Pride',null,null,null,
 'open',null,true,true,'tabling',14,
 'Inner-ring suburban swing area, 5pm to 8pm. PAC priority.'),
('hamilton-festival-2026-06-06',
 'Hamilton Pride','Hamilton','SW','Marcum Park','Marcum Park, Hamilton, OH 45011',
 39.399500,-84.561300,'2026-06-06','festival',
 'Hamilton Pride',null,null,null,
 'open',null,false,false,'none',15,
 'Butler County Pride at Marcum Park, 11am.'),
('portsmouth-festival-2026-06-06',
 'Portsmouth Pride','Portsmouth','SE','Tracy Park','Tracy Park, Portsmouth, OH 45662',
 38.731700,-82.997700,'2026-06-06','festival',
 'Portsmouth Pride',null,null,null,
 'open',null,false,true,'scouting',16,
 'Scioto County Pride, 2:30pm to 6pm. High symbolic value.'),
('wooster-festival-2026-06-06',
 'Wooster Pride','Wooster','NE','Christmas Run Park','Finn Pavilion, Wooster, OH 44691',
 40.805100,-81.935100,'2026-06-06','festival',
 'Wooster Pride',null,null,null,
 'open',null,false,false,'none',17,
 'Wayne County Pride at the Finn Pavilion, 3pm to 5pm.'),
('hillsboro-festival-2026-06-06',
 'Hillsboro Pride','Hillsboro','SW','Liberty Park','Liberty Park, Hillsboro, OH 45133',
 39.202000,-83.611000,'2026-06-06','festival',
 'Hillsboro Pride',null,null,null,
 'open',null,false,true,'scouting',18,
 'Highland County Pride, 3pm to 8pm. Strategic rural image-building stop.'),
('bryan-festival-2026-06-06',
 'Williams County Pride','Bryan','NW','Williams County Courthouse','Bryan, OH 43506',
 41.473600,-84.552200,'2026-06-06','festival',
 'Williams County Pride',null,null,null,
 'open',null,false,false,'none',19,
 'Williams County Pride at the courthouse, 10am to 6pm.'),
('vermilion-festival-2026-06-06',
 'Vermilion Pride (Inaugural)','Vermilion','NE','Grace United Methodist Church','Vermilion, OH 44089',
 41.420900,-82.364100,'2026-06-06','festival',
 'Grace United Methodist Church',null,null,null,
 'open',null,false,true,'scouting',20,
 'First-ever Vermilion Pride, 10am to 5pm. Strategic low-saturation organizing opportunity.'),
('circleville-festival-2026-06-06',
 'Pride A-Roundtown','Circleville','Central','Mound Street','Mound Street, Circleville, OH 43113',
 39.600900,-82.946000,'2026-06-06','festival',
 'Pride A-Roundtown',null,null,null,
 'open',null,false,false,'none',21,
 'Pickaway County Pride, 11am to 6pm.'),

-- ---- Sunday June 7 ----
('columbus-fundraiser-2026-06-07',
 'Stonewall Columbus Pride Brunch','Columbus','Central','Greater Columbus Convention Center','400 N. High St, Columbus, OH 43215',
 39.969700,-83.000400,'2026-06-07','fundraiser',
 'Stonewall Columbus','https://stonewallcolumbus.org/pride',null,null,
 'open',null,true,true,'scouting',25,
 'Ticketed fundraiser brunch, 11am to 1pm. Strategic for PAC leadership attendance.'),
('worthington-festival-2026-06-07',
 'Worthington Pride','Worthington','Central','Worthington Historic District','Worthington, OH 43085',
 40.093100,-83.018000,'2026-06-07','festival',
 'Worthington Pride',null,null,null,
 'open',null,false,false,'none',26,
 'Worthington Historic District, 1pm to 5pm.'),
('beavercreek-festival-2026-06-07',
 'Beavercreek Pride','Beavercreek','SW','Rotary Beaver Creek','Beavercreek, OH 45434',
 39.709200,-84.063300,'2026-06-07','festival',
 'Beavercreek Pride',null,null,null,
 'open',null,false,false,'none',27,
 'Greene County Pride, 3pm to 8pm.'),

-- ---- WEEK 2: June 12-13 (Major Day #2) ----
('kent-parade-2026-06-12',
 'Kent Pride Parade and Rally','Kent','NE','Kent Hotel to Franklin St. Gazebo','Kent, OH 44240',
 41.153700,-81.357900,'2026-06-12','parade',
 'Kent PrideFest','https://kentpridefest.com',null,'https://kentpridefest.com',
 'open',null,true,true,'marching',30,
 'Friday-evening parade and rally, 6:30pm to 8:30pm, Kent Hotel to Franklin St. Gazebo. Kent State area, HD-72.'),
('canton-parade_and_festival-2026-06-13',
 'Stark Pride Festival','Canton','NE','Centennial Plaza','330 Market Ave N, Canton, OH 44702',
 40.798900,-81.378400,'2026-06-13','parade_and_festival',
 'Stark Pride Festival Committee','https://starkpride.org',null,'https://starkpride.org',
 'open',6000,true,true,'both',31,
 'Stark County''s annual Pride walk and festival. Walk ~1pm (arrive 12:30pm), festival 2pm at Centennial Plaza. Major 2026 battleground geography.'),
('kent-community-2026-06-13',
 'Queer and Here Market','Kent','NE','E. Erie St.','E. Erie St., Kent, OH 44240',
 41.153700,-81.357900,'2026-06-13','community',
 'Kent PrideFest','https://kentpridefest.com',null,null,
 'open',null,false,true,'tabling',32,
 'Day 2 of Kent Pride weekend, 11am to 5pm on E. Erie St.'),
('marysville-festival-2026-06-13',
 'Marysville Pride Fest','Marysville','Central','Partners Park','Marysville, OH 43040',
 40.236200,-83.367200,'2026-06-13','festival',
 'Marysville Pride',null,null,null,
 'open',null,false,true,'scouting',33,
 'Union County Pride, 3pm to 9pm. HD-83.'),
('hilliard-festival-2026-06-13',
 'Hilliard Pride','Hilliard','Central','Hilliard''s Station Park','Hilliard, OH 43026',
 40.033400,-83.158200,'2026-06-13','festival',
 'Hilliard Pride',null,null,null,
 'open',null,false,true,'tabling',34,
 'Hilliard''s Station Park, noon to 3pm.'),
('gahanna-festival-2026-06-13',
 'Gahanna Pride','Gahanna','Central','Headley Park','Gahanna, OH 43230',
 40.019200,-82.879400,'2026-06-13','festival',
 'Gahanna Pride',null,null,null,
 'open',null,false,true,'tabling',35,
 'Headley Park, noon to 5pm.'),
('lisbon-festival-2026-06-13',
 'Columbiana County Pride Festival','Lisbon','NE','Eleanor Acres','Lisbon, OH 44432',
 40.771700,-80.763400,'2026-06-13','festival',
 'Columbiana County Pride',null,null,null,
 'open',null,false,true,'scouting',36,
 'Columbiana County Pride, 9am to 6pm at Eleanor Acres.'),
('west-union-festival-2026-06-13',
 'Adams County Pride (Inaugural)','West Union','SW','Adams Lake State Park','West Union, OH 45693',
 38.795000,-83.543000,'2026-06-13','festival',
 'Adams County Pride',null,null,null,
 'open',null,false,true,'scouting',37,
 'First-ever Adams County Pride, 2pm to 8pm at Adams Lake State Park. HD-90 region; strategic image-building stop.'),
('jackson-festival-2026-06-13',
 'Jackson Pride in the Park','Jackson','SE','Manpower Park','Jackson, OH 45640',
 39.061700,-82.635700,'2026-06-13','festival',
 'Jackson Pride',null,null,null,
 'open',null,false,false,'none',38,
 'Jackson County Pride, 1pm to 4pm at Manpower Park.'),
('coshocton-festival-2026-06-13',
 'Coshocton Pride Festival','Coshocton','SE','Courthouse Square','Coshocton, OH 43812',
 40.272200,-81.859600,'2026-06-13','festival',
 'Coshocton Pride',null,null,null,
 'open',null,false,false,'none',39,
 'Coshocton County Pride, 3pm to 8pm at Courthouse Square.'),
('reynoldsburg-festival-2026-06-13',
 'Reynoldsburg Pride Celebration','Reynoldsburg','Central','Huber Park','Reynoldsburg, OH 43068',
 39.954800,-82.812100,'2026-06-13','festival',
 'Reynoldsburg Pride',null,null,null,
 'open',null,false,false,'none',40,
 'Huber Park, 4pm to 8pm.'),

-- ---- WEEK 3: June 19-20 (Major Days #3 & #4) ----
('columbus-parade_and_festival-2026-06-20',
 'Stonewall Columbus Pride March','Columbus','Central','Broad and High to Goodale Park','120 W. Goodale St, Columbus, OH 43215',
 39.974500,-83.003000,'2026-06-20','parade_and_festival',
 'Stonewall Columbus','https://stonewallcolumbus.org/pride',
 '2026-06-01','https://www.eventeny.com/events/applications/application/?id=7662',
 'open',700000,true,true,'both',50,
 'Ohio''s largest Pride event. Theme: Until We''re All Free. Festival Fri June 19 4pm to 10pm and Sat June 20 11am to 8pm at Goodale Park; march step-off 10:30am at Broad & High. JORDY headlines the Freedom Main Stage. Register the PAC march group by June 1, 5pm EDT.'),
('warren-festival-2026-06-20',
 'Full Spectrum Pride in the Valley','Warren','NE','Courthouse Square','161 High St. NW, Warren, OH 44481',
 41.237600,-80.818400,'2026-06-20','festival',
 'Full Spectrum',null,null,null,
 'open',null,true,true,'tabling',51,
 'Trumbull County, swing region. Noon to 10pm at Courthouse Square. High PAC value.'),
('cleveland-community-2026-06-20',
 'Mx. Juneteenth','Cleveland','NE','North Coast Yard','515 Erieside Ave, Cleveland, OH 44114',
 41.510000,-81.697000,'2026-06-20','community',
 'Mx. Juneteenth Coalition',null,null,null,
 'open',null,false,true,'tabling',52,
 'Black/queer Juneteenth coalition event, 11am to 5pm. Closest 2026 Ohio trans-focused Pride.'),
('chardon-festival-2026-06-20',
 'Geauga Pride','Chardon','NE','Chardon Square','Chardon, OH 44024',
 41.580600,-81.200900,'2026-06-20','festival',
 'Geauga Pride',null,null,null,
 'open',null,false,false,'none',53,
 'Geauga County Pride, 2pm at Chardon Square.'),
('kettering-festival-2026-06-20',
 'Kettering Pride','Kettering','SW','Delco Park','1700 Delco Park Dr, Kettering, OH 45420',
 39.689500,-84.168800,'2026-06-20','festival',
 'Kettering Pride',null,null,null,
 'open',null,false,false,'none',54,
 'Montgomery County Pride, noon to 3pm at Delco Park.'),

-- ---- WEEK 4: June 27 (Major Day #5) ----
('cincinnati-parade_and_festival-2026-06-27',
 'Cincinnati Pride Parade and Festival','Cincinnati','SW','7th and Plum to Sawyer Point','705 E. Pete Rose Way, Cincinnati, OH 45202',
 39.099800,-84.512600,'2026-06-27','parade_and_festival',
 'Cincinnati Pride, Inc.','https://cincinnatipride.org',
 '2026-05-15','https://cincinnatipride.org/festival',
 'late_add',280000,true,true,'tabling',60,
 'Southwest Ohio''s flagship Pride. Parade 11am from 7th & Plum to Sawyer Point; festival noon to 8pm. Parade window closed (late asks only); festival vendor open until May 31.'),
('mansfield-parade_and_festival-2026-06-27',
 'Mansfield Pride Festival and Parade','Mansfield','NE','South Park','100 Brinkerhoff Ave, Mansfield, OH 44903',
 40.758400,-82.515400,'2026-06-27','parade_and_festival',
 'Mansfield Gay Pride Association','https://mansfieldgayprideassociation.org',
 null,'https://mansfieldgayprideassociation.org/vendors-sponsors',
 'open',null,true,true,'both',61,
 'Theme: Pride Rising. HD-76 priority. Parade 11am on Park Ave. West, festival noon to 4pm at South Park.'),
('youngstown-parade_and_festival-2026-06-27',
 'Pride Youngstown','Youngstown','NE','Downtown Youngstown','Phelps St & Federal St, Youngstown, OH 44503',
 41.099800,-80.649500,'2026-06-27','parade_and_festival',
 'Pride Youngstown','https://www.prideyoungstown.com',
 null,'https://www.prideyoungstown.com',
 'tbd',null,true,true,'both',62,
 'Mahoning Valley flagship, noon to 9pm in Downtown Youngstown. Phelps Street block + Federal Street parade route. Confirm registration directly.'),
('cleveland-heights-festival-2026-06-27',
 'Pride in the Park (Cain Park)','Cleveland Heights','NE','Cain Park','14591 Superior Rd, Cleveland Heights, OH 44118',
 41.520100,-81.556200,'2026-06-27','festival',
 'City of Cleveland Heights',null,null,null,
 'open',null,true,true,'tabling',63,
 'Inner-ring suburb, all day at Cain Park. PAC priority.'),
('oberlin-festival-2026-06-27',
 'Lorain County Pride','Oberlin','NE','Oberlin College Science Center','Oberlin, OH 44074',
 41.293900,-82.217100,'2026-06-27','festival',
 'Lorain County Pride',null,null,null,
 'open',null,false,true,'tabling',64,
 'Lorain County Pride, noon to 4pm at the Oberlin College Science Center.'),
('sandusky-festival-2026-06-27',
 'Shoreline Sandusky Pride','Sandusky','NW','Sandusky Shoreline Park','Sandusky, OH 44870',
 41.448900,-82.708000,'2026-06-27','festival',
 'Shoreline Sandusky Pride',null,null,null,
 'open',null,false,true,'tabling',65,
 'Erie County Pride, 11am to 10pm at Sandusky Shoreline Park.'),
('bowling-green-festival-2026-06-27',
 'Bowling Green Pride','Bowling Green','NW','Downtown Bowling Green','100 S Church St, Bowling Green, OH 43402',
 41.374800,-83.651300,'2026-06-27','festival',
 'Bowling Green Pride',null,null,null,
 'open',null,false,true,'scouting',66,
 'BGSU / Wood County Pride, noon to 4pm.'),
('chillicothe-festival-2026-06-27',
 'PRIDE in the Streets','Chillicothe','SE','W. 2nd St.','W. 2nd St., Chillicothe, OH 45601',
 39.333100,-82.982400,'2026-06-27','festival',
 'Chillicothe Pride',null,null,null,
 'open',null,false,false,'none',67,
 'Ross County Pride, 10am to 3pm on W. 2nd St.'),
('springfield-festival-2026-06-27',
 'Springfield Pride Festival','Springfield','SW','Downtown Springfield','Downtown Springfield, OH 45502',
 39.924200,-83.808800,'2026-06-27','festival',
 'Springfield Pride',null,null,null,
 'open',null,true,true,'tabling',68,
 'Clark County, HD-79 contested seat. Noon to 4pm in Downtown Springfield. Dedicated PAC booth justified by the race.'),
('zanesville-festival-2026-06-27',
 'Zanesville Pride','Zanesville','SE','Zane Landing Park','Zanesville, OH 43701',
 39.940300,-82.013200,'2026-06-27','festival',
 'Zanesville Pride',null,null,null,
 'open',null,false,false,'none',69,
 'Muskingum County Pride, noon to 8pm at Zane Landing Park.'),
('sunbury-festival-2026-06-27',
 'Sunbury Pride','Sunbury','Central','Sunbury Town Hall','Sunbury, OH 43074',
 40.242800,-82.855200,'2026-06-27','festival',
 'Sunbury Pride',null,null,null,
 'open',null,false,false,'none',70,
 'Delaware County Pride, 11am to 2pm at Sunbury Town Hall.'),
('granville-festival-2026-06-27',
 'Granville Pride','Granville','Central','Denison University','Granville, OH 43023',
 40.068100,-82.519300,'2026-06-27','festival',
 'Granville Pride',null,null,null,
 'open',null,false,false,'none',71,
 'Licking County Pride, 1pm to 4pm at Denison University.'),

-- ---- July bookend ----
('lebanon-festival-2026-07-25',
 'Lebanon Pride','Lebanon','SW','Bicentennial Park','Lebanon, OH 45036',
 39.435300,-84.203000,'2026-07-25','festival',
 'Lebanon Pride',null,null,null,
 'open',null,false,false,'none',80,
 'Warren County Pride, 11am to 9pm at Bicentennial Park.'),
('fremont-festival-2026-07-25',
 'Fremont Pride','Fremont','NW','Birchard Park','Fremont, OH 43420',
 41.350300,-83.121900,'2026-07-25','festival',
 'Fremont Pride',null,null,null,
 'open',null,false,false,'none',81,
 'Sandusky County Pride, noon to 6pm at Birchard Park.'),

-- ---- August / Sept / October bookends ----
('toledo-parade_and_festival-2026-08-15',
 'Toledo Pride Parade and Festival','Toledo','NW','Promenade Park','400 Water St, Toledo, OH 43604',
 41.652800,-83.537900,'2026-08-15','parade_and_festival',
 'Toledo Pride','https://www.toledopride.com',null,'https://www.toledopride.com',
 'open',null,true,true,'both',90,
 'Northwest Ohio''s flagship Pride. Aug 14 to 16 festival weekend; Sat Aug 15 parade and main festival at Promenade Park.'),
('painesville-festival-2026-08-15',
 'Lake County Pride Festival','Painesville','NE','Lake County History Center','Painesville, OH 44077',
 41.724200,-81.245700,'2026-08-15','festival',
 'Lake County Pride',null,null,null,
 'open',null,false,true,'tabling',91,
 'Lake County Pride, 11am to 5pm at the Lake County History Center.'),
('rocky-river-festival-2026-08-08',
 'Rocky River Pride Fest','Rocky River','NE','Rocky River Public Library','Rocky River, OH 44116',
 41.476700,-81.840100,'2026-08-08','festival',
 'Rocky River Pride',null,null,null,
 'open',null,false,false,'none',92,
 'Cuyahoga County Pride, 1pm to 4pm at the Rocky River Public Library.'),
('akron-parade_and_festival-2026-08-22',
 'Akron Pride Festival and Equity March','Akron','NE','Downtown Akron / Spaghetti Warehouse start','Downtown Akron, OH 44308',
 41.081400,-81.519000,'2026-08-22','parade_and_festival',
 'Akron Pride Festival','https://akronpridefestival.org',null,'https://akronpridefestival.org',
 'open',null,true,true,'both',93,
 '10th anniversary in 2026. Equity March step-off 10am at Spaghetti Warehouse; festival 10am to 10pm downtown. Equity March requires mandatory Group Leader training.'),
('greenville-festival-2026-09-12',
 'Darke County Pride','Greenville','SW','Shawnee Prairie','Greenville, OH 45331',
 40.102000,-84.633000,'2026-09-12','festival',
 'Darke County Pride',null,null,null,
 'open',null,false,false,'none',94,
 'Darke County Pride, noon to 6pm at Shawnee Prairie.'),
('newark-festival-2026-10-03',
 'Newark Ohio Pride Festival','Newark','Central','Canal Market District','Newark, OH 43055',
 40.058100,-82.401300,'2026-10-03','festival',
 'Newark Ohio Pride',null,null,null,
 'open',null,true,true,'tabling',95,
 'Licking County Pride, noon to 5pm at the Canal Market District. Final October touch-points before the election; doubles as a GOTV event.'),
('columbus-festival-2026-10-10',
 'Columbus Community Pride','Columbus','Central','Mayme Moore Park','835 Mt. Vernon Ave, Columbus, OH 43203',
 39.971000,-82.974000,'2026-10-10','festival',
 'Columbus Community Pride',null,null,null,
 'open',null,true,true,'tabling',96,
 'Africentric / Black Pride community alternative at Mayme Moore Park. Final October touch-point before the November 3 election; doubles as a GOTV event.')

on conflict (slug) do update set
  updated_at          = now(),
  name                = excluded.name,
  city                = excluded.city,
  region              = excluded.region,
  venue               = excluded.venue,
  address             = excluded.address,
  lat                 = excluded.lat,
  lng                 = excluded.lng,
  event_date          = excluded.event_date,
  event_type          = excluded.event_type,
  organizer           = excluded.organizer,
  organizer_url       = excluded.organizer_url,
  registration_deadline = excluded.registration_deadline,
  registration_url    = excluded.registration_url,
  registration_status = excluded.registration_status,
  attendance_estimate = excluded.attendance_estimate,
  pac_priority        = excluded.pac_priority,
  pac_attending       = excluded.pac_attending,
  pac_role            = excluded.pac_role,
  display_order       = excluded.display_order,
  description         = excluded.description;

-- Attendance is NOT confirmed for any Pride yet. The public site must not
-- claim "We're Going" anywhere; the PAC sets pac_attending per event in
-- Supabase Studio once a contingent is actually locked in.
update public.pride_events set pac_attending = false;

-- Tour status: the launch is the PAC's own event so it is a legitimate
-- "current" anchor, but no Pride stop is a confirmed "next" yet.
update public.pride_tour_status
set current_event_id = (select id from public.pride_events where slug = 'columbus-rally-2026-05-22'),
    next_event_id    = null,
    status_message   = 'Launch week at the Ohio Statehouse. Road tour stops are being confirmed. Check back for updates.',
    updated_at       = now()
where id = 1;
