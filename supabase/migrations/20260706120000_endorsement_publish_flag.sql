-- =====================================================================
-- Ohio Pride PAC — Endorsement publish flag
-- 2026-07-06. APPLIED TO PRODUCTION the same day (as
-- `endorsement_publish_flag` via MCP); this file mirrors what ran.
--
-- Endorsed candidates can now be held back from the public
-- /endorsements page until the PAC announces them. status='endorsed'
-- records the Board decision; is_published controls visibility.
--
-- Currently held (endorsed 2026-07-01, awaiting public announcement):
--   * Karen Brownlee — State House District 28
--   * Seth Walsh     — State Treasurer
--
-- To publish when announced (trigger disabled so the recorded
-- endorsement date is not re-stamped):
--
--   ALTER TABLE public.endorsement_applications
--     DISABLE TRIGGER trg_endorsement_updated_at;
--   UPDATE public.endorsement_applications
--      SET is_published = true
--    WHERE candidate_name IN ('Karen Brownlee', 'Seth Walsh')
--      AND status = 'endorsed';
--   ALTER TABLE public.endorsement_applications
--     ENABLE TRIGGER trg_endorsement_updated_at;
--
-- Remember to add their photos + approved copy to
-- js/endorsement-content.js before flipping the flag.
-- =====================================================================

ALTER TABLE public.endorsement_applications
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.endorsement_applications.is_published IS
  'Gate for the public_endorsements view: endorsed rows appear on /endorsements only when true. Set false to hold an endorsement until the public announcement.';

CREATE OR REPLACE VIEW public.public_endorsements AS
SELECT id,
    candidate_name,
    pronouns,
    office_sought,
    district,
    election_year,
    party,
    website,
    bio,
    is_out,
    updated_at AS endorsed_at
   FROM public.endorsement_applications
  WHERE status = 'endorsed'::text
    AND is_published;

-- Hold Karen Brownlee and Seth Walsh until the public announcement.
-- Trigger disabled so their recorded 2026-07-01 endorsement date
-- (updated_at) is not re-stamped by this edit.
ALTER TABLE public.endorsement_applications DISABLE TRIGGER trg_endorsement_updated_at;

UPDATE public.endorsement_applications
   SET is_published = false
 WHERE candidate_name IN ('Karen Brownlee', 'Seth Walsh')
   AND status = 'endorsed';

ALTER TABLE public.endorsement_applications ENABLE TRIGGER trg_endorsement_updated_at;
