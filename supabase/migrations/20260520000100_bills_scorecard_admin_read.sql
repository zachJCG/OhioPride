-- ============================================================
-- 20260520000100_bills_scorecard_admin_read.sql
-- Admin SELECT on public.bills, public.legislators, and
-- public.score_snapshots so /admin/bills and /admin/legislators
-- can see every row, including ones marked is_active = false.
--
-- Public-facing pages (/issues, /scorecard) go through the
-- bills.mjs / scorecard.mjs Netlify functions which use the
-- service role, so they're unaffected. The existing
-- "read active" policies for anon stay in place.
--
-- This closes the last gap from PR #131 (bills + scorecard
-- admin module). Write paths still flow through service_role
-- until the admin UI grows edit affordances; this is read-only.
-- ============================================================

DROP POLICY IF EXISTS "bills_admin_select" ON public.bills;
CREATE POLICY "bills_admin_select"
  ON public.bills
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "legislators_admin_select" ON public.legislators;
CREATE POLICY "legislators_admin_select"
  ON public.legislators
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "score_snapshots_admin_select" ON public.score_snapshots;
CREATE POLICY "score_snapshots_admin_select"
  ON public.score_snapshots
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

GRANT SELECT ON public.bills          TO authenticated;
GRANT SELECT ON public.legislators    TO authenticated;
GRANT SELECT ON public.score_snapshots TO authenticated;
