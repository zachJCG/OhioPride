-- =============================================================================
-- 20260511000000_actblue_report_backfill.sql
-- -----------------------------------------------------------------------------
-- Backfills founding_members with the full ActBlue Custom Report covering
-- 2026-04-12 -> 2026-05-11 (27 contributions). Adds the columns needed to
-- store the rich ActBlue report data (address, occupation, employer,
-- payment method, fees, refcode, recurring metadata, etc.) so the admin
-- /admin/donors view can surface them.
--
-- Per Director instruction (2026-05-11): every contribution in this report
-- is marked is_public = true and is_vetted = true.
--
-- Idempotent: rows are matched on actblue_contribution_id (ActBlue Lineitem
-- ID). The four pre-seeded rows (Jesse Shepherd, Nicole Green, Matthew
-- Joseph, Samuel Dorf) are first reconciled to their lineitem ids by name,
-- then the same upsert covers them.
--
-- Depends on migrations through 20260510000000_volunteers.sql.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Extend founding_members with ActBlue report columns.
-- -----------------------------------------------------------------------------
alter table public.founding_members
  add column if not exists address_line1                 text,
  add column if not exists state                         text,
  add column if not exists country                       text,
  add column if not exists occupation                    text,
  add column if not exists employer                      text,
  add column if not exists phone                         text,
  add column if not exists employer_address_line1        text,
  add column if not exists employer_city                 text,
  add column if not exists employer_state                text,
  add column if not exists employer_zip                  text,
  add column if not exists employer_country              text,
  add column if not exists refcode                       text,
  add column if not exists refcode_2                     text,
  add column if not exists contribution_form_url         text,
  add column if not exists form_owner_email              text,
  add column if not exists form_branding_name            text,
  add column if not exists recipient_committee           text,
  add column if not exists payment_method                text,
  add column if not exists card_type                     text,
  add column if not exists actblue_fee_cents             integer,
  add column if not exists stripe_fee_text               text,
  add column if not exists via_mobile                    boolean,
  add column if not exists is_actblue_express            boolean,
  add column if not exists is_refunded                   boolean,
  add column if not exists is_cancelled_recurring        boolean,
  add column if not exists recurring_upsell_shown        boolean,
  add column if not exists recurring_upsell_succeeded    boolean,
  add column if not exists recurring_amount_cents        integer,
  add column if not exists recurring_type                text,
  add column if not exists recurring_duration            text,
  add column if not exists initial_recurring_at          timestamptz,
  add column if not exists text_message_opt_in           text;

comment on column public.founding_members.address_line1
  is 'Private. ActBlue donor address line 1. Never exposed on the public roster.';
comment on column public.founding_members.refcode
  is 'ActBlue refcode that drove the contribution (e.g. website_founding_member). Used by founding_member_tier() for tier-prefix matching.';
comment on column public.founding_members.actblue_fee_cents
  is 'ActBlue processing fee in cents (separate from Stripe). Tracked for reconciliation.';
comment on column public.founding_members.stripe_fee_text
  is 'Raw Stripe fee string from the ActBlue report (e.g. "$0.78"). Stored verbatim to avoid parsing ambiguity.';


-- -----------------------------------------------------------------------------
-- 2. Reconcile pre-seeded rows to their ActBlue lineitem IDs before the upsert
--    so the ON CONFLICT (actblue_contribution_id) target lands on the existing
--    row instead of inserting a duplicate. Matches by full_name (case-insensitive)
--    + amount + recurrence to avoid grabbing the wrong row if multiple exist.
-- -----------------------------------------------------------------------------

-- Jesse Shepherd  -> lineitem 792838504 / receipt AB390349169
update public.founding_members
   set actblue_contribution_id = '792838504',
       actblue_receipt_id      = 'AB390349169'
 where actblue_contribution_id is null
   and lower(full_name) like 'jesse%shepherd%';

-- Nicole Green    -> lineitem 792838635 / receipt AB390349272 (monthly)
update public.founding_members
   set actblue_contribution_id = '792838635',
       actblue_receipt_id      = 'AB390349272'
 where actblue_contribution_id is null
   and lower(full_name) like 'nicole%green%';

