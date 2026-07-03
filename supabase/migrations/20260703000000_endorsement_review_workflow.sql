-- =====================================================================
-- Ohio Pride PAC — Endorsement Review Workflow (ATS for the board)
-- 2026-07-03
--
-- Turns the endorsement screening system into an applicant-tracking-style
-- workflow:
--   * A pipeline `stage` on each application (New -> Screening ->
--     Board Review -> Voting -> Endorsed / Declined / Tabled / Withdrawn),
--     kept in sync with the public-facing `status` so /endorsements keeps
--     working unchanged.
--   * `endorsement_reviews`     — one vote + recommendation per board member.
--   * `endorsement_assignments` — assign specific board members to an app.
--   * `endorsement_activity`    — an append-only progression timeline.
--
-- Permission model (uses the existing has_permission() / is_admin()):
--   * endorsements:read  (board_member, chair, director, ...) — read every
--     application, every vote, the timeline; cast / update THEIR OWN vote.
--   * endorsements:write (endorsements_chair, super_admin/director) — move
--     the stage, record the decision, assign reviewers, and "push" an
--     endorsement through regardless of the tally.
--
-- Idempotent: safe to re-run. Run the whole file in the Supabase SQL editor.
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------------------------------------------------------------------
-- 1. Pipeline + decision columns on the application
-- ---------------------------------------------------------------------
alter table public.endorsement_applications
  add column if not exists stage        text,
  add column if not exists decision     text,
  add column if not exists decided_at   timestamptz,
  add column if not exists decided_by   text,
  add column if not exists reviewed_by  text,          -- referenced by the admin UI audit trail
  add column if not exists reviewed_at  timestamptz,
  add column if not exists vote_deadline date;

-- Constrain the new enumerations (drop first so re-runs can widen them).
alter table public.endorsement_applications
  drop constraint if exists endorsement_applications_stage_check;
alter table public.endorsement_applications
  add  constraint endorsement_applications_stage_check
  check (stage is null or stage in
    ('new','screening','board_review','voting','endorsed','declined','tabled','withdrawn'));

alter table public.endorsement_applications
  drop constraint if exists endorsement_applications_decision_check;
alter table public.endorsement_applications
  add  constraint endorsement_applications_decision_check
  check (decision is null or decision in ('endorse','decline','no_action'));

-- Backfill stage from the legacy status for existing rows.
update public.endorsement_applications
   set stage = case status
                 when 'endorsed'     then 'endorsed'
                 when 'declined'     then 'declined'
                 when 'withdrawn'    then 'withdrawn'
                 when 'under_review' then 'board_review'
                 else 'new'
               end
 where stage is null;

alter table public.endorsement_applications
  alter column stage set default 'new';

create index if not exists idx_endorsement_stage on public.endorsement_applications(stage);

-- ---------------------------------------------------------------------
-- 2. Keep the public `status` derived from the internal `stage`.
--    /endorsements + public_endorsements key off status='endorsed', so a
--    stage change must always project down to a consistent status. This is
--    also a security backstop: the anon INSERT policy requires
--    status='submitted', and since the trigger derives status from stage,
--    an anonymous submitter can never self-advance to 'endorsed'.
-- ---------------------------------------------------------------------
create or replace function public.endorsement_sync_status()
returns trigger
language plpgsql
as $$
begin
  if new.stage is null then
    new.stage := 'new';
  end if;
  new.status := case new.stage
                  when 'new'          then 'submitted'
                  when 'screening'    then 'under_review'
                  when 'board_review' then 'under_review'
                  when 'voting'       then 'under_review'
                  when 'tabled'       then 'under_review'
                  when 'endorsed'     then 'endorsed'
                  when 'declined'     then 'declined'
                  when 'withdrawn'    then 'withdrawn'
                  else new.status
                end;
  return new;
end;
$$;

drop trigger if exists trg_endorsement_sync_status on public.endorsement_applications;
create trigger trg_endorsement_sync_status
  before insert or update on public.endorsement_applications
  for each row execute function public.endorsement_sync_status();

-- ---------------------------------------------------------------------
-- 3. Board votes / recommendations
-- ---------------------------------------------------------------------
create table if not exists public.endorsement_reviews (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.endorsement_applications(id) on delete cascade,
  reviewer_user_id uuid references public.admin_users(id) on delete set null,
  reviewer_email  citext not null,
  reviewer_name   text,
  vote            text not null
    check (vote in ('endorse','lean_endorse','neutral','lean_decline','decline','abstain','recuse')),
  recommendation  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (application_id, reviewer_email)
);

create index if not exists idx_endo_reviews_app on public.endorsement_reviews(application_id);

drop trigger if exists trg_endo_reviews_updated on public.endorsement_reviews;
create trigger trg_endo_reviews_updated
  before update on public.endorsement_reviews
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 4. Reviewer assignments (who is on the hook to weigh in)
-- ---------------------------------------------------------------------
create table if not exists public.endorsement_assignments (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.endorsement_applications(id) on delete cascade,
  assignee_user_id uuid references public.admin_users(id) on delete set null,
  assignee_email  citext not null,
  assignee_name   text,
  role_label      text,                       -- e.g. 'Lead reviewer', 'Committee'
  assigned_by     citext,
  assigned_at     timestamptz not null default now(),
  unique (application_id, assignee_email)
);

