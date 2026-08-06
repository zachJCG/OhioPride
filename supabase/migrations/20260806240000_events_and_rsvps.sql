-- Events and RSVPs as a first-class module.
--
-- The Pride Hours were collecting RSVPs through the generic form handler,
-- which stored them (when it stored them at all) as untyped rows in
-- form_submissions. That gives no roster, no headcount, no dedupe and no link
-- to the person's contact record. This makes an event a real object and an
-- RSVP a real object, so a new Pride Hour is a row rather than a code change.
--
-- events.slug matches the form-name the public page posts, which is how a
-- submission finds its event without hardcoding anything.

create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  city         text,
  venue        text,
  starts_at    timestamptz,
  ends_at      timestamptz,
  page_path    text,
  actblue_url  text,
  capacity     integer,
  status       text not null default 'upcoming'
               check (status in ('upcoming', 'past', 'cancelled')),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_events_starts on public.events (starts_at desc);

create table if not exists public.event_rsvps (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  contact_id    uuid references public.contacts(id) on delete set null,
  first_name    text,
  last_name     text,
  full_name     text,
  email         citext,
  phone         text,
  organization  text,
  guests        integer not null default 0 check (guests >= 0),
  status        text not null default 'rsvp'
                check (status in ('rsvp', 'attended', 'no_show', 'cancelled')),
  source        text,
  payload       jsonb not null default '{}'::jsonb,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_event_rsvps_event on public.event_rsvps (event_id, created_at desc);
create index if not exists idx_event_rsvps_contact on public.event_rsvps (contact_id);
-- One RSVP per person per event; a resubmit updates rather than duplicates.
create unique index if not exists uq_event_rsvps_event_email
  on public.event_rsvps (event_id, email) where email is not null;

-- Same contact-spine linking every other people table uses, so an RSVP shows
-- up on the person's contact record and in the texting "Event sign-ups"
-- segment without any extra wiring.
drop trigger if exists trg_link_contact on public.event_rsvps;
create trigger trg_link_contact
  before insert or update of email on public.event_rsvps
  for each row execute function public.link_or_create_contact('signup');

create or replace function public.events_touch()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_events_touch on public.events;
create trigger trg_events_touch before update on public.events
  for each row execute function public.events_touch();
drop trigger if exists trg_event_rsvps_touch on public.event_rsvps;
create trigger trg_event_rsvps_touch before update on public.event_rsvps
  for each row execute function public.events_touch();

-- Headcount without pulling every RSVP to the browser.
drop view if exists public.event_rsvp_summary;
create view public.event_rsvp_summary
with (security_invoker = on) as
select
  e.id as event_id,
  count(r.id)                                          as rsvps,
  coalesce(sum(r.guests), 0)                           as guests,
  count(r.id) filter (where r.status = 'attended')     as attended,
  count(r.id) filter (where r.status = 'cancelled')    as cancelled,
  count(r.id) + coalesce(sum(r.guests), 0)             as headcount,
  max(r.created_at)                                    as last_rsvp_at
from public.events e
left join public.event_rsvps r on r.event_id = e.id and r.status <> 'cancelled'
group by e.id;

-- RLS. RSVPs carry names, emails and phone numbers, so reads are admin only.
-- Inserts come from the form handler on the service role, never from anon.
alter table public.events enable row level security;
alter table public.event_rsvps enable row level security;

drop policy if exists "admin can read events" on public.events;
create policy "admin can read events" on public.events
  for select to authenticated using (public.is_admin());
drop policy if exists "events writers" on public.events;
create policy "events writers" on public.events
  for all to authenticated
  using (public.has_permission('events', 'write'))
  with check (public.has_permission('events', 'write'));

drop policy if exists "admin can read event_rsvps" on public.event_rsvps;
create policy "admin can read event_rsvps" on public.event_rsvps
  for select to authenticated using (public.is_admin());
drop policy if exists "events writers rsvps" on public.event_rsvps;
create policy "events writers rsvps" on public.event_rsvps
  for all to authenticated
  using (public.has_permission('events', 'write'))
  with check (public.has_permission('events', 'write'));

grant select, insert, update, delete on public.events to authenticated;
grant select, insert, update, delete on public.event_rsvps to authenticated;
grant select on public.event_rsvp_summary to authenticated;

-- Role grants: the same people who run fundraising and comms run events.
insert into public.role_permissions (role_slug, module, action) values
  ('super_admin', 'events', 'read'),   ('super_admin', 'events', 'write'),
  ('super_admin', 'events', 'admin'),  ('super_admin', 'events', 'manage_users'),
  ('board_member', 'events', 'read'),
  ('treasurer', 'events', 'read'),     ('treasurer', 'events', 'write'),
  ('comms_lead', 'events', 'read'),    ('comms_lead', 'events', 'write'),
  ('volunteer_lead', 'events', 'read'),('volunteer_lead', 'events', 'write')
on conflict do nothing;

-- The two Pride Hours that exist today. Slugs match the form-name each public
-- page posts, so their RSVPs land on the right event with no code change.
insert into public.events (slug, name, city, venue, starts_at, ends_at, page_path, actblue_url, status)
values
  ('pride-hour-cincinnati', 'Cincinnati Pride Hour', 'Cincinnati', 'Cobblestone OTR',
   '2026-08-26 18:00:00-04', '2026-08-26 20:00:00-04', '/pride-hour',
   'https://secure.actblue.com/donate/26-Pride-hourcincy', 'upcoming'),
  ('pride-hour-cleveland', 'Cleveland Pride Hour', 'Cleveland', 'Leather Stallion Saloon',
   '2026-09-20 16:00:00-04', '2026-09-20 18:00:00-04', '/sunday-funday',
   null, 'upcoming')
on conflict (slug) do nothing;
