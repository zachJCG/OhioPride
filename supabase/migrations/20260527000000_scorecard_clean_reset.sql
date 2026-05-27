-- =============================================================================
-- 20260527000000_scorecard_clean_reset.sql
-- -----------------------------------------------------------------------------
-- Wipes and re-seeds the scorecard evidence tables so the back-end is a
-- clean 1:1 mirror of what is currently visible on https://ohiopride.org/scorecard
-- and editable at https://ohiopride.org/admin/legislators/.
--
-- After this migration, the only things that drive a legislator's grade are:
--   1. public.roll_calls               (floor + committee votes)
--   2. public.legislator_vote_exceptions (party-line crossovers + absences)
--   3. public.legislator_sponsorships  (primary + co-sponsor attribution)
--
-- Nothing else. No legacy score_snapshots rows, no orphan sponsorships, no
-- duplicate legislator records, no half-recorded exception rows.
--
-- The scoring math (subscores, composite, grade) is recomputed at the end
-- by calling public.publish_scorecard_all(), which writes a fresh
-- score_snapshots row per legislator and updates legislators.{floor,
-- committee, sponsorship}_subscore. From this point forward, every grade
-- the public sees is derived from the three evidence tables via the
-- methodology published at https://ohiopride.org/methodology:
--
--   score = clamp(0, 100, round(50 + (Vf * 4) + (Vc * 4) + (S * 2)))
--
-- Floor and committee subscores are weighted equally (binding action).
-- Sponsorship is half-weighted (public commitment, not a recorded vote).
-- Stage weights inside the vote subscores:
--   override 1.25 | concur 1.00 | pass 1.00 | committee 0.75 | amend 0.50 | introduce 0.25
--
-- Roll-call + sponsorship + exception data below was captured 2026-05-27
-- from the live scorecard payload at /.netlify/functions/scorecard.
--
-- This migration is destructive on the four scorecard data tables and
-- idempotent thereafter (rerunning it produces the same end state).
-- =============================================================================


-- =============================================================================
-- 0. Roster hygiene: remove the duplicate House district 51 row.
-- -----------------------------------------------------------------------------
-- The live roster carried two rows for House district 51:
--   - Jodi Salvo (R)       — current OH-51 representative, 136th GA
--   - Sara P. Carruthers (R) — left the legislature; should not be on roster
-- Cascade removes any orphan score_snapshots / sponsorships for the dropped
-- record.
-- =============================================================================
delete from public.legislators l
 where l.chamber  = 'house'
   and l.district = 51
   and lower(l.full_name) like '%carruthers%';


-- =============================================================================
-- 1. Wipe scorecard evidence + derived snapshots.
-- -----------------------------------------------------------------------------
-- Order matters because of FKs:
--   exceptions  -> roll_calls
--   snapshots   -> legislators
-- =============================================================================
truncate table public.legislator_vote_exceptions restart identity cascade;
truncate table public.roll_calls                 restart identity cascade;
truncate table public.legislator_sponsorships    restart identity cascade;
truncate table public.score_snapshots            restart identity cascade;


-- =============================================================================
-- 2. Bills referenced by sponsorships / roll-calls — make sure they exist.
-- -----------------------------------------------------------------------------
-- Every roll_call.bill_slug and every legislator_sponsorships.bill_slug must
-- be present in public.bills. Insert the rows that the public scorecard
-- references but the existing bills catalog may not yet carry. Stance is the
-- editorial position; the resolver uses it to score Y/N votes correctly.
-- =============================================================================
insert into public.bills (slug, label, ga, stance, display_order, is_active)
values
  ('hb6',        'HB 6 (135th)',        '135th', 'anti', 220, true),
  ('hb467-135',  'HB 467 (135th)',      '135th', 'pro',  222, true),
  ('hb507',      'HB 507 (135th)',      '135th', 'anti', 224, true),
  ('sb53',       'SB 53',               '136th', 'anti', 226, true),
  ('sb1-135',    'SB 1 (135th)',        '135th', 'anti', 200, true),
  ('sb34-135',   'SB 34 (135th)',       '135th', 'pro',  202, true),
  ('hb602-135',  'HB 602 (135th)',      '135th', 'anti', 204, true)