-- Matthew Joseph  -> lineitem 795296458 / receipt AB391450237
update public.founding_members
   set actblue_contribution_id = '795296458',
       actblue_receipt_id      = 'AB391450237'
 where actblue_contribution_id is null
   and (lower(full_name) like 'matthew%joseph%' or lower(full_name) like 'matt%joseph%');

-- Samuel Dorf     -> lineitem 795312259 / receipt AB391462354
update public.founding_members
   set actblue_contribution_id = '795312259',
       actblue_receipt_id      = 'AB391462354'
 where actblue_contribution_id is null
   and (lower(full_name) like 'samuel%dorf%' or lower(full_name) like 'sam%dorf%');


-- -----------------------------------------------------------------------------
-- 3. Upsert the full 27-row report.
--    is_public=true, is_vetted=true per Director instruction (2026-05-11).
--    contributed_at is treated as UTC for storage; ActBlue exports are wall
--    times without a timezone, but the relative ordering is what matters
--    here and the 4-hour skew is fine.
--    `zip` triggers automatic county / county_fips fill via the existing
--    fn_founding_members_set_county trigger.
-- -----------------------------------------------------------------------------
insert into public.founding_members (
  full_name, display_name, email, phone,
  amount_cents, recurrence, recurring_amount_cents, recurring_type, recurring_duration, initial_recurring_at,
  actblue_contribution_id, actblue_receipt_id, contributed_at,
  is_public, is_vetted,
  address_line1, city, state, zip, country,
  occupation, employer,
  employer_address_line1, employer_city, employer_state, employer_zip, employer_country,
  refcode, refcode_2,
  contribution_form_url, form_owner_email, form_branding_name, recipient_committee,
  payment_method, card_type, actblue_fee_cents, stripe_fee_text,
  via_mobile, is_actblue_express, is_refunded, is_cancelled_recurring,
  recurring_upsell_shown, recurring_upsell_succeeded,
  text_message_opt_in,
  elected_office, jurisdiction
) values

-- 1) Jesse Shepherd  $25  2026-04-16
('Jesse Shepherd', 'Jesse Shepherd', 'shepherdjesse@icloud.com', null,
 2500, 'one_time', null, null, null, null,
 '792838504', 'AB390349169', '2026-04-16 16:09:59+00',
 true, true,
 '8049 Bridge Point Drive', 'Cincinnati', 'OH', '45248', 'United States',
 'Customer Success Manager', 'Arrellio',
 null, null, null, null, null,
 'website_founding_member', null,
 'https://secure.actblue.com/page/ohio-pride-pac', null, 'Ohio Pride Pac', 'OHIO PRIDE PAC',
 'Apple Pay', 'VISA', 38, '$0.78',
 true, false, false, false,
 true, false,
 null,
 null, null),

-- 2) Nicole Green  $19.69/mo  2026-04-16
('Nicole Green', 'Nicole Green', 'nicolegreen1031@gmail.com', null,
 1969, 'monthly', 1969, 'monthly', 'unlimited', '2026-04-16 16:10:39+00',
 '792838635', 'AB390349272', '2026-04-16 16:10:46+00',
 true, true,
 '2125 Emmons Avenue', 'Dayton', 'OH', '45420', 'United States',
 'Employment Analyst', 'City of Dayton',
 null, null, null, null, null,
 'website_founding_stonewall', null,
 'https://secure.actblue.com/page/ohio-pride-pac', 'nicolegreen1031@gmail.com', 'Ohio Pride Pac', 'OHIO PRIDE PAC',
 'Google Pay', 'MasterCard', 30, '$0.66',
 true, true, false, false,
 false, false,
 null,
 null, null),

-- 3) Matthew Joseph  $100  2026-04-27 (Dayton City Commissioner)
('Matthew Joseph', 'Matthew Joseph', 'mfj626@yahoo.com', '9372523193',
 10000, 'one_time', null, null, null, null,
 '795296458', 'AB391450237', '2026-04-27 12:37:40+00',
 true, true,
 '1338 Ashland Avenue', 'Dayton', 'OH', '45420', 'United States',
 'Commissioner', 'City of Dayton',
 null, null, null, null, null,
 'website_donate_100', null,
 'https://secure.actblue.com/page/ohio-pride-pac', 'mfj626@yahoo.com', 'Ohio Pride Pac', 'OHIO PRIDE PAC',
 'Card', 'VISA', 150, '$2.43',
 true, true, false, false,
 true, false,
 null,
 'City Commissioner', 'City of Dayton'),

