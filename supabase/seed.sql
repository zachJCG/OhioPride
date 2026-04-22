-- =============================================================================
-- Ohio Pride PAC — Reference seed file
-- -----------------------------------------------------------------------------
-- Standalone seed for board_members + founding_member_tiers. This file is
-- NOT auto-applied by `supabase db push`; it is applied by `supabase db reset`
-- (local CLI) or can be pasted manually into the SQL editor.
--
-- Differences from the original inline seeds in
-- 20260422015834_initial_schema.sql and 20260422020014_configuration_tables.sql:
--
--   1. Board_members order is Zachary R. Joseph, David Donofrio, Ross Widenor,
--      then the remaining members alphabetically by given name.
--   2. Zachary R. Joseph now carries his three-paragraph bio (the original
--      migration shipped him with an empty [] bio array).
--   3. Ross Widenor's final bio paragraph uses the em-dash character (—, U+2014)
--      exactly as it appears in the authoritative content source, rather than
--      the colon that ended up in the original migration.
--   4. Name corrections applied per operator review:
--        "Ariel Marry Ann"  →  "Ariel Mary Ann Shaw"
--        "Dalma Grandjean"  →  "Dalma Grangeen"
--      NOTE: img_path values (e.g. /assets/board/ariel-marry-ann.png) are
--      preserved as-is to avoid 404s; rename the asset files separately and
--      then update img_path here.
--
-- Idempotency: both tables are fully re-seeded via DELETE + INSERT inside a
-- transaction. site_leadership.board_member_id is set to NULL on delete (FK
-- rule is SET NULL), so the final block re-links the Director and Treasurer
-- rows by name once the new board rows exist.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- board_members
-- -----------------------------------------------------------------------------
delete from public.board_members;

