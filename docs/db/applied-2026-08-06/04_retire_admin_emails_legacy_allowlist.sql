-- ALREADY APPLIED to the live Supabase project (dkdxefzhttkmjhdbkvqn) on 2026-08-06 via MCP.
-- Kept in the repo for history/parity. DO NOT re-apply.

-- admin_emails was a legacy allowlist that bypassed roles and is_active. Snapshot: archive.admin_emails_20260806.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select exists (
    select 1 from public.admin_users au
    where lower(au.email::text) = lower(coalesce(auth.jwt() ->> 'email',''))
      and au.is_active
  );
$function$;

create or replace function public.has_permission(p_module text, p_action text)
returns boolean language sql stable security definer set search_path to 'public'
as $function$
  with me as (
    select au.id from public.admin_users au
    where lower(au.email::text) = lower(coalesce(auth.jwt() ->> 'email',''))
      and au.is_active
    limit 1
  )
  select
    exists (select 1 from me join public.admin_user_roles aur on aur.user_id = me.id where aur.role_slug = 'super_admin')
    or exists (
      select 1 from me
      join public.admin_user_roles aur on aur.user_id = me.id
      join public.role_permissions rp on rp.role_slug = aur.role_slug and rp.module = p_module and rp.action = p_action
    );
$function$;

drop table public.admin_emails;
