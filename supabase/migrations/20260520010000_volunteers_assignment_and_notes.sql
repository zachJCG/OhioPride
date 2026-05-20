-- =====================================================================
-- 20260520010000_volunteers_assignment_and_notes.sql
--
-- Make /admin/volunteers actionable: any super_admin / volunteer_lead
-- can hand a volunteer record off to another admin user so that user
-- can be responsible for following up and editing the row. Also adds a
-- dedicated admin_notes field so internal follow-up notes are kept
-- separate from the volunteer's own additional_notes free text.
--
-- Pride signups already land in public.volunteers via the
-- trg_sync_pride_volunteer trigger (see
-- 20260519010000_pride_volunteer_sync.sql) with
-- referral_source='pride_signup', so the /admin/volunteers list
-- already includes every Pride submission; this migration only adds
-- the columns the admin UI now writes to.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. New columns
-- ---------------------------------------------------------------------
alter table public.volunteers
  add column if not exists assigned_to uuid
    references public.admin_users(id) on delete set null;

alter table public.volunteers
  add column if not exists admin_notes text;

create index if not exists idx_volunteers_assigned_to
  on public.volunteers (assigned_to);

comment on column public.volunteers.assigned_to is
  'Admin user who owns follow-up for this volunteer. References admin_users(id); cleared (set null) if the admin user is deleted.';
comment on column public.volunteers.admin_notes is
  'Internal staff notes about this volunteer. Separate from additional_notes which holds the volunteer''s own free text.';

-- ---------------------------------------------------------------------
-- 2. Tell PostgREST to refresh its schema cache so the running admin
--    page sees the new columns on the next request.
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';
