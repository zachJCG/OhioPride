-- =============================================================================
-- 20260520020000_scorecard_publishing.sql
-- Reconciles /scorecard with /admin/legislators.
--
-- Before this migration:
--   * /admin/legislators read from public.score_snapshots, but that table
--     was never created. The grade/score column never populated.
--   * Editing a roll_call or exception had no recompute path. Public scorecard
--     numbers came from hand-entered floor/committee/sponsorship subscores
--     on public.legislators that nobody had wired up to the underlying votes.
--   * No admin write policies existed on roll_calls / vote exceptions /
--     sponsorships, so the admin UI could only ever read.
--
-- After this migration:
--   1. public.score_snapshots exists. Each row is one published version of a
--      legislator's scorecard. Most-recent snapshot per legislator is the
--      "live" number the public site shows.
--   2. public.compute_legislator_scorecard(text) returns the live computed
--      scorecard for one legislator, derived from the current roll_calls,
--      legislator_vote_exceptions, and legislator_sponsorships rows. This is
--      the draft (working-copy) score the admin UI surfaces.
--   3. public.publish_scorecard(text) snapshots one legislator's current
--      draft into score_snapshots. public.publish_scorecard_all() does the
--      same for every active legislator. Both write published_by from the
--      caller's JWT email and require legislators:write.
--   4. public.legislator_scorecard view prefers the newest score_snapshots
--      row when one exists, so /.netlify/functions/scorecard reflects only
--      published changes.
--   5. RLS: anyone with legislators:write (legislative_lead, super_admin)
--      can INSERT/UPDATE/DELETE on roll_calls, legislator_vote_exceptions,
--      legislator_sponsorships, legislators. Anon SELECT continues to work
--      via the existing public-read policies.
--
-- Idempotent.
-- =============================================================================


-- =============================================================================
-- 1. score_snapshots
-- -----------------------------------------------------------------------------
-- One row per (legislator, publish event). The newest row per legislator is
-- the published-live scorecard. Rows are immutable except for `is_current`,
-- which flips to false when a newer snapshot lands.
-- =============================================================================
create table if not exists public.score_snapshots (
  id                         uuid        primary key default gen_random_uuid(),
  legislator_id              text        not null references public.legislators(id) on delete cascade,

  -- Subscores, on the editorial -5..+5 scale used by /js/scorecard-data.js
  floor_score                numeric(5,2) not null default 0,
  committee_score            numeric(5,2) not null default 0,
  sponsorship_score          numeric(5,2) not null default 0,
  public_score               numeric(5,2) not null default 0,

  -- Final 0..100 composite and letter grade (matches calcGrade in JS)
  total_score                integer     not null,
  grade                      text        not null,

  -- Evidence counts for transparency
  floor_votes_counted        integer     not null default 0,
  committee_votes_counted    integer     not null default 0,
  sponsorships_counted       integer     not null default 0,
  statements_counted         integer     not null default 0,

  snapshot_at                timestamptz not null default now(),
  published_by               text,
  notes                      text,
  is_current                 boolean     not null default true
);

create index if not exists score_snapshots_legislator_idx
  on public.score_snapshots (legislator_id, snapshot_at desc);
create index if not exists score_snapshots_current_idx
  on public.score_snapshots (legislator_id) where is_current;