on conflict (slug) do update set
  label         = coalesce(public.bills.label, excluded.label),
  ga            = coalesce(public.bills.ga,    excluded.ga),
  stance        = coalesce(public.bills.stance, excluded.stance),
  is_active     = true,
  updated_at    = now();


-- =============================================================================
-- 3. roll_calls — 30 canonical entries: every floor + committee vote.
-- =============================================================================
insert into public.roll_calls
  (roll_call_slug, bill_id, bill_slug, bill_label, bill_title,
   chamber, stage, label, vote_date, result, yeas, nays, stance, ga, notes)
values
  -- HB 249 (136th) — Drag Performance Ban
  ('hb249-h-pass',
     (select id from public.bills where slug = 'hb249'),
     'hb249', 'HB 249', 'Drag Performance Ban',
     'house', 'pass', 'House Passage',
     '2026-03-25', 'Passed 63-32', 63, 32, 'anti', '136th',
     'Rep. Jamie Callender (R-57) voted N, sole R crossover.'),

  -- SB 1 (136th) — Higher Ed DEI Ban
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

  -- HB 68 (135th) — Gender-Affirming Care Ban + Sports Ban
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

  -- HB 8 (135th) — Parents' Bill of Rights / Forced Outing
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

  -- SB 104 (135th) — Bathroom Ban
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

  -- SB 1 (135th) — DEI precursor
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

  -- SB 34 (135th) — Liquor Control and Beer Act (roster-completeness vote)
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

  -- HB 602 (135th) — Pride Flag Ban Precursor
  ('hb602-135-h-cmte',
     (select id from public.bills where slug = 'hb602-135'),
     'hb602-135', 'HB 602 (135th)', 'Pride Flag Ban Precursor',
     'house', 'committee', 'House State and Local Government Committee',
     '2024-11-26', 'Reported 12-0', 12, 0, 'anti', '135th',
     'House committee report; no floor vote located in 135th GA.');


-- =============================================================================
-- 4. legislator_vote_exceptions — 15 documented party-line crossovers.
-- -----------------------------------------------------------------------------
-- Only rows that move a member off their party-line default. Redundant rows
-- (e.g. a D in the House voting N on an anti bill, which is the default)
-- are intentionally NOT included; the resolver covers them automatically.
-- =============================================================================
insert into public.legislator_vote_exceptions
  (roll_call_id, roll_call_slug, chamber, district, vote, notes)
values
  -- HB 249 (drag ban) — Callender alone among Rs voted N
  ((select id from public.roll_calls where roll_call_slug = 'hb249-h-pass'),
     'hb249-h-pass', 'house', 57, 'N',
     'Callender, sole R to vote against drag ban.'),

  -- HB 68 crossovers
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

  -- HB 8 crossovers
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

  -- SB 104 (bathroom ban) — Callender voted N on House passage
  ((select id from public.roll_calls where roll_call_slug = 'sb104-h-pass'),
     'sb104-h-pass', 'house', 57, 'N',
     'Callender, against SB 104 House passage with bathroom-ban amendment.'),

  -- SB 1 (136th) — Blessing III and Patton crossed on both passage + concurrence
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
     'Patton, crossed on SB 1 Senate concurrence.');


