-- =====================================================================
-- 20260511020000_volunteers_add_metadata_columns.sql
--
-- Heal partial state on the live public.volunteers table.
--
-- Root cause: the 2026-05-10 migration uses `create table if not exists`,
-- so on any environment where the table already existed before the
-- metadata columns were added to that file, the columns were silently
-- skipped. The live volunteer-submit function then upserts a row that
-- includes `submission_ip` / `user_agent`, PostgREST can't find them in
-- the schema cache, and the API returns:
--
--   HTTP 500  code=PGRST204
--   "Could not find the 'submission_ip' column of 'volunteers'
--    in the schema cache"
--
-- This migration re-declares every column the function writes with
-- `add column if not exists`, re-asserts the enum check constraints,
-- ensures the unique-on-email index exists (the upsert depends on it),
-- and pokes PostgREST so the API sees the new shape immediately.
--
-- Safe to re-run.
-- =====================================================================

create extension if not exists "citext";

-- ---------------------------------------------------------------------
-- 1. Columns the volunteer-submit function writes
-- ---------------------------------------------------------------------
alter table public.volunteers add column if not exists first_name  text;
alter table public.volunteers add column if not exists last_name   text;
alter table public.volunteers add column if not exists email       citext;
alter table public.volunteers add column if not exists phone       text;
alter table public.volunteers add column if not exists pronouns    text;

alter table public.volunteers add column if not exists city              text;
alter table public.volunteers add column if not exists county            text;
alter table public.volunteers add column if not exists zip               text;
alter table public.volunteers add column if not exists registered_voter  text;

alter table public.volunteers add column if not exists interests     text[] not null default '{}';
alter table public.volunteers add column if not exists skills        text[] not null default '{}';
alter table public.volunteers add column if not exists availability  text[] not null default '{}';
alter table public.volunteers add column if not exists time_commitment text;

alter table public.volunteers add column if not exists prior_campaign_experience boolean not null default false;
alter table public.volunteers add column if not exists prior_campaign_notes      text;

alter table public.volunteers add column if not exists referral_source    text;
alter table public.volunteers add column if not exists is_founding_member boolean not null default false;
alter table public.volunteers add column if not exists additional_notes   text;
alter table public.volunteers add column if not exists email_optin        boolean not null default true;
alter table public.volunteers add column if not exists sms_optin          boolean not null default false;

alter table public.volunteers add column if not exists status text not null default 'new';

-- The two columns that triggered the PGRST204 in prod:
alter table public.volunteers add column if not exists submission_ip text;
alter table public.volunteers add column if not exists user_agent    text;

-- ---------------------------------------------------------------------
-- 2. Re-assert enum check constraints (drop-and-recreate so they pick
--    up any new enum values shipped in later migrations and stay in
--    sync between dev/preview/prod)
-- ---------------------------------------------------------------------
alter table public.volunteers drop constraint if exists volunteers_registered_voter_check;
alter table public.volunteers
  add  constraint volunteers_registered_voter_check
  check (registered_voter in ('yes','no','unsure') or registered_voter is null);

alter table public.volunteers drop constraint if exists volunteers_time_commitment_check;
alter table public.volunteers
  add  constraint volunteers_time_commitment_check
  check (
    time_commitment in ('one_time','monthly','weekly','surge_only')
    or time_commitment is null
  );

alter table public.volunteers drop constraint if exists volunteers_status_check;
alter table public.volunteers
  add  constraint volunteers_status_check
  check (status in ('new','contacted','assigned','inactive','declined'));

-- ---------------------------------------------------------------------
-- 3. Indexes — the upsert uses ON CONFLICT (email), which requires a
--    unique index on (email). Re-assert it.
-- ---------------------------------------------------------------------
create unique index if not exists idx_volunteers_email_unique on public.volunteers (email);
create index        if not exists idx_volunteers_created_at   on public.volunteers (created_at desc);
create index        if not exists idx_volunteers_status       on public.volunteers (status);
create index        if not exists idx_volunteers_county       on public.volunteers (county);

-- ---------------------------------------------------------------------
-- 4. Tell PostgREST to drop its schema cache so the running function
--    sees the new columns on the very next request.
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';
