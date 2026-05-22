-- =====================================================================
-- Ohio Pride PAC — ActBlue Contributions Seed: May 2026 export
-- Source CSV: ohio-pride-pac-214738-contributions-2026_5 (4).csv
-- Range: 2026-05-01 .. 2026-05-22
-- Count: 106 contributions, ~$6428.14 gross
--
-- One row per ActBlue receipt. actblue_contribution_id is the
-- unique idempotency key, so this is safe to re-run.
--
-- Defaults: is_public=false, is_vetted=false (members opt in to the
-- public roster separately). The county trigger on `zip` will fill
-- county_name automatically for Ohio ZIPs; out-of-state rows are
-- inserted with a NULL county_name.
--
-- Reconciliation note: rows seeded in
-- 20260422020014_configuration_tables.sql used placeholder
-- actblue_contribution_id values like 'SEED_NICOLE_GREEN'. If any of
-- the donors in this CSV match those names, you'll have two rows for
-- the same person until you collapse them manually. Run:
--
--   SELECT id, full_name, actblue_contribution_id, contributed_at
--   FROM public.founding_members
--   WHERE full_name ILIKE ANY (ARRAY['%Nicole Green%','%Zachary Smith%','%Jesse Shepherd%'])
--   ORDER BY full_name, contributed_at;
-- =====================================================================

INSERT INTO public.founding_members
  (full_name, email, display_name, amount_cents, recurrence,
   actblue_contribution_id, actblue_receipt_id, contributed_at,
   city, state, zip, notes)