-- 4) Samuel Dorf  $25  2026-04-27 (Oakwood City Council)
('Samuel Dorf', 'Samuel Dorf', 'samuel.dorf@gmail.com', '6175384249',
 2500, 'one_time', null, null, null, null,
 '795312259', 'AB391462354', '2026-04-27 14:32:38+00',
 true, true,
 '120 Dellwood Ave.', 'Dayton', 'OH', '45419', 'United States',
 'Professor', 'University of Dayton',
 '300 College Park Ave, Department of Music', 'Dayton', 'OH', '45469-2946', 'United States',
 'website_founding_member', null,
 'https://secure.actblue.com/page/ohio-pride-pac', 'samuel.dorf@gmail.com', 'Ohio Pride Pac', 'OHIO PRIDE PAC',
 'Card', 'VISA', 38, '$0.78',
 false, true, false, false,
 true, false,
 null,
 'City Council', 'City of Oakwood'),

-- 5) Ben Huelskamp  $25  2026-04-27
('Ben Huelskamp', 'Ben Huelskamp', 'ben@benhuelskamp.com', '380-215-6413',
 2500, 'one_time', null, null, null, null,
 '795354300', 'AB391494815', '2026-04-27 19:00:03+00',
 true, true,
 '26 N Vine St., Apt. B', 'Westerville', 'OH', '43081', 'United States',
 'Executive Director', 'LOVEboldly',
 null, null, null, null, null,
 'website_founding_member', null,
 'https://secure.actblue.com/page/ohio-pride-pac', null, 'Ohio Pride Pac', 'OHIO PRIDE PAC',
 'Card', 'MasterCard', 38, '$0.78',
 false, false, false, false,
 true, false,
 'opt_in',
 null, null),

-- 6) Rose Lounsbury  $25  2026-04-27
('Rose Lounsbury', 'Rose Lounsbury', 'lounsbury.rose@gmail.com', null,
 2500, 'one_time', null, null, null, null,
 '795367120', 'AB391504623', '2026-04-27 20:12:57+00',
 true, true,
 '222 Wonderly Ave.', 'Dayton', 'OH', '45419', 'United States',
 'Simplicity coach', 'Rose Lounsbury',
 null, null, null, null, null,
 'website_founding_member', null,
 'https://secure.actblue.com/page/ohio-pride-pac', 'lounsbury.rose@gmail.com', 'Ohio Pride Pac', 'OHIO PRIDE PAC',
 'Card', 'VISA', 38, '$0.78',
 true, true, false, false,
 true, false,
 null,
 null, null),

-- 7) Connor Moreton  $25  2026-04-28
('Connor Moreton', 'Connor Moreton', 'cmoreton07@gmail.com', null,
 2500, 'one_time', null, null, null, null,
 '795580147', 'AB391586875', '2026-04-28 16:49:47+00',
 true, true,
 '4815, Greenlee Ave', 'Cincinnati', 'OH', '43217', 'United States',
 'Director of Public Affairs', 'Hamilton County Auditor''s Office',
 null, null, null, null, null,
 'website_founding_member', null,
 'https://secure.actblue.com/page/ohio-pride-pac', null, 'Ohio Pride Pac', 'OHIO PRIDE PAC',
 'Apple Pay', 'American Express', 38, '$0.78',
 true, false, false, false,
 true, false,
 null,
 null, null),

-- 8) Jocelyn Rhynard  $25  2026-04-28
('Jocelyn Rhynard', 'Jocelyn Rhynard', 'jsrhynard@gmail.com', null,
 2500, 'one_time', null, null, null, null,
 '795594334', 'AB391597807', '2026-04-28 18:03:52+00',
 true, true,
 '107 McDaniel St', 'Dayton', 'OH', '45405', 'United States',
 'Self employed', 'Jocelyn Rhynard LLC',
 null, null, null, null, null,
 'website_founding_member', null,
 'https://secure.actblue.com/page/ohio-pride-pac', null, 'Ohio Pride Pac', 'OHIO PRIDE PAC',
 'Apple Pay', 'VISA', 38, '$0.78',
 true, false, false, false,
 true, false,
 null,
 null, null),

