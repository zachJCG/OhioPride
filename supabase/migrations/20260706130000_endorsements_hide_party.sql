-- =====================================================================
-- Ohio Pride PAC — Hide party affiliation from public endorsements
-- 2026-07-06. APPLIED TO PRODUCTION the same day (as
-- `endorsements_hide_party` via MCP); this file mirrors what ran.
--
-- Party stays on endorsement_applications for internal/admin use; it
-- is no longer served through the public view or shown on
-- /endorsements (the page also stopped rendering it in the same PR).
-- =====================================================================

-- CREATE OR REPLACE cannot drop a column; recreate the view.
DROP VIEW public.public_endorsements;

CREATE VIEW public.public_endorsements AS
SELECT id,
    candidate_name,
    pronouns,
    office_sought,
    district,
    election_year,
    website,
    bio,
    is_out,
    updated_at AS endorsed_at
   FROM public.endorsement_applications
  WHERE status = 'endorsed'::text
    AND is_published;

GRANT SELECT ON public.public_endorsements TO anon, authenticated;
