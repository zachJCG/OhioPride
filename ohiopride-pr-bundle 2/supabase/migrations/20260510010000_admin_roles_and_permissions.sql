-- =====================================================================
-- 20260510010000_admin_roles_and_permissions.sql
--
-- Admin roles, permissions, and dashboard preferences.
--
-- WHY:
--   The original admin allowlist (public.admin_emails) was binary: either
--   you were "admin" or you weren't. This migration introduces a role
--   model so /admin/* can be a real one-stop-shop for board members,
--   committee chairs, and trusted volunteers, with each role seeing only
--   the modules they own.
--
-- BACKWARDS COMPATIBLE:
--   - public.admin_emails is preserved unchanged.
--   - public.is_admin() now returns true for anyone in admin_emails OR
--     anyone with an active role assignment, so existing RLS policies on
--     volunteers / endorsement_applications / etc. keep working.
--   - Existing admin_emails rows get auto-promoted to 'super_admin'.
--
-- NEW SURFACES:
--   - public.admin_roles            (catalog of roles + label/order)
--   - public.role_permissions       (which modules each role can see/edit)
--   - public.admin_users            (one row per authorized human)
--   - public.admin_user_roles       (many-to-many, with assigned_by + on)
--   - public.admin_dashboard_prefs  (per-user widget layout + visibility)
--   - public.current_admin_user()   (returns the calling user's row)
--   - public.has_permission(text, text)
--   - public.is_admin()             (UPGRADED, see above)
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------------------------------------------------------------------
-- 1. Role catalog
-- ---------------------------------------------------------------------
create table if not exists public.admin_roles (
  slug         text primary key,
  label        text not null,
  description  text,
  sort_order   int  not null default 100,
  is_system    boolean not null default false,
  created_at   timestamptz not null default now()
);

insert into public.admin_roles (slug, label, description, sort_order, is_system) values
  ('super_admin',      'Super Admin',       'Director-level. Full read/write across every module, plus user + role management.', 10,  true),
  ('board_member',     'Board Member',      'Read access to every module. Write access to board communications and meeting notes.', 20,  true),
  ('treasurer',        'Treasurer',         'Full read/write on donors, founding members, and finance. Read on everything else.', 30,  true),
  ('endorsements_chair','Endorsements Chair','Full read/write on endorsement applications, screening, and decisions.', 40,  true),
  ('volunteer_lead',   'Volunteer Lead',    'Full read/write on volunteers and county captain assignments.', 50,  true),
  ('comms_lead',       'Comms Lead',        'Full read/write on news, statements, and outbound announcements.', 60,  true),
  ('legislative_lead', 'Legislative Lead',  'Full read/write on bills, scorecard, and legislator records.', 70,  true),
  ('volunteer',        'Volunteer',         'Read access to limited modules: their own profile, news, and upcoming actions.', 90,  true)
on conflict (slug) do update set
  label       = excluded.label,
  description = excluded.description,
  sort_order  = excluded.sort_order,
  is_system   = excluded.is_system;

-- ---------------------------------------------------------------------
-- 2. Permission catalog
-- ---------------------------------------------------------------------
create table if not exists public.role_permissions (
  role_slug text not null references public.admin_roles(slug) on delete cascade,
  module    text not null,
  action    text not null check (action in ('read','write','manage_users','admin')),
  primary key (role_slug, module, action)
);

-- super_admin: everything
insert into public.role_permissions (role_slug, module, action)
select 'super_admin', m, a
from unnest(array[
  'dashboard','volunteers','endorsements','donors','bills','legislators',
  'news','board','launch','users','settings'
]) m
cross join unnest(array['read','write','admin','manage_users']) a
on conflict do nothing;

-- board_member: read everywhere, write on board + news
insert into public.role_permissions (role_slug, module, action) values
  ('board_member','dashboard','read'),
  ('board_member','volunteers','read'),
  ('board_member','endorsements','read'),
  ('board_member','donors','read'),
  ('board_member','bills','read'),
  ('board_member','legislators','read'),
  ('board_member','news','read'),
  ('board_member','board','read'),
  ('board_member','board','write'),
  ('board_member','launch','read')
on conflict do nothing;

-- treasurer
insert into public.role_permissions (role_slug, module, action) values
  ('treasurer','dashboard','read'),
  ('treasurer','donors','read'),
  ('treasurer','donors','write'),
  ('treasurer','volunteers','read'),
  ('treasurer','endorsements','read'),
  ('treasurer','bills','read'),
  ('treasurer','news','read'),
  ('treasurer','board','read')
on conflict do nothing;

-- endorsements_chair
insert into public.role_permissions (role_slug, module, action) values
  ('endorsements_chair','dashboard','read'),
  ('endorsements_chair','endorsements','read'),
  ('endorsements_chair','endorsements','write'),
  ('endorsements_chair','volunteers','read'),
  ('endorsements_chair','bills','read'),
  ('endorsements_chair','legislators','read'),
  ('endorsements_chair','news','read')
on conflict do nothing;

-- volunteer_lead
insert into public.role_permissions (role_slug, module, action) values
  ('volunteer_lead','dashboard','read'),
  ('volunteer_lead','volunteers','read'),
  ('volunteer_lead','volunteers','write'),
  ('volunteer_lead','news','read'),
  ('volunteer_lead','launch','read')
on conflict do nothing;

-- comms_lead
insert into public.role_permissions (role_slug, module, action) values
  ('comms_lead','dashboard','read'),
  ('comms_lead','news','read'),
  ('comms_lead','news','write'),
  ('comms_lead','bills','read'),
  ('comms_lead','volunteers','read'),
  ('comms_lead','endorsements','read')
on conflict do nothing;

-- legislative_lead
insert into public.role_permissions (role_slug, module, action) values
  ('legislative_lead','dashboard','read'),
  ('legislative_lead','bills','read'),
  ('legislative_lead','bills','write'),
  ('legislative_lead','legislators','read'),
  ('legislative_lead','legislators','write'),
  ('legislative_lead','endorsements','read'),
  ('legislative_lead','news','read')
on conflict do nothing;

-- volunteer (lowest tier)
insert into public.role_permissions (role_slug, module, action) values
  ('volunteer','dashboard','read'),
  ('volunteer','news','read'),
  ('volunteer','launch','read')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 3. Admin users + role assignments
-- ---------------------------------------------------------------------
create table if not exists public.admin_users (
  id           uuid primary key default gen_random_uuid(),
  email        citext unique not null,
  full_name    text,
  title        text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  last_seen_at timestamptz,
  invited_by   citext,
  notes        text
);

create index if not exists idx_admin_users_active on public.admin_users (is_active) where is_active;

create table if not exists public.admin_user_roles (
  user_id      uuid not null references public.admin_users(id) on delete cascade,
  role_slug    text not null references public.admin_roles(slug) on delete cascade,
  assigned_at  timestamptz not null default now(),
  assigned_by  citext,
  primary key (user_id, role_slug)
);

-- Backfill: pull anyone already in admin_emails into admin_users as super_admin.
insert into public.admin_users (email, full_name, invited_by)
select ae.email,
       coalesce(initcap(split_part(ae.email,'@',1)), ae.email),
       coalesce(ae.added_by,'legacy_admin_emails')
from public.admin_emails ae
on conflict (email) do nothing;

insert into public.admin_user_roles (user_id, role_slug, assigned_by)
select au.id, 'super_admin', 'legacy_backfill'
from public.admin_users au
join public.admin_emails ae on lower(ae.email) = lower(au.email::text)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 4. Dashboard preferences (per user)
-- ---------------------------------------------------------------------
create table if not exists public.admin_dashboard_prefs (
  user_id    uuid primary key references public.admin_users(id) on delete cascade,
  layout     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. Helper functions
-- ---------------------------------------------------------------------
create or replace function public.current_admin_user()
returns public.admin_users
language sql
stable
security definer
set search_path = public
as $$
  select au.*
  from public.admin_users au
  where lower(au.email::text) = lower(coalesce(auth.jwt() ->> 'email',''))
    and au.is_active
  limit 1;
$$;

-- Upgrade is_admin to accept legacy admin_emails OR active admin_user.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.admin_emails ae
      where lower(ae.email) = lower(coalesce(auth.jwt() ->> 'email',''))
    )
    or exists (
      select 1
      from public.admin_users au
      where lower(au.email::text) = lower(coalesce(auth.jwt() ->> 'email',''))
        and au.is_active
    );
$$;

-- Permission check: does the current JWT have <module>/<action>?
create or replace function public.has_permission(p_module text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select au.id
    from public.admin_users au
    where lower(au.email::text) = lower(coalesce(auth.jwt() ->> 'email',''))
      and au.is_active
    limit 1
  )
  select
    exists (
      select 1 from public.admin_emails ae
      where lower(ae.email) = lower(coalesce(auth.jwt() ->> 'email',''))
    )
    or exists (
      select 1
      from me
      join public.admin_user_roles aur on aur.user_id = me.id
      where aur.role_slug = 'super_admin'
    )
    or exists (
      select 1
      from me
      join public.admin_user_roles aur on aur.user_id = me.id
      join public.role_permissions rp
        on rp.role_slug = aur.role_slug
       and rp.module    = p_module
       and rp.action    = p_action
    );
$$;

-- ---------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------
alter table public.admin_roles            enable row level security;
alter table public.role_permissions       enable row level security;
alter table public.admin_users            enable row level security;
alter table public.admin_user_roles       enable row level security;
alter table public.admin_dashboard_prefs  enable row level security;

drop policy if exists "admin can read admin_roles"           on public.admin_roles;
drop policy if exists "admin can read role_permissions"      on public.role_permissions;
drop policy if exists "admin can read admin_users"           on public.admin_users;
drop policy if exists "super_admin can write admin_users"    on public.admin_users;
drop policy if exists "admin can read admin_user_roles"      on public.admin_user_roles;
drop policy if exists "super_admin can write admin_user_roles" on public.admin_user_roles;
drop policy if exists "user can read/write own dashboard prefs" on public.admin_dashboard_prefs;

create policy "admin can read admin_roles"
  on public.admin_roles for select to authenticated
  using (public.is_admin());

create policy "admin can read role_permissions"
  on public.role_permissions for select to authenticated
  using (public.is_admin());

create policy "admin can read admin_users"
  on public.admin_users for select to authenticated
  using (public.is_admin());

create policy "super_admin can write admin_users"
  on public.admin_users for all to authenticated
  using (public.has_permission('users','manage_users'))
  with check (public.has_permission('users','manage_users'));

create policy "admin can read admin_user_roles"
  on public.admin_user_roles for select to authenticated
  using (public.is_admin());

create policy "super_admin can write admin_user_roles"
  on public.admin_user_roles for all to authenticated
  using (public.has_permission('users','manage_users'))
  with check (public.has_permission('users','manage_users'));

create policy "user can read/write own dashboard prefs"
  on public.admin_dashboard_prefs for all to authenticated
  using (
    user_id in (select id from public.current_admin_user())
  )
  with check (
    user_id in (select id from public.current_admin_user())
  );

-- ---------------------------------------------------------------------
-- 7. last_seen_at touch helper
-- ---------------------------------------------------------------------
create or replace function public.touch_admin_last_seen()
returns void
language sql
security definer
set search_path = public
as $$
  update public.admin_users
     set last_seen_at = now()
   where lower(email::text) = lower(coalesce(auth.jwt() ->> 'email',''));
$$;

grant execute on function public.touch_admin_last_seen()   to authenticated;
grant execute on function public.current_admin_user()      to authenticated;
grant execute on function public.has_permission(text,text) to authenticated;
