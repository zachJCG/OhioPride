-- =============================================================================
-- Election cycles v2: statewide containers, race levels, ballot paths
-- (2026-09-10)
-- -----------------------------------------------------------------------------
-- The v1 model (20260909000000) shipped cycles, an enforced application window,
-- and cycle_is_open(). This is the v2 work order's delta on top of it. Nothing
-- here re-litigates what v1 got right: cycle_is_open() is still the only
-- definition of open, and the anon INSERT policy still calls it.
--
-- What changes, and why:
--
--   1. A cycle is a STATEWIDE container, always. v1 gave election_cycles a
--      `jurisdiction` column and seeded a city-specific cycle into it. That was
--      the wrong axis: every contest in Ohio, statewide executive through school
--      board, hangs off the same three or four Secretary of State dates per
--      year. The column is dropped. Where a race happens is a fact about the
--      APPLICANT, so it moves to endorsement_applications.jurisdiction as free
--      text the candidate types.
--
--   2. `filing_deadline` becomes `petition_filing_deadline`, and
--      `independent_deadline` joins it. Ohio runs two different filing
--      deadlines: the party petition at 90 days before the election, and the
--      independent nominating petition the day before the primary. v1 stored
--      one column and seeded the independent date into it, so the 2026 general
--      showed May 4 as "the" filing deadline when the party deadline was
--      February 4. Two deadlines need two columns.
--
--   3. `early_review_close_at` is the first board review round for a cycle. It
--      is not a gate: the form stays open until applications_close_at. It
--      exists so the page can state a near-term date instead of one eleven
--      months out, and so the board can batch early filers.
--
--   4. `carries_forward_to` handles the races that never pass through a
--      primary. Nonpartisan contests hold no primary when the certified field
--      does not exceed the local threshold, and those candidates go straight to
--      the general. That is a pointer between cycles, not a separate cycle.
--
--   5. race_level and ballot_path. The race level drives descriptive-only
--      handling for judicial applications, which is board doctrine and must not
--      depend on a human remembering. The ballot path is informational: which
--      petition the candidate is filing tells the board which statutory
--      deadline governs them, and it is deliberately NOT used for enforcement,
--      because a candidate's own filing status is their business.
--
-- Deliberately not built (work order section 12): no per-race deadline
-- overrides, and no derivation of statutory dates from election_date. Ohio
-- moves deadlines for holidays under R.C. 1.14 and the arithmetic drifts. The
-- dates are seeded from the published calendar.
--
-- Rollback: docs/db/rollback/20260910000000_election_cycles_v2_down.sql
-- =============================================================================

