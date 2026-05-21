-- =============================================================================
-- 20260521010000_scorecard_seed_data.sql
-- -----------------------------------------------------------------------------
-- Lands the editorial roll-call dataset that /scorecard.html has been serving
-- out of /js/voting-records.js, plus the LEGISLATOR_SPONSORSHIPS map from
-- /js/scorecard-data.js, into the live admin-editable tables
-- (roll_calls, legislator_vote_exceptions, legislator_sponsorships).
--
-- All inserts are idempotent (`on conflict do update`) so re-running this
-- migration against a refreshed editorial dataset stays safe.
-- =============================================================================

-- ---------------------------------------------------------------------
-- 1. Add the 135th-GA historical bills that the voting-records seed
--    references but the current bills catalog does not yet carry.
-- ---------------------------------------------------------------------
insert into public.bills (
  slug, bill_number, label, ga, general_assembly, title, official_title,
  stance, category, status, chamber_of_origin, summary, display_order, is_active
)
values
  ('sb1-135',   'SB 1 (135th)',   'SB 1 (135th)',   '135th', 135,
     'Higher Ed Reform (DEI precursor)',
     'Higher Ed Reform (DEI precursor)',
     'anti', 'education_dei', 'dead', 'senate',
     'Prior-GA version of the higher-ed DEI restrictions that passed the Senate but did not clear the House in the 135th GA.',
     200, true),
  ('sb34-135',  'SB 34 (135th)',  'SB 34 (135th)',  '135th', 135,
     'Liquor Control and Beer Act',
     'Liquor Control and Beer Act',
     'pro', 'civil_rights', 'enacted', 'senate',
     'Non-LGBTQ+ bill kept in the dataset for roster completeness; all members had a recorded vote.',
     202, true),
  ('hb602-135', 'HB 602 (135th)', 'HB 602 (135th)', '135th', 135,
     'Pride Flag Ban Precursor',
     'Pride Flag Ban Precursor',
     'anti', 'expression', 'dead', 'house',
     'Prior-GA predecessor restricting which flags may be flown at public buildings; cleared committee but never reached a floor vote.',
     204, true)
on conflict (slug) do update set
  label       = excluded.label,
  ga          = excluded.ga,
  stance      = excluded.stance,
  status      = excluded.status,
  summary     = excluded.summary,
  display_order = excluded.display_order,
  updated_at  = now();

-- ---------------------------------------------------------------------
-- 2. roll_calls — one row per tracked floor / committee action
-- ---------------------------------------------------------------------
insert into public.roll_calls
  (roll_call_slug, bill_id, bill_slug, bill_label, bill_title,
   chamber, stage, label, vote_date, result, yeas, nays, stance, ga, notes)
