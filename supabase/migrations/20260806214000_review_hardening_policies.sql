-- Adversarial-review hardening on the overhaul's own policies.
--
-- 1. donors insert: is_admin() let ANY active admin record gifts; the UI
--    gates on contacts:write, so the policy now matches it.
-- 2. admin_roles: the earlier FOR ALL policy granted DELETE nothing in the
--    UI uses — deleting a role cascades through admin_user_roles and could
--    wipe every super_admin assignment in one statement. Insert/update only.
-- 3. endorsement_activity self-append: actor_email is plain text, so the
--    equality was case-sensitive while the JWT email casing is not
--    guaranteed; compare lowercased.
-- 4. endorsement_applications update: is_admin() let any active admin flip
--    status/publish; the console gates director controls on
--    endorsements:write, so the policy now matches it.

drop policy if exists "admin can insert donors" on public.donors;
create policy "admin can insert donors"
  on public.donors for insert
  to authenticated
  with check (public.has_permission('contacts', 'write'));

drop policy if exists "manage_users can write admin_roles" on public.admin_roles;
create policy "manage_users can insert admin_roles"
  on public.admin_roles for insert
  to authenticated
  with check (public.has_permission('users', 'manage_users'));
create policy "manage_users can update admin_roles"
  on public.admin_roles for update
  to authenticated
  using (public.has_permission('users', 'manage_users'))
  with check (public.has_permission('users', 'manage_users'));

drop policy if exists eact_insert on public.endorsement_activity;
create policy eact_insert
  on public.endorsement_activity for insert
  to authenticated
  with check (
    public.has_permission('endorsements', 'write')
    or (
      public.has_permission('endorsements', 'read')
      and lower(actor_email) = lower(auth.jwt() ->> 'email')
    )
  );

drop policy if exists "admin can update applications" on public.endorsement_applications;
create policy "endorsements write can update applications"
  on public.endorsement_applications for update
  to authenticated
  using (public.has_permission('endorsements', 'write'))
  with check (public.has_permission('endorsements', 'write'));
