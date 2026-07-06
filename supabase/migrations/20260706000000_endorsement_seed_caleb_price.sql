-- =====================================================================
-- Ohio Pride PAC — Endorsement Seed: Caleb Price (OH House District 30)
-- 2026-07-06
--
-- Seeds our second endorsed candidate into endorsement_applications
-- with status='endorsed', which flows through the public_endorsements
-- view to /endorsements.
--
-- APPLIED TO PRODUCTION 2026-07-06 (as `endorsement_seed_caleb_price`
-- via MCP). This file mirrors what ran. Note the live project is
-- status-based; it does not have the `stage` column from the
-- (unapplied) 20260703000000_endorsement_review_workflow migration.
--
-- TODO: confirm Board approval date and campaign ActBlue link with
-- Zach; the contact email below is an internal placeholder (email is
-- not exposed by public_endorsements).
--
-- Idempotent: an UPDATE block keeps a re-run from creating a duplicate
-- candidate or downgrading the status if the row already exists.
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
  q5_not_applicable,
  responses,
  reviewer_notes
)
SELECT
  'endorsed',
  'Caleb',
  'Price',
  'Caleb Price',
  'he/him',
  'Ohio House of Representatives',
  'District 30',
  2026,
  false,
  'Democrat',
  'Caleb Price for Ohio House District 30',
  'campaign@calebpriceforoh30.com',  -- placeholder; confirm with campaign (not public)
  'https://www.calebpriceforoh30.com',
  'yes',
  -- Bio (approved card blurb from the copy deck)
  'Born and raised on Cincinnati''s west side, Caleb Price is a Walnut ' ||
  'Hills grad and IBEW union member running for District 30. He is ' ||
  'fighting to write marriage equality into Ohio law, ban conversion ' ||
  'therapy, and bring the first Pride to the west side.',
  true,
  false,
  '{}'::jsonb,
  'Second endorsement of the 2026 cycle. Board approval date TBC with ' ||
  'Zach. Challenger to Rep. Mike Odioso in western Hamilton County. ' ||
  'Campaign ActBlue link TBC.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.endorsement_applications
  WHERE candidate_name = 'Caleb Price'
    AND office_sought  = 'Ohio House of Representatives'
    AND election_year  = 2026
);

-- 2) If the row already existed (e.g. submitted via the public form),
--    promote it to status='endorsed' and backfill core fields without
--    clobbering anything reviewers may have edited.
UPDATE public.endorsement_applications
   SET status        = 'endorsed',
       first_name    = COALESCE(NULLIF(first_name, ''), 'Caleb'),
       last_name     = COALESCE(NULLIF(last_name, ''),  'Price'),
       pronouns      = COALESCE(NULLIF(pronouns, ''),   'he/him'),
       district      = COALESCE(NULLIF(district, ''),   'District 30'),
       election_year = COALESCE(election_year, 2026),
       party         = COALESCE(NULLIF(party, ''),      'Democrat'),
       website       = COALESCE(NULLIF(website, ''),    'https://www.calebpriceforoh30.com'),
       is_out        = COALESCE(NULLIF(is_out, ''),     'yes')
 WHERE candidate_name = 'Caleb Price'
   AND office_sought  = 'Ohio House of Representatives'
   AND election_year  = 2026
   AND status <> 'endorsed';

-- 3) Sanity check (no-op, just selects a count for your psql session):
-- SELECT count(*) AS endorsed_candidates FROM public.public_endorsements;
