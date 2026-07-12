-- =====================================================================
-- Ohio Pride PAC — Publish endorsements: Karen Brownlee + Seth Walsh
-- 2026-07-12. APPLIED TO PRODUCTION the same day; this file mirrors
-- what ran.
--
-- Both were endorsed by the Board on 2026-07-01 (same meeting as Caleb
-- Price) and held from /endorsements via is_published = false — see
-- 20260706120000_endorsement_publish_flag.sql. This is the public
-- announcement: the flag flips to true and both candidates appear on
-- /endorsements through the public_endorsements view.
--
--   * Karen Brownlee — State House District 28 (re-election)
--   * Seth Walsh     — State Treasurer
--
-- Photos + approved copy land in js/endorsement-content.js and
-- assets/endorsements/ in the same PR.
--
-- The publish itself was flipped via the admin console ("Push
-- endorsement"), which re-stamped updated_at (served as endorsed_at by
-- the public view) to the push time. The block below repeats the flip
-- idempotently and restores the recorded 2026-07-01 board approval
-- date, with the touch trigger disabled per the documented procedure.
-- =====================================================================

ALTER TABLE public.endorsement_applications
  DISABLE TRIGGER trg_endorsement_updated_at;

UPDATE public.endorsement_applications
   SET is_published = true,
       updated_at   = reviewed_at   -- 2026-07-01 16:00:00+00, board approval
 WHERE candidate_name IN ('Karen Brownlee', 'Seth Walsh')
   AND status = 'endorsed'
   AND reviewed_at IS NOT NULL;

-- Normalize office labels to the approved copy so /endorsements reads
-- consistently: Karen matches the other House candidates, and Seth's
-- statewide race drops the redundant "State of Ohio" district.
UPDATE public.endorsement_applications
   SET office_sought = 'Ohio House of Representatives'
 WHERE candidate_name = 'Karen Brownlee'
   AND status = 'endorsed';

UPDATE public.endorsement_applications
   SET office_sought = 'Ohio State Treasurer',
       district      = NULL
 WHERE candidate_name = 'Seth Walsh'
   AND status = 'endorsed';

ALTER TABLE public.endorsement_applications
  ENABLE TRIGGER trg_endorsement_updated_at;