-- ── 1. Race levels and ballot paths ─────────────────────────────────────────
do $$ begin
  create type public.race_level as enum (
    'statewide_executive',
    'us_congress',
    'general_assembly',
    'state_board_of_education',
    'judicial_appellate',
    'judicial_trial',
    'county',
    'municipal',
    'township',
    'school_board'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ballot_path as enum (
    'party_petition',
    'independent',
    'nonpartisan',
    'write_in'
  );
exception when duplicate_object then null; end $$;

-- Judicial candidates are not asked to pledge positions on matters that may
-- come before them. This is the machine-readable form of that doctrine, so a
-- downstream copy generator cannot get it wrong by forgetting.
create or replace function public.requires_descriptive_only(lvl public.race_level)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select lvl in ('judicial_appellate', 'judicial_trial');
$$;

comment on function public.requires_descriptive_only(public.race_level) is
  'True for the judicial race levels, which the Board reviews under its descriptive-only standard. The one definition; do not restate it in JavaScript.';

-- ── 2. Views come down before the columns they read ─────────────────────────
drop view if exists public.public_election_cycles;
drop view if exists public.admin_election_cycles;

-- ── 3. Cycles are statewide containers ──────────────────────────────────────
-- A city-specific cycle is retired rather than deleted: it carries a real
-- application and belongs in the record. Its application moves to the general
-- election it was always going to be decided at, and the December 4 round it
-- was created for survives as early_review_close_at on both 2027 cycles, which
-- is what was actually committed to those campaigns.
update public.endorsement_applications a
   set cycle_id = g.id
  from public.election_cycles old
  join public.election_cycles g on g.slug = '2027-general'
 where a.cycle_id = old.id
   and old.election_type = 'municipal';

update public.election_cycles
   set is_published   = false,
       is_open_override = false,
       override_note  = 'Retired 2026-09-10. Cycles are statewide containers keyed to Secretary of State dates; this one was scoped to a single municipality. Its applications moved to the 2027 general election and its review round became early_review_close_at on both 2027 cycles.'
 where election_type = 'municipal';

alter table public.election_cycles
  drop column if exists jurisdiction;

alter table public.election_cycles
  rename column filing_deadline to petition_filing_deadline;

alter table public.election_cycles
  add column if not exists independent_deadline  timestamptz,
  add column if not exists early_review_close_at timestamptz,
  add column if not exists carries_forward_to    uuid references public.election_cycles(id);

comment on column public.election_cycles.petition_filing_deadline is
  'Party petition (declaration of candidacy), 90 days before the election. Informational: rendered for candidates, never enforced.';
comment on column public.election_cycles.independent_deadline is
  'Independent nominating petition, the day before the primary election. Informational.';
comment on column public.election_cycles.early_review_close_at is
  'The first board review round for this cycle. Applies to every race in it equally. NOT a gate: the form stays open until applications_close_at.';
comment on column public.election_cycles.carries_forward_to is
  'The cycle a race rolls into when it holds no primary. Nonpartisan contests with a field at or under the local threshold go straight to the general.';

-- A retired municipal cycle keeps its row, so the type check is widened to
-- tolerate it while refusing any NEW municipal cycle: the three types in the
-- work order are the only ones a seed may use from here.
alter table public.election_cycles
  drop constraint if exists election_cycles_election_type_check;
alter table public.election_cycles
  add constraint election_cycles_election_type_check
  check (election_type in ('primary', 'general', 'special', 'municipal'));

-- A cycle cannot carry forward to itself, which would be a loop the page walks.
alter table public.election_cycles
  drop constraint if exists election_cycles_carry_forward_not_self;
alter table public.election_cycles
  add constraint election_cycles_carry_forward_not_self
  check (carries_forward_to is null or carries_forward_to <> id);

-- The early round, when set, has to sit inside the window it is a round of.
alter table public.election_cycles
  drop constraint if exists election_cycles_early_review_in_window;
alter table public.election_cycles
  add constraint election_cycles_early_review_in_window
  check (
    early_review_close_at is null
    or (early_review_close_at > applications_open_at
        and early_review_close_at <= applications_close_at)
  );

-- ── 4. Applications carry a race level, a ballot path, and a jurisdiction ───
alter table public.endorsement_applications
  add column if not exists race_level   public.race_level,
  add column if not exists ballot_path  public.ballot_path,
  add column if not exists jurisdiction text;

comment on column public.endorsement_applications.race_level is
  'Which level of race this is. Drives requires_descriptive_only() for judicial applications. Supplied by the applicant, prefilled from the office they picked.';
comment on column public.endorsement_applications.ballot_path is
  'Which petition the candidate is filing, so the Board knows which statutory deadline governs them. Informational only: never used to accept or refuse a submission.';
comment on column public.endorsement_applications.jurisdiction is
  'Where the race happens, in the applicant''s own words. Free text on purpose. Nothing is seeded into it and no place name is hardcoded anywhere that feeds it.';

create index if not exists idx_endorsement_applications_cycle_level
  on public.endorsement_applications (cycle_id, race_level);

-- The office catalog is where a race level can be decided without asking a
-- candidate to classify their own race twice, so it carries the mapping and
-- the form reads it as the prefill.
alter table public.endorsement_office_options
  add column if not exists race_level public.race_level;

comment on column public.endorsement_office_options.race_level is
  'The race level this office implies, used to prefill the application. Null where the office does not decide it and the applicant has to say.';

-- A computed column, so the admin queue can flag a judicial application
-- without a JavaScript copy of the rule drifting from the SQL one. PostgREST
-- exposes it as `descriptive_only` on a select.
create or replace function public.descriptive_only(a public.endorsement_applications)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select a.race_level is not null and public.requires_descriptive_only(a.race_level);
$$;

comment on function public.descriptive_only(public.endorsement_applications) is
  'Computed column: whether this application is reviewed under the descriptive-only standard. Select it as `descriptive_only`. One definition, in SQL, shared by every surface.';

-- ── 5. Read surfaces, rebuilt on the new columns ────────────────────────────
create view public.public_election_cycles
with (security_invoker = on) as
select
  c.id,
  c.slug,
  c.label,
  c.election_type,
  c.election_date,
  c.petition_filing_deadline,
  c.independent_deadline,
  c.write_in_deadline,
  c.voter_reg_deadline,
  c.early_voting_start,
  c.applications_open_at,
  c.early_review_close_at,
  c.applications_close_at,
  c.board_action_earliest,
  f.slug  as carries_forward_to_slug,
  f.label as carries_forward_to_label,
  public.cycle_is_open(c)          as is_open,
  (now() < c.applications_open_at) as is_upcoming
from public.election_cycles c
left join public.election_cycles f on f.id = c.carries_forward_to
where c.is_published;

comment on view public.public_election_cycles is
  'Published cycles plus the computed is_open / is_upcoming. The public page and the application form read this; nothing recomputes the open rule client side. override_note is deliberately absent: it records internal reasoning.';

create view public.admin_election_cycles
with (security_invoker = on) as
select
  c.id, c.slug, c.label, c.election_type, c.election_date,
  c.petition_filing_deadline, c.independent_deadline, c.write_in_deadline,
  c.voter_reg_deadline, c.early_voting_start,
  c.applications_open_at, c.early_review_close_at, c.applications_close_at,
  c.board_action_earliest, c.carries_forward_to,
  f.slug  as carries_forward_to_slug,
  f.label as carries_forward_to_label,
  c.is_open_override, c.override_note, c.is_published, c.created_at, c.updated_at,
  public.cycle_is_open(c)          as is_open,
  (now() < c.applications_open_at) as is_upcoming,
  (select count(*) from public.endorsement_applications a
    where a.cycle_id = c.id)                                          as application_count,
  (select count(*) from public.endorsement_applications a
    where a.cycle_id = c.id and a.was_late)                           as late_count,
  (select count(*) from public.endorsement_applications a
    where a.cycle_id = c.id
      and a.race_level is not null
      and public.requires_descriptive_only(a.race_level))             as judicial_count
from public.election_cycles c
left join public.election_cycles f on f.id = c.carries_forward_to;

comment on view public.admin_election_cycles is
  'Every cycle, published or not, with the same computed is_open the public view and the insert policy use, plus application counts. security_invoker, so the admin read policies still apply.';

grant select on public.public_election_cycles to anon, authenticated;
grant select on public.admin_election_cycles to authenticated;

-- ── 6. The insert gate, restated ────────────────────────────────────────────
-- Unchanged in substance from v1 and repeated here so the whole rule is
-- readable in one place after the column churn above. Still a REPLACEMENT of
-- the anon policy rather than a second one beside it: permissive policies are
-- OR'd, and a second policy would leave the ungated path open.
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
