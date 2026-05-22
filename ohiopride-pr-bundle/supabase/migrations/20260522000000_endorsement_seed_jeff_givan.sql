-- =====================================================================
-- Ohio Pride PAC — Endorsement Seed: Jeff Givan (OH House District 78)
-- 2026-05-22 (post-Launch Day)
--
-- Seeds our first endorsed candidate directly into the existing
-- endorsement_applications table with status='endorsed' so the row
-- flows through the public_endorsements view to /endorsements.
--
-- Idempotent: an UPDATE block keeps a re-run from creating a duplicate
-- candidate or downgrading the status if the row already exists.
--
-- NOTE ON SPELLING: the candidate's surname is "Givan", not "Gavin".
-- =====================================================================

-- 1) Insert the endorsement if not already present.
INSERT INTO public.endorsement_applications (
  status,
  first_name,
  last_name,
  candidate_name,
  pronouns,
  office_sought,
  district,
  election_year,
  is_special_election,
  party,
  committee_name,
  email,
  website,
  is_out,
  bio,
  attestation,
  q1_nondiscrimination,
  q2_anti_lgbtq_legislation,
  q3_conversion_therapy,
  q4_inclusive_education,
  q5_vote_against_rollbacks,
  reviewer_notes
)
SELECT
  'endorsed',
  'Jeff',
  'Givan',
  'Jeff Givan',
  'he/him',
  'Ohio House of Representatives',
  'District 78',
  2026,
  false,
  'Democrat',
  'Givan for Ohio',
  'campaign@jeffgivan4ohio.com',
  'https://jeffgivan4ohio.com',
  'yes',
  -- Bio
  'Jeff Givan is the Democratic nominee for Ohio House District 78, ' ||
  'covering Allen County and part of Auglaize County. A co-founder of ' ||
  'the Lima Pride Alliance, Jeff and his husband were the second gay ' ||
  'couple to marry in rural Allen County. A former international sales ' ||
  'manager, Jeff is running to defend public schools, protect marriage ' ||
  'equality, and expand access to preventative healthcare. His campaign ' ||
  'slogan is "Standing with the people."',
  true,
  true,  -- q1: nondiscrimination
  true,  -- q2: oppose anti-LGBTQ legislation
  true,  -- q3: ban conversion therapy
  true,  -- q4: inclusive education
  true,  -- q5: vote against rollbacks
  'First endorsement of the 2026 cycle. Board-approved 2026-05-22. ' ||
  'Challenger to House Speaker Matt Huffman.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.endorsement_applications
  WHERE candidate_name = 'Jeff Givan'
    AND office_sought  = 'Ohio House of Representatives'
    AND election_year  = 2026
);

-- 2) If the row already existed (e.g. submitted via the public form),
--    promote it to status='endorsed' and backfill core fields without
--    clobbering anything reviewers may have edited.
UPDATE public.endorsement_applications
   SET status        = 'endorsed',
       first_name    = COALESCE(NULLIF(first_name, ''), 'Jeff'),
       last_name     = COALESCE(NULLIF(last_name, ''),  'Givan'),
       pronouns      = COALESCE(NULLIF(pronouns, ''),   'he/him'),
       district      = COALESCE(NULLIF(district, ''),   'District 78'),
       election_year = COALESCE(election_year, 2026),
       party         = COALESCE(NULLIF(party, ''),      'Democrat'),
       website       = COALESCE(NULLIF(website, ''),    'https://jeffgivan4ohio.com'),
       is_out        = COALESCE(NULLIF(is_out, ''),     'yes'),
       reviewer_notes = COALESCE(
                          reviewer_notes,
                          'First endorsement of the 2026 cycle. Board-approved 2026-05-22. ' ||
                          'Challenger to House Speaker Matt Huffman.'
                        )
 WHERE candidate_name = 'Jeff Givan'
   AND office_sought  = 'Ohio House of Representatives'
   AND election_year  = 2026
   AND status <> 'endorsed';

-- 3) Sanity check (no-op, just selects a count for your psql session):
-- SELECT count(*) AS endorsed_candidates FROM public.public_endorsements;
