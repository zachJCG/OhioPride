-- =============================================================================
-- 20260510120000_seed_scorecard_and_issues.sql
-- -----------------------------------------------------------------------------
-- Seeds the data the /admin/* pages and /scorecard + /issues need to read
-- live from Supabase instead of /js/bill-data.js, /js/scorecard-data.js, and
-- /js/voting-records.js.
--
-- Idempotent. ON CONFLICT DO UPDATE clauses preserve admin edits on re-run.
--
-- Sources (snapshot 05/10/26):
--   * js/bill-data.js       -> bills (denorm fields) + bill_pipeline_steps
--   * js/scorecard-data.js  -> legislators + legislator_sponsorships
--
-- Committee subscores are not present in the JS source; they default to 0 so
-- the admin dashboard can fill them in. Floor = v, sponsorship = s.
-- =============================================================================

-- ==============================================================================
-- 1. Bills — insert any missing rows from bill-data.js, then upsert denorm fields
-- ==============================================================================
-- 3 new bill(s) not yet in the catalog:
insert into public.bills (slug, label, title, ga, stance, summary, status, is_active, display_order) values
  ('hb96', 'HB 96', 'FY 2026-2027 Operating Budget', '136th', 'anti', 'Ohio''s biennial state operating budget for FY 2026-2027. Contains anti-LGBTQ+ riders affecting K–12, higher education, and state agencies. DeWine line-item-vetoed select equality-related provisions on June 30, 2025; the legislature later overrode select vetoes (House 61–28, Senate 21–11).', 'law', true, 300),
  ('hb838', 'HB 838', 'Restrict Public Coverage of Gender-Affirming Surgery', '136th', 'anti', 'Restricts Medicaid and public-employee health benefits from covering gender-affirming surgery for adult Ohioans. Extends the HB 68 framework from minors into adult care via state coverage rather than direct prohibition.', 'introduced', true, 310),
  ('hb112', 'HB 112', 'Healthcare Sharing Ministries / Right of Conscience', '136th', 'anti', 'Lets providers, hospitals, pharmacists, and insurers refuse to participate in or pay for services on conscience or religious grounds. Pairs broad refusal protections with a healthcare sharing ministry framework outside standard insurance regulation — long-tail risk for LGBTQ+ patients.', 'in-committee', true, 320)
on conflict (slug) do nothing;

-- Upsert denormalized issue-page columns for every tracked bill.
-- Uses temp staging + update so we don't disturb the bill identity columns.
with src(slug, nickname, official_title, status_label, status_color, categories, category_labels, sponsors_text, last_action, next_date, house_vote, chamber, current_step, url, legislature_url, text_url) as (values
  ('hb96', 'Budget with Anti-LGBTQ+ Riders', 'Make operating appropriations for the biennium ending June 30, 2027', 'Enacted with Anti-LGBTQ+ Riders', '#dc2626', array['education', 'anti-trans', 'civil-rights']::text[], array['Education', 'Anti-Trans', 'Civil Rights']::text[], 'Executive Budget (Gov. DeWine) / House Finance', 'Signed with line-item vetoes; select overrides recorded — June 30, 2025', 'Provision-level mapping of surviving language pending', '', 'house', 8, '/issues/hb96', 'https://www.legislature.ohio.gov/legislation/136/hb96', 'https://search-prod.lis.state.oh.us/api/v2/general_assembly_136/legislation/hb96/00_IN/pdf/'),
  ('hb249', 'Drag Ban', 'Enact the Indecent Exposure Modernization Act', 'Passed House → In Senate', '#dc2626', array['expression', 'anti-trans']::text[], array['Expression', 'Anti-Trans']::text[], 'Rep. Angela N. King (R-84), Rep. Josh Williams (R-44)', 'Referred to Senate Judiciary Committee — April 15, 2026', 'Awaiting first Senate committee hearing', 'Passed 63–32 on March 25, 2026', 'house', 6, '/issues/hb249', 'https://www.legislature.ohio.gov/legislation/136/hb249', 'https://search-prod.lis.state.oh.us/api/v2/general_assembly_136/legislation/hb249/00_IN/pdf/'),
  ('hb838', 'Adult Trans Care Coverage Ban', 'Restrict Medicaid and public-employee coverage of gender-affirming surgery', 'Introduced', '#3b82f6', array['healthcare', 'anti-trans']::text[], array['Healthcare', 'Anti-Trans']::text[], 'Rep. Gross', 'Introduced — April 30, 2026', 'Awaiting committee assignment', '', 'house', 0, '/issues/hb838', 'https://www.legislature.ohio.gov/legislation/136/hb838', 'https://search-prod.lis.state.oh.us/api/v2/general_assembly_136/legislation/hb838/00_IN/pdf/'),
  ('hb112', 'Healthcare Refusal Bill', 'Regards healthcare sharing ministries and right-of-conscience protections', 'In Committee', '#f59e0b', array['healthcare']::text[], array['Healthcare']::text[], 'Rep. Gross', 'Referred to House Judiciary Committee — February 26, 2025', 'Awaiting committee hearing', '', 'house', 1, '/issues/hb112', 'https://www.legislature.ohio.gov/legislation/136/hb112', 'https://search-prod.lis.state.oh.us/api/v2/general_assembly_136/legislation/hb112/00_IN/pdf/'),
  ('hb693', 'Parental Rejection Shield', 'Enact the Affirming Families First Act', 'In Committee', '#f59e0b', array['youth', 'anti-trans']::text[], array['Youth / Family', 'Anti-Trans']::text[], 'Rep. Gary Click (R-88), Rep. Josh Williams (R-44)', '2nd hearing (proponent testimony) in House Judiciary — March 25, 2026', 'Opponent testimony expected next', '', 'house', 2, '/issues/hb693', 'https://www.legislature.ohio.gov/legislation/136/hb693', 'https://search-prod.lis.state.oh.us/api/v2/general_assembly_136/legislation/hb693/00_IN/pdf/'),
  ('hb798', 'Omnibus Anti-Trans Bill', 'Enact the Privacy Protection Act', 'Introduced', '#3b82f6', array['anti-trans', 'education', 'corrections']::text[], array['Anti-Trans', 'Education', 'Corrections']::text[], 'Rep. Josh Williams (R-44)', 'Introduced — March 31, 2026', 'Awaiting committee assignment', '', 'house', 0, '/issues/hb798', 'https://www.legislature.ohio.gov/legislation/136/hb798', 'https://search-prod.lis.state.oh.us/api/v2/general_assembly_136/legislation/hb798/00_IN/pdf/'),
  ('hb796', 'Prison Trans Housing Ban', 'Ensure inmates, prisoners housed according to biological sex', 'Introduced', '#3b82f6', array['corrections', 'anti-trans']::text[], array['Corrections', 'Anti-Trans']::text[], 'Rep. Josh Williams (R-44)', 'Introduced — March 25, 2026', 'Awaiting committee assignment', '', 'house', 0, '/issues/hb796', 'https://www.legislature.ohio.gov/legislation/136/hb796', 'https://search-prod.lis.state.oh.us/api/v2/general_assembly_136/legislation/hb796/00_IN/pdf/'),
  ('hb190', 'Forced Outing / Pronoun Ban', 'Enact the Given Name Act', 'In Committee', '#f59e0b', array['education', 'anti-trans']::text[], array['Education', 'Anti-Trans']::text[], 'Rep. Johnathan Newman (R-80), Rep. Josh Williams (R-44)', '1st hearing in House Education — April 29, 2025', 'Additional hearings expected', '', 'house', 2, '/issues/hb190', 'https://www.legislature.ohio.gov/legislation/136/hb190', 'https://search-prod.lis.state.oh.us/api/v2/general_assembly_136/legislation/hb190/00_IN/pdf/'),
  ('hb155', 'K–12 DEI Ban', 'Prohibit diversity, equity, and inclusion in public schools', 'In Committee', '#f59e0b', array['education']::text[], array['Education / DEI']::text[], 'Rep. Beth Lear (R-61), Rep. Josh Williams (R-44)', '2nd hearing in House Education — May 20, 2025', 'Additional hearings expected', '', 'house', 2, '/issues/hb155', 'https://www.legislature.ohio.gov/legislation/136/hb155', 'https://search-prod.lis.state.oh.us/api/v2/general_assembly_136/legislation/hb155/00_IN/pdf/'),
  ('sb113', 'Senate DEI Ban', 'Prohibit diversity, equity, and inclusion in public schools', 'In Committee', '#f59e0b', array['education']::text[], array['Education / DEI']::text[], 'Sen. Andrew Brenner (R-19)', '2nd hearing in Senate Education — March 25, 2026', 'Additional hearings expected', '', 'senate', 2, '/issues/sb113', 'https://www.legislature.ohio.gov/legislation/136/sb113', 'https://search-prod.lis.state.oh.us/api/v2/general_assembly_136/legislation/sb113/00_IN/pdf/'),
  ('hb172', 'Youth Therapy Consent Rollback', 'Prohibit mental health service to minors without parental consent', 'In Committee', '#f59e0b', array['youth']::text[], array['Youth / Family']::text[], 'Rep. Johnathan Newman (R-80)', 'Opponent testimony in House Health — November 19, 2025', 'Additional hearings or committee vote', '', 'house', 2, '/issues/hb172', 'https://www.legislature.ohio.gov/legislation/136/hb172', 'https://search-prod.lis.state.oh.us/api/v2/general_assembly_136/legislation/hb172/00_IN/pdf/'),
  ('hb196', 'Deadnaming Candidates Bill', 'Regards candidate nomination protests, names on candidacy forms', 'In Committee', '#f59e0b', array['elections']::text[], array['Elections / Privacy']::text[], 'Rep. Rodney Creech (R-40), Rep. Angela N. King (R-84)', '1st hearing in House General Government — April 29, 2025', 'Additional hearings expected', '', 'house', 2, '/issues/hb196', 'https://www.legislature.ohio.gov/legislation/136/hb196', 'https://search-prod.lis.state.oh.us/api/v2/general_assembly_136/legislation/hb196/00_IN/pdf/'),
  ('sb34', 'Ten Commandments Classroom Displays', 'Enact the Display of Founding Documents of Historic Significance Act', 'Passed Senate → In House', '#dc2626', array['education']::text[], array['Education']::text[], 'Sen. Terry Johnson (R-14)', 'Referred to House Education Committee — February 4, 2026', 'Awaiting House committee hearing', '', 'senate', 6, '/issues/sb34', 'https://www.legislature.ohio.gov/legislation/136/sb34', 'https://search-prod.lis.state.oh.us/api/v2/general_assembly_136/legislation/sb34/00_IN/pdf/'),
  ('hb602', 'Pride Flag Ban on State Property', 'Limit types of flags that state agencies may display on grounds or buildings', 'In Committee', '#f59e0b', array['expression']::text[], array['Expression']::text[], 'Rep. D.J. Swearingen (R-89), Rep. Rodney Creech (R-40)', 'Sponsor testimony in House General Government — week of March 30, 2026', 'Additional hearings expected', '', 'house', 2, '/issues/hb602', 'https://www.legislature.ohio.gov/legislation/136/hb602', 'https://search-prod.lis.state.oh.us/api/v2/general_assembly_136/legislation/hb602/00_IN/pdf/'),
  ('sb274', 'Senate Companion to HB 172', 'Prohibit mental health service to minors without parental consent', 'In Committee', '#f59e0b', array['youth']::text[], array['Youth / Family']::text[], 'Sen. Jerry Cirino (R-18), Sen. Andrew Brenner (R-19)', 'Referred to Senate Health Committee — October 1, 2025', 'Awaiting committee hearing', '', 'senate', 1, '/issues/sb274', 'https://www.legislature.ohio.gov/legislation/136/sb274', 'https://search-prod.lis.state.oh.us/api/v2/general_assembly_136/legislation/sb274/00_IN/pdf/'),
  ('hb457', 'Sexual Orientation Aggravator Removal', 'Create enhanced penalties for politically motivated offenses', 'In Committee', '#f59e0b', array['civil-rights', 'anti-trans']::text[], array['Civil Rights', 'Anti-Trans']::text[], 'Rep. Jack K. Daniels (R-32), Rep. Josh Williams (R-44)', 'Referred to House Criminal Justice Committee', 'Awaiting committee hearing', '', 'house', 1, '/issues/hb457', 'https://www.legislature.ohio.gov/legislation/136/hb457', 'https://search-prod.lis.state.oh.us/api/v2/general_assembly_136/legislation/hb457/00_IN/pdf/'),
  ('hb262', 'Anti-LGBTQ Family Framing', 'Designate Natural Family Month', 'In Committee', '#f59e0b', array['youth']::text[], array['Youth / Family']::text[], 'Rep. Beth Lear (R-61), Rep. Josh Williams (R-44)', 'Proponent testimony — September 30, 2025', 'Additional hearings or committee vote', '', 'house', 2, '/issues/hb262', 'https://www.legislature.ohio.gov/legislation/136/hb262', 'https://search-prod.lis.state.oh.us/api/v2/general_assembly_136/legislation/hb262/00_IN/pdf/'),
  ('sb70', 'Statewide Nondiscrimination Protections', 'Enact the Ohio Fairness Act regarding nondiscrimination protections', 'In Committee', '#22c55e', array['civil-rights']::text[], array['Civil Rights']::text[], 'Sen. Nickie Antonio (D-23)', 'Referred to Senate Judiciary Committee', 'Awaiting committee hearing', '', 'senate', 1, '/issues/sb70', 'https://www.legislature.ohio.gov/legislation/136/sb70', 'https://search-prod.lis.state.oh.us/api/v2/general_assembly_136/legislation/sb70/00_IN/pdf/'),
  ('hb136', 'House Nondiscrimination Companion', 'Enact the Ohio Fairness Act regarding nondiscrimination protections', 'In Committee', '#22c55e', array['civil-rights']::text[], array['Civil Rights']::text[], 'Rep. Tristan Rader (D-13), Rep. Crystal Lett (D-11)', 'Referred to House Judiciary Committee — March 5, 2025', 'Awaiting committee hearing', '', 'house', 1, '/issues/hb136', 'https://www.legislature.ohio.gov/legislation/136/hb136', 'https://search-prod.lis.state.oh.us/api/v2/general_assembly_136/legislation/hb136/00_IN/pdf/'),
  ('sb71', 'Protect LGBTQ+ Youth from Conversion Therapy', 'Prohibit licensed professionals from practicing conversion therapy on minors', 'In Committee', '#22c55e', array['healthcare', 'youth']::text[], array['Healthcare', 'Youth / Family']::text[], 'Sen. Nickie Antonio (D-23)', 'Referred to Senate Health Committee', 'Awaiting committee hearing', '', 'senate', 1, '/issues/sb71', 'https://www.legislature.ohio.gov/legislation/136/sb71', 'https://search-prod.lis.state.oh.us/api/v2/general_assembly_136/legislation/sb71/00_IN/pdf/'),
  ('hb300', 'House Conversion Therapy Companion', 'Prohibit licensed professionals from practicing conversion therapy on minors', 'Introduced', '#22c55e', array['healthcare', 'youth']::text[], array['Healthcare', 'Youth / Family']::text[], 'Rep. Karen Brownlee (D-28), Rep. Crystal Lett (D-11)', 'Referred to House Health Committee — May 28, 2025', 'Awaiting committee hearing', '', 'house', 1, '/issues/hb300', 'https://www.legislature.ohio.gov/legislation/136/hb300', 'https://search-prod.lis.state.oh.us/api/v2/general_assembly_136/legislation/hb300/00_IN/pdf/'),
  ('sb211', 'Celebrate Diverse Ohio Families', 'Designate Love Makes a Family Week in Ohio', 'Introduced', '#22c55e', array['youth']::text[], array['Youth / Family']::text[], 'Sen. Nickie Antonio (D-23)', 'Introduced — October 14, 2025', 'Awaiting committee assignment', '', 'senate', 0, '/issues/sb211', 'https://www.legislature.ohio.gov/legislation/136/sb211', 'https://search-prod.lis.state.oh.us/api/v2/general_assembly_136/legislation/sb211/00_IN/pdf/'),
  ('hb327', 'Parental Rights for Affirming Families', 'Enact the Parental Rights in Diverse Environments Act', 'In Committee', '#22c55e', array['youth', 'civil-rights']::text[], array['Youth / Family', 'Civil Rights']::text[], 'Rep. Karen Brownlee (D-28), Rep. Darnell Brewer (D-23)', 'Referred to House Children and Human Services Committee — June 11, 2025', 'Awaiting committee hearing', '', 'house', 1, '/issues/hb327', 'https://www.legislature.ohio.gov/legislation/136/hb327', 'https://search-prod.lis.state.oh.us/api/v2/general_assembly_136/legislation/hb327/00_IN/pdf/'),
  ('hjr4', 'Repeal Ohio''s 2004 Same-Sex Marriage Ban', 'Amend Article XV Section 11 of the Constitution of Ohio regarding marriage', 'In Committee', '#22c55e', array['civil-rights']::text[], array['Civil Rights']::text[], 'Rep. Eric Synenberg (D-22), Rep. Anita Somani (D-11)', 'Referred to House Judiciary Committee — June 2025', 'Awaiting committee hearing', '', 'house', 1, '/issues/hjr4', 'https://www.legislature.ohio.gov/legislation/136/hjr4', 'https://search-prod.lis.state.oh.us/api/v2/general_assembly_136/legislation/hjr4/00_IN/pdf/'),
  ('hb306', 'Hate Crimes — Excludes Trans Protections', 'Enact the Ohio Hate Crimes Act', 'In Committee', '#eab308', array['civil-rights']::text[], array['Civil Rights']::text[], 'Rep. Brett Hillyer (R-37), Rep. Bride Rose Sweeney (D-16)', '1st hearing in House Criminal Justice Committee — February 25, 2026', 'Additional hearings expected', '', 'house', 2, '/issues/hb306', 'https://www.legislature.ohio.gov/legislation/136/hb306', 'https://search-prod.lis.state.oh.us/api/v2/general_assembly_136/legislation/hb306/00_IN/pdf/')
)
update public.bills b
   set nickname        = src.nickname,
       official_title  = src.official_title,
       status_label    = src.status_label,
       status_color    = nullif(src.status_color, ''),
       categories      = src.categories,
       category_labels = src.category_labels,
       sponsors_text   = src.sponsors_text,
       last_action     = src.last_action,
       next_date       = src.next_date,
       house_vote      = src.house_vote,
       chamber         = src.chamber,
       current_step    = src.current_step,
       url             = src.url,
       legislature_url = nullif(src.legislature_url, ''),
       text_url        = nullif(src.text_url, ''),
       updated_at      = now()
  from src
 where b.slug = src.slug;

-- ==============================================================================
-- 2. Bill pipeline steps — one row per (bill, step) for every dated step
-- ==============================================================================
-- 59 pipeline step row(s)
insert into public.bill_pipeline_steps (bill_slug, step_index, step_label, happened_on) values
  ('hb96', 0, null, '2025-04-01'::date),
  ('hb96', 4, null, '2025-04-09'::date),
  ('hb96', 7, null, '2025-06-11'::date),
  ('hb96', 8, null, '2025-06-30'::date),
  ('hb249', 0, null, '2025-04-29'::date),
  ('hb249', 1, null, '2025-05-07'::date),
  ('hb249', 3, null, '2026-03-25'::date),
  ('hb249', 4, null, '2026-03-25'::date),
  ('hb249', 5, null, '2026-03-26'::date),
  ('hb249', 6, null, '2026-04-15'::date),
  ('hb838', 0, null, '2026-04-30'::date),
  ('hb112', 0, null, '2025-02-18'::date),
  ('hb112', 1, null, '2025-02-26'::date),
  ('hb693', 0, null, '2026-02-10'::date),
  ('hb693', 1, null, '2026-02-18'::date),
  ('hb693', 2, null, '2026-03-25'::date),
  ('hb798', 0, null, '2026-03-31'::date),
  ('hb796', 0, null, '2026-03-25'::date),
  ('hb190', 0, null, '2025-03-24'::date),
  ('hb190', 1, null, '2025-03-26'::date),
  ('hb190', 2, null, '2025-04-29'::date),
  ('hb155', 0, null, '2025-03-06'::date),
  ('hb155', 1, null, '2025-03-19'::date),
  ('hb155', 2, null, '2025-05-20'::date),
  ('sb113', 2, null, '2026-03-25'::date),
  ('hb172', 0, null, '2025-03-12'::date),
  ('hb172', 1, null, '2025-03-19'::date),
  ('hb172', 2, null, '2025-11-19'::date),
  ('hb196', 0, null, '2025-03-24'::date),
  ('hb196', 1, null, '2025-03-26'::date),
  ('hb196', 2, null, '2025-04-29'::date),
  ('sb34', 0, null, '2025-02-01'::date),
  ('sb34', 3, null, '2025-04-08'::date),
  ('sb34', 4, null, '2025-11-20'::date),
  ('sb34', 5, null, '2025-11-20'::date),
  ('sb34', 6, null, '2026-02-04'::date),
  ('hb602', 0, null, '2025-11-18'::date),
  ('hb602', 2, null, '2026-03-30'::date),
  ('sb274', 0, null, '2025-09-30'::date),
  ('sb274', 1, null, '2025-10-01'::date),
  ('hb262', 0, null, '2025-05-13'::date),
  ('hb262', 1, null, '2025-05-14'::date),
  ('hb262', 2, null, '2025-09-30'::date),
  ('sb70', 0, null, '2025-02-11'::date),
  ('sb70', 1, null, '2025-02-19'::date),
  ('hb136', 0, null, '2025-02-25'::date),
  ('hb136', 1, null, '2025-03-05'::date),
  ('sb71', 0, null, '2025-02-11'::date),
  ('sb71', 1, null, '2025-02-19'::date),
  ('hb300', 0, null, '2025-05-21'::date),
  ('hb300', 1, null, '2025-05-28'::date),
  ('sb211', 0, null, '2025-10-14'::date),
  ('hb327', 0, null, '2025-06-03'::date),
  ('hb327', 1, null, '2025-06-11'::date),
  ('hjr4', 0, null, '2025-06-03'::date),
  ('hjr4', 1, null, '2025-06-01'::date),
  ('hb306', 0, null, '2025-05-27'::date),
  ('hb306', 1, null, '2025-06-04'::date),
  ('hb306', 2, null, '2026-02-25'::date)
on conflict (bill_slug, step_index) do update set
  step_label  = excluded.step_label,
  happened_on = excluded.happened_on,
  updated_at  = now();

-- ==============================================================================
-- 3. Legislators — 99 House + 33 Senate, with floor and sponsorship subscores
-- ==============================================================================
insert into public.legislators
  (id, chamber, district, full_name, party, floor_subscore, committee_subscore, sponsorship_subscore, notes)
values
  ('h-1', 'house', 1, 'Dontavius L. Jarrells', 'D', 5, 0, 3, 'Primary sponsor HB 306 (Hate Crimes Act). Votes consistently against anti-LGBTQ+ bills.'),
  ('h-2', 'house', 2, 'Latyna M. Humphrey', 'D', 5, 0, 0, 'Votes against anti-LGBTQ+ bills.'),
  ('h-3', 'house', 3, 'Ismail Mohamed', 'D', 5, 0, 0, 'Votes against anti-LGBTQ+ bills.'),
  ('h-4', 'house', 4, 'Beryl Brown Piccolantonio', 'D', 5, 0, 0, 'Votes against anti-LGBTQ+ bills.'),
  ('h-5', 'house', 5, 'Meredith R. Lawson-Rowe', 'D', 5, 0, 0, 'Votes against anti-LGBTQ+ bills.'),
  ('h-6', 'house', 6, 'Christine Cockley', 'D', 5, 0, 0, 'Votes against anti-LGBTQ+ bills.'),
  ('h-7', 'house', 7, 'C. Allison Russo', 'D', 5, 0, 0, 'Votes against anti-LGBTQ+ bills. House Minority Leader.'),
  ('h-8', 'house', 8, 'Anita Somani', 'D', 5, 0, 0, 'Votes against anti-LGBTQ+ bills. Medical professional; vocal on healthcare bills.'),
  ('h-9', 'house', 9, 'Munira Abdullahi', 'D', 5, 0, 0, 'Votes against anti-LGBTQ+ bills.'),
  ('h-10', 'house', 10, 'Mark Sigrist', 'D', 5, 0, 0, 'Votes against anti-LGBTQ+ bills.'),
  ('h-11', 'house', 11, 'Crystal Lett', 'D', 5, 0, 5, 'Primary sponsor HB 136 (Fairness Act), co-sponsor HB 300 (conversion therapy ban). Champion.'),
  ('h-12', 'house', 12, 'Brian Stewart', 'R', -5, 0, -3, 'Primary sponsor Sub HB 96 (budget with anti-LGBTQ+ provisions). Votes for anti-LGBTQ+ bills.'),
  ('h-13', 'house', 13, 'Tristan Rader', 'D', 5, 0, 5, 'Primary sponsor HB 136 (Fairness Act). Vocal advocate for LGBTQ+ rights. Hosts Pride press conferences.'),
  ('h-14', 'house', 14, 'Sean P. Brennan', 'D', 5, 0, 0, 'Votes against anti-LGBTQ+ bills.'),
  ('h-15', 'house', 15, 'Chris Glassburn', 'D', 5, 0, 0, 'Votes against anti-LGBTQ+ bills.'),
  ('h-16', 'house', 16, 'Bride Rose Sweeney', 'D', 5, 0, 0, 'Votes against anti-LGBTQ+ bills.'),
  ('h-17', 'house', 17, 'Michael D. Dovilla', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-18', 'house', 18, 'Juanita O. Brent', 'D', 5, 0, 0, 'Votes against anti-LGBTQ+ bills.'),
  ('h-19', 'house', 19, 'Phillip M. Robinson, Jr.', 'D', 5, 0, 0, 'Votes against anti-LGBTQ+ bills.'),
  ('h-20', 'house', 20, 'Terrence Upchurch', 'D', 5, 0, 0, 'Votes against anti-LGBTQ+ bills.'),
  ('h-21', 'house', 21, 'Eric Synenberg', 'D', 5, 0, 0, 'Votes against anti-LGBTQ+ bills. Participated in Pride press conference.'),
  ('h-22', 'house', 22, 'Darnell T. Brewer', 'D', 5, 0, 2, 'Co-sponsor HB 327 (PRIDE Act). Votes against anti-LGBTQ+ bills.'),
  ('h-23', 'house', 23, 'Daniel P. Troy', 'D', 5, 0, 0, 'Votes against anti-LGBTQ+ bills.'),
  ('h-24', 'house', 24, 'Dani Isaacsohn', 'D', 5, 0, 0, 'Votes against anti-LGBTQ+ bills. Vocal opponent of HB 68 in 135th GA.'),
  ('h-25', 'house', 25, 'Cecil Thomas', 'D', 5, 0, 0, 'Votes against anti-LGBTQ+ bills.'),
  ('h-26', 'house', 26, 'Ashley Bryant Bailey', 'D', 5, 0, 0, 'Votes against anti-LGBTQ+ bills.'),
  ('h-27', 'house', 27, 'Rachel B. Baker', 'D', 5, 0, 0, 'Votes against anti-LGBTQ+ bills.'),
  ('h-28', 'house', 28, 'Karen Brownlee', 'D', 5, 0, 5, 'Primary sponsor HB 300 (conversion therapy ban), HB 327 (PRIDE Act). Strong champion.'),
  ('h-29', 'house', 29, 'Cindy Abrams', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-30', 'house', 30, 'Mike Odioso', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-31', 'house', 31, 'Bill Roemer', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-32', 'house', 32, 'Jack K. Daniels', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-33', 'house', 33, 'Veronica R. Sims', 'D', 5, 0, 0, 'Votes against anti-LGBTQ+ bills.'),
  ('h-34', 'house', 34, 'Derrick Hall', 'D', 5, 0, 0, 'Votes against anti-LGBTQ+ bills.'),
  ('h-35', 'house', 35, 'Steve Demetriou', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-36', 'house', 36, 'Andrea White', 'R', -2, 0, 0, 'Voted against HB 8 (forced outing). Otherwise votes party line on anti-LGBTQ+ bills.'),
  ('h-37', 'house', 37, 'Tom Young', 'R', -5, 0, -2, 'Co-sponsor HB 6 (companion to SB 1 DEI ban). Votes for anti-LGBTQ+ bills.'),
  ('h-38', 'house', 38, 'Desiree Tims', 'D', 5, 0, 0, 'Votes against anti-LGBTQ+ bills.'),
  ('h-39', 'house', 39, 'Phil Plummer', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-40', 'house', 40, 'Rodney Creech', 'R', -5, 0, -3, 'Primary sponsor HB 196 (trans candidate disclosure). Accused of sexual misconduct with minor relative (BCI documents).'),
  ('h-41', 'house', 41, 'Erika White', 'D', 5, 0, 0, 'Votes against anti-LGBTQ+ bills.'),
  ('h-42', 'house', 42, 'Elgin Rogers, Jr.', 'D', 5, 0, 0, 'Votes against anti-LGBTQ+ bills.'),
  ('h-43', 'house', 43, 'Michele Grim', 'D', 5, 0, 0, 'Votes against anti-LGBTQ+ bills.'),
  ('h-44', 'house', 44, 'Josh Williams', 'R', -5, 0, -15, 'Primary/co-sponsor of 8+ anti-LGBTQ+ bills: HB 249, 155, 190, 262, 693, 796, 798. Most prolific anti-LGBTQ+ bill author in 136th GA.'),
  ('h-45', 'house', 45, 'Jennifer Gross', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-46', 'house', 46, 'Thomas Hall', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-47', 'house', 47, 'Diane Mullins', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-48', 'house', 48, 'Scott Oelslager', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-49', 'house', 49, 'Jim Thomas', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-50', 'house', 50, 'Matthew Kishman', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-51', 'house', 51, 'Jodi Salvo', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-52', 'house', 52, 'Gayle Manning', 'R', -2, 0, 0, 'Voted against HB 8 (forced outing) and original HB 6 (sports ban) in committee. Otherwise party line.'),
  ('h-53', 'house', 53, 'Joseph A. Miller, III', 'D', 5, 0, 0, 'Votes against anti-LGBTQ+ bills.'),
  ('h-54', 'house', 54, 'Kellie Deeter', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-55', 'house', 55, 'Michelle Teska', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-56', 'house', 56, 'Adam Mathews', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-57', 'house', 57, 'Jamie Callender', 'R', 5, 0, 0, 'Only Republican to vote against HB 68, HB 6, HB 8, and HB 249. Stated: ''I am a Republican because I believe in empowering individuals and limiting government.'''),
  ('h-58', 'house', 58, 'Lauren McNally', 'D', 5, 0, 0, 'Votes against anti-LGBTQ+ bills.'),
  ('h-59', 'house', 59, 'Tex Fischer', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-60', 'house', 60, 'Brian Lorenz', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-61', 'house', 61, 'Beth Lear', 'R', -5, 0, -6, 'Primary sponsor HB 155 (DEI ban), HB 262 (Natural Family Month). Anti-equality rhetoric.'),
  ('h-62', 'house', 62, 'Jean Schmidt', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-63', 'house', 63, 'Adam C. Bird', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-64', 'house', 64, 'Nick Santucci', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-65', 'house', 65, 'David Thomas', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-66', 'house', 66, 'Sharon A. Ray', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-67', 'house', 67, 'Melanie Miller', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-68', 'house', 68, 'Thaddeus J. Claggett', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-69', 'house', 69, 'Kevin D. Miller', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-70', 'house', 70, 'Brian Lampton', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-71', 'house', 71, 'Levi Dean', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-72', 'house', 72, 'Heidi Workman', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-73', 'house', 73, 'Jeff LaRe', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-74', 'house', 74, 'Bernard Willis', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-75', 'house', 75, 'Haraz N. Ghanbari', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-76', 'house', 76, 'Marilyn John', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-77', 'house', 77, 'Meredith Craig', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-78', 'house', 78, 'Matt Huffman', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills. Former Senate President who advanced anti-LGBTQ+ agenda.'),
  ('h-79', 'house', 79, 'Monica Robb Blasdel', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-80', 'house', 80, 'Johnathan Newman', 'R', -5, 0, -6, 'Primary sponsor HB 190 (Given Names Act), HB 172 (mental health consent removal). Ties to Center for Christian Virtue (SPLC-designated anti-LGBTQ group).'),
  ('h-81', 'house', 81, 'James M. Hoops', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-82', 'house', 82, 'Roy Klopfenstein', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-83', 'house', 83, 'Ty D. Mathews', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-84', 'house', 84, 'Angela N. King', 'R', -5, 0, -6, 'Primary sponsor HB 249 (drag ban), co-sponsor HB 196 (trans candidate disclosure). Vocal proponent of anti-LGBTQ+ legislation.'),
  ('h-85', 'house', 85, 'Tim Barhorst', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-86', 'house', 86, 'Tracy M. Richardson', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-87', 'house', 87, 'Riordan T. McClain', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-88', 'house', 88, 'Gary Click', 'R', -5, 0, -6, 'Primary sponsor HB 68 (135th GA, care ban) and HB 693 (affirming families). Compared trans people to ''Lucifer.'' Misconduct-related allegations involving minors.'),
  ('h-89', 'house', 89, 'D. J. Swearingen', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-90', 'house', 90, 'Justin Pizzulli', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-91', 'house', 91, 'Bob Peterson', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-92', 'house', 92, 'Mark Johnson', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-93', 'house', 93, 'Jason Stephens', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-94', 'house', 94, 'Kevin Ritter', 'R', -5, 0, -3, 'Primary sponsor HB 507 (School Chaplain Act). Votes for anti-LGBTQ+ bills.'),
  ('h-95', 'house', 95, 'Ty Moore', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-96', 'house', 96, 'Ron Ferguson', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-97', 'house', 97, 'Adam Holmes', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-98', 'house', 98, 'Mark Hiner', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('h-99', 'house', 99, 'Sarah Fowler Arthur', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills. Known for far-right positions.'),
  ('s-1', 'senate', 1, 'Rob McColley', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('s-2', 'senate', 2, 'Theresa Gavarone', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('s-3', 'senate', 3, 'Michele Reynolds', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('s-4', 'senate', 4, 'George F. Lang', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('s-5', 'senate', 5, 'Stephen A. Huffman', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('s-6', 'senate', 6, 'Willis E. Blackshear, Jr.', 'D', 5, 0, 0, 'Votes against anti-LGBTQ+ bills.'),
  ('s-7', 'senate', 7, 'Steve Wilson', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('s-8', 'senate', 8, 'Louis W. Blessing, III', 'R', -3, 0, 0, 'Voted against HB 8 (forced outing) in Senate. Otherwise votes party line.'),
  ('s-9', 'senate', 9, 'Catherine D. Ingram', 'D', 5, 0, 0, 'Votes against anti-LGBTQ+ bills. Vocal opponent of SB 104 (bathroom ban).'),
  ('s-10', 'senate', 10, 'Kyle Koehler', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('s-11', 'senate', 11, 'Paula Hicks-Hudson', 'D', 5, 0, 0, 'Votes against anti-LGBTQ+ bills. Argued ''Just let me live'' during HB 68 override debate.'),
  ('s-12', 'senate', 12, 'Susan Manchester', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('s-13', 'senate', 13, 'Nathan H. Manning', 'R', -1, 0, 0, 'Only Republican senator to vote against HB 68 veto override. Notable crossover on major bill.'),
  ('s-14', 'senate', 14, 'Terry Johnson', 'R', -5, 0, -3, 'Primary sponsor SB 34 (Ten Commandments in schools).'),
  ('s-15', 'senate', 15, 'Hearcel F. Craig', 'D', 5, 0, 0, 'Votes against anti-LGBTQ+ bills.'),
  ('s-16', 'senate', 16, 'Beth Liston', 'D', 5, 0, 2, 'Co-sponsor SB 71 (conversion therapy ban). Votes against anti-LGBTQ+ bills.'),
  ('s-17', 'senate', 17, 'Shane Wilkin', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('s-18', 'senate', 18, 'Jerry C. Cirino', 'R', -5, 0, -9, 'Primary sponsor SB 1 (DEI ban), co-sponsor SB 104 (bathroom ban), SB 274 (minor consent). Religious arguments for HB 68 override.'),
  ('s-19', 'senate', 19, 'Andrew O. Brenner', 'R', -5, 0, -9, 'Primary sponsor SB 113 (school DEI ban), SB 274 (minor consent), co-sponsor SB 104 (bathroom ban). Called DEI ''institutional discrimination.'''),
  ('s-20', 'senate', 20, 'Tim Schaffer', 'R', -5, 0, -3, 'Primary sponsor SB 53 (anti-protest/vandalism).'),
  ('s-21', 'senate', 21, 'Kent Smith', 'D', 5, 0, 0, 'Criticized ''state-sponsored bullying of trans youth'' during HB 68 debate.'),
  ('s-22', 'senate', 22, 'Mark Romanchuk', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('s-23', 'senate', 23, 'Nickie J. Antonio', 'D', 5, 0, 9, 'Primary sponsor SB 70 (Fairness Act, 12th time), SB 71 (conversion therapy ban), SB 211 (Love Makes a Family). Senate Minority Leader. First openly LGBTQ+ Ohio legislator.'),
  ('s-24', 'senate', 24, 'Thomas F. Patton', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('s-25', 'senate', 25, 'William P. DeMora', 'D', 5, 0, 0, 'Motioned to adjourn in protest against HB 68 override vote. Did not co-sponsor HB 68 or any tracked anti-equality bill.'),
  ('s-26', 'senate', 26, 'Bill Reineke', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('s-27', 'senate', 27, 'Kristina D. Roegner', 'R', -5, 0, 0, 'Made anti-trans statements during HB 68 override debate.'),
  ('s-28', 'senate', 28, 'Casey Weinstein', 'D', 5, 0, 0, 'Votes against anti-LGBTQ+ bills.'),
  ('s-29', 'senate', 29, 'Jane M. Timken', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('s-30', 'senate', 30, 'Brian M. Chavez', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('s-31', 'senate', 31, 'Al Landis', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('s-32', 'senate', 32, 'Sandra O''Brien', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.'),
  ('s-33', 'senate', 33, 'Al Cutrona', 'R', -5, 0, 0, 'Votes for anti-LGBTQ+ bills.')
on conflict (id) do update set
  chamber              = excluded.chamber,
  district             = excluded.district,
  full_name            = excluded.full_name,
  party                = excluded.party,
  -- Subscores: only update if admin hasn't changed them since seed.
  -- We do that by only writing when current value is still 0 (default).
  floor_subscore       = case when public.legislators.floor_subscore       = 0 then excluded.floor_subscore       else public.legislators.floor_subscore       end,
  sponsorship_subscore = case when public.legislators.sponsorship_subscore = 0 then excluded.sponsorship_subscore else public.legislators.sponsorship_subscore end,
  -- Never overwrite committee_subscore from this seed (it's admin-owned).
  notes                = case when public.legislators.notes is null or public.legislators.notes = '' then excluded.notes else public.legislators.notes end,
  updated_at           = now();

-- ==============================================================================
-- 4. Legislator sponsorships — primary / co-sponsor map from scorecard-data.js
-- ==============================================================================
-- 18 sponsorship row(s)
insert into public.legislator_sponsorships (legislator_id, bill_slug, role)
select v.legislator_id, v.bill_slug, v.role
from (values
  ('h-4', 'hb467-135', 'primary'),
  ('h-43', 'hb467-135', 'primary'),
  ('h-1', 'hb306', 'primary'),
  ('h-1', 'hb467-135', 'co'),
  ('h-8', 'hb467-135', 'co'),
  ('h-9', 'hb467-135', 'co'),
  ('h-11', 'hb136', 'primary'),
  ('h-11', 'hb300', 'co'),
  ('h-11', 'hb467-135', 'co'),
  ('h-13', 'hb136', 'primary'),
  ('h-13', 'hb467-135', 'co'),
  ('h-16', 'hb467-135', 'co'),
  ('h-28', 'hb300', 'primary'),
  ('h-28', 'hb327', 'primary'),
  ('h-28', 'hb467-135', 'co'),
  ('h-53', 'hb467-135', 'co'),
  ('s-9', 'hb467-135', 'co'),
  ('s-15', 'hb467-135', 'co')
) as v(legislator_id, bill_slug, role)
join public.bills b        on b.slug = v.bill_slug
join public.legislators l  on l.id   = v.legislator_id
on conflict (legislator_id, bill_slug) do update set role = excluded.role;

-- ==============================================================================
-- 5. Bookkeeping
-- ==============================================================================
-- Bump updated_at on bills so /issues last-updated card refreshes.
update public.bills set updated_at = now() where slug in (
  'hb96', 'hb249', 'hb838', 'hb112', 'hb693', 'hb798', 'hb796', 'hb190', 'hb155', 'sb113', 'hb172', 'hb196', 'sb34', 'hb602', 'sb274', 'hb457', 'hb262', 'sb70', 'hb136', 'sb71', 'hb300', 'sb211', 'hb327', 'hjr4', 'hb306'
);
