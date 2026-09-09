-- =============================================================================
-- ROLLBACK for 20260909000000_election_cycles.sql and its seed (2026-09-09)
-- -----------------------------------------------------------------------------
-- Run top to bottom. Order matters: the insert policy has to stop referring to
-- cycle_accepts_applications before the function can be dropped, and the views
-- have to go before cycle_is_open.
--
-- This DROPS the cycle each application belongs to. Nothing else reads
-- cycle_id, and election_year / is_special_election still carry the election on
-- every row, so the queue and the board packet are unaffected. If any
-- application has been accepted late, `was_late` is the only record of that and
-- it goes with the column: export it first if the minutes need it.
--
--   select a.id, a.candidate_name, c.slug, a.submitted_at, a.was_late
--     from public.endorsement_applications a
--     join public.election_cycles c on c.id = a.cycle_id
--    where a.was_late;
-- =============================================================================

-- 1. Put the ungated anon INSERT policy back exactly as it was before.
drop policy if exists "anon can submit applications" on public.endorsement_applications;
create policy "anon can submit applications" on public.endorsement_applications
  for insert to anon
  with check (
    status = 'submitted'
    and reviewer_notes is null
    and reviewed_by is null
    and reviewed_at is null
    and endorsed_at is null
    and (photo_path is null or photo_path like ('submissions/' || id::text || '/%'))
  );

-- 2. Read surfaces.
drop view if exists public.admin_election_cycles;
drop view if exists public.public_election_cycles;

-- 3. Application columns.
drop index if exists public.idx_endorsement_applications_cycle;
alter table public.endorsement_applications
  drop column if exists cycle_id,
  drop column if exists submitted_at,
  drop column if exists was_late;

-- 4. Functions. cycle_is_open takes the table's row type, so it can only go
--    after every view that calls it and before the table itself.
drop function if exists public.cycle_accepts_applications(uuid);
drop function if exists public.cycle_is_open(public.election_cycles);

-- 5. The table, its trigger, and the trigger function.
drop trigger if exists trg_election_cycles_touch on public.election_cycles;
drop table if exists public.election_cycles;
drop function if exists public.election_cycles_touch();