-- =============================================================================
-- 5. legislator_sponsorships — primary + co-sponsor attribution.
-- -----------------------------------------------------------------------------
-- Resolved via (chamber, district) lookup against public.legislators so we
-- do not depend on UUIDs. Bills must already be in public.bills (see step 2).
-- =============================================================================
insert into public.legislator_sponsorships (legislator_id, bill_slug, role)
select l.id, x.bill_slug, x.role
from (values
  -- HB 467 (135th) — Trans Candidate Name-Change Fix
  ('house',   4, 'hb467-135', 'primary'),  -- Beryl Brown Piccolantonio
  ('house',  43, 'hb467-135', 'primary'),  -- Michele Grim
  ('house',   1, 'hb467-135', 'co'),       -- Dontavius L. Jarrells
  ('house',   8, 'hb467-135', 'co'),       -- Anita Somani
  ('house',   9, 'hb467-135', 'co'),       -- Munira Abdullahi
  ('house',  11, 'hb467-135', 'co'),       -- Crystal Lett
  ('house',  13, 'hb467-135', 'co'),       -- Tristan Rader
  ('house',  16, 'hb467-135', 'co'),       -- Bride Rose Sweeney
  ('house',  28, 'hb467-135', 'co'),       -- Karen Brownlee
  ('house',  53, 'hb467-135', 'co'),       -- Joseph A. Miller, III
  ('senate',  9, 'hb467-135', 'co'),       -- Catherine D. Ingram
  ('senate', 15, 'hb467-135', 'co'),       -- Hearcel F. Craig

  -- Pro-equality primary sponsorships
  ('house',   1, 'hb306',     'primary'),  -- Jarrells, Hate Crimes Act
  ('house',  11, 'hb136',     'primary'),  -- Lett, Fairness Act House
  ('house',  13, 'hb136',     'primary'),  -- Rader, Fairness Act House
  ('house',  28, 'hb300',     'primary'),  -- Brownlee, Conversion Therapy Ban House
  ('house',  28, 'hb327',     'primary'),  -- Brownlee, PRIDE Act
  ('house',  11, 'hb300',     'co'),       -- Lett, Conversion Therapy Ban House
  ('senate', 23, 'sb70',      'primary'),  -- Antonio, Fairness Act
  ('senate', 23, 'sb71',      'primary'),  -- Antonio, Conversion Therapy Ban
  ('senate', 23, 'sb211',     'primary'),  -- Antonio, Love Makes a Family Week
  ('senate', 16, 'sb71',      'co'),       -- Liston, Conversion Therapy Ban
  ('house',  22, 'hb327',     'co'),       -- Brewer, PRIDE Act

  -- Anti-equality primary sponsorships
  ('senate', 14, 'sb34',      'primary'),  -- Terry Johnson, Ten Commandments
  ('senate', 18, 'sb1',       'primary'),  -- Cirino, DEI Ban (higher ed)
  ('senate', 18, 'sb104',     'co'),       -- Cirino, Bathroom Ban
  ('senate', 18, 'sb274',     'co'),       -- Cirino, Minor consent
  ('senate', 19, 'sb113',     'primary'),  -- Brenner, school DEI ban
  ('senate', 19, 'sb274',     'primary'),  -- Brenner, minor consent
  ('senate', 19, 'sb104',     'co'),       -- Brenner, bathroom ban
  ('senate', 20, 'sb53',      'primary'),  -- Schaffer, anti-protest
  ('house',  84, 'hb249',     'primary'),  -- Angela King, drag ban
  ('house',  84, 'hb196',     'co'),       -- Angela King, candidate disclosure
  ('house',  44, 'hb249',     'co'),       -- Josh Williams, drag ban
  ('house',  44, 'hb155',     'co'),       -- Josh Williams, DEI K-12
  ('house',  44, 'hb190',     'co'),       -- Josh Williams, Given Name Act
  ('house',  44, 'hb262',     'co'),       -- Josh Williams, Natural Family Month
  ('house',  44, 'hb693',     'co'),       -- Josh Williams, Affirming Families
  ('house',  44, 'hb796',     'co'),       -- Josh Williams, Inmate Housing
  ('house',  44, 'hb798',     'co'),       -- Josh Williams, Privacy Protection
  ('house',  40, 'hb196',     'primary'),  -- Rodney Creech, candidate disclosure
  ('house',  61, 'hb155',     'primary'),  -- Beth Lear, DEI K-12
  ('house',  61, 'hb262',     'primary'),  -- Beth Lear, Natural Family Month
  ('house',  80, 'hb190',     'primary'),  -- Newman, Given Name Act
  ('house',  80, 'hb172',     'primary'),  -- Newman, Minor Mental Health Consent
  ('house',  88, 'hb68',      'primary'),  -- Gary Click, care ban (135th)
  ('house',  88, 'hb693',     'primary'),  -- Gary Click, Affirming Families
  ('house',  94, 'hb507',     'primary'),  -- Kevin Ritter, School Chaplain Act
  ('house',  37, 'hb6',       'co'),       -- Tom Young, HB 6 (DEI ban companion)
  ('house',  12, 'hb96',      'primary')   -- Brian Stewart, budget w/ riders
) as x(chamber, district, bill_slug, role)
join public.legislators l
  on l.chamber  = x.chamber
 and l.district = x.district
 and l.is_active