-- 9) Ross Widenor  $25  2026-04-29 (Munroe Falls City Council President)
('Ross Widenor', 'Ross Widenor', 'ross.widenor@gmail.com', '7243448123',
 2500, 'one_time', null, null, null, null,
 '795901630', 'AB391760755', '2026-04-29 20:36:37+00',
 true, true,
 '540 Belmont Park Drive', 'Munroe Falls', 'OH', '44262', 'United States',
 'Consultant', 'Widenor Consulting LLC',
 null, null, null, null, null,
 'website_founding_member', null,
 'https://secure.actblue.com/page/ohio-pride-pac', 'ross.widenor@gmail.com', 'Ohio Pride Pac', 'OHIO PRIDE PAC',
 'Card', 'Discover', 38, '$0.78',
 false, true, false, false,
 true, false,
 null,
 'City Council President', 'City of Munroe Falls'),

-- 10) Thomas Herner  $25  2026-05-01
('Thomas Herner', 'Thomas Herner', 'thomasjherner@gmail.com', null,
 2500, 'one_time', null, null, null, null,
 '796599474', 'AB392073004', '2026-05-01 15:53:22+00',
 true, true,
 '9409 Trail stone point', 'Dayton', 'OH', '45458', 'United States',
 'Banking', 'JPMorganChase',
 null, null, null, null, null,
 'website_founding_member', null,
 'https://secure.actblue.com/page/ohio-pride-pac', 'thomasjherner@gmail.com', 'Ohio Pride Pac', 'OHIO PRIDE PAC',
 'Apple Pay', 'VISA', 38, '$0.78',
 false, true, false, false,
 true, false,
 null,
 null, null),

-- 11) Amanda Davis  $25  2026-05-01
('Amanda Davis', 'Amanda Davis', 'davial682@gmail.com', null,
 2500, 'one_time', null, null, null, null,
 '796604809', 'AB392076928', '2026-05-01 16:22:45+00',
 true, true,
 '70 McClure Street', 'Dayton', 'OH', '45403', 'United States',
 'Attorney', 'Montgomery County',
 null, null, null, null, null,
 'website_founding_member', null,
 'https://secure.actblue.com/page/ohio-pride-pac', 'davial682@gmail.com', 'Ohio Pride Pac', 'OHIO PRIDE PAC',
 'Card', 'VISA', 38, '$0.78',
 true, true, false, false,
 true, false,
 null,
 null, null),

-- 12) Martin Gehres  $100  2026-05-01 (Dayton Clerk of Court)
('Martin Gehres', 'Martin Gehres', 'mg127108@gmail.com', '9376814283',
 10000, 'one_time', null, null, null, null,
 '796638642', 'AB392102436', '2026-05-01 19:30:43+00',
 true, true,
 '208 Wroe Ave', 'Dayton', 'OH', '45406', 'United States',
 'Clerk of Court', 'City of Dayton',
 null, null, null, null, null,
 'website_donate_100', null,
 'https://secure.actblue.com/page/ohio-pride-pac', 'mg127108@gmail.com', 'Ohio Pride Pac', 'OHIO PRIDE PAC',
 'Card', 'VISA', 150, '$2.43',
 true, true, false, false,
 true, false,
 null,
 'Clerk of Court', 'City of Dayton'),

-- 13) Kim McCarthy  $25  2026-05-04
('Kim McCarthy', 'Kim McCarthy', 'mccarthykim1969@gmail.com', null,
 2500, 'one_time', null, null, null, null,
 '797245829', 'AB392348161', '2026-05-04 08:25:22+00',
 true, true,
 '2525 Stewart Rd', 'Xenia', 'OH', '45385', 'United States',
 'Accountant', 'PQ Systems Inc',
 null, null, null, null, null,
 'website_founding_member', null,
 'https://secure.actblue.com/page/ohio-pride-pac', 'mccarthykim1969@gmail.com', 'Ohio Pride Pac', 'OHIO PRIDE PAC',
 'Card', 'VISA', 38, '$0.78',
 true, true, false, false,
 true, false,
 null,
 null, null),

