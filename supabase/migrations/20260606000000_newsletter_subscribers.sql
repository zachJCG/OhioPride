-- =====================================================================
-- 20260606000000_newsletter_subscribers.sql
-- Newsletter signup capture for the /signup hub page (and the homepage
-- newsletter band, which forwards to /signup).
--
-- NOTE: this table already exists in the production Ohio Pride project;
-- this migration documents that schema so fresh/local environments
-- reproduce it. It is written idempotently (create-if-not-exists,
-- drop-policy-if-exists) and is a no-op against the live project.
--
-- Posts arrive at /.netlify/functions/newsletter-submit, which writes
-- using the service-role key. Admin tooling reads it back via
-- authenticated admin sessions.
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------
create table if not exists public.newsletter_subscribers (
  id                uuid primary key default gen_random_uuid(),
  email             citext not null unique,
  first_name        text,
  last_name         text,
  zip               text,
  source            text not null default 'website_newsletter',
  status            text not null default 'active'
    check (status in ('active','unsubscribed','bounced','complained')),
  consented_at      timestamptz not null default now(),
  unsubscribed_at   timestamptz,
  unsubscribe_token uuid not null default gen_random_uuid(),
  referrer          text,
  user_agent        text,
  submission_ip     text,
  tags              text[] not null default '{}',
  admin_notes       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.newsletter_subscribers is
  'Newsletter signups from the public /signup hub. Anon role can INSERT (locked to a fresh active row) but cannot SELECT. Read access is admin-only via is_admin().';

-- ---------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------
create index if not exists idx_newsletter_subscribers_created_at on public.newsletter_subscribers (created_at desc);
create index if not exists idx_newsletter_subscribers_status     on public.newsletter_subscribers (status);

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

drop trigger if exists trg_newsletter_subscribers_updated_at on public.newsletter_subscribers;
create trigger trg_newsletter_subscribers_updated_at
  before update on public.newsletter_subscribers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 4. Row Level Security
-- ---------------------------------------------------------------------
alter table public.newsletter_subscribers enable row level security;

drop policy if exists "anon can subscribe"            on public.newsletter_subscribers;
drop policy if exists "admin can read subscribers"    on public.newsletter_subscribers;
drop policy if exists "admin can update subscribers"  on public.newsletter_subscribers;
drop policy if exists "service_role all subscribers"  on public.newsletter_subscribers;

-- Anon inserts are locked to a clean, freshly-subscribed row. The
-- Netlify function uses the service-role key (which bypasses RLS), but
-- direct anon inserts stay usable from any future client.
create policy "anon can subscribe"
on public.newsletter_subscribers
for insert
to anon, authenticated
with check (
  status = 'active'
  and unsubscribed_at is null
  and admin_notes is null
  and tags = '{}'::text[]
  and email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'::citext
);

create policy "admin can read subscribers"
on public.newsletter_subscribers
for select
to authenticated
using (public.is_admin());

create policy "admin can update subscribers"
on public.newsletter_subscribers
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "service_role all subscribers"
on public.newsletter_subscribers
for all
to service_role
using (true)
with check (true);

-- Anon role gets explicit column-level INSERT grants (excludes admin-only
-- and server-managed columns).
grant insert (
  email, first_name, last_name, zip, source, referrer,
  user_agent, submission_ip
) on public.newsletter_subscribers to anon, authenticated;
