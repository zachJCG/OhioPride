-- Contacts module 09: seed role_permissions for the `contacts` module.
-- Mirrors networking's role grants. Legacy super-admins (admin_emails) and the
-- super_admin role already pass has_permission()/is_admin(); this lets role-scoped
-- admins (board, comms, legislative, treasurer) reach Contacts too.
-- Applied to production 2026-06-15 (version 20260615170101).

insert into public.role_permissions (role_slug, module, action)
select v.role_slug, v.module, v.action
from (values
  ('board_member','contacts','read'),
  ('board_member','contacts','write'),
  ('comms_lead','contacts','read'),
  ('legislative_lead','contacts','read'),
  ('treasurer','contacts','read'),
  ('treasurer','contacts','write'),
  ('super_admin','contacts','read'),
  ('super_admin','contacts','write'),
  ('super_admin','contacts','admin'),
  ('super_admin','contacts','manage_users')
) as v(role_slug, module, action)
where not exists (
  select 1 from public.role_permissions rp
  where rp.role_slug = v.role_slug and rp.module = v.module and rp.action = v.action
);
