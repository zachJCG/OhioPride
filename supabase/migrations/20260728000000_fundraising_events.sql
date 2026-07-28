-- =====================================================================
-- 20260728000000_fundraising_events.sql
--
-- Fundraising Events module for /admin/events. Models the team's
-- "Ohio Pride Event Template" workbook as first-class tables so every
-- finance/host event (Zoom call, house party, reception) is tracked in
-- one place instead of a spreadsheet per event.
--
-- Each event carries:
--   * the header fields   (name, date, time, zoom link, giving levels,
--                          goal, donate page, ActBlue page, source code,
--                          PDF invite)
--   * a pledge/attendee ledger (First, Last, Pledged, In, Out, RSVP,
--                          Email, Notes) -> fundraising_event_attendees
--   * a build checklist and a follow-up checklist, each item with a
--                          "date completed" -> fundraising_event_checklist
--
-- Rollups (Total Pledged / In / Out, Variance to Goal, RSVP count,
-- checklist progress) come from the fundraising_events_summary view so
-- the list page is a single query.
--
-- ADDS
--   - public.fundraising_event_status     (enum)
--   - public.fundraising_event_phase      (enum)
--   - public.fundraising_events           (one row per event)
--   - public.fundraising_event_attendees  (pledge ledger)
--   - public.fundraising_event_checklist  (build + follow-up items)
--   - public.fundraising_events_summary   (view w/ rollups)
--   - seed-default-checklist trigger on event insert
--   - role_permissions for the new `events` module
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------
do $$ begin
  create type public.fundraising_event_status as enum (
    'planning','active','completed','cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.fundraising_event_phase as enum ('build','followup');
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------
-- 2. fundraising_events
-- ---------------------------------------------------------------------
create table if not exists public.fundraising_events (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  event_date    date,
  event_time    text,                       -- freeform, e.g. "6:00 PM ET"
  location      text,                        -- optional venue / "Virtual"
  host_name     text,                        -- host / host committee
  status        public.fundraising_event_status not null default 'planning',
  goal          numeric(12,2) not null default 0,
  giving_levels text,                        -- freeform list of tiers
  zoom_link     text,
  donate_page   text,
  actblue_page  text,
  source_code   text,                        -- ActBlue source code / refcode
  pdf_invite_url text,
  notes         text,
  created_by    uuid references public.admin_users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_fund_events_date   on public.fundraising_events (event_date);
create index if not exists idx_fund_events_status on public.fundraising_events (status);

-- ---------------------------------------------------------------------
-- 3. fundraising_event_attendees  (the pledge / RSVP ledger)
-- ---------------------------------------------------------------------
create table if not exists public.fundraising_event_attendees (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.fundraising_events(id) on delete cascade,
  first_name  text,
  last_name   text,
  email       text,
  pledged     numeric(12,2) not null default 0,   -- amount pledged
  amount_in   numeric(12,2) not null default 0,   -- collected
  amount_out  numeric(12,2) not null default 0,   -- still outstanding
  rsvp        text,                                -- yes | no | maybe | (blank)
  notes       text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_fund_attendees_event on public.fundraising_event_attendees (event_id, sort_order);

-- ---------------------------------------------------------------------
-- 4. fundraising_event_checklist  (build + follow-up items)
-- ---------------------------------------------------------------------
create table if not exists public.fundraising_event_checklist (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.fundraising_events(id) on delete cascade,
  phase         public.fundraising_event_phase not null,
  label         text not null,
  is_done       boolean not null default false,
  completed_on  date,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists idx_fund_checklist_event on public.fundraising_event_checklist (event_id, phase, sort_order);

-- ---------------------------------------------------------------------
-- 5. Touch triggers (keep updated_at fresh; stamp completed_on)
-- ---------------------------------------------------------------------
create or replace function public.fundraising_events_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_fund_events_touch on public.fundraising_events;
create trigger trg_fund_events_touch
  before update on public.fundraising_events
  for each row execute function public.fundraising_events_touch();

drop trigger if exists trg_fund_attendees_touch on public.fundraising_event_attendees;
create trigger trg_fund_attendees_touch
  before update on public.fundraising_event_attendees
  for each row execute function public.fundraising_events_touch();

-- When a checklist item is flipped done, stamp today's date if not set;
-- when un-done, clear it. Mirrors the Excel "Date Completed" column.
create or replace function public.fundraising_checklist_stamp()
returns trigger language plpgsql as $$
begin
  if new.is_done and not coalesce(old.is_done, false) and new.completed_on is null then
    new.completed_on := current_date;
  elsif not new.is_done then
    new.completed_on := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_fund_checklist_stamp on public.fundraising_event_checklist;
create trigger trg_fund_checklist_stamp
  before insert or update on public.fundraising_event_checklist
  for each row execute function public.fundraising_checklist_stamp();

-- ---------------------------------------------------------------------
-- 6. Seed the standard checklist when an event is created
--    (items lifted straight from the Event Template workbook)
-- ---------------------------------------------------------------------
create or replace function public.fundraising_events_seed_checklist()
returns trigger language plpgsql as $$
begin
  insert into public.fundraising_event_checklist (event_id, phase, label, sort_order)
  values
    (new.id, 'build',    'Date on Final Outreach',   1),
    (new.id, 'build',    'Source code',              2),
    (new.id, 'build',    'ActBlue Page',             3),
    (new.id, 'build',    'PDF Invite',               4),
    (new.id, 'build',    'Zoom Link',                5),
    (new.id, 'build',    'Staff invites',            6),
    (new.id, 'build',    'Email Blast(s)',           7),
    (new.id, 'build',    'Staff reminder emails',    8),
    (new.id, 'build',    'Event Briefing',           9),
    (new.id, 'followup', 'All Attendee Thank You Email', 1),
    (new.id, 'followup', 'Final Host Update',        2),
    (new.id, 'followup', 'Host Thank Yous',          3),
    (new.id, 'followup', 'Pledge Chasing',           4);
  return new;
end $$;

drop trigger if exists trg_fund_events_seed_checklist on public.fundraising_events;
create trigger trg_fund_events_seed_checklist
  after insert on public.fundraising_events
  for each row execute function public.fundraising_events_seed_checklist();

-- ---------------------------------------------------------------------
-- 7. Rollup view (Total Pledged/In/Out, Variance, RSVPs, checklist %)
-- ---------------------------------------------------------------------
create or replace view public.fundraising_events_summary
with (security_invoker = on) as
select
  e.*,
  coalesce(a.attendee_count, 0)                       as attendee_count,
  coalesce(a.rsvp_count, 0)                            as rsvp_count,
  coalesce(a.total_pledged, 0)                         as total_pledged,
  coalesce(a.total_in, 0)                              as total_in,
  coalesce(a.total_out, 0)                             as total_out,
  (e.goal - coalesce(a.total_in, 0))                   as variance_to_goal,
  coalesce(c.build_total, 0)                           as build_total,
  coalesce(c.build_done, 0)                            as build_done,
  coalesce(c.followup_total, 0)                        as followup_total,
  coalesce(c.followup_done, 0)                         as followup_done
from public.fundraising_events e
left join (
  select
    event_id,
    count(*)                                            as attendee_count,
    count(*) filter (where lower(coalesce(rsvp,'')) = 'yes') as rsvp_count,
    sum(pledged)                                        as total_pledged,
    sum(amount_in)                                      as total_in,
    sum(amount_out)                                     as total_out
  from public.fundraising_event_attendees
  group by event_id
) a on a.event_id = e.id
left join (
  select
    event_id,
    count(*) filter (where phase = 'build')                          as build_total,
    count(*) filter (where phase = 'build'    and is_done)           as build_done,
    count(*) filter (where phase = 'followup')                       as followup_total,
    count(*) filter (where phase = 'followup' and is_done)           as followup_done
  from public.fundraising_event_checklist
  group by event_id
) c on c.event_id = e.id;

-- ---------------------------------------------------------------------
-- 8. RLS
-- ---------------------------------------------------------------------
alter table public.fundraising_events          enable row level security;
alter table public.fundraising_event_attendees enable row level security;
alter table public.fundraising_event_checklist enable row level security;

-- fundraising_events
drop policy if exists fund_events_select on public.fundraising_events;
create policy fund_events_select on public.fundraising_events for select to authenticated
  using (public.has_permission('events','read'));
drop policy if exists fund_events_insert on public.fundraising_events;
create policy fund_events_insert on public.fundraising_events for insert to authenticated
  with check (public.has_permission('events','write'));
drop policy if exists fund_events_update on public.fundraising_events;
create policy fund_events_update on public.fundraising_events for update to authenticated
  using (public.has_permission('events','write')) with check (public.has_permission('events','write'));
drop policy if exists fund_events_delete on public.fundraising_events;
create policy fund_events_delete on public.fundraising_events for delete to authenticated
  using (public.has_permission('events','admin'));

-- fundraising_event_attendees
drop policy if exists fund_attendees_select on public.fundraising_event_attendees;
create policy fund_attendees_select on public.fundraising_event_attendees for select to authenticated
  using (public.has_permission('events','read'));
drop policy if exists fund_attendees_insert on public.fundraising_event_attendees;
create policy fund_attendees_insert on public.fundraising_event_attendees for insert to authenticated
  with check (public.has_permission('events','write'));
drop policy if exists fund_attendees_update on public.fundraising_event_attendees;
create policy fund_attendees_update on public.fundraising_event_attendees for update to authenticated
  using (public.has_permission('events','write')) with check (public.has_permission('events','write'));
drop policy if exists fund_attendees_delete on public.fundraising_event_attendees;
create policy fund_attendees_delete on public.fundraising_event_attendees for delete to authenticated
  using (public.has_permission('events','write'));

-- fundraising_event_checklist
drop policy if exists fund_checklist_select on public.fundraising_event_checklist;
create policy fund_checklist_select on public.fundraising_event_checklist for select to authenticated
  using (public.has_permission('events','read'));
drop policy if exists fund_checklist_insert on public.fundraising_event_checklist;
create policy fund_checklist_insert on public.fundraising_event_checklist for insert to authenticated
  with check (public.has_permission('events','write'));
drop policy if exists fund_checklist_update on public.fundraising_event_checklist;
create policy fund_checklist_update on public.fundraising_event_checklist for update to authenticated
  using (public.has_permission('events','write')) with check (public.has_permission('events','write'));
drop policy if exists fund_checklist_delete on public.fundraising_event_checklist;
create policy fund_checklist_delete on public.fundraising_event_checklist for delete to authenticated
  using (public.has_permission('events','write'));

-- ---------------------------------------------------------------------
-- 9. Grants
-- ---------------------------------------------------------------------
grant select, insert, update, delete on public.fundraising_events          to authenticated;
grant select, insert, update, delete on public.fundraising_event_attendees to authenticated;
grant select, insert, update, delete on public.fundraising_event_checklist to authenticated;
grant select on public.fundraising_events_summary to authenticated;

-- ---------------------------------------------------------------------
-- 10. Role permissions for the new `events` module (idempotent)
-- ---------------------------------------------------------------------
-- super_admin: full
insert into public.role_permissions (role_slug, module, action)
select 'super_admin','events', a
from   unnest(array['read','write','admin','manage_users']) a
on conflict do nothing;

-- Finance + leadership: read/write (they run the events)
insert into public.role_permissions (role_slug, module, action)
select rs,'events', a
from   unnest(array['treasurer','board_member','comms_lead']) rs
cross join unnest(array['read','write']) a
on conflict do nothing;

-- Volunteer / legislative leads: read-only visibility
insert into public.role_permissions (role_slug, module, action)
select rs,'events','read'
from   unnest(array['volunteer_lead','legislative_lead']) rs
on conflict do nothing;