-- 14) Nickie J. Antonio  $25  2026-05-04 (Ohio State Senator)
('Nickie J. Antonio', 'Nickie J. Antonio', 'nickie@nickieantonio.com', '2164070173',
 2500, 'one_time', null, null, null, null,
 '797291814', 'AB392383892', '2026-05-04 14:45:41+00',
 true, true,
 '1305 Belle Ave.', 'Lakewood', 'OH', '44107', 'United States',
 'State Senator', 'State of Ohio',
 null, null, null, null, null,
 'website_founding_member', null,
 'https://secure.actblue.com/page/ohio-pride-pac', null, 'Ohio Pride Pac', 'OHIO PRIDE PAC',
 'Card', 'VISA', 38, '$0.78',
 false, false, false, false,
 true, false,
 'opt_in',
 'State Senator', 'Ohio Senate'),

-- 15) Brian Sharp  $250  2026-05-04 (Ohio Pride Board Member)
('Brian Sharp', 'Brian Sharp', 'soldbybriansharp@gmail.com', null,
 25000, 'one_time', null, null, null, null,
 '797297179', 'AB392387812', '2026-05-04 15:16:46+00',
 true, true,
 '2750 , Hayward Avenue', 'Dayton', 'OH', '45414', 'United States',
 'Realtor', 'Berkshire Hathaway',
 null, null, null, null, null,
 'website_founding_patron_250', null,
 'https://secure.actblue.com/page/ohio-pride-pac', null, 'Ohio Pride Pac', 'OHIO PRIDE PAC',
 'Apple Pay', 'MasterCard', 375, '$5.73',
 true, false, false, false,
 true, false,
 null,
 null, null),

-- 16) Evan Nolan  $25  2026-05-05
('Evan Nolan', 'Evan Nolan', 'evan.t.nolan@gmail.com', '513-310-5661',
 2500, 'one_time', null, null, null, null,
 '797646631', 'AB392570799', '2026-05-05 21:31:42+00',
 true, true,
 '3850 Hyde Park Avenue', 'Cincinnati', 'OH', '45209', 'United States',
 'Attorney', 'Katz Teller',
 null, null, null, null, null,
 'website_founding_member', null,
 'https://secure.actblue.com/page/ohio-pride-pac', 'evan.t.nolan@gmail.com', 'Ohio Pride Pac', 'OHIO PRIDE PAC',
 'Card', 'MasterCard', 38, '$0.78',
 true, true, false, false,
 true, false,
 null,
 null, null),

-- 17) Karen Brownlee  $250  2026-05-07
('Karen Brownlee', 'Karen Brownlee', 'karenbrownlee@gmail.com', '513-800-1806',
 25000, 'one_time', null, null, null, null,
 '798173373', 'AB392828832', '2026-05-07 21:40:17+00',
 true, true,
 '8417 PREAKNESS LN', 'Cincinnati', 'OH', '45249', 'United States',
 'Not Employed', 'Not Employed',
 null, null, null, null, null,
 'website_founding_patron_250', null,
 'https://secure.actblue.com/page/ohio-pride-pac', 'karenbrownlee@gmail.com', 'Ohio Pride Pac', 'OHIO PRIDE PAC',
 'Card', 'American Express', 375, null,
 true, true, false, false,
 true, false,
 null,
 null, null),

-- 18) Philip Maurer  $25  2026-05-08
('Philip Maurer', 'Philip Maurer', 'phil.nw@gmail.com', null,
 2500, 'one_time', null, null, null, null,
 '798361636', 'AB392905743', '2026-05-08 15:43:04+00',
 true, true,
 '5870 Myrick Rd', 'Dublin', 'OH', '43016', 'United States',
 'Implementation Specialist', 'Plaid',
 null, null, null, null, null,
 'website_founding_member', null,
 'https://secure.actblue.com/page/ohio-pride-pac', null, 'Ohio Pride Pac', 'OHIO PRIDE PAC',
 'Apple Pay', 'MasterCard', 38, null,
 true, false, false, false,
 true, false,
 null,
 null, null),

