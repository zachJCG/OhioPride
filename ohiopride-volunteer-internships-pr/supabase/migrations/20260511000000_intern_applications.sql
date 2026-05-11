-- =====================================================================
-- 20260511000000_intern_applications.sql
-- Captures Summer / Fall 2026 Internship and Fellowship applications
-- submitted via the Apply CTA on /volunteer (intern path).
--
-- Posts arrive at /.netlify/functions/volunteer-submit, which inserts
-- into this table when application_type = 'internship' (otherwise the
-- function falls through to public.volunteers).
--
-- RLS:
--   - anon INSERT: allowed, locked to status = 'new'
--   - admin SELECT / UPDATE: gated through public.is_admin()
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------
create table if not exists public.intern_applications (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Step 1: about you
  first_name  text   not null,
  last_name   text   not null,
  email       citext not null,
  phone       text,
  pronouns    text,

  -- Step 2: where you live
  city              text,
  county            text,
  zip               text,

  -- Step 3: position + program
  position text not null check (position in (
    'chief_of_staff',
    'graphics_social_media',
    'volunteer_coordinator',
    'legislative_director',
    'policy_aide'
  )),
  term text not null check (term in ('summer_2026', 'fall_2026', 'either')),
  start_date_pref text,                  -- free text: "ASAP", "June 1", etc.
  weekly_hours int check (weekly_hours between 1 and 40 or weekly_hours is null),
  credit_hours numeric(3,1) check (credit_hours between 0 and 12 or credit_hours is null),

  -- Step 4: academic background
  institution      text,
  program_major    text,
  class_year       text,                 -- "Senior", "JD candidate", "MPA 1L", etc.
  faculty_sponsor_name  text,
  faculty_sponsor_email text,

  -- Step 5: materials + notes
  resume_url text,                       -- Drive/Dropbox/etc. share URL
  portfolio_url text,                    -- optional, Graphics & Social Media
  statement_of_interest text not null,   -- short ask: "why this role"
  prior_experience text,
  why_ohio_pride text,
  referral_source text,
  is_founding_member boolean not null default false,

  -- Communication preferences
  email_optin boolean not null default true,
  sms_optin   boolean not null default false,

  -- Workflow / metadata
  status text not null default 'new'
    check (status in ('new','contacted','interviewing','offered','hired','declined','withdrawn')),
  submission_ip text,
  user_agent    text
);

comment on table public.intern_applications is
  'Summer/Fall 2026 internship + fellowship applications (Chief of Staff, Graphics & Social, Volunteer Coordinator, Legislative Director, Policy Aide). Anon role can INSERT but cannot SELECT. Read access is admin-only via is_admin().';

-- ---------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------
create index if not exists idx_intern_apps_created_at on public.intern_applications (created_at desc);
create index if not exists idx_intern_apps_status     on public.intern_applications (status);
create index if not exists idx_intern_apps_position   on public.intern_applications (position);
create index if not exists idx_intern_apps_term       on public.intern_applications (term);
create unique index if not exists idx_intern_apps_email_position_unique
  on public.intern_applications (email, position);

-- ---------------------------------------------------------------------
-- 3. updated_at auto-touch (reuses public.set_updated_at if present)
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

drop trigger if exists trg_intern_apps_updated_at on public.intern_applications;
create trigger trg_intern_apps_updated_at
  before update on public.intern_applications
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 4. Row Level Security
-- ---------------------------------------------------------------------
alter table public.intern_applications enable row level security;

drop policy if exists "anon can submit intern applications" on public.intern_applications;
drop policy if exists "admin can read intern applications" on public.intern_applications;
drop policy if exists "admin can update intern applications" on public.intern_applications;

create policy "anon can submit intern applications"
on public.intern_applications
for insert
to anon, authenticated
with check (status = 'new');

create policy "admin can read intern applications"
on public.intern_applications
for select
to authenticated
using (public.is_admin());

create policy "admin can update intern applications"
on public.intern_applications
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Anon role gets explicit column-level INSERT grants. Excludes status
-- (defaulted to 'new') and admin-only columns.
grant insert (
  first_name, last_name, email, phone, pronouns,
  city, county, zip,
  position, term, start_date_pref, weekly_hours, credit_hours,
  institution, program_major, class_year,
  faculty_sponsor_name, faculty_sponsor_email,
  resume_url, portfolio_url, statement_of_interest, prior_experience,
  why_ohio_pride, referral_source, is_founding_member,
  email_optin, sms_optin,
  submission_ip, user_agent
) on public.intern_applications to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Convenience view for the admin dashboard (joins nothing, just
--    pre-formats the position label).
-- ---------------------------------------------------------------------
create or replace view public.intern_applications_admin as
select
  ia.*,
  case ia.position
    when 'chief_of_staff'         then 'Chief of Staff'
    when 'graphics_social_media'  then 'Graphics and Social Media'
    when 'volunteer_coordinator'  then 'Volunteer Coordinator'
    when 'legislative_director'   then 'Legislative Director'
    when 'policy_aide'            then 'Policy Aide'
    else ia.position
  end as position_label,
  case ia.term
    when 'summer_2026' then 'Summer 2026'
    when 'fall_2026'   then 'Fall 2026'
    when 'either'      then 'Summer or Fall 2026'
    else ia.term
  end as term_label
from public.intern_applications ia;

grant select on public.intern_applications_admin to authenticated;
