-- The Users module's roles-and-modules matrix writes role_permissions, and
-- custom roles insert into admin_roles — but both tables only had select
-- policies, so every write failed RLS (the old static page never wrote them).
-- Writes are gated the same way as admin_users / admin_user_roles:
-- has_permission('users','manage_users').

create policy "manage_users can write role_permissions"
  on public.role_permissions for all
  to authenticated
  using (public.has_permission('users', 'manage_users'))
  with check (public.has_permission('users', 'manage_users'));

create policy "manage_users can write admin_roles"
  on public.admin_roles for all
  to authenticated
  using (public.has_permission('users', 'manage_users'))
  with check (public.has_permission('users', 'manage_users'));