values
  -- HB 249 (136th), drag performance ban
  ('hb249-h-pass',
     (select id from public.bills where slug = 'hb249'),
     'hb249', 'HB 249', 'Drag Performance Ban',
     'house', 'pass', 'House Passage',
     '2026-03-25', 'Passed 63-32', 63, 32, 'anti', '136th',
     'Rep. Jamie Callender (R-57) voted N, sole R crossover.'),

  -- SB 1 (136th), higher-ed DEI ban
  ('sb1-136-s-cmte',
     (select id from public.bills where slug = 'sb1'),
     'sb1', 'SB 1', 'Higher Ed DEI Ban',
     'senate', 'committee', 'Senate Higher Education Committee',
     '2025-02-12', 'Reported 5-2', 5, 2, 'anti', '136th',
     'Committee report clearing SB 1 to the Senate floor.'),
  ('sb1-136-s-pass',
     (select id from public.bills where slug = 'sb1'),
     'sb1', 'SB 1', 'Higher Ed DEI Ban',
     'senate', 'pass', 'Senate Passage',
     '2025-02-12', 'Passed 21-11', 21, 11, 'anti', '136th',
     'Sens. Blessing III (R-8) and Patton (R-24) voted N.'),
  ('sb1-136-h-cmte',
     (select id from public.bills where slug = 'sb1'),
     'sb1', 'SB 1', 'Higher Ed DEI Ban',
     'house', 'committee', 'House Higher Education Committee',
     '2025-03-19', 'Reported 11-4', 11, 4, 'anti', '136th',
     'House committee reported substitute.'),
  ('sb1-136-h-pass',
     (select id from public.bills where slug = 'sb1'),
     'sb1', 'SB 1', 'Higher Ed DEI Ban',
     'house', 'pass', 'House Passage',
     '2025-03-19', 'Passed 59-31', 59, 31, 'anti', '136th',
     'House passage of substitute bill.'),
  ('sb1-136-s-concur',
     (select id from public.bills where slug = 'sb1'),
     'sb1', 'SB 1', 'Higher Ed DEI Ban',
     'senate', 'concur', 'Senate Concurrence',
     '2025-03-26', 'Concurred 21-11', 21, 11, 'anti', '136th',
     'Senate concurred in House amendments, sending SB 1 to the Governor.'),

  -- HB 68 (135th), gender-affirming care + sports ban
  ('hb68-h-cmte',
     (select id from public.bills where slug = 'hb68'),
     'hb68', 'HB 68', 'Gender-Affirming Care + Sports Ban',
     'house', 'committee', 'House Public Health Committee',
     '2023-06-14', 'Reported 8-4', 8, 4, 'anti', '135th',
     'Committee report.'),
  ('hb68-h-pass',
     (select id from public.bills where slug = 'hb68'),
     'hb68', 'HB 68', 'Gender-Affirming Care + Sports Ban',
     'house', 'pass', 'House Original Passage',
     '2023-06-21', 'Passed 64-28', 64, 28, 'anti', '135th',
     'Original House passage.'),
  ('hb68-s-cmte',
     (select id from public.bills where slug = 'hb68'),
     'hb68', 'HB 68', 'Gender-Affirming Care + Sports Ban',
     'senate', 'committee', 'Senate Government Oversight Committee',
     '2023-12-13', 'Reported 5-2', 5, 2, 'anti', '135th',
     'Senate committee report.'),
  ('hb68-s-pass',
     (select id from public.bills where slug = 'hb68'),
     'hb68', 'HB 68', 'Gender-Affirming Care + Sports Ban',
     'senate', 'pass', 'Senate Passage',
     '2023-12-13', 'Passed 24-8', 24, 8, 'anti', '135th',
     'Sen. N. Manning (R-13) voted N, sole R crossover.'),
  ('hb68-h-concur',
     (select id from public.bills where slug = 'hb68'),
     'hb68', 'HB 68', 'Gender-Affirming Care + Sports Ban',
     'house', 'concur', 'House Concurrence',
     '2023-12-13', 'Concurred 62-27', 62, 27, 'anti', '135th',
     'House concurred in Senate amendments.'),
  ('hb68-h-override',
     (select id from public.bills where slug = 'hb68'),
     'hb68', 'HB 68', 'Gender-Affirming Care + Sports Ban',
     'house', 'override', 'House Veto Override',
     '2024-01-10', 'Overridden 65-28', 65, 28, 'anti', '135th',
     'House override of Gov. DeWine''s veto.'),
  ('hb68-s-override',
     (select id from public.bills where slug = 'hb68'),
     'hb68', 'HB 68', 'Gender-Affirming Care + Sports Ban',
     'senate', 'override', 'Senate Veto Override',
     '2024-01-24', 'Overridden 23-9', 23, 9, 'anti', '135th',
     'Senate override of Gov. DeWine''s veto; bill became law.'),

  -- HB 8 (135th), parents' bill of rights / forced outing
  ('hb8-h-cmte',
     (select id from public.bills where slug = 'hb8'),
     'hb8', 'HB 8', 'Parents'' Bill of Rights (Forced Outing)',
     'house', 'committee', 'House Primary and Secondary Education Committee',
     '2023-06-14', 'Reported 9-6', 9, 6, 'anti', '135th',
     'House committee reported amended bill.'),
  ('hb8-h-pass',
     (select id from public.bills where slug = 'hb8'),
     'hb8', 'HB 8', 'Parents'' Bill of Rights (Forced Outing)',
     'house', 'pass', 'House Passage',
     '2023-06-21', 'Passed 65-29', 65, 29, 'anti', '135th',
     'Reps. White (R-36), Manning (R-52), Callender (R-57) voted N.'),
  ('hb8-s-cmte',
     (select id from public.bills where slug = 'hb8'),
     'hb8', 'HB 8', 'Parents'' Bill of Rights (Forced Outing)',
     'senate', 'committee', 'Senate Education Committee',
     '2024-12-18', 'Reported 5-2', 5, 2, 'anti', '135th',
     'Senate committee reported substitute bill.'),
  ('hb8-s-pass',
     (select id from public.bills where slug = 'hb8'),
     'hb8', 'HB 8', 'Parents'' Bill of Rights (Forced Outing)',
     'senate', 'pass', 'Senate Passage',
     '2024-12-18', 'Passed 24-7', 24, 7, 'anti', '135th',
     'Sen. Blessing III (R-8) voted N.'),
  ('hb8-h-concur',
     (select id from public.bills where slug = 'hb8'),
     'hb8', 'HB 8', 'Parents'' Bill of Rights (Forced Outing)',
     'house', 'concur', 'House Concurrence',
     '2024-12-18', 'Concurred 57-31', 57, 31, 'anti', '135th',
     'House concurred in Senate amendments, sending HB 8 to the Governor.'),

  -- SB 104 (135th), bathroom ban
  ('sb104-s-cmte',
     (select id from public.bills where slug = 'sb104'),
     'sb104', 'SB 104', 'Bathroom Ban (on CCP vehicle)',
     'senate', 'committee', 'Senate Education Committee',
     '2024-02-28', 'Reported 5-0', 5, 0, 'anti', '135th',
     'Committee reported substitute; bathroom-ban amendment added later.'),
  ('sb104-s-pass',
     (select id from public.bills where slug = 'sb104'),
     'sb104', 'SB 104', 'Bathroom Ban (on CCP vehicle)',
     'senate', 'pass', 'Senate Original Passage',
     '2024-02-28', 'Passed 32-0', 32, 0, 'anti', '135th',
     'Original Senate passage before House bathroom-ban amendment.'),
  ('sb104-h-cmte',
     (select id from public.bills where slug = 'sb104'),
     'sb104', 'SB 104', 'Bathroom Ban (on CCP vehicle)',
     'house', 'committee', 'House Higher Education Committee',
     '2024-06-25', 'Reported 13-0', 13, 0, 'anti', '135th',
     'Committee reported bill as amended.'),
  ('sb104-h-pass',
     (select id from public.bills where slug = 'sb104'),
     'sb104', 'SB 104', 'Bathroom Ban (on CCP vehicle)',
     'house', 'pass', 'House Passage (with bathroom-ban amendment)',
     '2024-06-26', 'Passed 60-31', 60, 31, 'anti', '135th',
     'House attached K-12 and higher-ed bathroom/locker-room restrictions.'),
  ('sb104-s-concur',
     (select id from public.bills where slug = 'sb104'),
     'sb104', 'SB 104', 'Bathroom Ban (on CCP vehicle)',
     'senate', 'concur', 'Senate Concurrence',
     '2024-11-13', 'Concurred 24-7', 24, 7, 'anti', '135th',
     'Senate concurred in House amendments, sending SB 104 to the Governor.'),

  -- SB 1 (135th), DEI precursor
  ('sb1-135-s-cmte',
     (select id from public.bills where slug = 'sb1-135'),
     'sb1-135', 'SB 1 (135th)', 'Higher Ed Reform (DEI precursor)',
     'senate', 'committee', 'Senate Workforce and Higher Education Committee',
     '2023-03-01', 'Reported 5-2', 5, 2, 'anti', '135th',
     'Committee reported substitute bill.'),
  ('sb1-135-s-pass',
     (select id from public.bills where slug = 'sb1-135'),
     'sb1-135', 'SB 1 (135th)', 'Higher Ed Reform (DEI precursor)',
     'senate', 'pass', 'Senate Passage',
     '2023-03-01', 'Passed 26-7', 26, 7, 'anti', '135th',
     'Senate passage; did not clear House in 135th GA.'),

  -- SB 34 (135th), Liquor Control and Beer Act
  ('sb34-135-s-cmte',
     (select id from public.bills where slug = 'sb34-135'),
     'sb34-135', 'SB 34 (135th)', 'Liquor Control and Beer Act',
     'senate', 'committee', 'Senate Small Business Committee',
     '2023-03-22', 'Reported 5-0', 5, 0, 'pro', '135th',
     'Non-LGBTQ+ bill included in dataset for roster completeness.'),
  ('sb34-135-s-pass',
     (select id from public.bills where slug = 'sb34-135'),
     'sb34-135', 'SB 34 (135th)', 'Liquor Control and Beer Act',
     'senate', 'pass', 'Senate Passage',
     '2023-05-17', 'Passed 31-0', 31, 0, 'pro', '135th',
     'Unanimous Senate passage.'),
  ('sb34-135-h-cmte',
     (select id from public.bills where slug = 'sb34-135'),
     'sb34-135', 'SB 34 (135th)', 'Liquor Control and Beer Act',
     'house', 'committee', 'House Commerce and Labor Committee',
     '2023-10-12', 'Reported 12-0', 12, 0, 'pro', '135th',
     'Unanimous House committee report.'),
  ('sb34-135-h-pass',
     (select id from public.bills where slug = 'sb34-135'),
     'sb34-135', 'SB 34 (135th)', 'Liquor Control and Beer Act',
     'house', 'pass', 'House Passage',
     '2023-11-15', 'Passed 93-1', 93, 1, 'pro', '135th',
     'Near-unanimous House passage.'),

  -- HB 602 (135th), pride flag ban precursor
  ('hb602-135-h-cmte',
     (select id from public.bills where slug = 'hb602-135'),
     'hb602-135', 'HB 602 (135th)', 'Pride Flag Ban Precursor',
     'house', 'committee', 'House State and Local Government Committee',
     '2024-11-26', 'Reported 12-0', 12, 0, 'anti', '135th',
     'House committee report; no floor vote located in 135th GA.')