where exists (select 1 from public.bills b where b.slug = x.bill_slug);


-- =============================================================================
-- 6. Re-publish every legislator's scorecard from the canonical data above.
-- -----------------------------------------------------------------------------
-- Inlines what publish_scorecard_all() does, but skips the has_permission()
-- gate so the migration can run without an authenticated JWT. The math
-- itself comes from public.compute_legislator_scorecard(), unchanged.
--
-- After this block:
--   * Every active legislator has exactly one snapshot row with is_current=true.
--   * legislators.{floor,committee,sponsorship}_subscore reflects that snapshot.
--   * public.legislator_scorecard returns the recomputed composite + grade.
-- =============================================================================
insert into public.score_snapshots (
  legislator_id,
  floor_score, committee_score, sponsorship_score,
  public_score, total_score, grade,
  floor_votes_counted, committee_votes_counted,
  sponsorships_counted, statements_counted,
  is_current, published_by, snapshot_at
)
select
  l.id,
  s.floor_score, s.committee_score, s.sponsorship_score,
  s.public_score, s.total_score, s.grade,
  s.floor_votes_counted, s.committee_votes_counted,
  s.sponsorships_counted, s.statements_counted,
  true, 'scorecard-clean-reset', now()
from public.legislators l
cross join lateral public.compute_legislator_scorecard(l.id) s
where l.is_active;

update public.legislators l
   set floor_subscore       = greatest(-5, least(5, round(s.floor_score)::integer)),
       committee_subscore   = greatest(-5, least(5, round(s.committee_score)::integer)),
       sponsorship_subscore = greatest(-5, least(5, round(s.sponsorship_score)::integer)),
       updated_at           = now()
  from public.score_snapshots s
 where s.legislator_id = l.id
   and s.is_current;


-- =============================================================================
-- 7. Sanity assertions — fail loudly if the reset left bad data behind.
-- =============================================================================
do $$
declare
  v_legs        integer;
  v_house       integer;
  v_senate      integer;
  v_rolls       integer;
  v_excs        integer;
  v_spons       integer;
  v_orphan_rolls integer;
  v_orphan_spons integer;
  v_dupe_house  integer;
begin
  select count(*) into v_legs
    from public.legislators where is_active;

  select count(*) into v_house
    from public.legislators where is_active and chamber = 'house';

  select count(*) into v_senate
    from public.legislators where is_active and chamber = 'senate';

  select count(*) into v_rolls           from public.roll_calls;
  select count(*) into v_excs            from public.legislator_vote_exceptions;
  select count(*) into v_spons           from public.legislator_sponsorships;

  select count(*) into v_orphan_rolls
    from public.roll_calls rc
    left join public.bills b on b.slug = rc.bill_slug
    where b.slug is null;

  select count(*) into v_orphan_spons
    from public.legislator_sponsorships s
    left join public.bills b on b.slug = s.bill_slug
    where b.slug is null;

  select count(*) into v_dupe_house
    from (
      select district
        from public.legislators
        where is_active and chamber = 'house'
        group by district
        having count(*) > 1
    ) d;

  raise notice 'scorecard clean reset summary: legislators=% (house=%, senate=%), roll_calls=%, exceptions=%, sponsorships=%',
    v_legs, v_house, v_senate, v_rolls, v_excs, v_spons;

  if v_house <> 99 then
    raise exception 'scorecard reset: expected 99 active house members, got %', v_house;
  end if;
  if v_senate <> 33 then
    raise exception 'scorecard reset: expected 33 active senate members, got %', v_senate;
  end if;
  if v_dupe_house > 0 then
    raise exception 'scorecard reset: duplicate house districts remain';
  end if;
  if v_orphan_rolls > 0 then
    raise exception 'scorecard reset: % roll_calls reference unknown bill slugs', v_orphan_rolls;
  end if;
  if v_orphan_spons > 0 then
    raise exception 'scorecard reset: % sponsorships reference unknown bill slugs', v_orphan_spons;
  end if;
end $$;
