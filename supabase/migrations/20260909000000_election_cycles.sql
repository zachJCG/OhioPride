-- =============================================================================
-- Election cycles and deadline enforcement for endorsement applications
-- (2026-09-09)
-- -----------------------------------------------------------------------------
-- The endorsement application was an always-open form with no idea which
-- election it belonged to. This gives an application a cycle, gives a cycle an
-- application window, and enforces that window in the database so a closed
-- cycle cannot accept a submission.
--
-- Three things are worth reading before changing any of this:
--
--   1. `cycle_is_open()` is the ONLY definition of open. The public page, the
--      form, the admin, and the insert gate all reach it. Do not restate the
--      rule in JavaScript; read `is_open` from `public_election_cycles`.
--
--   2. The gate is a rewrite of the existing anon INSERT policy, not a second
--      policy beside it. Permissive policies are OR'd, so adding a new one
--      would have left the old, ungated policy as an open door.
--
--   3. The gate calls a SECURITY DEFINER helper rather than sub-selecting
--      `election_cycles` inline. An inline sub-select would be filtered by the
--      caller's own RLS, which makes every public submission depend on anon
--      keeping SELECT on the cycles table: tighten that read policy later and
--      applications start failing for a reason nobody would look for.
--
-- Rollback: docs/db/rollback/20260909000000_election_cycles_down.sql
-- APPLIED TO PRODUCTION 2026-09-09; see docs/db/CHANGES-2026-09-09.md.
-- =============================================================================

-- ── 1. Cycles ───────────────────────────────────────────────────────────────
create table if not exists public.election_cycles (
  id                      uuid primary key default gen_random_uuid(),
  slug                    text not null unique,
  label                   text not null,
  jurisdiction            text not null default 'Statewide',
  election_type           text not null check (election_type in ('primary', 'general', 'special', 'municipal')),
  election_date           date not null,

  -- Ohio board of elections dates. Informational: rendered, never enforced.
  filing_deadline         timestamptz,
  write_in_deadline       timestamptz,
  voter_reg_deadline      timestamptz,
  early_voting_start      date,

  -- The Ohio Pride application window. This is the part that is enforced.
  applications_open_at    timestamptz not null,
  applications_close_at   timestamptz not null,

  -- Board doctrine: no final endorsement action before the filing deadline.
  board_action_earliest   timestamptz,

  -- Three-state on purpose. Null means "use the dates"; true and false each
  -- override them, and either one has to say why.
  is_open_override        boolean,
  override_note           text,

  is_published            boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint election_cycles_window_valid
    check (applications_close_at > applications_open_at),
  constraint election_cycles_override_needs_note
    check (is_open_override is null or nullif(btrim(coalesce(override_note, '')), '') is not null)
);

comment on table public.election_cycles is
  'One row per election the PAC accepts endorsement applications for. applications_open_at / applications_close_at are the enforced window; the board of elections dates beside them are rendered for candidates and never gate anything.';
comment on column public.election_cycles.is_open_override is
  'Null uses the dates. True forces the cycle open, false forces it closed. Either non-null value requires override_note.';
comment on column public.election_cycles.board_action_earliest is
  'The earliest the Board takes final endorsement action, normally the Ohio filing deadline. Recorded for the minutes; not enforced.';

create index if not exists idx_election_cycles_date on public.election_cycles (election_date);
create index if not exists idx_election_cycles_open on public.election_cycles (is_published, applications_close_at);

create or replace function public.election_cycles_touch()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_election_cycles_touch on public.election_cycles;
create trigger trg_election_cycles_touch before update on public.election_cycles
  for each row execute function public.election_cycles_touch();

-- ── 2. The one definition of "open" ─────────────────────────────────────────
create or replace function public.cycle_is_open(c public.election_cycles)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    c.is_open_override,
    now() >= c.applications_open_at and now() < c.applications_close_at
  );
$$;

comment on function public.cycle_is_open(public.election_cycles) is
  'Whether a cycle accepts applications right now. The single source of truth: read it through public_election_cycles rather than recomputing the rule anywhere else.';

-- Enforcement wrapper. SECURITY DEFINER so the insert gate does not depend on
-- the submitting role being able to read election_cycles (see header note 3).
create or replace function public.cycle_accepts_applications(p_cycle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.election_cycles c
    where c.id = p_cycle_id
      and c.is_published
      and public.cycle_is_open(c)
  );
$$;

comment on function public.cycle_accepts_applications(uuid) is
  'True when the cycle exists, is published, and is open. Used by the anon INSERT policy on endorsement_applications. Returns only a boolean about already-public information.';