create index if not exists idx_endo_assign_app on public.endorsement_assignments(application_id);

-- ---------------------------------------------------------------------
-- 5. Progression timeline (append-only)
-- ---------------------------------------------------------------------
create table if not exists public.endorsement_activity (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.endorsement_applications(id) on delete cascade,
  actor_email     citext,
  actor_name      text,
  event_type      text not null
    check (event_type in
      ('stage_change','vote','assignment','unassignment','note','director_push','decision')),
  summary         text,
  detail          jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists idx_endo_activity_app
  on public.endorsement_activity(application_id, created_at desc);

-- ---------------------------------------------------------------------
-- 6. Row Level Security
-- ---------------------------------------------------------------------
alter table public.endorsement_reviews     enable row level security;
alter table public.endorsement_assignments enable row level security;
alter table public.endorsement_activity    enable row level security;

-- Helper: the caller's email, lowercased, as citext.
create or replace function public.jwt_email()
returns citext
language sql
stable
as $$
  select nullif(lower(coalesce(auth.jwt() ->> 'email','')), '')::citext;
$$;
grant execute on function public.jwt_email() to authenticated;

-- --- reviews -----------------------------------------------------------
drop policy if exists "endorsements read can view reviews"  on public.endorsement_reviews;
drop policy if exists "reviewer can manage own vote"        on public.endorsement_reviews;
drop policy if exists "endorsements write can manage reviews" on public.endorsement_reviews;

create policy "endorsements read can view reviews"
  on public.endorsement_reviews for select to authenticated
  using (public.has_permission('endorsements','read'));

-- A board member may create / change / retract THEIR OWN vote as long as
-- they can read the module. reviewer_email is pinned to their JWT email.
create policy "reviewer can manage own vote"
  on public.endorsement_reviews for all to authenticated
  using (
    public.has_permission('endorsements','read')
    and reviewer_email = public.jwt_email()
  )
  with check (
    public.has_permission('endorsements','read')
    and reviewer_email = public.jwt_email()
  );

-- The chair / director may manage any vote (e.g. clear a stale one).
create policy "endorsements write can manage reviews"
  on public.endorsement_reviews for all to authenticated
  using (public.has_permission('endorsements','write'))
  with check (public.has_permission('endorsements','write'));

-- --- assignments -------------------------------------------------------
drop policy if exists "endorsements read can view assignments"    on public.endorsement_assignments;
drop policy if exists "endorsements write can manage assignments"  on public.endorsement_assignments;

create policy "endorsements read can view assignments"
  on public.endorsement_assignments for select to authenticated
  using (public.has_permission('endorsements','read'));

create policy "endorsements write can manage assignments"
  on public.endorsement_assignments for all to authenticated
  using (public.has_permission('endorsements','write'))
  with check (public.has_permission('endorsements','write'));

-- --- activity ----------------------------------------------------------
drop policy if exists "endorsements read can view activity"    on public.endorsement_activity;
drop policy if exists "admin can log own activity"             on public.endorsement_activity;
drop policy if exists "endorsements write can manage activity" on public.endorsement_activity;

create policy "endorsements read can view activity"
  on public.endorsement_activity for select to authenticated
  using (public.has_permission('endorsements','read'));

-- Anyone who can read the module may append a timeline entry stamped with
-- their own email (votes, notes). Spoofing another actor is blocked.
create policy "admin can log own activity"
  on public.endorsement_activity for insert to authenticated
  with check (
    public.has_permission('endorsements','read')
    and (actor_email is null or actor_email = public.jwt_email())
  );

-- The chair / director may prune the timeline if needed.
create policy "endorsements write can manage activity"
  on public.endorsement_activity for all to authenticated
  using (public.has_permission('endorsements','write'))
  with check (public.has_permission('endorsements','write'));

-- ---------------------------------------------------------------------
-- 7. Tighten application writes to the decision-makers.
--    Previously any active admin (incl. a board_member) could UPDATE an
--    application. In the ATS model board members only *vote*; moving the
--    stage / recording the decision / pushing an endorsement is reserved
--    for endorsements:write (chair + director/super_admin).
-- ---------------------------------------------------------------------
drop policy if exists "admin can update applications" on public.endorsement_applications;
create policy "endorsements write can update applications"
  on public.endorsement_applications for update to authenticated
  using (public.has_permission('endorsements','write'))
  with check (public.has_permission('endorsements','write'));

-- Harden the anon submission policy: a public submitter stays at the very
-- front of the pipeline and cannot pre-set a decision.
drop policy if exists "anon can submit applications" on public.endorsement_applications;
create policy "anon can submit applications"
  on public.endorsement_applications for insert to anon
  with check (
    status = 'submitted'
    and coalesce(stage, 'new') = 'new'
    and decision is null
    and reviewer_notes is null
    and generated_pdf_path is null
  );

-- ---------------------------------------------------------------------
-- 8. Table privileges (RLS still governs which *rows* are visible).
-- ---------------------------------------------------------------------
grant select, insert, update, delete on public.endorsement_reviews     to authenticated;
grant select, insert, update, delete on public.endorsement_assignments to authenticated;
grant select, insert, update, delete on public.endorsement_activity    to authenticated;

-- =====================================================================
-- DONE.
-- =====================================================================