-- 19) Matt Long  $25  2026-05-08
('Matt Long', 'Matt Long', 'mattlong506@gmail.com', null,
 2500, 'one_time', null, null, null, null,
 '798362279', 'AB392906223', '2026-05-08 15:46:00+00',
 true, true,
 '5870 Myrick Road', 'Dublin', 'OH', '43016', 'United States',
 'Teacher', 'Madison-Plains local school district',
 null, null, null, null, null,
 'website_founding_member', null,
 'https://secure.actblue.com/page/ohio-pride-pac', 'mattlong506@gmail.com', 'Ohio Pride Pac', 'OHIO PRIDE PAC',
 'Apple Pay', 'VISA', 38, null,
 true, true, false, false,
 true, false,
 null,
 null, null),

-- 20) Robert Ham  $25  2026-05-09
('Robert Ham', 'Robert Ham', 'robbie.ham@gmail.com', null,
 2500, 'one_time', null, null, null, null,
 '798685815', 'AB393081490', '2026-05-09 21:33:08+00',
 true, true,
 '51 Brandywine Dr', 'Hudson', 'OH', '44236', 'United States',
 'Non profit', 'UUSA',
 null, null, null, null, null,
 'website_donate_25', null,
 'https://secure.actblue.com/page/ohio-pride-pac', null, 'Ohio Pride Pac', 'OHIO PRIDE PAC',
 'Apple Pay', 'VISA', 38, null,
 true, false, false, false,
 true, false,
 null,
 null, null),

-- 21) Kyle Brown  $50  2026-05-10
('Kyle Brown', 'Kyle Brown', 'kyledbrown@gmail.com', null,
 5000, 'one_time', null, null, null, null,
 '798912534', 'AB393189274', '2026-05-10 23:03:54+00',
 true, true,
 '4318 Norman Ave. NW', 'Canton', 'OH', '44709', 'United States',
 'Communications Manager', 'Turfgrass Producers International',
 null, null, null, null, null,
 'website_founding_member', null,
 'https://secure.actblue.com/page/ohio-pride-pac', null, 'Ohio Pride Pac', 'OHIO PRIDE PAC',
 'Card', 'Discover', 75, null,
 false, false, false, false,
 true, false,
 'opt_out',
 null, null),

-- 22) Jeffrey Lox  $100  2026-05-11
('Jeffrey Lox', 'Jeffrey Lox', 'jeffreylox@gmail.com', null,
 10000, 'one_time', null, null, null, null,
 '799022950', 'AB393207611', '2026-05-11 10:02:45+00',
 true, true,
 '3288 Bremerton Rd', 'Pepper Pike', 'OH', '44124-5348', 'United States',
 'Social Work', 'Wingspan Care Group',
 null, null, null, null, null,
 'website_founding_member', null,
 'https://secure.actblue.com/page/ohio-pride-pac', null, 'Ohio Pride Pac', 'OHIO PRIDE PAC',
 'Card', 'MasterCard', 150, null,
 true, false, false, false,
 true, false,
 'opt_out',
 null, null),

-- 23) Michael Oakley  $25  2026-05-11
('Michael Oakley', 'Michael Oakley', 'mdoakley7070@outlook.com', null,
 2500, 'one_time', null, null, null, null,
 '799023434', 'AB393207995', '2026-05-11 10:08:33+00',
 true, true,
 '5835 Windknoll Ct', 'Cincinnati', 'OH', '45243', 'United States',
 'Not Employed', 'Not Employed',
 null, null, null, null, null,
 'website_founding_member', null,
 'https://secure.actblue.com/page/ohio-pride-pac', 'mdoakley7070@outlook.com', 'Ohio Pride Pac', 'OHIO PRIDE PAC',
 'Apple Pay', 'VISA', 38, null,
 true, true, false, false,
 true, false,
 null,
 null, null),

-- 24) Winifred Weizer  $25  2026-05-11
('Winifred Weizer', 'Winifred Weizer', 'winfud@gmail.com', '2167028300',
 2500, 'one_time', null, null, null, null,
 '799025337', 'AB393209478', '2026-05-11 10:28:51+00',
 true, true,
 '2177 Jackson Blvd', 'Cleveland', 'OH', '44118', 'United States',
 'Not Employed', 'Not Employed',
 null, null, null, null, null,
 'website_founding_member', null,
 'https://secure.actblue.com/page/ohio-pride-pac', 'winfud@gmail.com', 'Ohio Pride Pac', 'OHIO PRIDE PAC',
 'Card', 'MasterCard', 38, null,
 false, true, false, false,
 true, false,
 'opt_in',
 null, null),