insert into public.board_members (name, role, chip, img_path, display_order, bio) values
(
  'Zachary R. Joseph, MBA',
  'Director',
  'is-director',
  '/assets/board/zach-joseph.png',
  10,
  jsonb_build_array(
    'Zachary R. Joseph is a U.S. Navy veteran, former elected official, and political strategist based in Cincinnati. He served five and a half years in the Navy Reserve, rising to a junior leadership role as a non-commissioned officer. At 26, Zach became the youngest and first openly LGBTQ+ member elected to Riverside City Council, where he gained direct experience in municipal governance and constituent services.',
    'Zach holds an MBA from Antioch University and spent a decade in the HR technology industry with companies including Tyler Technologies, Paychex, UKG, and HiBob. He was named to the Dayton Business Journal''s 40 Under 40 for his professional and civic contributions to the region.',
    'He launched Ohio Pride to give pro-equality candidates the institutional support the community has lacked at the state level, bringing both public service and private-sector leadership to the organization''s endorsement strategy, fundraising, and statewide outreach.'
  )
),
(
  'David Donofrio',
  'Treasurer',
  'is-treasurer',
  '/assets/board/david-donofrio.png',
  20,
  jsonb_build_array(
    'David Donofrio is a lifelong central Ohioan with deep roots in political organizing and public service. A former Ohio Legislative Service Commission Fellow, David went on to make history as the first openly gay member elected to the South-Western City School District Board of Education, where he advocated for inclusive policies and equitable resource allocation.',
    'David has held leadership roles with the Stonewall Democrats of Central Ohio and currently serves as Secretary of the Ohio Democratic Party''s Pride Caucus. He is active with Pride in Grove City and the Columbus Gay Men''s Chorus, contributing to LGBTQ+ visibility and community building across the metro area.',
    'He brings years of organizational governance, financial stewardship, and grassroots political experience to his role as Treasurer of Ohio Pride.'
  )
),
(
  'Ross Widenor, PMP',
  'Secretary',
  'is-secretary',
  '/assets/board/ross-widenor.png',
  30,
  jsonb_build_array(
    'Ross Widenor, PMP, serves as Council President of the Munroe Falls City Council, first elected in 2021 and re-elected in 2025 with endorsement from the LGBTQ+ Victory Fund. Originally from southwest Pennsylvania, Ross earned a BS and MS in Chemical Engineering from Case Western Reserve University before building a career in sustainability and strategic planning at Bridgestone Americas. He lives in Munroe Falls with his husband, Anthony, and their terrier, Mileena.',
    'A certified Project Management Professional, Ross founded Widenor Consulting LLC and was named a Summit County "30 for the Future" honoree for his regional impact. He leads the Core Team of the Summit of Sustainability Alliance, a county-wide consortium advancing shared environmental goals. His prior service includes Chair of the Finance and Audit Committee in Munroe Falls, Chair of the city''s Parks and Recreation Board, and a seat on the Board of Akron Metro RTA.',
    'Ross brings a rare combination to Ohio Pride — elected governance experience, disciplined project and financial management, and a proven record of building coalitions across organizations and sectors.'
  )
),
(
  'Ari Childrey',
  'Communications Director',
  'is-comms',
  '/assets/board/ari-childrey.png',
  40,
  jsonb_build_array(
    'Ari Childrey is a community advocate and trailblazing leader in Ohio''s LGBTQ+ movement. She made history as the first openly transgender woman to serve on a city council in Ohio, representing the 4th Ward on the St. Marys City Council. In 2025, Ari received the Equality Ohio Emerging Leader Award in recognition of her organizing and advocacy work.',
    'Ari helped build Northwest Ohio Trans Advocacy as a grassroots network of local advocates supporting transgender Ohioans in rural and underserved communities. She serves as Vice Chair of the Ohio Democratic Party''s Pride Caucus and has been a candidate for the Ohio House of Representatives in District 84 in both 2024 and 2026.',
    'Across western Ohio, Ari organizes Pride events, mentors emerging LGBTQ+ leaders, and advocates for accessible political processes for all candidates. She brings grassroots communications expertise and a statewide network to Ohio Pride.'
  )
),
(
  -- Name corrected from "Ariel Marry Ann" on operator review. Asset renamed
  -- in the same commit from /assets/board/ariel-marry-ann.png.
  'Ariel Mary Ann Shaw',
  'Board Member',
  '',
  '/assets/board/ariel-mary-ann-shaw.png',
  50,
  jsonb_build_array(
    'Ariel Mary Ann Shaw is a Black trans woman, theatre artist, and advocate based in Cincinnati. She studied Women''s and Gender Studies at the University of Cincinnati and works in public health, bringing an intersectional lens to both her professional and creative life.',
    'Ariel is the Producing Artistic Director of InBocca Performance and serves as co-Vice President of the League of Cincinnati Theatres. Her creative work centers the visibility and celebration of trans people of color through storytelling, original performance, and community organizing. She has reached audiences across Ohio and beyond with her writing, speaking, and stage productions.',
    'Ariel brings lived experience, creative vision, and arts leadership to the Ohio Pride board, strengthening the organization''s connection to Cincinnati and the broader cultural community.'
  )
),
(
  'Brian Sharp',
  'Board Member',
  '',
  '/assets/board/brian-sharp.png',
  60,
  jsonb_build_array(
    'Brian Sharp is the Director of Business and Market Development at Berkshire Hathaway HomeServices Professional Realty, where he leads growth strategy across the State of Ohio. He studied at Sinclair Community College, Wright State University, and Hondros College, building expertise in real estate, business development, and community investment.',
    'Brian serves on the Montgomery County Land Bank Board of Directors, working to revitalize neighborhoods and strengthen local economies. He was named 2025 Dayton Heart Ball Chair by the American Heart Association and is a member of the LGBTQ+ Real Estate Alliance.',
    'His career spans real estate, civic engagement, and nonprofit leadership in the Miami Valley. Brian brings that broad coalition-building experience and professional network to the Ohio Pride board.'
  )
),
(
  -- Chrisondra Goodwine joined the board replacing Jake Hogue. Confirmed active.
  'Chrisondra Goodwine, J.D.',
  'Board Member',
  '',
  '/assets/board/chrisondra-goodwine.png',
  70,
  jsonb_build_array(
    'Chrisondra Goodwine is an attorney, educator, and public administrator with deep roots in West Dayton. She attended Dayton Public Schools at every level and went on to earn a Bachelor of Arts from the University of Akron, a Juris Doctor from the University of Dayton School of Law, an MBA from Capella University, and a Master of Public Administration from Capella.',
    'Chrisondra serves as Township Administrator of Jefferson Township and as President of the Dayton Public Schools Board of Education, where she has been a vocal champion of equity and community investment. She co-founded Dayton Black Pride and made history as one of the first openly LGBTQ+ Black women elected to public office in the Dayton area.',
    'Her decades of experience in education policy, municipal governance, and civil rights advocacy make her a cornerstone of the Ohio Pride board.'
  )
),
(
  -- Name corrected from "Dalma Grandjean" on operator review. Asset renamed
  -- in the same commit from /assets/board/dalma-grandjean.png.
  'Dalma Grangeen',
  'Board Member',
  '',
  '/assets/board/dalma-grangeen.png',
  80,
  jsonb_build_array(
    'Dalma Grangeen is a retired attorney and former Law Director for the City of Riverside. Born in Germany to Hungarian parents, she grew up in the Dayton area and earned her Juris Doctor summa cum laude from the University of Dayton School of Law.',
    'Over her career, Dalma built a distinguished practice in family law, military divorce, and international domestic relations as a shareholder at Altick & Corwin Co., LPA. She also served as a linguist at Wright-Patterson Air Force Base, leveraging her multilingual background in service to the military community. She was named Barrister of the Month by the Dayton Bar Association for her contributions to the profession.',
    'Dalma brings decades of legal expertise, municipal government experience, and a steadfast commitment to justice and equality to the Ohio Pride board.'
  )
),
(
  'Eli Bohnert, MPH',
  'Board Member',
  '',
  '/assets/board/eli-bohnert.png',
  90,
  jsonb_build_array(
    'Eli Bohnert is a public health professional and political strategist based in Columbus. He holds a Master of Public Health from The Ohio State University.',
    'Eli was a candidate for the Ohio House of Representatives in 2024 and previously served as President of the Stonewall Democrats of Central Ohio. He remains active as a Franklin County Democratic Party Central Committee member, Vice Chair of Political Affairs for the Hilliard Democrats, and was elected to two terms on the West Scioto Area Commission.',
    'His combination of public health expertise, campaign experience, and deep ties to progressive organizing in Franklin County strengthens Ohio Pride''s reach in the Columbus metro area.'
  )
),
(
  'Keara Dever, J.D.',
  'Board Member',
  '',
  '/assets/board/keara-dever.png',
  100,
  jsonb_build_array(
    'Keara Dever was born and raised in Buffalo, New York. She earned her undergraduate degree from Duquesne University and her Juris Doctor from the University of Dayton School of Law. While in law school, she found her calling through the immigration clinic, fostering a deep commitment to serving society''s most vulnerable populations.',
    'Keara opened her own practice in 2023, focusing on immigration, criminal defense, and family law. She serves as an Acting Judge in Kettering Municipal Court and co-founded the Dayton Bar Association''s LGBTQ+ affinity group, creating a professional community for queer attorneys in the Miami Valley.',
    'Active in local politics throughout the Dayton region, Keara brings legal expertise, judicial experience, and a passion for equal justice to the Ohio Pride board.'
  )
);


