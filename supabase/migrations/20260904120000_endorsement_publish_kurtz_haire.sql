-- =====================================================================
-- Ohio Pride PAC: Publish endorsements, Paul Kurtz + Jordan Haire
-- 2026-09-04. Mirrors what runs in production; run it in the Supabase
-- SQL editor (execute_sql), not as DDL.
--
-- Both applications reached the Board's six-vote auto-endorse threshold
-- on 2026-09-03 (Keara Dever's vote, 12:48 PM ET) but were still
-- status = 'submitted', so neither reached the public_endorsements view.
--
--   * Paul Kurtz:   Ohio House District 55 (Warren County)
--   * Jordan Haire: Ohio House District 47 (Butler County)
--
-- Photos, OG cards, and the editorial entries in lib/endorsement-content.mjs
-- land in the same PR. Run STEP 1 any time; run STEP 2 only after that PR
-- has deployed, or both candidates render with an initial-letter avatar and
-- their raw Supabase bio for up to ten minutes (revalidate = 600).
-- =====================================================================

-- ---------------------------------------------------------------------
-- STEP 0 (hygiene, safe any time). Every 'submitted' application carried
-- is_published = true, which meant a status change alone would publish a
-- candidate with no second gate. Publication stays a deliberate act.
-- ---------------------------------------------------------------------
UPDATE public.endorsement_applications
   SET is_published = false
 WHERE status <> 'endorsed'
   AND is_published = true;

-- ---------------------------------------------------------------------
-- STEP 1. Record the decision. Publishes nothing yet.
-- endorsed_at is stamped to the moment the sixth endorse vote landed, so
-- the profile reads "Endorsed September 3, 2026" in Eastern time.
-- ---------------------------------------------------------------------
UPDATE public.endorsement_applications
   SET status        = 'endorsed',
       endorsed_at   = '2026-09-03 16:48:54+00',
       reviewed_at   = '2026-09-03 16:48:54+00',
       reviewed_by   = 'Board vote (6 endorse, 1 abstain)',
       is_published  = false,
       office_sought = 'Ohio House of Representatives',
       district      = 'District 55'
 WHERE candidate_name = 'Paul Kurtz'
   AND status = 'submitted';

-- Haire: normalize the name so the public slug is /endorsements/jordan-haire
-- (slugify strips nothing, so "Jordan E Haire" would have produced
-- jordan-e-haire and missed the editorial entry's `match`). Middle initial
-- stays on the application in middle_name. Bio is filled from her
-- application and campaign site so the row is complete even without the
-- editorial entry.
UPDATE public.endorsement_applications
   SET status          = 'endorsed',
       endorsed_at     = '2026-09-03 16:48:42+00',
       reviewed_at     = '2026-09-03 16:48:42+00',
       reviewed_by     = 'Board vote (6 endorse, 1 abstain)',
       is_published    = false,
       candidate_name  = 'Jordan Haire',
       office_sought   = 'Ohio House of Representatives',
       office_category = 'Ohio House of Representatives',
       district        = 'District 47',
       is_incumbent    = false,
       bio             = 'Jordan Haire is a mental health counselor with 13 years in practice and a Medicaid provider. Raised in Fairfield and Ross and a graduate of Badin High School, she is running for Ohio House District 47 to make life more affordable, fully fund public schools, and restore trust in state government. She lives in Butler County with her husband and daughter.'
 WHERE candidate_name = 'Jordan E Haire'
   AND status = 'submitted';

-- ---------------------------------------------------------------------
-- STEP 2. Publish. Run after the PR deploys (or use "Push endorsement" in
-- /admin/endorsements, which flips the same flag).
-- ---------------------------------------------------------------------
-- UPDATE public.endorsement_applications
--    SET is_published = true
--  WHERE candidate_name IN ('Paul Kurtz', 'Jordan Haire')
--    AND status = 'endorsed';

-- Verify: both rows should appear.
-- SELECT candidate_name, office_sought, district, endorsed_at
--   FROM public.public_endorsements
--  WHERE candidate_name IN ('Paul Kurtz', 'Jordan Haire');
