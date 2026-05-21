-- =============================================================================
-- 20260521000000_scorecard_admin_schema.sql
-- -----------------------------------------------------------------------------
-- Wires up /admin/legislators against the production schema. Before this
-- migration, the admin page targeted tables that never landed in prod
-- (roll_calls, legislator_vote_exceptions, legislator_sponsorships,
-- compute_legislator_scorecard, publish_scorecard, publish_scorecard_all,
-- legislator_scorecard view, is_current/published_by on score_snapshots).
--
-- This migration is additive only — it does not touch the bill_votes /
-- legislator_votes / bill_sponsors model that already exists in prod. It
-- creates the missing tables alongside, keyed on the existing
-- public.legislators(id uuid) and public.bills(slug) primary keys, so a
-- single seed of editorial roll-call data can be edited and published from
-- /admin/legislators and read back by the public scorecard via the existing
-- /.netlify/functions/scorecard handler.
-- =============================================================================

-- ---------------------------------------------------------------------
-- 1. Add columns the admin page reads from public.bills
-- ---------------------------------------------------------------------
alter table public.bills
  add column if not exists label         text,
  add column if not exists ga            text,
  add column if not exists display_order integer not null default 100;

-- Backfill new columns from existing data.
update public.bills
   set label = coalesce(label, bill_number)
 where label is null;

update public.bills
   set ga = coalesce(ga,
                     case
                       when general_assembly is null then null
                       when general_assembly = 135   then '135th'
                       when general_assembly = 136   then '136th'
                       else general_assembly::text || 'th'
                     end)
 where ga is null;

-- ---------------------------------------------------------------------
-- 2. Add columns the admin page reads from public.legislators
-- ---------------------------------------------------------------------
alter table public.legislators
  add column if not exists statehouse_url       text,
  add column if not exists counties             text[] default '{}',
  add column if not exists headshot_url         text,
  add column if not exists notes                text,
  add column if not exists floor_subscore       integer not null default 0 check (floor_subscore between -5 and 5),
  add column if not exists committee_subscore   integer not null default 0 check (committee_subscore between -5 and 5),
  add column if not exists sponsorship_subscore integer not null default 0 check (sponsorship_subscore between -5 and 5);

-- ---------------------------------------------------------------------
-- 3. Add publish-state columns to score_snapshots
-- ---------------------------------------------------------------------
alter table public.score_snapshots
  add column if not exists is_current   boolean,
  add column if not exists published_by text;

update public.score_snapshots
   set is_current = true
 where is_current is null;

alter table public.score_snapshots
  alter column is_current set not null,
  alter column is_current set default true;

create index if not exists score_snapshots_is_current_idx
  on public.score_snapshots (legislator_id) where is_current;

-- Ensure only one current snapshot per legislator.
create unique index if not exists score_snapshots_one_current_per_leg_idx
  on public.score_snapshots (legislator_id) where is_current;