-- -----------------------------------------------------------------------------
-- founding_member_tiers
-- -----------------------------------------------------------------------------
delete from public.founding_member_tiers;

insert into public.founding_member_tiers
  (name, slug, amount_cents, recurrence, match_mode, actblue_refcode_prefix, description, display_order)
values
  ('Stonewall Sustainer', 'stonewall-sustainer',  1969, 'monthly',  'exact',    'founding_stonewall_', '$19.69 per month, honoring the year of the Stonewall uprising.', 10),
  ('Founding Member',     'founding-member',      2500, 'one_time', 'exact',    'founding_member_',    '$25 one-time contribution.',                                     20),
  ('Pride Builder',       'pride-builder',        5000, 'monthly',  'exact',    'founding_builder_',   '$50 per month.',                                                 30),
  ('Founding Circle',     'founding-circle',     10000, 'monthly',  'exact',    'founding_circle_',    '$100 per month.',                                                40),
  ('Founding Patron',     'founding-patron',     25000, 'one_time', 'at_least', 'founding_patron_',    '$250 or more, one-time.',                                        50);


-- -----------------------------------------------------------------------------
-- Re-link site_leadership to the fresh board_members rows by name.
-- board_member_id went to NULL when we deleted the board above (FK ON DELETE
-- SET NULL). The title+entity rows in site_leadership stay untouched; we just
-- rewire them to the new UUIDs.
-- -----------------------------------------------------------------------------
update public.site_leadership sl
   set board_member_id = bm.id
  from public.board_members bm
 where sl.entity = 'pac'
   and sl.title  = 'Director'
   and bm.name   = 'Zachary R. Joseph, MBA';

update public.site_leadership sl
   set board_member_id = bm.id
  from public.board_members bm
 where sl.entity = 'pac'
   and sl.title  = 'Treasurer'
   and bm.name   = 'David Donofrio';

commit;
