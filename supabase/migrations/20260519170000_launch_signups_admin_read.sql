-- ============================================================
-- 20260519170000_launch_signups_admin_read.sql
-- Admin read-back + manage for launch-day RSVPs so
-- /admin/launch-day can show the roster the same way
-- /admin/pride/volunteers reads public.pride_volunteers.
--
-- The public RSVP form posts as the anon role (unchanged). This
-- adds is_admin() SELECT + DELETE policies for authenticated
-- admins, matching the pride_volunteers pattern. anon still
-- cannot SELECT.
-- ============================================================

DROP POLICY IF EXISTS "launch_signups_admin_select" ON public.launch_signups;
CREATE POLICY "launch_signups_admin_select"
  ON public.launch_signups
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "launch_signups_admin_delete" ON public.launch_signups;
CREATE POLICY "launch_signups_admin_delete"
  ON public.launch_signups
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- Table-level privileges. RLS above is the actual gate; anon keeps
-- only the column-level INSERT grant from 20260427000200.
GRANT SELECT, DELETE ON public.launch_signups TO authenticated;
