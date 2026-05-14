-- ============================================================
-- 20260514000000_founding_members_public_add_state.sql
--
-- Expose `state` from public.founding_members through the
-- founding_members_public view so the directory can show state
-- alongside city. The column was added to founding_members on
-- 2026-05-11 (actblue report backfill) but never made it into
-- the view, so out-of-state donors appeared as Ohio-only in the
-- UI.
-- ============================================================

DROP VIEW IF EXISTS public.founding_members_public;

CREATE VIEW public.founding_members_public AS
  SELECT
    id,
    founding_number,
    COALESCE(NULLIF(display_name, ''), 'Anonymous') AS display_name,
    founding_member_tier(amount_cents, recurrence) AS tier,
    city,
    state,
    county,
    elected_office,
    jurisdiction,
    public_quote,
    contributed_at
  FROM public.founding_members
  WHERE is_public = true
    AND is_vetted = true;

COMMENT ON VIEW public.founding_members_public IS
  'Public-facing founding members. Excludes PII (full_name, email, notes). Powers the Founding Members directory page. Includes state so out-of-state donors render correctly.';

GRANT SELECT ON public.founding_members_public TO anon, authenticated;