-- ---------------------------------------------------------------------
-- 4. roll_calls — one row per tracked legislative action
-- ---------------------------------------------------------------------
create table if not exists public.roll_calls (
  id              uuid        primary key default gen_random_uuid(),
  roll_call_slug  text        not null unique,
  bill_id         uuid        not null references public.bills(id) on delete cascade,
  bill_slug       text        not null,
  bill_label      text        not null,
  bill_title      text        not null,

  chamber         text        not null check (chamber in ('house','senate')),
  stage           text        not null check (stage in ('introduce','amend','committee','pass','concur','override')),
  label           text        not null,
  vote_date       date        not null,

  result          text        not null,
  yeas            integer     not null default 0 check (yeas >= 0),
  nays            integer     not null default 0 check (nays >= 0),

  stance          text        not null check (stance in ('pro','anti','mixed')),
  ga              text        not null,

  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists roll_calls_bill_slug_idx on public.roll_calls (bill_slug);
create index if not exists roll_calls_ga_chamber_idx on public.roll_calls (ga, chamber);
create index if not exists roll_calls_vote_date_idx on public.roll_calls (vote_date desc);

drop trigger if exists set_roll_calls_updated_at on public.roll_calls;
create trigger set_roll_calls_updated_at
  before update on public.roll_calls
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 5. legislator_vote_exceptions — party-line crossovers + recorded absences
-- ---------------------------------------------------------------------
create table if not exists public.legislator_vote_exceptions (
  id             uuid        primary key default gen_random_uuid(),
  roll_call_id   uuid        not null references public.roll_calls(id) on delete cascade,
  roll_call_slug text        not null,

  chamber        text        not null check (chamber in ('house','senate')),
  district       integer     not null check (district > 0),
  vote           text        not null check (vote in ('Y','N','NV','E')),

  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (chamber, district, roll_call_id)
);

create index if not exists legislator_vote_exceptions_member_idx
  on public.legislator_vote_exceptions (chamber, district);

drop trigger if exists set_legislator_vote_exceptions_updated_at on public.legislator_vote_exceptions;
create trigger set_legislator_vote_exceptions_updated_at
  before update on public.legislator_vote_exceptions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 6. legislator_sponsorships — primary/co sponsor attribution
--    Keyed to the production legislators.id (uuid) + bills.slug.
-- ---------------------------------------------------------------------
create table if not exists public.legislator_sponsorships (
  legislator_id uuid not null references public.legislators(id) on delete cascade,
  bill_slug     text not null references public.bills(slug)     on delete cascade on update cascade,
  role          text not null check (role in ('primary','co')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (legislator_id, bill_slug)
);

create index if not exists legislator_sponsorships_bill_slug_idx
  on public.legislator_sponsorships (bill_slug);

drop trigger if exists set_legislator_sponsorships_updated_at on public.legislator_sponsorships;
create trigger set_legislator_sponsorships_updated_at
  before update on public.legislator_sponsorships
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 7. Scoring helper functions
-- ---------------------------------------------------------------------
create or replace function public.has_permission(
  p_module text,
  p_action text
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin();
$$;

comment on function public.has_permission(text,text) is
  'Compatibility shim for the admin UI. Mirrors is_admin() until granular role-permission tables exist.';

grant execute on function public.has_permission(text,text) to authenticated, anon;

create or replace function public.event_weight(p_stage text)
returns numeric
language sql
immutable
as $$
  select case p_stage
    when 'override'   then 1.25
    when 'pass'       then 1.00
    when 'concur'     then 1.00
    when 'committee'  then 0.75
    when 'amend'      then 0.50
    when 'introduce'  then 0.25
    else 0
  end::numeric;
$$;

create or replace function public.resolve_legislator_vote(
  p_chamber text,
  p_district integer,
  p_party    text,
  p_roll_call_id uuid
) returns text
language plpgsql
stable
as $$
declare
  v_exc   text;
  v_stance text;
begin
  select e.vote into v_exc
    from public.legislator_vote_exceptions e
   where e.chamber = p_chamber
     and e.district = p_district
     and e.roll_call_id = p_roll_call_id;
  if v_exc is not null then
    return v_exc;
  end if;

  select stance into v_stance
    from public.roll_calls
   where id = p_roll_call_id;

  if v_stance = 'anti' then
    if p_party = 'R' then return 'Y';
    elsif p_party = 'D' then return 'N';
    else return 'NV';
    end if;
  elsif v_stance = 'pro' then
    if p_party = 'R' then return 'N';
    elsif p_party = 'D' then return 'Y';
    else return 'NV';
    end if;
  end if;
  return 'NV';
end;
$$;

-- ---------------------------------------------------------------------
-- 8. compute_legislator_scorecard(uuid) — live draft scorecard
-- ---------------------------------------------------------------------
create or replace function public.compute_legislator_scorecard(
  p_legislator_id uuid
) returns table (
  legislator_id           uuid,
  floor_score             numeric,
  committee_score         numeric,
  sponsorship_score       numeric,
  public_score            numeric,
  total_score             integer,
  grade                   text,
  floor_votes_counted     integer,
  committee_votes_counted integer,
  sponsorships_counted    integer,
  statements_counted      integer
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

  with resolved as (
    select rc.id, rc.stance, rc.stage,
           public.resolve_legislator_vote(v_chamber, v_district, v_party, rc.id) as v
      from public.roll_calls rc
     where rc.chamber = v_chamber
       and rc.stage in ('pass','concur','override')
  ),
  scored as (
    select case
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

  with resolved as (
    select rc.id, rc.stance, rc.stage,
           public.resolve_legislator_vote(v_chamber, v_district, v_party, rc.id) as v
      from public.roll_calls rc
     where rc.chamber = v_chamber
       and rc.stage = 'committee'
  ),
  scored as (
    select case
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

  with sigs as (
    select case
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

  v_floor := greatest(-5, least(5, round(v_floor)));
  v_cmte  := greatest(-5, least(5, round(v_cmte)));
  v_spon  := greatest(-5, least(5, round(v_spon)));

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
    0::numeric,
    v_total,
    v_grade,
    v_floor_n,
    v_cmte_n,
    v_spon_n,
    0;
end;
$$;

grant execute on function public.compute_legislator_scorecard(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 9. publish_scorecard(uuid) + publish_scorecard_all()
-- ---------------------------------------------------------------------
create or replace function public.publish_scorecard(
  p_legislator_id uuid
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
  if not public.has_permission('legislators','write') then
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
    published_by, is_current, snapshot_at
  )
  values (
    p_legislator_id, v_calc.floor_score, v_calc.committee_score, v_calc.sponsorship_score,
    v_calc.public_score, v_calc.total_score, v_calc.grade,
    v_calc.floor_votes_counted, v_calc.committee_votes_counted,
    v_calc.sponsorships_counted, v_calc.statements_counted,
    nullif(v_caller, ''), true, now()
  )
  returning * into v_row;

  update public.legislators
     set floor_subscore       = greatest(-5, least(5, round(v_calc.floor_score)::integer)),
         committee_subscore   = greatest(-5, least(5, round(v_calc.committee_score)::integer)),
         sponsorship_subscore = greatest(-5, least(5, round(v_calc.sponsorship_score)::integer)),
         updated_at           = now()
   where id = p_legislator_id;

  return v_row;
end;
$$;

grant execute on function public.publish_scorecard(uuid) to authenticated;

create or replace function public.publish_scorecard_all()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_count integer := 0;
begin
  if not public.has_permission('legislators','write') then
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

grant execute on function public.publish_scorecard_all() to authenticated;

-- ---------------------------------------------------------------------
-- 10. legislator_scorecard view (public read)
-- ---------------------------------------------------------------------
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
      s.total_score::integer,
      greatest(0, least(100,
        round(50 + (l.floor_subscore * 4) + (l.committee_subscore * 4) + (l.sponsorship_subscore * 2))
      ))::integer
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

grant select on public.legislator_scorecard to anon, authenticated;

-- ---------------------------------------------------------------------
-- 11. RLS — public read, admin write
-- ---------------------------------------------------------------------
alter table public.roll_calls                    enable row level security;
alter table public.legislator_vote_exceptions    enable row level security;
alter table public.legislator_sponsorships       enable row level security;

drop policy if exists "roll_calls public read" on public.roll_calls;
create policy "roll_calls public read"
  on public.roll_calls for select to anon, authenticated using (true);

drop policy if exists "roll_calls admin write" on public.roll_calls;
create policy "roll_calls admin write"
  on public.roll_calls for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "legislator_vote_exceptions public read" on public.legislator_vote_exceptions;
create policy "legislator_vote_exceptions public read"
  on public.legislator_vote_exceptions for select to anon, authenticated using (true);

drop policy if exists "legislator_vote_exceptions admin write" on public.legislator_vote_exceptions;
create policy "legislator_vote_exceptions admin write"
  on public.legislator_vote_exceptions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "legislator_sponsorships public read" on public.legislator_sponsorships;
create policy "legislator_sponsorships public read"
  on public.legislator_sponsorships for select to anon, authenticated using (true);

drop policy if exists "legislator_sponsorships admin write" on public.legislator_sponsorships;
create policy "legislator_sponsorships admin write"
  on public.legislator_sponsorships for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "score_snapshots admin write" on public.score_snapshots;
create policy "score_snapshots admin write"
  on public.score_snapshots for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- legislators table already has its own policies in prod; add admin-write
-- only if it isn't there yet.
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'legislators'
       and policyname = 'legislators admin write'
  ) then
    execute $p$
      create policy "legislators admin write"
        on public.legislators for all to authenticated
        using (public.is_admin()) with check (public.is_admin())
    $p$;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 12. Grants
-- ---------------------------------------------------------------------
grant select on public.roll_calls                    to anon, authenticated;
grant select on public.legislator_vote_exceptions    to anon, authenticated;
grant select on public.legislator_sponsorships       to anon, authenticated;
grant insert, update, delete on public.roll_calls                 to authenticated;
grant insert, update, delete on public.legislator_vote_exceptions to authenticated;
grant insert, update, delete on public.legislator_sponsorships    to authenticated;
grant insert, update, delete on public.score_snapshots            to authenticated;
