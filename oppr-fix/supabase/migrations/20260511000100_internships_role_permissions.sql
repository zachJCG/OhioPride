-- =====================================================================
-- 20260511000100_internships_role_permissions.sql
-- Add the new "internships" admin module to the existing role catalog.
-- Mirrors how the "volunteers" module is granted: super_admin gets all
-- actions; volunteer_lead gets read+write; board_member, treasurer, and
-- endorsements_chair get read-only.
-- =====================================================================

-- super_admin: full
insert into public.role_permissions (role_slug, module, action)
select 'super_admin', 'internships', a
from unnest(array['read','write','admin','manage_users']) a
on conflict do nothing;

-- volunteer_lead: read+write (intern hiring lives next to volunteer ops)
insert into public.role_permissions (role_slug, module, action) values
  ('volunteer_lead','internships','read'),
  ('volunteer_lead','internships','write')
on conflict do nothing;

-- board_member, treasurer, endorsements_chair: read-only visibility
insert into public.role_permissions (role_slug, module, action) values
  ('board_member','internships','read'),
  ('treasurer','internships','read'),
  ('endorsements_chair','internships','read'),
  ('comms_lead','internships','read'),
  ('legislative_lead','internships','read')
on conflict do nothing;