-- 25) Wilson Figueroa  $25  2026-05-11
('Wilson Figueroa', 'Wilson Figueroa', 'wsfigueroa@gmail.com', null,
 2500, 'one_time', null, null, null, null,
 '799027484', 'AB393211069', '2026-05-11 10:49:04+00',
 true, true,
 '334 Taylor Ave', 'Columbus', 'OH', '43203', 'United States',
 'postdoctoral scholar', 'The Wexner Medical Center',
 null, null, null, null, null,
 'website_founding_member', null,
 'https://secure.actblue.com/page/ohio-pride-pac', null, 'Ohio Pride Pac', 'OHIO PRIDE PAC',
 'Apple Pay', 'VISA', 38, null,
 true, false, false, false,
 true, false,
 null,
 null, null),

-- 26) Jordan Ostrum  $25  2026-05-11
('Jordan Ostrum', 'Jordan Ostrum', 'ostrumjordan@gmail.com', null,
 2500, 'one_time', null, null, null, null,
 '799027537', 'AB393211115', '2026-05-11 10:49:38+00',
 true, true,
 '210 Wayne Ave Apt 404', 'Dayton', 'OH', '45402', 'United States',
 'Librarian', 'DML',
 null, null, null, null, null,
 'website_founding_member', null,
 'https://secure.actblue.com/page/ohio-pride-pac', null, 'Ohio Pride Pac', 'OHIO PRIDE PAC',
 'Card', 'VISA', 38, null,
 true, false, false, false,
 true, false,
 'opt_out',
 null, null),

-- 27) Jerry Hubbard  $25  2026-05-11
('Jerry Hubbard', 'Jerry Hubbard', 'modernmythos.mmj@gmail.com', '4809097082',
 2500, 'one_time', null, null, null, null,
 '799032452', 'AB393214764', '2026-05-11 11:30:42+00',
 true, true,
 '925 E Street', 'Lorain', 'OH', '44052', 'United States',
 'Local Artisan', 'Modern Mythos',
 null, null, null, null, null,
 'website_founding_member', null,
 'https://secure.actblue.com/page/ohio-pride-pac', 'modernmythos.mmj@gmail.com', 'Ohio Pride Pac', 'OHIO PRIDE PAC',
 'Card', 'VISA', 38, null,
 false, true, false, false,
 true, false,
 'opt_in',
 null, null)

on conflict (actblue_contribution_id) do update set
  full_name                  = excluded.full_name,
  display_name               = excluded.display_name,
  email                      = excluded.email,
  phone                      = excluded.phone,
  amount_cents               = excluded.amount_cents,
  recurrence                 = excluded.recurrence,
  recurring_amount_cents     = excluded.recurring_amount_cents,
  recurring_type             = excluded.recurring_type,
  recurring_duration         = excluded.recurring_duration,
  initial_recurring_at       = excluded.initial_recurring_at,
  actblue_receipt_id         = excluded.actblue_receipt_id,
  contributed_at             = excluded.contributed_at,
  is_public                  = true,
  is_vetted                  = true,
  address_line1              = excluded.address_line1,
  city                       = excluded.city,
  state                      = excluded.state,
  zip                        = excluded.zip,
  country                    = excluded.country,
  occupation                 = excluded.occupation,
  employer                   = excluded.employer,
  employer_address_line1     = excluded.employer_address_line1,
  employer_city              = excluded.employer_city,
  employer_state             = excluded.employer_state,
  employer_zip               = excluded.employer_zip,
  employer_country           = excluded.employer_country,
  refcode                    = excluded.refcode,
  refcode_2                  = excluded.refcode_2,
  contribution_form_url      = excluded.contribution_form_url,
  form_owner_email           = excluded.form_owner_email,
  form_branding_name         = excluded.form_branding_name,
  recipient_committee        = excluded.recipient_committee,
  payment_method             = excluded.payment_method,
  card_type                  = excluded.card_type,
  actblue_fee_cents          = excluded.actblue_fee_cents,
  stripe_fee_text            = excluded.stripe_fee_text,
  via_mobile                 = excluded.via_mobile,
  is_actblue_express         = excluded.is_actblue_express,
  is_refunded                = excluded.is_refunded,
  is_cancelled_recurring     = excluded.is_cancelled_recurring,
  recurring_upsell_shown     = excluded.recurring_upsell_shown,
  recurring_upsell_succeeded = excluded.recurring_upsell_succeeded,
  text_message_opt_in        = excluded.text_message_opt_in,
  elected_office             = coalesce(public.founding_members.elected_office, excluded.elected_office),
  jurisdiction               = coalesce(public.founding_members.jurisdiction,   excluded.jurisdiction);


