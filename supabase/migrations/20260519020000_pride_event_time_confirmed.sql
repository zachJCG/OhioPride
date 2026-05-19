-- =====================================================================
-- 20260519020000_pride_event_time_confirmed.sql
-- Two changes for /admin/pride:
--
-- 1. pride_events.time_confirmed — every road-tour stop now carries a
--    time slot, but the slot is "tentative" until an admin confirms it.
--    The calendar parks unconfirmed events in a Tentative strip above
--    the All-day row; once confirmed they drop into their hour slot
--    (or the All-day row when no start time is set).
--
-- 2. pride_volunteers admin INSERT / DELETE — the seed migration only
--    granted anon INSERT (consent-gated) plus admin SELECT/UPDATE, so
--    admins could neither add a volunteer by hand nor remove one. Add
--    is_admin()-gated INSERT and DELETE so /admin/pride/volunteers can
--    manage the roster directly. DELETE cascades to
--    pride_event_volunteers via its existing ON DELETE CASCADE FK.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. pride_events.time_confirmed + attendance category flags
-- ---------------------------------------------------------------------
alter table public.pride_events
  add column if not exists time_confirmed boolean not null default false,
  add column if not exists board_attending boolean not null default false,
  add column if not exists staff_attending boolean not null default false,
  add column if not exists ed_attending    boolean not null default false;

comment on column public.pride_events.time_confirmed is
  'False = event sits in the calendar "Tentative" strip above All-day. True = event drops into its time slot (or All-day if no start time).';
comment on column public.pride_events.board_attending is
  'A board member is attending this stop (Board attendance category).';
comment on column public.pride_events.staff_attending is
  'Staff is attending this stop (Staff attendance category).';
comment on column public.pride_events.ed_attending is
  'The Executive Director is attending this stop. Drives the /admin/pride/ED calendar.';

-- Republish the public view with the new column (appended at the end so
-- create-or-replace stays valid; clients read by name via select *).
create or replace view public.pride_events_public as
select
  id, slug, name, city, region, venue, address, lat, lng,
  event_date, start_time_utc, end_time_utc, event_type,
  organizer, organizer_url, description, notes,
  pac_priority, pac_attending, pac_role,
  registration_deadline, registration_url, registration_status,
  attendance_estimate, display_order, time_confirmed,
  board_attending, staff_attending, ed_attending
from public.pride_events
where is_public = true
order by event_date asc, display_order asc;

grant select on public.pride_events_public to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. pride_volunteers admin INSERT / DELETE
-- ---------------------------------------------------------------------
drop policy if exists "pride_volunteers_admin_insert" on public.pride_volunteers;
drop policy if exists "pride_volunteers_admin_delete" on public.pride_volunteers;

create policy "pride_volunteers_admin_insert"
  on public.pride_volunteers for insert
  to authenticated
  with check (public.is_admin());

create policy "pride_volunteers_admin_delete"
  on public.pride_volunteers for delete
  to authenticated
  using (public.is_admin());

-- Table-level privileges. RLS still gates rows: a non-admin authenticated
-- user only satisfies the consent-gated anon_insert policy, never the
-- admin policies above.
grant insert, delete on public.pride_volunteers to authenticated;
