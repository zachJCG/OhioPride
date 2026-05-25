-- =====================================================================
-- 20260525000000_tasks_module.sql
--
-- Internal task tracking for the Ohio Pride team. Built into /admin as
-- a first-class module ("Tasks") that doubles as our work-breakdown
-- structure board: every line item has a WBS code, an owner, status,
-- priority, due date, and an audit/comment trail.
--
-- ADDS
--   - public.task_status         (enum)
--   - public.task_priority       (enum)
--   - public.tasks               (one row per task)
--   - public.task_comments       (discussion thread on a task)
--   - public.task_activity       (lightweight audit trail)
--   - role_permissions for the new `tasks` module
--   - small admin_users seed so the assignee picker isn't empty on a
--     fresh install (Zach is the only real auth account today)
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------
do $$ begin
  create type public.task_status as enum (
    'not_started','in_progress','blocked','in_review','done','cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.task_priority as enum ('low','normal','high','urgent');
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------
-- 2. tasks table
-- ---------------------------------------------------------------------
create table if not exists public.tasks (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  description     text,
  status          public.task_status   not null default 'not_started',
  priority        public.task_priority not null default 'normal',
  wbs_code        text,
  parent_task_id  uuid references public.tasks(id) on delete set null,
  assignee_id     uuid references public.admin_users(id) on delete set null,
  created_by      uuid references public.admin_users(id) on delete set null,
  start_date      date,
  due_date        date,
  estimated_hours numeric(6,1),
  tags            text[] not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create index if not exists idx_tasks_assignee   on public.tasks (assignee_id);
create index if not exists idx_tasks_status     on public.tasks (status);
create index if not exists idx_tasks_priority   on public.tasks (priority);
create index if not exists idx_tasks_parent     on public.tasks (parent_task_id);
create index if not exists idx_tasks_due_date   on public.tasks (due_date);
create index if not exists idx_tasks_wbs_code   on public.tasks (wbs_code);

-- Keep updated_at / completed_at in lockstep with status changes.
create or replace function public.tasks_touch_timestamps()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if new.status = 'done' and (old.status is distinct from 'done') then
      new.completed_at := now();
    elsif new.status <> 'done' then
      new.completed_at := null;
    end if;
  elsif tg_op = 'INSERT' then
    if new.status = 'done' and new.completed_at is null then
      new.completed_at := now();
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_tasks_touch_ts on public.tasks;
create trigger trg_tasks_touch_ts
  before insert or update on public.tasks
  for each row execute function public.tasks_touch_timestamps();

-- ---------------------------------------------------------------------
-- 3. task_comments
-- ---------------------------------------------------------------------
create table if not exists public.task_comments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  author_id   uuid references public.admin_users(id) on delete set null,
  body        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_task_comments_task on public.task_comments (task_id, created_at);

-- ---------------------------------------------------------------------
-- 4. task_activity (audit log)
--    Populated by the app (admin UI) on create / status change / assign.
--    We keep this manual rather than trigger-driven so the actor email
--    is always the human who clicked, not whatever JWT happened to be
--    in scope.
-- ---------------------------------------------------------------------
create table if not exists public.task_activity (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  actor_id    uuid references public.admin_users(id) on delete set null,
  action      text not null,                     -- created, status_change, assign, comment, edit
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_task_activity_task on public.task_activity (task_id, created_at desc);

-- ---------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------
alter table public.tasks         enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_activity enable row level security;

drop policy if exists "admin can read tasks"           on public.tasks;
drop policy if exists "tasks writers can write tasks"  on public.tasks;
drop policy if exists "admin can read task_comments"   on public.task_comments;
drop policy if exists "tasks writers can insert comments" on public.task_comments;
drop policy if exists "admin can read task_activity"   on public.task_activity;
drop policy if exists "tasks writers can insert activity" on public.task_activity;

create policy "admin can read tasks"
  on public.tasks for select to authenticated
  using (public.is_admin());

create policy "tasks writers can write tasks"
  on public.tasks for all to authenticated
  using (public.has_permission('tasks','write'))
  with check (public.has_permission('tasks','write'));

create policy "admin can read task_comments"
  on public.task_comments for select to authenticated
  using (public.is_admin());

create policy "tasks writers can insert comments"
  on public.task_comments for insert to authenticated
  with check (public.has_permission('tasks','write'));

create policy "admin can read task_activity"
  on public.task_activity for select to authenticated
  using (public.is_admin());

create policy "tasks writers can insert activity"
  on public.task_activity for insert to authenticated
  with check (public.has_permission('tasks','write'));

-- ---------------------------------------------------------------------
-- 6. Role permissions for the new module
-- ---------------------------------------------------------------------

-- super_admin: full
insert into public.role_permissions (role_slug, module, action)
select 'super_admin','tasks', a
from   unnest(array['read','write','admin','manage_users']) a
on conflict do nothing;

-- Board + leads: read/write
insert into public.role_permissions (role_slug, module, action)
select rs,'tasks', a
from   unnest(array[
         'board_member','treasurer','endorsements_chair',
         'volunteer_lead','comms_lead','legislative_lead'
       ]) rs
cross join unnest(array['read','write']) a
on conflict do nothing;

-- Volunteers: read-only so they can see what's on their plate
insert into public.role_permissions (role_slug, module, action)
values ('volunteer','tasks','read')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 7. Admin user seed
--
--    The user management module (newly built) reads from admin_users.
--    The legacy backfill migration only carries over rows from
--    admin_emails, so on a fresh install the assignee dropdown can
--    show as empty. Make sure the director's row exists and has full
--    metadata.
--
--    NOTE: this does NOT create Supabase Auth accounts. Inviting a new
--    user (and provisioning their auth login) happens through the
--    `/admin/users` UI, which calls the `admin-user-invite` Netlify
--    function with the service-role key.
-- ---------------------------------------------------------------------

insert into public.admin_users (email, full_name, title, is_active, invited_by)
values
  ('zach@ohiopride.org',          'Zachary R. Joseph', 'Director',         true, 'tasks_module_seed'),
  ('zach@josephcartergroup.com',  'Zachary R. Joseph', 'Director',         true, 'tasks_module_seed')
on conflict (email) do update set
  full_name = coalesce(public.admin_users.full_name, excluded.full_name),
  title     = coalesce(public.admin_users.title,     excluded.title),
  is_active = true;

insert into public.admin_user_roles (user_id, role_slug, assigned_by)
select au.id, 'super_admin', 'tasks_module_seed'
from   public.admin_users au
where  lower(au.email::text) in ('zach@ohiopride.org','zach@josephcartergroup.com')
on conflict do nothing;