VALUES
  ('Thomas Herner', 'thomasjherner@gmail.com', 'Thomas H.', 2500, 'one_time', 'AB392073004', 'AB392073004', '2026-05-01T15:53:22Z', 'Dayton', 'OH', '45458', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Amanda Davis', 'davial682@gmail.com', 'Amanda D.', 2500, 'one_time', 'AB392076928', 'AB392076928', '2026-05-01T16:22:45Z', 'Dayton', 'OH', '45403', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Martin Gehres', 'mg127108@gmail.com', 'Martin G.', 10000, 'one_time', 'AB392102436', 'AB392102436', '2026-05-01T19:30:43Z', 'Dayton', 'OH', '45406', 'ActBlue May 2026 import. refcode=website_donate_100'),
  ('kim McCarthy', 'mccarthykim1969@gmail.com', 'Kim M.', 2500, 'one_time', 'AB392348161', 'AB392348161', '2026-05-04T08:25:22Z', 'Xenia', 'OH', '45385', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Nickie      J Antonio', 'nickie@nickieantonio.com', 'Nickie      J A.', 2500, 'one_time', 'AB392383892', 'AB392383892', '2026-05-04T14:45:41Z', 'Lakewood', 'OH', '44107', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Brian Sharp', 'soldbybriansharp@gmail.com', 'Brian S.', 25000, 'one_time', 'AB392387812', 'AB392387812', '2026-05-04T15:16:46Z', 'Dayton', 'OH', '45414', 'ActBlue May 2026 import. refcode=website_founding_patron_250'),
  ('Evan Nolan', 'evan.t.nolan@gmail.com', 'Evan N.', 2500, 'one_time', 'AB392570799', 'AB392570799', '2026-05-05T21:31:42Z', 'Cincinnati', 'OH', '45209', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Karen Brownlee', 'votekarenbrownlee@gmail.com', 'Karen B.', 25000, 'one_time', 'AB392828832', 'AB392828832', '2026-05-07T21:40:17Z', 'CINCINNATI', 'OH', '45249', 'ActBlue May 2026 import. refcode=website_founding_patron_250'),
  ('Philip Maurer', 'phil.nw@gmail.com', 'Philip M.', 2500, 'one_time', 'AB392905743', 'AB392905743', '2026-05-08T15:43:04Z', 'Dublin', 'OH', '43016', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Matt Long', 'mattlong506@gmail.com', 'Matt L.', 2500, 'one_time', 'AB392906223', 'AB392906223', '2026-05-08T15:46:00Z', 'Dublin', 'OH', '43016', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Robert Ham', 'robbie.ham@gmail.com', 'Robert H.', 2500, 'one_time', 'AB393081490', 'AB393081490', '2026-05-09T21:33:08Z', 'Hudson', 'OH', '44236', 'ActBlue May 2026 import. refcode=website_donate_25'),
  ('Kyle Brown', 'kyledbrown@gmail.com', 'Kyle B.', 5000, 'one_time', 'AB393189274', 'AB393189274', '2026-05-10T23:03:54Z', 'Canton', 'OH', '44709', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Jeffrey Lox', 'jeffreylox@gmail.com', 'Jeffrey L.', 10000, 'one_time', 'AB393207611', 'AB393207611', '2026-05-11T10:02:45Z', 'Pepper Pike', 'OH', '44124', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Michael Oakley', 'mdoakley7777@icloud.com', 'Michael O.', 2500, 'one_time', 'AB393207995', 'AB393207995', '2026-05-11T10:08:33Z', 'Cincinnati', 'OH', '45243', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('winifred weizer', 'winfud@gmail.com', 'Winifred W.', 2500, 'one_time', 'AB393209478', 'AB393209478', '2026-05-11T10:28:51Z', 'Cleveland', 'OH', '44118', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Wilson Figueroa', 'wsfigueroa@gmail.com', 'Wilson F.', 2500, 'one_time', 'AB393211069', 'AB393211069', '2026-05-11T10:49:04Z', 'Columbus', 'OH', '43203', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Jordan Ostrum', 'ostrumjordan@gmail.com', 'Jordan O.', 2500, 'one_time', 'AB393211115', 'AB393211115', '2026-05-11T10:49:38Z', 'Dayton', 'OH', '45402', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Jerry Hubbard', 'modernmythos.mmj@gmail.com', 'Jerry H.', 2500, 'one_time', 'AB393214764', 'AB393214764', '2026-05-11T11:30:42Z', 'Lorain', 'OH', '44052', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('ANGELA MAY', 'mayandtaylor@yahoo.com', 'Angela M.', 2500, 'one_time', 'AB393219667', 'AB393219667', '2026-05-11T12:15:54Z', 'Wadsworth', 'OH', '44281', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Cynthia Watson Bowen', 'cindy@watsonbowen.com', 'Cynthia W.', 1969, 'monthly', 'AB393221195', 'AB393221195', '2026-05-11T12:28:44Z', 'Sugar Grove', 'OH', '43155', 'ActBlue May 2026 import. refcode=website_founding_stonewall'),
  ('Karen Izzi Gallagher', 'jwiz84@roadrunner.com', 'Karen Izzi G.', 2500, 'one_time', 'AB393226494', 'AB393226494', '2026-05-11T13:19:12Z', 'NEW PHILADELPHIA', 'OH', '44663', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Jennifer Speer', 'jennifer@jenniferspeer.com', 'Jennifer S.', 7500, 'one_time', 'AB393266048', 'AB393266048', '2026-05-11T18:07:53Z', 'Brecksville', 'OH', '44141', 'ActBlue May 2026 import. refcode=website_founding_patron'),
  ('Dan Tyson', 'tyson.danj@gmail.com', 'Dan T.', 1000, 'one_time', 'AB393268381', 'AB393268381', '2026-05-11T18:24:23Z', 'Brecksville', 'OH', '44141', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Angela Mulligan', 'angelamia.lenetti@gmail.com', 'Angela M.', 2500, 'monthly', 'AB393273397', 'AB393273397', '2026-05-11T19:02:58Z', 'Marysville', 'OH', '43040', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Shelby Farmer', 'shelbyjacobs26@yahoo.com', 'Shelby F.', 1969, 'monthly', 'AB393299541', 'AB393299541', '2026-05-11T22:29:46Z', 'Olathe', 'KS', '66061', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Sioux Thompson', 'siouxat@yahoo.com', 'Sioux T.', 25000, 'one_time', 'AB393315184', 'AB393315184', '2026-05-12T07:53:40Z', 'Silver Spring', 'MD', '20910', 'ActBlue May 2026 import. refcode=website_founding_patron'),
  ('Steven Coyle', 'scoyle93@yahoo.com', 'Steven C.', 2500, 'one_time', 'AB393315378', 'AB393315378', '2026-05-12T07:58:51Z', 'Brooklyn', 'OH', '44144', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Jivanto van Hemert', 'jivanto.vanhemert@gmail.com', 'Jivanto V.', 2500, 'one_time', 'AB393316162', 'AB393316162', '2026-05-12T08:16:48Z', 'Cincinnati', 'OH', '45243', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Amelia Vaughan', 'vaughanamelia@gmail.com', 'Amelia V.', 2500, 'one_time', 'AB393321167', 'AB393321167', '2026-05-12T09:40:10Z', 'Columbus', 'OH', '43206', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Cat Zielinski', 'smflgbtqcrew@gmail.com', 'Cat Z.', 2500, 'one_time', 'AB393322505', 'AB393322505', '2026-05-12T09:58:09Z', 'Cuyahoga Falls', 'OH', '44221', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Susan Majercak', 'blairsm@att.net', 'Susan M.', 2500, 'one_time', 'AB393322826', 'AB393322826', '2026-05-12T10:05:25Z', 'Stow', 'OH', '44224', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Nicole Kowalski', 'nicoletomak@gmail.com', 'Nicole K.', 2500, 'one_time', 'AB393324747', 'AB393324747', '2026-05-12T10:25:39Z', 'Hudson', 'OH', '44236', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Timothy Theiss', 'timtheiss@icloud.com', 'Timothy T.', 2500, 'one_time', 'AB393326590', 'AB393326590', '2026-05-12T10:45:36Z', 'Westerville', 'OH', '43081', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Shannon Hardin', 'info@sstrategiesconsulting.com', 'Shannon H.', 2500, 'one_time', 'AB393372198', 'AB393372198', '2026-05-12T16:17:43Z', 'Columbus', 'OH', '43215', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Megan LaConte', 'meganbarrett58@gmail.com', 'Megan L.', 2500, 'one_time', 'AB393376453', 'AB393376453', '2026-05-12T16:48:39Z', 'Akron', 'OH', '44305', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Matthew Herold', 'matthewp.herold@gmail.com', 'Matthew H.', 2500, 'one_time', 'AB393376935', 'AB393376935', '2026-05-12T16:52:27Z', 'Akron', 'OH', '44313', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Melissa Green', 'info@greenforcolumbus.com', 'Melissa G.', 2500, 'one_time', 'AB393381023', 'AB393381023', '2026-05-12T17:20:39Z', 'Columbus', 'OH', '43204', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Nancy Day-Achauer', 'n2day@hotmail.com', 'Nancy D.', 2500, 'one_time', 'AB393382628', 'AB393382628', '2026-05-12T17:31:06Z', 'Columbus', 'OH', '43228', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Robert Dorans', 'robdorans@gmail.com', 'Robert D.', 2500, 'one_time', 'AB393383070', 'AB393383070', '2026-05-12T17:33:53Z', 'Columbus', 'OH', '43214', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Nick Bankston', 'njbankston@gmail.com', 'Nick B.', 2500, 'one_time', 'AB393386711', 'AB393386711', '2026-05-12T17:56:13Z', 'Columbus', 'OH', '43219', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Emmanuel Remy', 'emmanuel.v.remy@gmail.com', 'Emmanuel R.', 2500, 'one_time', 'AB393387386', 'AB393387386', '2026-05-12T18:03:14Z', 'Columbus', 'OH', '43215', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Tracy Samuels', 'tracy.samuels87@gmail.com', 'Tracy S.', 2500, 'one_time', 'AB393388476', 'AB393388476', '2026-05-12T18:07:59Z', 'Columbus', 'OH', '43230', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('william rinard', 'wcrinard@gmail.com', 'William R.', 25000, 'one_time', 'AB393400120', 'AB393400120', '2026-05-12T19:25:31Z', 'Cleveland', 'OH', '44103', 'ActBlue May 2026 import. refcode=website_founding_patron_250'),
  ('Zachary Branstool', 'zbranstool@gmail.com', 'Zachary B.', 2500, 'one_time', 'AB393403583', 'AB393403583', '2026-05-12T19:49:16Z', 'Columbus', 'OH', '43201', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Robin Chrusniak', 'birdie76@ameritech.net', 'Robin C.', 2500, 'one_time', 'AB393418666', 'AB393418666', '2026-05-12T21:47:55Z', 'Round Lake', 'IL', '60073', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('SHERYL WARREN', 'almsthvn@gmail.com', 'Sheryl W.', 50000, 'one_time', 'AB393420232', 'AB393420232', '2026-05-12T22:03:01Z', 'Mason', 'OH', '45040', 'ActBlue May 2026 import. refcode=website_founding_patron_500'),
  ('John Wheeler', 'johnw@bgsu.edu', 'John W.', 2500, 'one_time', 'AB393426637', 'AB393426637', '2026-05-12T23:15:48Z', 'Franklin', 'OH', '45005', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Tiara Ross', 'info@sstrategiesconsulting.com', 'Tiara R.', 2500, 'one_time', 'AB393438732', 'AB393438732', '2026-05-13T07:36:57Z', 'Columbus', 'OH', '43215', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Christopher Wyche', 'clwyche@gmail.com', 'Christopher W.', 2500, 'one_time', 'AB393442867', 'AB393442867', '2026-05-13T09:00:22Z', 'Columbus', 'OH', '43235', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Jennifer Boudrye', 'jboudrye@gmail.com', 'Jennifer B.', 2500, 'one_time', 'AB393451487', 'AB393451487', '2026-05-13T10:42:17Z', 'Derwood', 'MD', '20855', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Lourdes I. Barroso', 'loubar76@gmail.com', 'Lourdes I.', 2500, 'one_time', 'AB393463299', 'AB393463299', '2026-05-13T12:18:12Z', 'Columbus', 'OH', '43209', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Jordan McLaughlin', 'jmclaughlin.20@gmail.com', 'Jordan M.', 2500, 'one_time', 'AB393466447', 'AB393466447', '2026-05-13T12:38:42Z', 'New Albany', 'OH', '43054', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Aimee Bucher', 'aimeebuch@gmail.com', 'Aimee B.', 2500, 'one_time', 'AB393487709', 'AB393487709', '2026-05-13T14:58:54Z', 'Lima', 'OH', '45805', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Jamie Lombardi', 'jamie@autonomyproject.org', 'Jamie L.', 2500, 'one_time', 'AB393490601', 'AB393490601', '2026-05-13T15:17:47Z', 'Columbus', 'OH', '43205', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Curtis Davis', 'curtis.davis@team-icsc.com', 'Curtis D.', 25000, 'one_time', 'AB393493954', 'AB393493954', '2026-05-13T15:38:49Z', 'Columbus', 'OH', '43206', 'ActBlue May 2026 import. refcode=website_founding_patron_250'),
  ('Ashley Bryant Bailey', 'ashley@bryantbailey.co', 'Ashley B.', 10000, 'one_time', 'AB393551838', 'AB393551838', '2026-05-13T21:59:45Z', 'Cincinnati', 'OH', '45206', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Christopher Clevenger', 'chris@ceclevenger.com', 'Christopher C.', 2500, 'one_time', 'AB393557229', 'AB393557229', '2026-05-13T22:52:56Z', 'Kent', 'OH', '44240', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Gavin Steele', 'daytongjs@gmail.com', 'Gavin S.', 2500, 'one_time', 'AB393561627', 'AB393561627', '2026-05-13T23:54:38Z', 'Dayton', 'OH', '45402', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Phil Montgomery', 'phil@electphilmontgomery.com', 'Phil M.', 2500, 'one_time', 'AB393571711', 'AB393571711', '2026-05-14T07:32:39Z', 'Akron', 'OH', '44313', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Joshua Jones', 'thisisjoshjones@gmail.com', 'Joshua J.', 3000, 'one_time', 'AB393572718', 'AB393572718', '2026-05-14T07:58:32Z', 'Cleveland', 'OH', '44102', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('mary Smith', 'mary.mi.smith@gmail.com', 'Mary S.', 2500, 'one_time', 'AB393573526', 'AB393573526', '2026-05-14T08:16:51Z', 'Fairborn', 'OH', '45324', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Jose Rodriguez', 'jrodrig414@gmail.com', 'Jose R.', 2500, 'one_time', 'AB393575539', 'AB393575539', '2026-05-14T08:52:36Z', 'Columbus', 'OH', '43212', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Sarah Alcorn', 'sarah.alcorn88@gmail.com', 'Sarah A.', 2500, 'one_time', 'AB393575898', 'AB393575898', '2026-05-14T08:58:43Z', 'Riverside', 'OH', '45431', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Lynn Greer', 'equalityohio@aol.com', 'Lynn G.', 50000, 'one_time', 'AB393579216', 'AB393579216', '2026-05-14T09:43:15Z', 'Reno', 'NV', '89509', 'ActBlue May 2026 import. refcode=website_founding_patron'),
  ('Scott Snider', '1scottsnider@gmail.com', 'Scott S.', 2500, 'monthly', 'AB393585761', 'AB393585761', '2026-05-14T10:50:42Z', 'Granville', 'OH', '43023', 'ActBlue May 2026 import. refcode=website_founding_stonewall'),
  ('Daniel McGuire', 'dmcguirenyc@gmail.com', 'Daniel M.', 2500, 'one_time', 'AB393590861', 'AB393590861', '2026-05-14T11:32:12Z', 'Bratenahl', 'OH', '44108', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('James Ford', 'drjamesbford@gmail.com', 'James F.', 10000, 'monthly', 'AB393592999', 'AB393592999', '2026-05-14T11:47:38Z', 'Columbus', 'OH', '43206', 'ActBlue May 2026 import. refcode=website_founding_circle'),
  ('Victoria Hutchinson', 'ramothofbenden@gmail.com', 'Victoria H.', 2500, 'one_time', 'AB393604194', 'AB393604194', '2026-05-14T13:02:29Z', 'Parma', 'OH', '44134', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Cami Barber', 'cami.barber@gmail.com', 'Cami B.', 25000, 'one_time', 'AB393605706', 'AB393605706', '2026-05-14T13:12:33Z', 'Kent', 'OH', '44240', 'ActBlue May 2026 import. refcode=website_founding_patron_250'),
  ('Branden Holley', 'brandenholley@gmail.com', 'Branden H.', 2500, 'one_time', 'AB393612088', 'AB393612088', '2026-05-14T13:54:30Z', 'Cincinnati', 'OH', '45240', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Jeffrey Bixby', 'jallynbixby@gmail.com', 'Jeffrey B.', 5000, 'one_time', 'AB393612675', 'AB393612675', '2026-05-14T13:58:15Z', 'Medina', 'OH', '44256', 'ActBlue May 2026 import. refcode=website_founding_pride_builder'),
  ('Lizzie Bjork', 'lizzie.bjork@gmail.com', 'Lizzie B.', 1969, 'monthly', 'AB393621217', 'AB393621217', '2026-05-14T14:52:02Z', 'Cleveland Heights', 'OH', '44106', 'ActBlue May 2026 import. refcode=website_founding_stonewall'),
  ('Paul Errera', 'perrera@kent.edu', 'Paul E.', 2500, 'one_time', 'AB393621761', 'AB393621761', '2026-05-14T14:55:46Z', 'Kent', 'OH', '44240', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Beryl Brown Piccolantonio', 'berylbp@gmail.com', 'Beryl B.', 2500, 'one_time', 'AB393626049', 'AB393626049', '2026-05-14T15:26:48Z', 'Gahanna', 'OH', '43230', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('David Donofrio', 'daviddonofrio1@gmail.com', 'David D.', 2500, 'one_time', 'AB393628322', 'AB393628322', '2026-05-14T15:39:32Z', 'Grove City', 'OH', '43123', 'ActBlue May 2026 import. refcode=website_donate_25'),
  ('Kathy Wyenandt', 'kathy@butlercountydems.org', 'Kathy W.', 25000, 'one_time', 'AB393667358', 'AB393667358', '2026-05-14T19:26:54Z', 'Hamilton', 'OH', '45011', 'ActBlue May 2026 import. refcode=website_founding_patron'),
  ('Susan Hyde', 'sjhyde81@gmail.com', 'Susan H.', 5000, 'one_time', 'AB393682314', 'AB393682314', '2026-05-14T20:59:55Z', 'Columbus', 'OH', '43212', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Mark Derrig', 'markerparker@ameritech.net', 'Mark D.', 2500, 'one_time', 'AB393719066', 'AB393719066', '2026-05-15T09:08:58Z', 'Akron', 'OH', '44319', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Liam Strausbaugh', 'liamstrausbaugh1@gmail.com', 'Liam S.', 2500, 'one_time', 'AB393722186', 'AB393722186', '2026-05-15T09:47:01Z', 'Circleville', 'OH', '43113', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('John Hegnauer', 'jhegnauer@gmail.com', 'John H.', 2500, 'one_time', 'AB393724875', 'AB393724875', '2026-05-15T10:15:47Z', 'Munroe Falls', 'OH', '44262', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Dina Edwards', 'ddah104@aol.com', 'Dina E.', 2500, 'one_time', 'AB393727447', 'AB393727447', '2026-05-15T10:40:03Z', 'Munroe Falls', 'OH', '44262', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Jay Smith', 'jayjsmith@mac.com', 'Jay S.', 1969, 'monthly', 'AB393731279', 'AB393731279', '2026-05-15T11:13:49Z', 'Columbus', 'OH', '43204', 'ActBlue May 2026 import. refcode=website_founding_stonewall'),
  ('Joseph LaConte', 'jcantwe2@gmail.com', 'Joseph L.', 2500, 'one_time', 'AB393746978', 'AB393746978', '2026-05-15T13:02:44Z', 'Akron', 'OH', '44303', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Rebecca McClung', 'bakergirl26@me.com', 'Rebecca M.', 2500, 'monthly', 'AB393766409', 'AB393766409', '2026-05-15T15:18:24Z', 'Columbus', 'OH', '43220', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Helen Flanner', 'fflanner@usa.net', 'Helen F.', 2500, 'monthly', 'AB393787575', 'AB393787575', '2026-05-15T17:38:06Z', 'Kent', 'OH', '44240', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Maxwell Warner', 'warnerm4@outlook.com', 'Maxwell W.', 2500, 'one_time', 'AB393804557', 'AB393804557', '2026-05-15T19:28:26Z', 'Akron', 'OH', '44313', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Brian Wildman', 'brwildman@zoomtown.com', 'Brian W.', 50000, 'one_time', 'AB393812699', 'AB393812699', '2026-05-15T20:29:31Z', 'Amelia', 'OH', '45102', 'ActBlue May 2026 import. refcode=website_founding_patron_500'),
  ('Cayde Copeland', 'caydecopeland@gmail.com', 'Cayde C.', 2500, 'one_time', 'AB393814275', 'AB393814275', '2026-05-15T20:39:13Z', 'Marietta', 'OH', '45750', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Nicole Green', 'nicolegreen1031@gmail.com', 'Nicole G.', 1969, 'monthly', 'AB390349272', 'AB390349272', '2026-05-16T04:00:56Z', 'Dayton', 'OH', '45420', 'ActBlue May 2026 import. refcode=website_founding_stonewall'),
  ('Michelle Kozak', 'kozakm@sbcglobal.net', 'Michelle K.', 2500, 'one_time', 'AB393843854', 'AB393843854', '2026-05-16T07:06:35Z', 'Columbus', 'OH', '43212', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Marya Kolman', 'maryakolman@gmail.com', 'Marya K.', 2000, 'monthly', 'AB393874572', 'AB393874572', '2026-05-16T13:04:19Z', 'Westerville', 'OH', '43082', 'ActBlue May 2026 import. refcode=website_founding_stonewall'),
  ('Amelia Black', 'ablack@blackmule.com', 'Amelia B.', 2500, 'one_time', 'AB393953677', 'AB393953677', '2026-05-17T07:57:45Z', 'Hilliard', 'OH', '43026', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('David A Hamiter', 'hamited@gmail.com', 'David A.', 10000, 'one_time', 'AB394053220', 'AB394053220', '2026-05-18T08:47:15Z', 'Lummi Island', 'WA', '98262', 'ActBlue May 2026 import. refcode=website_donate_100'),
  ('Meeka Owens', 'meekaowens2016@gmail.com', 'Meeka O.', 2500, 'one_time', 'AB394058723', 'AB394058723', '2026-05-18T10:16:19Z', 'Cincinnati', 'OH', '45217', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Steven Nikolakis', 'stevenikolakis@gmail.com', 'Steven N.', 2500, 'one_time', 'AB394139872', 'AB394139872', '2026-05-18T20:21:49Z', 'Lakewood', 'OH', '44107', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Stephan Ho', 'ravenho27@gmail.com', 'Stephan H.', 2500, 'one_time', 'AB394174090', 'AB394174090', '2026-05-19T08:21:55Z', 'Columbus', 'OH', '43211', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Finnigan Kitchen', 'finninthekitchen@gmail.com', 'Finnigan K.', 2500, 'one_time', 'AB394302599', 'AB394302599', '2026-05-20T00:59:42Z', 'Wooster', 'OH', '44691', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Anna Albi', 'anna.albi6@gmail.com', 'Anna A.', 2500, 'one_time', 'AB394321665', 'AB394321665', '2026-05-20T09:54:14Z', 'Cincinnati', 'OH', '45227', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Aron Dell', 'aron1985@att.net', 'Aron D.', 2500, 'one_time', 'AB394389862', 'AB394389862', '2026-05-20T16:24:59Z', 'Beavercreek', 'OH', '45431', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Carolyn Rice', 'carolyn_rice2002@yahoo.com', 'Carolyn R.', 10000, 'one_time', 'AB394437141', 'AB394437141', '2026-05-20T20:51:29Z', 'Dayton', 'OH', '45429', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Thomas M. Bilcze', 'tom.bilcze@gmail.com', 'Thomas M.', 1969, 'monthly', 'AB394512437', 'AB394512437', '2026-05-21T13:21:28Z', 'Mount Vernon', 'OH', '43050', 'ActBlue May 2026 import. refcode=website_founding_stonewall'),
  ('Rowan Ratvasky', 'rowanratvasky@gmail.com', 'Rowan R.', 2500, 'one_time', 'AB394639792', 'AB394639792', '2026-05-22T11:04:22Z', 'Columbus', 'OH', '43231', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Zachary Zugelder', 'zachary.zugelder@gmail.com', 'Zachary Z.', 2500, 'one_time', 'AB394652503', 'AB394652503', '2026-05-22T12:41:36Z', 'Dayton', 'OH', '45410', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Robert Solon Jr', 'rfsolonjr@gmail.com', 'Robert S.', 5000, 'one_time', 'AB394673857', 'AB394673857', '2026-05-22T15:18:14Z', 'Put In Bay', 'OH', '43456', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Terry Williams', 'terry.williams.2006@owu.edu', 'Terry W.', 2500, 'monthly', 'AB394684351', 'AB394684351', '2026-05-22T16:33:05Z', 'Chillicothe', 'OH', '45601', 'ActBlue May 2026 import. refcode=website_founding_member'),
  ('Bobbie Arnold', 'bobbiethebuilderoh@gmail.com', 'Bobbie A.', 25000, 'one_time', 'AB394691989', 'AB394691989', '2026-05-22T17:23:45Z', 'West Alexandria', 'OH', '45381', 'ActBlue May 2026 import. refcode=website_founding_patron')
ON CONFLICT (actblue_contribution_id) DO UPDATE
  SET amount_cents       = EXCLUDED.amount_cents,
      recurrence         = EXCLUDED.recurrence,
      contributed_at     = EXCLUDED.contributed_at,
      city               = COALESCE(public.founding_members.city, EXCLUDED.city),
      state              = COALESCE(public.founding_members.state, EXCLUDED.state),
      zip                = COALESCE(public.founding_members.zip, EXCLUDED.zip),
      email              = COALESCE(public.founding_members.email, EXCLUDED.email),
      notes              = COALESCE(public.founding_members.notes, EXCLUDED.notes);

-- After the upsert, force the county trigger to recompute county_name
-- for any row whose zip was just populated/changed.
UPDATE public.founding_members
   SET zip = zip
 WHERE actblue_contribution_id LIKE 'AB%'
   AND contributed_at >= '2026-05-01';