on conflict (roll_call_slug) do update set
  bill_id    = excluded.bill_id,
  bill_slug  = excluded.bill_slug,
  bill_label = excluded.bill_label,
  bill_title = excluded.bill_title,
  chamber    = excluded.chamber,
  stage      = excluded.stage,
  label      = excluded.label,
  vote_date  = excluded.vote_date,
  result     = excluded.result,
  yeas       = excluded.yeas,
  nays       = excluded.nays,
  stance     = excluded.stance,
  ga         = excluded.ga,
  notes      = excluded.notes,
  updated_at = now();

-- ---------------------------------------------------------------------
-- 3. legislator_vote_exceptions — party-line crossovers and absences
-- ---------------------------------------------------------------------
insert into public.legislator_vote_exceptions
  (roll_call_id, roll_call_slug, chamber, district, vote, notes)
values
  ((select id from public.roll_calls where roll_call_slug = 'hb249-h-pass'),
     'hb249-h-pass', 'house', 57, 'N',
     'Callender, sole R to vote against drag ban.'),
  ((select id from public.roll_calls where roll_call_slug = 'hb68-s-pass'),
     'hb68-s-pass', 'senate', 13, 'N',
     'N. Manning, sole R against Senate passage with sports-ban.'),
  ((select id from public.roll_calls where roll_call_slug = 'hb68-h-concur'),
     'hb68-h-concur', 'house', 57, 'N',
     'Callender, against HB 68 concurrence.'),
  ((select id from public.roll_calls where roll_call_slug = 'hb68-h-override'),
     'hb68-h-override', 'house', 57, 'N',
     'Callender, against HB 68 override.'),
  ((select id from public.roll_calls where roll_call_slug = 'hb68-s-override'),
     'hb68-s-override', 'senate', 13, 'N',
     'N. Manning, sole R against Senate override.'),
  ((select id from public.roll_calls where roll_call_slug = 'hb8-h-pass'),
     'hb8-h-pass', 'house', 36, 'N',
     'A. White, against HB 8.'),
  ((select id from public.roll_calls where roll_call_slug = 'hb8-h-pass'),
     'hb8-h-pass', 'house', 52, 'N',
     'G. Manning, against HB 8.'),
  ((select id from public.roll_calls where roll_call_slug = 'hb8-h-pass'),
     'hb8-h-pass', 'house', 57, 'N',
     'Callender, against HB 8.'),
  ((select id from public.roll_calls where roll_call_slug = 'hb8-s-pass'),
     'hb8-s-pass', 'senate', 8, 'N',
     'Blessing III, against HB 8 Senate passage.'),
  ((select id from public.roll_calls where roll_call_slug = 'hb8-h-concur'),
     'hb8-h-concur', 'house', 57, 'N',
     'Callender, against HB 8 concurrence.'),
  ((select id from public.roll_calls where roll_call_slug = 'sb104-h-pass'),
     'sb104-h-pass', 'house', 57, 'N',
     'Callender, against SB 104 House passage with bathroom-ban amendment.'),
  ((select id from public.roll_calls where roll_call_slug = 'sb1-136-s-pass'),
     'sb1-136-s-pass', 'senate', 8, 'N',
     'Blessing III, crossed on SB 1 Senate passage.'),
  ((select id from public.roll_calls where roll_call_slug = 'sb1-136-s-pass'),
     'sb1-136-s-pass', 'senate', 24, 'N',
     'Patton, crossed on SB 1 Senate passage.'),
  ((select id from public.roll_calls where roll_call_slug = 'sb1-136-s-concur'),
     'sb1-136-s-concur', 'senate', 8, 'N',
     'Blessing III, crossed on SB 1 Senate concurrence.'),
  ((select id from public.roll_calls where roll_call_slug = 'sb1-136-s-concur'),
     'sb1-136-s-concur', 'senate', 24, 'N',
     'Patton, crossed on SB 1 Senate concurrence.')
