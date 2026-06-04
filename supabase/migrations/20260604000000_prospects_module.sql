-- =====================================================================
-- 20260604000000_prospects_module.sql
--
-- Donor pipeline ("Prospects") backend.
--
-- WHY:
--   /admin/prospects/ was shipped (commit e5d6494) against a Supabase
--   backend that was assumed to already exist but never actually got a
--   migration. The page gate passes for the director, then every data
--   read fails because the tables/views/RPCs are missing, so the page
--   shows "Could not load prospects." This migration creates the whole
--   surface the page (and scripts/import_prospects.py) depend on:
--
--   - public.prospects                  (one row per cultivated contact)
--   - public.prospect_activities        (timeline: notes/calls/stage moves)
--   - public.prospects_pipeline         (view the list + drawer read)
--   - public.prospects_pipeline_summary (view the stage chips read)
--   - public.prospect_set_stage(uuid,text)  (atomic, auto-logged move)
--   - RLS + role_permissions for the `prospects` module
--   - founding_members -> prospects sync (secured donors mirror in)
--
-- DESIGN NOTES:
--   - Secured rows are owned by Founding Members: a trigger mirrors each
--     founding_members row into a prospect (stage 'secured', source
--     'founding_member') and keeps identity in lockstep. The page renders
--     identity + secured gift read-only for those rows; everything else
--     (stage, owner, tasks, tags, activity) stays CRM-owned.
--   - The two read views use security_invoker so the prospects RLS (and
--     the existing founding_members / admin_users read policies) apply to
--     the calling admin.
--   - Access mirrors the spec: board members, the treasurer, and admins.
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------------------------------------------------------------------
-- 1. prospects
-- ---------------------------------------------------------------------
create table if not exists public.prospects (
  id                     uuid primary key default gen_random_uuid(),

  -- Identity (for secured rows these are mirrored from founding_members)
  full_name              text not null,
  first_name             text,
  last_name              text,
  email                  citext,
  phone                  text,
  city                   text,
  county                 text,
  state                  text default 'OH',
  zip                    text,
  employer               text,
  occupation             text,

  -- Pipeline
  stage                  text not null default 'identified'
                           check (stage in ('identified','qualified','cultivating','ask_made',
                                            'committed','secured','stewardship','lapsed','declined')),
  status                 text not null default 'active'
                           check (status in ('active','on_hold','archived')),
  priority               text not null default 'medium'
                           check (priority in ('high','medium','low')),
  source                 text not null default 'manual'
                           check (source in ('manual','founding_member','donor','volunteer',
                                             'event','referral','website','import','other')),
  owner_id               uuid references public.admin_users(id) on delete set null,
  tags                   text[] not null default '{}',
  do_not_contact         boolean not null default false,

  -- Workflow
  next_action            text,
  next_action_date       date,
  notes                  text,

  -- Money (cents)
  ask_target_cents       integer,
  committed_amount_cents integer,

  -- Links to the systems of record
  founding_member_id     uuid references public.founding_members(id) on delete set null,
  donor_id               uuid,   -- optional mirror from public.donors (no FK; donors is compliance-owned)

  -- Rollups (maintained by trigger from prospect_activities)
  last_contacted_at      timestamptz,
  last_activity_at       timestamptz,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- One prospect per founding member; one per donor mirror.
create unique index if not exists uq_prospects_founding_member
  on public.prospects (founding_member_id) where founding_member_id is not null;
create unique index if not exists uq_prospects_donor
  on public.prospects (donor_id) where donor_id is not null;

-- Dedup net-new contacts by email, but never block the secured/fm mirror
-- (two founding members may legitimately share a household email).
create unique index if not exists uq_prospects_email_unlinked
  on public.prospects (email) where email is not null and founding_member_id is null;

create index if not exists idx_prospects_owner       on public.prospects (owner_id);
create index if not exists idx_prospects_stage       on public.prospects (stage);
create index if not exists idx_prospects_status      on public.prospects (status);
create index if not exists idx_prospects_source      on public.prospects (source);
create index if not exists idx_prospects_county      on public.prospects (county);
create index if not exists idx_prospects_priority    on public.prospects (priority);
create index if not exists idx_prospects_next_action on public.prospects (next_action_date);
create index if not exists idx_prospects_last_act    on public.prospects (last_activity_at desc);

create or replace function public.prospects_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_prospects_touch_updated on public.prospects;
create trigger trg_prospects_touch_updated
  before update on public.prospects
  for each row execute function public.prospects_touch_updated_at();

-- ---------------------------------------------------------------------
-- 2. prospect_activities
-- ---------------------------------------------------------------------
create table if not exists public.prospect_activities (
  id            uuid primary key default gen_random_uuid(),
  prospect_id   uuid not null references public.prospects(id) on delete cascade,
  activity_type text not null
                  check (activity_type in ('note','call','email','text','meeting','event',
                                           'ask','pledge','gift','stage_change','system')),
  subject       text,
  body          text,
  occurred_at   timestamptz not null default now(),
  actor_id      uuid references public.admin_users(id) on delete set null,
  actor_email   text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_prospect_activities_prospect
  on public.prospect_activities (prospect_id, occurred_at desc);

-- Stamp the acting admin from the JWT when the app doesn't pass one.
create or replace function public.prospect_activities_set_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.admin_users;
begin
  if new.actor_id is null or new.actor_email is null then
    v := public.current_admin_user();
    if new.actor_id is null    then new.actor_id    := v.id; end if;
    if new.actor_email is null then new.actor_email := v.email::text; end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_prospect_activities_actor on public.prospect_activities;
create trigger trg_prospect_activities_actor
  before insert on public.prospect_activities
  for each row execute function public.prospect_activities_set_actor();

-- Roll an activity up into the prospect's last_activity_at / last_contacted_at.
create or replace function public.prospect_activities_rollup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.prospects p
     set last_activity_at  = greatest(coalesce(p.last_activity_at, new.occurred_at), new.occurred_at),
         last_contacted_at = case
           when new.activity_type in ('call','email','text','meeting','event')
             then greatest(coalesce(p.last_contacted_at, new.occurred_at), new.occurred_at)
           else p.last_contacted_at
         end,
         updated_at = now()
   where p.id = new.prospect_id;
  return new;
end $$;

drop trigger if exists trg_prospect_activities_rollup on public.prospect_activities;
create trigger trg_prospect_activities_rollup
  after insert on public.prospect_activities
  for each row execute function public.prospect_activities_rollup();

-- ---------------------------------------------------------------------
-- 3. prospect_set_stage  (atomic move + auto-logged activity)
-- ---------------------------------------------------------------------
create or replace function public.prospect_set_stage(p_prospect_id uuid, p_stage text)
returns public.prospects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old  text;
  v_row  public.prospects;
begin
  if not public.has_permission('prospects','write') then
    raise exception 'not authorized to change prospect stage'
      using errcode = '42501';
  end if;

  if p_stage not in ('identified','qualified','cultivating','ask_made',
                     'committed','secured','stewardship','lapsed','declined') then
    raise exception 'invalid stage %', p_stage using errcode = '22023';
  end if;

  select stage into v_old from public.prospects where id = p_prospect_id;
  if not found then
    raise exception 'prospect % not found', p_prospect_id using errcode = 'P0002';
  end if;

  update public.prospects
     set stage = p_stage, updated_at = now()
   where id = p_prospect_id
  returning * into v_row;

  if v_old is distinct from p_stage then
    insert into public.prospect_activities (prospect_id, activity_type, subject, body, occurred_at)
    values (p_prospect_id, 'stage_change',
            'Stage → ' || initcap(replace(p_stage, '_', ' ')),
            'Moved from ' || coalesce(v_old, '?') || ' to ' || p_stage,
            now());
  end if;

  return v_row;
end $$;

-- ---------------------------------------------------------------------
-- 4. Founding members -> prospects sync (secured donors mirror in)
-- ---------------------------------------------------------------------
create or replace function public.prospect_sync_founding_member(p_fm_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fm    public.founding_members;
  v_id  uuid;
begin
  select * into fm from public.founding_members where id = p_fm_id;
  if not found then
    return;
  end if;

  -- Already linked?
  select id into v_id from public.prospects where founding_member_id = fm.id;

  -- Otherwise adopt an existing, unlinked contact with the same email.
  if v_id is null and fm.email is not null then
    select id into v_id
      from public.prospects
     where founding_member_id is null
       and email is not null
       and email = fm.email
     limit 1;
  end if;

  if v_id is not null then
    update public.prospects
       set founding_member_id = fm.id,
           full_name          = coalesce(fm.full_name, full_name),
           email              = coalesce(fm.email, email),
           city               = coalesce(fm.city, city),
           county             = coalesce(fm.county, county),
           state              = coalesce(fm.state, state),
           -- secured is the floor for a confirmed donor, but never override
           -- an explicit later stage (stewardship) or a declined flag.
           stage              = case
                                  when stage in ('stewardship','declined') then stage
                                  else 'secured'
                                end,
           source             = case when source in ('manual','import') then 'founding_member' else source end,
           status             = 'active',
           updated_at         = now()
     where id = v_id;
  else
    insert into public.prospects
      (founding_member_id, full_name, email, city, county, state, stage, source, status)
    values
      (fm.id, fm.full_name, fm.email, fm.city, fm.county, fm.state,
       'secured', 'founding_member', 'active');
  end if;
end $$;

create or replace function public.prospects_fm_sync_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.prospect_sync_founding_member(new.id);
  return new;
end $$;

drop trigger if exists trg_founding_members_to_prospects on public.founding_members;
create trigger trg_founding_members_to_prospects
  after insert or update on public.founding_members
  for each row execute function public.prospects_fm_sync_trigger();

-- ---------------------------------------------------------------------
-- 5. Read views
-- ---------------------------------------------------------------------
drop view if exists public.prospects_pipeline_summary;
drop view if exists public.prospects_pipeline;

create view public.prospects_pipeline
with (security_invoker = true) as
select
  p.id,
  p.full_name,
  p.first_name,
  p.last_name,
  p.email,
  p.phone,
  p.city,
  p.county,
  p.state,
  p.zip,
  p.employer,
  p.occupation,
  p.stage,
  p.status,
  p.priority,
  p.source,
  p.owner_id,
  coalesce(au.full_name, au.email::text)            as owner_name,
  p.tags,
  p.do_not_contact,
  p.next_action,
  p.next_action_date,
  p.notes,
  p.ask_target_cents,
  p.committed_amount_cents,
  p.founding_member_id,
  fm.founding_number,
  fm.amount_cents                                   as secured_amount_cents,
  fm.recurrence                                     as secured_recurrence,
  fm.contributed_at                                 as secured_at,
  p.last_contacted_at,
  p.last_activity_at,
  p.created_at,
  p.updated_at
from public.prospects p
left join public.admin_users     au on au.id = p.owner_id
left join public.founding_members fm on fm.id = p.founding_member_id;

create view public.prospects_pipeline_summary
with (security_invoker = true) as
select
  stage,
  count(*)::int                                          as prospect_count,
  coalesce(sum(committed_amount_cents), 0)::bigint       as committed_cents,
  coalesce(sum(secured_amount_cents), 0)::bigint         as secured_cents
from public.prospects_pipeline
group by stage;

-- ---------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------
alter table public.prospects          enable row level security;
alter table public.prospect_activities enable row level security;

drop policy if exists "prospects readers can read"        on public.prospects;
drop policy if exists "prospects writers can write"       on public.prospects;
drop policy if exists "prospect activities readers read"  on public.prospect_activities;
drop policy if exists "prospect activities writers write" on public.prospect_activities;

create policy "prospects readers can read"
  on public.prospects for select to authenticated
  using (public.has_permission('prospects','read'));

create policy "prospects writers can write"
  on public.prospects for all to authenticated
  using (public.has_permission('prospects','write'))
  with check (public.has_permission('prospects','write'));

create policy "prospect activities readers read"
  on public.prospect_activities for select to authenticated
  using (public.has_permission('prospects','read'));

create policy "prospect activities writers write"
  on public.prospect_activities for all to authenticated
  using (public.has_permission('prospects','write'))
  with check (public.has_permission('prospects','write'));

-- ---------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------
grant select on public.prospects_pipeline         to authenticated;
grant select on public.prospects_pipeline_summary to authenticated;

-- prospect_set_stage is the one RPC the app calls; restrict it to signed-in
-- admins (it re-checks has_permission internally). Everything else is
-- trigger- or migration-only and must NOT be reachable as a PostgREST RPC.
revoke execute on function public.prospect_set_stage(uuid, text)            from public, anon;
grant  execute on function public.prospect_set_stage(uuid, text)            to authenticated;
revoke execute on function public.prospect_sync_founding_member(uuid)       from public, anon, authenticated;
revoke execute on function public.prospect_activities_set_actor()           from public, anon, authenticated;
revoke execute on function public.prospect_activities_rollup()              from public, anon, authenticated;
revoke execute on function public.prospects_fm_sync_trigger()               from public, anon, authenticated;
revoke execute on function public.prospects_touch_updated_at()              from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 8. Role permissions for the new module (spec: board, treasurer, admins)
-- ---------------------------------------------------------------------
insert into public.role_permissions (role_slug, module, action)
select 'super_admin','prospects', a
from   unnest(array['read','write','admin','manage_users']) a
on conflict do nothing;

insert into public.role_permissions (role_slug, module, action)
select rs,'prospects', a
from   unnest(array['board_member','treasurer']) rs
cross join unnest(array['read','write']) a
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 9. Backfill: mirror every existing founding member into the pipeline.
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select id from public.founding_members loop
    perform public.prospect_sync_founding_member(r.id);
  end loop;
end $$;
