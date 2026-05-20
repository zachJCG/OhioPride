-- ============================================================
-- 20260520000000_founding_members_admin_read.sql
-- Admin SELECT + UPDATE on public.founding_members so the
-- /admin/donors and /admin/finance/budget pages can read the
-- donor roster from the browser (anon key + authenticated JWT).
--
-- Until now the only policy on founding_members was a
-- service_role catch-all (see 20260422015834_initial_schema.sql),
-- so PostgREST returned 0 rows to admin sessions and the donors
-- page showed an empty list. The is_public/is_vetted toggles on
-- the row likewise no-op'd. Public reads still go through
-- founding_members_public; anon access is unchanged.
-- ============================================================

DROP POLICY IF EXISTS "founding_members_admin_select" ON public.founding_members;
CREATE POLICY "founding_members_admin_select"
  ON public.founding_members
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "founding_members_admin_update" ON public.founding_members;
CREATE POLICY "founding_members_admin_update"
  ON public.founding_members
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT, UPDATE ON public.founding_members TO authenticated;