-- =============================================================================
-- 2. compute_legislator_scorecard(legislator_id) -> table
-- -----------------------------------------------------------------------------
-- Returns the live computed scorecard for one legislator, derived from the
-- current roll_calls + exceptions + sponsorships rows. This is what the
-- admin UI shows under "Draft" before publish.
--
-- Floor / committee subscores: clamp(round(weighted-net), -5, +5)
--   where weighted-net comes from public.legislator_voting_net() filtered
--   by stage. Floor = pass / concur / override stages. Committee = committee
--   stage. Introduce / amend are not surfaced as separate stages here.
--
-- Sponsorship subscore: primary +/-2, co +/-1, sign by bill stance.
--
-- Final composite mirrors the legislator_scorecard view:
--   score = clamp(0, 100, round(50 + (floor*4) + (committee*4) + (sponsor*2)))
-- =============================================================================
create or replace function public.compute_legislator_scorecard(
  p_legislator_id text
) returns table (
  legislator_id            text,
  floor_score              numeric,
  committee_score          numeric,
  sponsorship_score        numeric,
  public_score             numeric,
  total_score              integer,
  grade                    text,
  floor_votes_counted      integer,
  committee_votes_counted  integer,
  sponsorships_counted     integer,
  statements_counted       integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_chamber  text;
  v_district integer;
  v_party    text;
  v_floor    numeric := 0;
  v_cmte     numeric := 0;
  v_spon     numeric := 0;
  v_floor_n  integer := 0;
  v_cmte_n   integer := 0;
  v_spon_n   integer := 0;
  v_total    integer;
  v_grade    text;
begin
  select l.chamber, l.district, l.party
    into v_chamber, v_district, v_party
    from public.legislators l
   where l.id = p_legislator_id;

  if not found then
    return;
  end if;

  -- Floor votes: pass + concur + override stages
  with resolved as (
    select rc.id, rc.stance, rc.stage,
           public.resolve_legislator_vote(v_chamber, v_district, v_party, rc.id) as v
      from public.roll_calls rc
     where rc.chamber = v_chamber
       and rc.stage in ('pass', 'concur', 'override')
  ),
  scored as (
    select
      case
        when stance = 'anti' and v = 'N' then  1 * public.event_weight(stage)
        when stance = 'pro'  and v = 'Y' then  1 * public.event_weight(stage)
        when stance = 'anti' and v = 'Y' then -1 * public.event_weight(stage)
        when stance = 'pro'  and v = 'N' then -1 * public.event_weight(stage)
        else 0::numeric
      end as pts
    from resolved
    where v in ('Y','N')
  )
  select coalesce(sum(pts), 0), count(*)::integer
    into v_floor, v_floor_n
    from scored;

  -- Committee votes: committee stage only
  with resolved as (
    select rc.id, rc.stance, rc.stage,
           public.resolve_legislator_vote(v_chamber, v_district, v_party, rc.id) as v
      from public.roll_calls rc
     where rc.chamber = v_chamber
       and rc.stage = 'committee'
  ),
  scored as (
    select
      case
        when stance = 'anti' and v = 'N' then  1 * public.event_weight(stage)
        when stance = 'pro'  and v = 'Y' then  1 * public.event_weight(stage)
        when stance = 'anti' and v = 'Y' then -1 * public.event_weight(stage)
        when stance = 'pro'  and v = 'N' then -1 * public.event_weight(stage)
        else 0::numeric
      end as pts
    from resolved
    where v in ('Y','N')
  )
  select coalesce(sum(pts), 0), count(*)::integer
    into v_cmte, v_cmte_n
    from scored;

  -- Sponsorships: primary +/-2, co +/-1, signed by bill stance
  with sigs as (
    select
      case
        when b.stance = 'pro'  and ls.role = 'primary' then  2
        when b.stance = 'pro'  and ls.role = 'co'      then  1
        when b.stance = 'anti' and ls.role = 'primary' then -2
        when b.stance = 'anti' and ls.role = 'co'      then -1
        else 0
      end as pts
      from public.legislator_sponsorships ls
      join public.bills b on b.slug = ls.bill_slug
     where ls.legislator_id = p_legislator_id
  )
  select coalesce(sum(pts), 0)::numeric, count(*)::integer
    into v_spon, v_spon_n
    from sigs;

  -- Clamp subscores to the -5..+5 editorial scale
  v_floor := greatest(-5, least(5, round(v_floor)));
  v_cmte  := greatest(-5, least(5, round(v_cmte)));
  v_spon  := greatest(-5, least(5, round(v_spon)));

  -- Composite mirrors the legislator_scorecard view formula
  v_total := greatest(0, least(100,
    round(50 + (v_floor * 4) + (v_cmte * 4) + (v_spon * 2))::integer));

  v_grade := case
    when v_total >= 95 then 'A+'
    when v_total >= 88 then 'A'
    when v_total >= 78 then 'A-'
    when v_total >= 60 then 'B'
    when v_total >= 38 then 'C'
    when v_total >= 18 then 'D'
    else 'F'
  end;

  return query select
    p_legislator_id,
    v_floor,
    v_cmte,
    v_spon,
    0::numeric           as public_score,
    v_total,
    v_grade,
    v_floor_n,
    v_cmte_n,
    v_spon_n,
    0                    as statements_counted;
end;
$$;

comment on function public.compute_legislator_scorecard(text) is
  'Live computed scorecard for one legislator, derived from current roll_calls + exceptions + sponsorships. Same math as the legislator_scorecard view but reading evidence instead of stored subscores. Used by /admin/legislators to show the draft (unpublished) score.';

grant execute on function public.compute_legislator_scorecard(text) to authenticated;


-- =============================================================================
-- 3. publish_scorecard(legislator_id) / publish_scorecard_all()
-- -----------------------------------------------------------------------------
-- Capture the current computed scorecard as a published snapshot. Marks any
-- prior snapshots for that legislator as no longer current. Requires
-- legislators:write on the caller's JWT.
-- =============================================================================
create or replace function public.publish_scorecard(
  p_legislator_id text
) returns public.score_snapshots
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller text;
  v_calc   record;
  v_row    public.score_snapshots;
begin
  if not public.has_permission('legislators', 'write') then
    raise exception 'forbidden: legislators:write required to publish';
  end if;

  v_caller := lower(coalesce(auth.jwt() ->> 'email', ''));

  select * into v_calc
    from public.compute_legislator_scorecard(p_legislator_id);

  if not found then
    raise exception 'no such legislator: %', p_legislator_id;
  end if;

  update public.score_snapshots
     set is_current = false
   where legislator_id = p_legislator_id
     and is_current = true;

  insert into public.score_snapshots (
    legislator_id, floor_score, committee_score, sponsorship_score,
    public_score, total_score, grade,
    floor_votes_counted, committee_votes_counted,
    sponsorships_counted, statements_counted,
    published_by, is_current
  )
  values (
    p_legislator_id, v_calc.floor_score, v_calc.committee_score, v_calc.sponsorship_score,
    v_calc.public_score, v_calc.total_score, v_calc.grade,
    v_calc.floor_votes_counted, v_calc.committee_votes_counted,
    v_calc.sponsorships_counted, v_calc.statements_counted,
    nullif(v_caller, ''), true
  )
  returning * into v_row;

  -- Mirror published subscores back onto legislators so the
  -- legislator_scorecard view (which falls back to stored subscores
  -- for legislators without a snapshot) stays consistent.
  update public.legislators
     set floor_subscore       = greatest(-5, least(5, round(v_calc.floor_score)::integer)),
         committee_subscore   = greatest(-5, least(5, round(v_calc.committee_score)::integer)),
         sponsorship_subscore = greatest(-5, least(5, round(v_calc.sponsorship_score)::integer)),
         updated_at           = now()
   where id = p_legislator_id;

  return v_row;
end;
$$;

comment on function public.publish_scorecard(text) is
  'Snapshot the current computed scorecard for one legislator into score_snapshots. Marks previous snapshots as not-current. Requires legislators:write.';

grant execute on function public.publish_scorecard(text) to authenticated;


create or replace function public.publish_scorecard_all()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    text;
  v_count integer := 0;
begin
  if not public.has_permission('legislators', 'write') then
    raise exception 'forbidden: legislators:write required to publish';
  end if;

  for v_id in
    select id from public.legislators where is_active order by chamber, district
  loop
    perform public.publish_scorecard(v_id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.publish_scorecard_all() is
  'Publish a fresh snapshot for every active legislator. Returns the number of snapshots written. Requires legislators:write.';

grant execute on function public.publish_scorecard_all() to authenticated;


-- =============================================================================
-- 4. Update legislator_scorecard view to prefer the current snapshot
-- -----------------------------------------------------------------------------
-- The public scorecard reads this view via /.netlify/functions/scorecard.
-- When a legislator has a current snapshot we surface its numbers; otherwise
-- we fall back to the stored editorial subscores on public.legislators so
-- pre-existing data keeps showing up.
--
-- We DROP and recreate (rather than CREATE OR REPLACE) because we're adding
-- a new column (published_at). CREATE OR REPLACE forbids inserting columns
-- into the middle of the column list.
-- =============================================================================
drop view if exists public.legislator_scorecard;
create view public.legislator_scorecard as
select
    l.id                                                                  as legislator_id,
    l.full_name,
    l.chamber,
    l.district,
    l.party,
    l.counties,
    l.headshot_url,
    coalesce(s.floor_score,       l.floor_subscore)::numeric              as floor_subscore,
    coalesce(s.committee_score,   l.committee_subscore)::numeric          as committee_subscore,
    coalesce(s.sponsorship_score, l.sponsorship_subscore)::numeric        as sponsorship_subscore,
    coalesce(
      s.total_score,
      greatest(
        0,
        least(
          100,
          round(50
            + (l.floor_subscore       * 4)
            + (l.committee_subscore   * 4)
            + (l.sponsorship_subscore * 2)
          )
        )
      )::integer
    )                                                                     as composite_score,
    coalesce(
      s.grade,
      case
        when greatest(0, least(100, round(50 + (l.floor_subscore * 4) + (l.committee_subscore * 4) + (l.sponsorship_subscore * 2)))) >= 95 then 'A+'
        when greatest(0, least(100, round(50 + (l.floor_subscore * 4) + (l.committee_subscore * 4) + (l.sponsorship_subscore * 2)))) >= 88 then 'A'
        when greatest(0, least(100, round(50 + (l.floor_subscore * 4) + (l.committee_subscore * 4) + (l.sponsorship_subscore * 2)))) >= 78 then 'A-'
        when greatest(0, least(100, round(50 + (l.floor_subscore * 4) + (l.committee_subscore * 4) + (l.sponsorship_subscore * 2)))) >= 60 then 'B'
        when greatest(0, least(100, round(50 + (l.floor_subscore * 4) + (l.committee_subscore * 4) + (l.sponsorship_subscore * 2)))) >= 38 then 'C'
        when greatest(0, least(100, round(50 + (l.floor_subscore * 4) + (l.committee_subscore * 4) + (l.sponsorship_subscore * 2)))) >= 18 then 'D'
        else 'F'
      end
    )                                                                     as grade,
    s.snapshot_at                                                         as published_at,
    l.notes
from public.legislators l
left join public.score_snapshots s
  on s.legislator_id = l.id
 and s.is_current
where l.is_active;


-- =============================================================================
-- 5. RLS: admin writes on the editorial tables
-- -----------------------------------------------------------------------------
-- Anyone with legislators:write (legislative_lead or super_admin) can edit
-- the raw evidence. The existing anon SELECT policies are untouched.
-- score_snapshots is admin-write, public-read because the public scorecard
-- needs to see published rows.
-- =============================================================================
alter table public.score_snapshots enable row level security;

drop policy if exists "score_snapshots public read" on public.score_snapshots;
create policy "score_snapshots public read"
  on public.score_snapshots
  for select
  to anon, authenticated
  using (true);

drop policy if exists "score_snapshots admin write" on public.score_snapshots;
create policy "score_snapshots admin write"
  on public.score_snapshots
  for all
  to authenticated
  using (public.has_permission('legislators', 'write'))
  with check (public.has_permission('legislators', 'write'));

drop policy if exists "roll_calls admin write" on public.roll_calls;
create policy "roll_calls admin write"
  on public.roll_calls
  for all
  to authenticated
  using (public.has_permission('legislators', 'write'))
  with check (public.has_permission('legislators', 'write'));

drop policy if exists "legislator_vote_exceptions admin write" on public.legislator_vote_exceptions;
create policy "legislator_vote_exceptions admin write"
  on public.legislator_vote_exceptions
  for all
  to authenticated
  using (public.has_permission('legislators', 'write'))
  with check (public.has_permission('legislators', 'write'));

drop policy if exists "legislator_sponsorships admin write" on public.legislator_sponsorships;
create policy "legislator_sponsorships admin write"
  on public.legislator_sponsorships
  for all
  to authenticated
  using (public.has_permission('legislators', 'write'))
  with check (public.has_permission('legislators', 'write'));

drop policy if exists "legislators admin write" on public.legislators;
create policy "legislators admin write"
  on public.legislators
  for all
  to authenticated
  using (public.has_permission('legislators', 'write'))
  with check (public.has_permission('legislators', 'write'));

drop policy if exists "bills admin write" on public.bills;
create policy "bills admin write"
  on public.bills
  for all
  to authenticated
  using (public.has_permission('bills', 'write'))
  with check (public.has_permission('bills', 'write'));


-- =============================================================================
-- 6. Grants
-- =============================================================================
grant select on public.score_snapshots to anon, authenticated;
grant insert, update, delete on public.score_snapshots         to authenticated;
grant insert, update, delete on public.roll_calls              to authenticated;
grant insert, update, delete on public.legislator_vote_exceptions to authenticated;
grant insert, update, delete on public.legislator_sponsorships to authenticated;
grant insert, update, delete on public.legislators             to authenticated;
grant insert, update, delete on public.bills                   to authenticated;
