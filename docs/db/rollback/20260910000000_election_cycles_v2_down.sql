-- =============================================================================
-- ROLLBACK: election cycles v2 (20260910000000 + 20260910000100)
-- -----------------------------------------------------------------------------
-- Returns the schema to the v1 shape from 20260909000000. Run top to bottom in
-- one transaction.
--
-- What this cannot restore, and what to do about it:
--
--   The retired municipal cycle's applications were moved to 2027-general and
--   the move is not recorded per row, so this script cannot put them back by
--   itself. As of 2026-09-10 that is exactly one row, and this puts it back:
--
--     update public.endorsement_applications
--        set cycle_id = '9ed99160-20ce-4629-8265-fb7d2efd017c'
--      where id = 'f35f48b7-c400-428e-ac4d-686be2022954';
--
--   If more have accumulated since, list the candidates on 2027-general and
--   re-point the municipal ones by hand:
--
--     select id, candidate_name, office_sought, jurisdiction, submitted_at
--       from public.endorsement_applications
--      where cycle_id = (select id from public.election_cycles
--                         where slug = '2027-general')
--      order by submitted_at;
--
--   race_level, ballot_path and jurisdiction values on applications are
--   dropped with their columns. Export them first if they matter:
--
--     copy (select id, race_level, ballot_path, jurisdiction
--             from public.endorsement_applications
--            where race_level is not null
--               or ballot_path is not null
--               or jurisdiction is not null) to stdout with csv header;
-- =============================================================================

begin;

-- ── Views come down before the columns they read ────────────────────────────
drop view if exists public.public_election_cycles;
drop view if exists public.admin_election_cycles;

-- ── Applications: back to the v1 column set ─────────────────────────────────
drop index if exists public.idx_endorsement_applications_cycle_level;

alter table public.endorsement_applications
  drop column if exists race_level,
  drop column if exists ballot_path,
  drop column if exists jurisdiction;

alter table public.endorsement_office_options
  drop column if exists race_level;

-- ── Cycles: back to the v1 column set ───────────────────────────────────────
alter table public.election_cycles
  drop constraint if exists election_cycles_early_review_in_window,
  drop constraint if exists election_cycles_carry_forward_not_self;

alter table public.election_cycles
  drop column if exists carries_forward_to,
  drop column if exists early_review_close_at,
  drop column if exists independent_deadline;

alter table public.election_cycles
  rename column petition_filing_deadline to filing_deadline;

alter table public.election_cycles
  add column if not exists jurisdiction text not null default 'Statewide';

-- The retired cycle is the only municipal one; it is the only row whose
-- jurisdiction was not 'Statewide'.
update public.election_cycles
   set jurisdiction     = 'Columbus',
       is_published     = true,
       is_open_override = null,
       override_note    = null
 where election_type = 'municipal';

-- ── Functions and types added by v2 ─────────────────────────────────────────
drop function if exists public.requires_descriptive_only(public.race_level);
drop type if exists public.race_level;
drop type if exists public.ballot_path;

-- ── Views, as v1 had them ───────────────────────────────────────────────────
create view public.public_election_cycles
with (security_invoker = on) as
select
  c.id, c.slug, c.label, c.jurisdiction, c.election_type, c.election_date,
  c.filing_deadline, c.write_in_deadline, c.voter_reg_deadline, c.early_voting_start,
  c.applications_open_at, c.applications_close_at, c.board_action_earliest,
  public.cycle_is_open(c)          as is_open,
  (now() < c.applications_open_at) as is_upcoming
from public.election_cycles c
where c.is_published;

create view public.admin_election_cycles
with (security_invoker = on) as
select
  c.id, c.slug, c.label, c.jurisdiction, c.election_type, c.election_date,
  c.filing_deadline, c.write_in_deadline, c.voter_reg_deadline, c.early_voting_start,
  c.applications_open_at, c.applications_close_at, c.board_action_earliest,
  c.is_open_override, c.override_note, c.is_published, c.created_at, c.updated_at,
  public.cycle_is_open(c)          as is_open,
  (now() < c.applications_open_at) as is_upcoming,
  (select count(*) from public.endorsement_applications a where a.cycle_id = c.id)                as application_count,
  (select count(*) from public.endorsement_applications a where a.cycle_id = c.id and a.was_late) as late_count
from public.election_cycles c;

grant select on public.public_election_cycles to anon, authenticated;
grant select on public.admin_election_cycles to authenticated;

-- ── The insert gate, as v1 had it (unchanged in substance) ──────────────────
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
    and cycle_id is not null
    and was_late = false
    and public.cycle_accepts_applications(cycle_id)
  );

commit;