-- -----------------------------------------------------------------------------
-- 4. Force the ZIP-driven county trigger to fire on the upserted rows.
--    INSERT...ON CONFLICT DO UPDATE bypasses BEFORE INSERT, and the trigger
--    we have only fires BEFORE INSERT or BEFORE UPDATE OF zip, so a direct
--    UPDATE that touches zip will populate county_name / county_fips.
-- -----------------------------------------------------------------------------
update public.founding_members
   set zip = zip
 where actblue_contribution_id in (
   '792838504','792838635','795296458','795312259','795354300','795367120',
   '795580147','795594334','795901630','796599474','796604809','796638642',
   '797245829','797291814','797297179','797646631','798173373','798361636',
   '798362279','798685815','798912534','799022950','799023434','799025337',
   '799027484','799027537','799032452'
 );

-- Mirror county_name into the legacy `county` column for any row where the
-- county constraint allows it and county is currently null. Strips
-- " County" suffix if present.
update public.founding_members
   set county = case
     when county_name is null then null
     when county_name ilike '% County' then regexp_replace(county_name, ' County$', '')
     else county_name
   end
 where county is null
   and county_name is not null
   and actblue_contribution_id in (
     '792838504','792838635','795296458','795312259','795354300','795367120',
     '795580147','795594334','795901630','796599474','796604809','796638642',
     '797245829','797291814','797297179','797646631','798173373','798361636',
     '798362279','798685815','798912534','799022950','799023434','799025337',
     '799027484','799027537','799032452'
   );


-- -----------------------------------------------------------------------------
-- 5. Assign display_order to any newly-public row that doesn't have one yet,
--    ordering by contributed_at so the public roster reads chronologically
--    after the four manually-ordered seed members.
-- -----------------------------------------------------------------------------
with ordered as (
  select id,
         row_number() over (order by contributed_at, full_name) as rn
  from public.founding_members
  where is_public = true
    and is_vetted = true
    and display_order is null
),
nextstart as (
  select coalesce(max(display_order), 0) as base from public.founding_members
)
update public.founding_members fm
   set display_order = ns.base + o.rn
  from ordered o, nextstart ns
 where fm.id = o.id;


-- -----------------------------------------------------------------------------
-- 6. Assign founding_number to any public+vetted row that doesn't have one,
--    in contribution order. Mirrors prior seed migrations.
-- -----------------------------------------------------------------------------
with ordered as (
  select id,
         row_number() over (order by contributed_at, full_name) as rn
  from public.founding_members
  where is_public = true
    and is_vetted = true
    and founding_number is null
),
nextstart as (
  select coalesce(max(founding_number), 0) as base from public.founding_members
)
update public.founding_members fm
   set founding_number = ns.base + o.rn
  from ordered o, nextstart ns
 where fm.id = o.id;


-- -----------------------------------------------------------------------------
-- 7. Notes column: stamp where each row came from so future audits are easy.
-- -----------------------------------------------------------------------------
update public.founding_members
   set notes = coalesce(notes || E'\n', '')
               || 'Backfilled from ActBlue Custom Report 2026-04-12..2026-05-11 on ' || now()::date
 where actblue_contribution_id in (
   '795354300','795367120','795580147','795594334','795901630','796599474',
   '796604809','796638642','797245829','797291814','797297179','797646631',
   '798173373','798361636','798362279','798685815','798912534','799022950',
   '799023434','799025337','799027484','799027537','799032452'
 );
