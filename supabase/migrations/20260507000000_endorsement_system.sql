-- =====================================================================
-- Ohio Pride PAC: Endorsement Screening System
-- Phase 1: Database Foundation
--
-- Run this entire file in the Supabase SQL Editor (one paste, one click).
-- Idempotent: safe to re-run.
--
-- BEFORE RUNNING:
--   1. Update ADMIN_EMAIL below to the email you'll use to log into
--      the admin dashboard.
--   2. Create the Storage bucket "endorsement-pdfs" in the Supabase
--      Dashboard (Storage > New bucket, Private). The storage policies
--      at the bottom of this file will not apply until the bucket exists.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. Admin allowlist
--    Authoritative source for who counts as an "admin". The is_admin()
--    helper checks the JWT email against this table on every request.
--    Add or remove board members later with simple INSERT/DELETE.
-- ---------------------------------------------------------------------
create table if not exists public.admin_emails (
  email      text primary key,
  added_at   timestamptz not null default now(),
  added_by   text
);

-- >>> EDIT THIS LINE before running <<<
insert into public.admin_emails (email, added_by)
values ('zach@ohiopride.org', 'system_init')
on conflict (email) do nothing;

-- ---------------------------------------------------------------------
-- 2. is_admin() helper
--    Returns true if the current JWT's email is in admin_emails.
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_emails
    where email = (auth.jwt() ->> 'email')
  );
$$;

-- ---------------------------------------------------------------------
-- 3. Main table: endorsement_applications
-- ---------------------------------------------------------------------
create table if not exists public.endorsement_applications (
  -- Identity
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Workflow
  status         text not null default 'submitted'
    check (status in ('submitted','under_review','endorsed','declined','withdrawn')),

  -- Candidate info
  candidate_name   text not null,
  pronouns         text,
  office_sought    text not null,
  district         text,
  election_year    int,
  party            text,
  committee_name   text,
  treasurer_name   text,
  email            text not null,
  phone            text,
  website          text,
  is_out           text check (is_out in ('yes','no','prefer_not_to_say') or is_out is null),

  -- Section 2: Core Positions
  q1_nondiscrimination        boolean,
  q1_explanation              text,
  q2_anti_lgbtq_legislation   boolean,
  q2_explanation              text,
  q3_conversion_therapy       boolean,
  q3_explanation              text,
  q4_inclusive_education      boolean,
  q4_explanation              text,
  q5_vote_against_rollbacks   boolean,
  q5_explanation              text,

  -- Section 3: Legislative & Advocacy
  q6_priorities    text,
  q7_legislation   text,
  q8_safety        text,

  -- Section 4: Vision & Ohio Context
  q9_intersection      text,
  q10_why_endorsement  text,

  -- Section 5: Background & Attestation
  bio                   text,
  conflicts_disclosure  text,
  attestation           boolean not null default false,
  signature             text,

  -- Internal
  reviewer_notes        text,
  generated_pdf_path    text,

  -- Metadata
  submission_ip   text,
  user_agent      text
);

-- Indexes
create index if not exists idx_endorsement_status   on public.endorsement_applications(status);
create index if not exists idx_endorsement_office   on public.endorsement_applications(office_sought);
create index if not exists idx_endorsement_year     on public.endorsement_applications(election_year);
create index if not exists idx_endorsement_created  on public.endorsement_applications(created_at desc);

-- updated_at auto-touch
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_endorsement_updated_at on public.endorsement_applications;
create trigger trg_endorsement_updated_at
  before update on public.endorsement_applications
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 4. Row Level Security
-- ---------------------------------------------------------------------
alter table public.endorsement_applications enable row level security;
alter table public.admin_emails             enable row level security;

-- Drop any pre-existing policies (idempotent re-run support)
drop policy if exists "anon can submit applications"     on public.endorsement_applications;
drop policy if exists "anon can read endorsed candidates" on public.endorsement_applications;
drop policy if exists "admin can read all applications"  on public.endorsement_applications;
drop policy if exists "admin can update applications"    on public.endorsement_applications;
drop policy if exists "admin can read allowlist"         on public.admin_emails;

-- anon INSERT: candidates submitting the form.
-- Locked to safe defaults: cannot self-promote to 'endorsed', cannot
-- pre-populate reviewer_notes or pdf path.
create policy "anon can submit applications"
on public.endorsement_applications
for insert
to anon
with check (
  status = 'submitted'
  and reviewer_notes is null
  and generated_pdf_path is null
);

-- anon SELECT: only rows that have been endorsed.
-- This powers the public endorsements page.
create policy "anon can read endorsed candidates"
on public.endorsement_applications
for select
to anon
using (status = 'endorsed');

-- authenticated admin: full SELECT and UPDATE
create policy "admin can read all applications"
on public.endorsement_applications
for select
to authenticated
using (public.is_admin());

create policy "admin can update applications"
on public.endorsement_applications
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- admin_emails table: only admins can read it. Modify via service role.
create policy "admin can read allowlist"
on public.admin_emails
for select
to authenticated
using (public.is_admin());

-- Note: DELETE is intentionally not policied for any role except
-- service_role (which bypasses RLS). Use the Supabase dashboard or
-- service-role calls for deletions, to prevent accidental data loss.

-- ---------------------------------------------------------------------
-- 5. Public endorsements view
--    Safe projection for the public /endorsements page. Only exposes
--    fields a voter should see; no internal notes, contact info, or
--    pre-endorsement answers.
-- ---------------------------------------------------------------------
create or replace view public.public_endorsements as
select
  id,
  candidate_name,
  pronouns,
  office_sought,
  district,
  election_year,
  party,
  website,
  bio,
  is_out,
  updated_at as endorsed_at
from public.endorsement_applications
where status = 'endorsed';

grant select on public.public_endorsements to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Storage policies for endorsement-pdfs bucket
--    The bucket must be created in the dashboard FIRST (Storage > New
--    bucket > "endorsement-pdfs", Private). These policies then lock
--    read/write to admins only.
-- ---------------------------------------------------------------------
drop policy if exists "admin can read endorsement pdfs"   on storage.objects;
drop policy if exists "admin can write endorsement pdfs"  on storage.objects;
drop policy if exists "admin can update endorsement pdfs" on storage.objects;
drop policy if exists "admin can delete endorsement pdfs" on storage.objects;

create policy "admin can read endorsement pdfs"
on storage.objects
for select
to authenticated
using (bucket_id = 'endorsement-pdfs' and public.is_admin());

create policy "admin can write endorsement pdfs"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'endorsement-pdfs' and public.is_admin());

create policy "admin can update endorsement pdfs"
on storage.objects
for update
to authenticated
using  (bucket_id = 'endorsement-pdfs' and public.is_admin())
with check (bucket_id = 'endorsement-pdfs' and public.is_admin());

create policy "admin can delete endorsement pdfs"
on storage.objects
for delete
to authenticated
using (bucket_id = 'endorsement-pdfs' and public.is_admin());

-- =====================================================================
-- DONE.
-- =====================================================================