-- ── 3. Applications carry a cycle ───────────────────────────────────────────
alter table public.endorsement_applications
  add column if not exists cycle_id     uuid references public.election_cycles(id),
  add column if not exists submitted_at timestamptz,
  add column if not exists was_late     boolean not null default false;

comment on column public.endorsement_applications.was_late is
  'Set by staff when the Board accepts an application after its cycle closed, so the minutes show it. Public submissions cannot set it: the insert policy pins it to false.';
comment on column public.endorsement_applications.submitted_at is
  'When the application was submitted. Backfilled from created_at for rows that predate the column.';

update public.endorsement_applications
   set submitted_at = created_at
 where submitted_at is null;

alter table public.endorsement_applications
  alter column submitted_at set not null,
  alter column submitted_at set default now();

create index if not exists idx_endorsement_applications_cycle
  on public.endorsement_applications (cycle_id);

-- ── 4. Read surfaces ────────────────────────────────────────────────────────
-- Published cycles with the computed state, for the public page and the form.
-- override_note is deliberately absent: it records internal reasoning.
drop view if exists public.public_election_cycles;
create view public.public_election_cycles
with (security_invoker = on) as
select
  c.id,
  c.slug,
  c.label,
  c.jurisdiction,
  c.election_type,
  c.election_date,
  c.filing_deadline,
  c.write_in_deadline,
  c.voter_reg_deadline,
  c.early_voting_start,
  c.applications_open_at,
  c.applications_close_at,
  c.board_action_earliest,
  public.cycle_is_open(c) as is_open,
  (now() < c.applications_open_at) as is_upcoming
from public.election_cycles c
where c.is_published;

comment on view public.public_election_cycles is
  'Published cycles plus the computed is_open / is_upcoming. The public page and the application form read this; nothing recomputes the open rule client side.';

-- ── 5. RLS ──────────────────────────────────────────────────────────────────
alter table public.election_cycles enable row level security;

drop policy if exists "anyone can read published cycles" on public.election_cycles;
create policy "anyone can read published cycles" on public.election_cycles
  for select to anon, authenticated using (is_published);

drop policy if exists "admin can read all cycles" on public.election_cycles;
create policy "admin can read all cycles" on public.election_cycles
  for select to authenticated using (public.is_admin());

drop policy if exists "endorsements write can manage cycles" on public.election_cycles;
create policy "endorsements write can manage cycles" on public.election_cycles
  for update to authenticated
  using (public.has_permission('endorsements', 'write'))
  with check (public.has_permission('endorsements', 'write'));

drop policy if exists "service role manages cycles" on public.election_cycles;
create policy "service role manages cycles" on public.election_cycles
  for all to service_role using (true) with check (true);

grant select on public.election_cycles to anon, authenticated;
grant update on public.election_cycles to authenticated;
grant all on public.election_cycles to service_role;
grant select on public.public_election_cycles to anon, authenticated;

-- The gate. This REPLACES "anon can submit applications" rather than sitting
-- beside it: two permissive INSERT policies would be OR'd and the ungated one
-- would still let a closed cycle through.
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
    -- New: the application belongs to a published, currently open cycle, and
    -- cannot declare itself late.
    and cycle_id is not null
    and was_late = false
    and public.cycle_accepts_applications(cycle_id)
  );

-- ── 6. Admin read surface ───────────────────────────────────────────────────
-- Every cycle, published or not, carrying the SAME computed is_open the public
-- view and the insert policy use, plus the counts the admin list shows. It is
-- security_invoker, so the admin read policies on election_cycles and
-- endorsement_applications still decide who sees it.
drop view if exists public.admin_election_cycles;
create view public.admin_election_cycles
with (security_invoker = on) as
select
  c.id, c.slug, c.label, c.jurisdiction, c.election_type, c.election_date,
  c.filing_deadline, c.write_in_deadline, c.voter_reg_deadline, c.early_voting_start,
  c.applications_open_at, c.applications_close_at, c.board_action_earliest,
  c.is_open_override, c.override_note, c.is_published, c.created_at, c.updated_at,
  public.cycle_is_open(c)                as is_open,
  (now() < c.applications_open_at)       as is_upcoming,
  (select count(*) from public.endorsement_applications a where a.cycle_id = c.id)                 as application_count,
  (select count(*) from public.endorsement_applications a where a.cycle_id = c.id and a.was_late)  as late_count
from public.election_cycles c;

comment on view public.admin_election_cycles is
  'Every cycle, published or not, with the same computed is_open the public view and the insert policy use, plus application counts. security_invoker, so the admin read policies on election_cycles and endorsement_applications still apply.';

grant select on public.admin_election_cycles to authenticated;
