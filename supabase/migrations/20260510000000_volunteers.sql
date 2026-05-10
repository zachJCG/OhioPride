-- =====================================================================
-- 20260510000000_volunteers.sql
-- Volunteer signup capture for the /volunteer page form.
--
-- Posts arrive at /.netlify/functions/volunteer-submit, which inserts
-- into this table using the service-role key. The /admin/volunteers
-- dashboard reads it back via authenticated admin sessions.
--
-- RLS:
--   - anon INSERT: allowed, with a check that locks newly-created rows
--     to status='new' so visitors can't self-promote to 'assigned' etc.
--   - admin SELECT / UPDATE: gated through public.is_admin() which is
--     already defined by the endorsement_system migration.
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------
create table if not exists public.volunteers (
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
  registered_voter  text check (registered_voter in ('yes','no','unsure') or registered_voter is null),

  -- Step 3 / 4: how you want to help, skills, availability
  interests     text[] not null default '{}',
  skills        text[] not null default '{}',
  availability  text[] not null default '{}',
  time_commitment text check (
    time_commitment in ('one_time','monthly','weekly','surge_only')
    or time_commitment is null
  ),

  prior_campaign_experience boolean not null default false,
  prior_campaign_notes      text,

  -- Step 5: wrap up
  referral_source     text,
  is_founding_member  boolean not null default false,
  additional_notes    text,
  email_optin         boolean not null default true,
  sms_optin           boolean not null default false,

  -- Workflow / metadata
  status text not null default 'new'
    check (status in ('new','contacted','assigned','inactive','declined')),
  submission_ip text,
  user_agent    text
);

comment on table public.volunteers is
  'Volunteer signups from the public /volunteer form. Anon role can INSERT but cannot SELECT. Read access is admin-only via is_admin().';

-- ---------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------
create index if not exists idx_volunteers_created_at on public.volunteers (created_at desc);
create index if not exists idx_volunteers_status     on public.volunteers (status);
create index if not exists idx_volunteers_county     on public.volunteers (county);
create unique index if not exists idx_volunteers_email_unique on public.volunteers (email);

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

drop trigger if exists trg_volunteers_updated_at on public.volunteers;
create trigger trg_volunteers_updated_at
  before update on public.volunteers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 4. Row Level Security
-- ---------------------------------------------------------------------
alter table public.volunteers enable row level security;

drop policy if exists "anon can submit volunteer signups" on public.volunteers;
drop policy if exists "admin can read volunteers"         on public.volunteers;
drop policy if exists "admin can update volunteers"       on public.volunteers;

-- The Netlify function uses the service-role key (which bypasses RLS),
-- but we still allow direct anon inserts so the table remains usable
-- from any future client without re-policying. Locked to status='new'.
create policy "anon can submit volunteer signups"
on public.volunteers
for insert
to anon, authenticated
with check (status = 'new');

create policy "admin can read volunteers"
on public.volunteers
for select
to authenticated
using (public.is_admin());

create policy "admin can update volunteers"
on public.volunteers
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Anon role gets explicit column-level INSERT grants. Excludes status
-- (defaulted to 'new') and admin-only columns.
grant insert (
  first_name, last_name, email, phone, pronouns,
  city, county, zip, registered_voter,
  interests, skills, availability, time_commitment,
  prior_campaign_experience, prior_campaign_notes,
  referral_source, is_founding_member, additional_notes,
  email_optin, sms_optin,
  submission_ip, user_agent
) on public.volunteers to anon, authenticated;