on conflict (chamber, district, roll_call_id) do update set
  vote = excluded.vote,
  notes = excluded.notes,
  updated_at = now();

-- ---------------------------------------------------------------------
-- 4. legislator_sponsorships — from LEGISLATOR_SPONSORSHIPS in
--    /js/scorecard-data.js, joined to the prod legislators by
--    (chamber, district).
-- ---------------------------------------------------------------------
insert into public.legislator_sponsorships (legislator_id, bill_slug, role)
select l.id, x.bill_slug, x.role
from (values
  -- HB 467 (135th) — Trans Candidate Name-Change Fix primary sponsors
  ('house',  4,  'hb467-135', 'primary'),  -- Beryl Brown Piccolantonio
  ('house',  43, 'hb467-135', 'primary'),  -- Michele Grim

  -- HB 467 (135th) co-sponsors
  ('house',  1,  'hb467-135', 'co'),       -- Dontavius L. Jarrells
  ('house',  8,  'hb467-135', 'co'),       -- Anita Somani
  ('house',  9,  'hb467-135', 'co'),       -- Munira Abdullahi
  ('house',  11, 'hb467-135', 'co'),       -- Crystal Lett
  ('house',  13, 'hb467-135', 'co'),       -- Tristan Rader
  ('house',  16, 'hb467-135', 'co'),       -- Bride Rose Sweeney
  ('house',  28, 'hb467-135', 'co'),       -- Karen Brownlee
  ('house',  53, 'hb467-135', 'co'),       -- Joseph A. Miller, III
  ('senate', 9,  'hb467-135', 'co'),       -- Catherine D. Ingram
  ('senate', 15, 'hb467-135', 'co'),       -- Hearcel F. Craig

  -- Notes-derived primary sponsorships
  ('house',  1,  'hb306', 'primary'),      -- Jarrells, Hate Crimes Act
  ('house',  11, 'hb136', 'primary'),      -- Lett, Fairness Act House
  ('house',  13, 'hb136', 'primary'),      -- Rader, Fairness Act House
  ('house',  28, 'hb300', 'primary'),      -- Brownlee, Conversion Therapy Ban House
  ('house',  28, 'hb327', 'primary'),      -- Brownlee, PRIDE Act

  -- Co-sponsorship: Crystal Lett on hb300
  ('house',  11, 'hb300', 'co'),

  -- Senate primaries from notes
  ('senate', 23, 'sb70',  'primary'),      -- Antonio, Fairness Act
  ('senate', 23, 'sb71',  'primary'),      -- Antonio, Conversion Therapy Ban
  ('senate', 23, 'sb211', 'primary'),      -- Antonio, Love Makes a Family Week
  ('senate', 16, 'sb71',  'co'),           -- Liston, Conversion Therapy Ban co-sponsor
  ('senate', 14, 'sb34',  'primary'),      -- Terry Johnson, Ten Commandments
  ('senate', 18, 'sb1',   'primary'),      -- Cirino, DEI Ban (higher ed)
  ('senate', 18, 'sb104', 'co'),           -- Cirino, Bathroom Ban co
  ('senate', 18, 'sb274', 'co'),           -- Cirino, Minor consent co
  ('senate', 19, 'sb113', 'primary'),      -- Brenner, school DEI ban
  ('senate', 19, 'sb274', 'primary'),      -- Brenner, minor consent
  ('senate', 19, 'sb104', 'co'),           -- Brenner, bathroom ban co
  ('senate', 20, 'sb53',  'primary'),      -- Schaffer, anti-protest

  -- Co-sponsor: Darnell Brewer on PRIDE Act
  ('house',  22, 'hb327', 'co'),

  -- House anti-equality primary sponsors
  ('house',  84, 'hb249', 'primary'),      -- Angela King, drag ban
  ('house',  84, 'hb196', 'co'),           -- Angela King, candidate disclosure
  ('house',  44, 'hb249', 'co'),           -- Josh Williams, drag ban
  ('house',  44, 'hb155', 'co'),           -- Josh Williams, DEI K-12
  ('house',  44, 'hb190', 'co'),           -- Josh Williams, Given Name Act
  ('house',  44, 'hb262', 'co'),           -- Josh Williams, Natural Family Month
  ('house',  44, 'hb693', 'co'),           -- Josh Williams, Affirming Families
  ('house',  44, 'hb796', 'co'),           -- Josh Williams, Inmate Housing
  ('house',  44, 'hb798', 'co'),           -- Josh Williams, Privacy Protection
  ('house',  40, 'hb196', 'primary'),      -- Rodney Creech, trans candidate disclosure
  ('house',  61, 'hb155', 'primary'),      -- Beth Lear, DEI K-12
  ('house',  61, 'hb262', 'primary'),      -- Beth Lear, Natural Family Month
  ('house',  80, 'hb190', 'primary'),      -- Newman, Given Name Act
  ('house',  80, 'hb172', 'primary'),      -- Newman, Minor Mental Health Consent
  ('house',  88, 'hb68',  'primary'),      -- Gary Click (135th GA), care ban
  ('house',  88, 'hb693', 'primary'),      -- Gary Click, Affirming Families
  ('house',  94, 'hb507', 'primary'),      -- Kevin Ritter, School Chaplain Act
  ('house',  37, 'hb6',   'co'),           -- Tom Young, HB 6 (DEI ban companion)
  ('house',  12, 'hb96',  'primary')       -- Brian Stewart, budget with riders
) as x(chamber, district, bill_slug, role)
join public.legislators l on l.chamber = x.chamber and l.district = x.district and l.is_active
where exists (select 1 from public.bills b where b.slug = x.bill_slug)
on conflict (legislator_id, bill_slug) do update set
  role       = excluded.role,
  updated_at = now();

-- ---------------------------------------------------------------------
-- 5. Sync legislators.{floor,committee,sponsorship}_subscore from the
--    current published snapshot so the legislator_scorecard view stays
--    consistent for legislators without a freshly-computed draft.
-- ---------------------------------------------------------------------
update public.legislators l
   set floor_subscore       = greatest(-5, least(5, round(s.floor_score)::integer)),
       committee_subscore   = greatest(-5, least(5, round(s.committee_score)::integer)),
       sponsorship_subscore = greatest(-5, least(5, round(s.sponsorship_score)::integer)),
       updated_at           = now()
  from public.score_snapshots s
 where s.legislator_id = l.id
   and s.is_current;
