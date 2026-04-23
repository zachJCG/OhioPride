-- =============================================================================
-- Ohio Pride PAC, Migration 4: Scorecard (Bills, Roll Calls, Exceptions)
-- -----------------------------------------------------------------------------
-- Persists the raw evidence that powers the public scorecard. Every row is a
-- mirror of an official Ohio General Assembly roll call record published at
-- legislature.ohio.gov; the editorial dataset in /js/voting-records.js is the
-- working copy, and this migration lands the same records in Postgres so
-- backend tooling, the daily verification workflow (migration 5), and Netlify
-- edge functions can query the evidence without parsing JavaScript.
--
-- SCORING MODEL: composite scores are computed from this evidence at view
-- time, not stored. There is no votes_score / sponsorship_score / news_score
-- column, and there is no party_baseline column. The published formula is
-- evidence-only with a flat 50 starting baseline applied to every
-- legislator regardless of party, chamber, or caucus role:
--
--   score = clamp(0, 100, round(50 + (V * 6) + (S * 3) + (N * 1)))
--
-- where V, S, N are the Votes / Sponsorship / News subscores derived from
-- this table and from /js/scorecard-data.js. To shift a legislator's grade
-- you change the underlying evidence: add or correct a roll_calls row, add
-- a legislator_vote_exception, or update news / sponsorship attribution in
-- /js/scorecard-data.js. The scorecard front end recomputes from there.
-- See computeSubscores() and calcScore() in scorecard-data.js for the
-- canonical implementation, and /methodology on the live site for the
-- public-facing explanation.
--
-- Four objects:
--
--   1. public.bills: the catalog of bills the scorecard tracks. Keyed by
--      slug to match HOUSE_MEMBERS / SENATE_MEMBERS notes in
--      scorecard-data.js. Seeded with all 26 currently tracked bills plus
--      3 historical 135th-GA bills.
--
--   2. public.roll_calls: one row per recorded floor / committee / concur
--      / override / amend / introduce vote. Carries chamber, stage,
--      date, tally, and stance. Migration 5 extends this table with
--      verification columns; do not rename any column defined here.
--
--   3. public.legislator_vote_exceptions: one row per member-roll_call
--      pair where the member broke from their party-line default. The JS
--      resolver falls back to party-line defaults, so only crossovers and
--      hand-recorded absences need rows here.
--
--   4. RLS policies giving anon SELECT on everything (the public scorecard
--      reads it) and service_role full CRUD (automation writes it).
--
-- Depends on migrations 1-3. Specifically references public.set_updated_at().
-- =============================================================================


-- =============================================================================
-- TABLE: bills
-- -----------------------------------------------------------------------------
-- Catalog of bills tracked on the scorecard. `slug` is the stable join key
-- used by roll_calls.bill_slug and by the scorecard front end.
--
-- `stance` carries the editorial stance that drives scoring: "anti" means a
-- Y vote hurts a legislator's score, "pro" means a Y vote helps. "mixed"
-- suppresses automatic scoring and requires a hand-entered exception.
-- =============================================================================
create table if not exists public.bills (
  id            uuid        primary key default gen_random_uuid(),
  slug          text        not null unique,                 -- "hb249", "sb1", "sb1-135", ...
  label         text        not null,                        -- "HB 249", "SB 1 (135th)"
  title         text        not null,                        -- short human title
  ga            text        not null                         -- "135th" | "136th"
                  check (ga in ('135th', '136th')),
  stance        text        not null default 'anti'
                  check (stance in ('pro', 'anti', 'mixed')),
  summary       text,                                        -- one-paragraph description
  status        text,                                        -- "signed", "pending", "died", etc.
  is_active     boolean     not null default true,
  display_order integer     not null default 100,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.bills is
  'Catalog of bills tracked on the Ohio Pride PAC scorecard. Slug is the stable join key for roll_calls and the client JS.';
comment on column public.bills.stance is
  'Editorial stance: anti = Y vote hurts score, pro = Y vote helps score, mixed = no automatic scoring.';

create index if not exists bills_ga_stance_idx
  on public.bills (ga, stance);
create index if not exists bills_active_order_idx
  on public.bills (is_active, display_order);

drop trigger if exists set_bills_updated_at on public.bills;
create trigger set_bills_updated_at
  before update on public.bills
  for each row execute function public.set_updated_at();


-- =============================================================================
-- TABLE: roll_calls
-- -----------------------------------------------------------------------------
-- One row per recorded legislative action that resolves to a scorecard
-- impact: committee reports, floor passage, concurrence, override, amend,
-- introduce. `roll_call_slug` mirrors the JS ROLL_CALLS[].id convention
-- ("<billSlug>-<chamber-letter>-<stage>") so JS and SQL stay in sync.
--
-- NOTE: Migration 5 adds journal_page_reference, verification_status,
-- source_url, verified_at, verified_by via `alter table ... add column if
-- not exists`. Those columns are intentionally omitted here so this
-- migration remains a clean baseline.
-- =============================================================================
create table if not exists public.roll_calls (
  id              uuid        primary key default gen_random_uuid(),
  roll_call_slug  text        not null unique,               -- "hb249-h-pass", "sb1-136-s-concur"
  bill_id         uuid        not null references public.bills(id) on delete cascade,
  bill_slug       text        not null,                      -- denormalized for JS round-trip
  bill_label      text        not null,                      -- "HB 249", "SB 1"
  bill_title      text        not null,                      -- "Drag Performance Ban"

  chamber         text        not null
                    check (chamber in ('house', 'senate')),
  stage           text        not null
                    check (stage in ('introduce', 'amend', 'committee', 'pass', 'concur', 'override')),
  label           text        not null,                      -- e.g. "House Passage"
  vote_date       date        not null,

  result          text        not null,                      -- "Passed 63-32"
  yeas            integer     not null default 0 check (yeas >= 0),
  nays            integer     not null default 0 check (nays >= 0),

  stance          text        not null
                    check (stance in ('pro', 'anti', 'mixed')),
  ga              text        not null
                    check (ga in ('135th', '136th')),

  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.roll_calls is
  'One row per tracked legislative action (committee report, floor passage, concurrence, override, etc.). Carries the data the scorecard uses to resolve a legislator vote + score impact.';
comment on column public.roll_calls.roll_call_slug is
  'Stable slug matching JS ROLL_CALLS[].id. Convention: "<billSlug>-<chamberLetter>-<stage>".';
comment on column public.roll_calls.stage is
  'Weighting ladder (see EVENT_WEIGHTS in voting-records.js): override 1.25, concur/pass 1.00, committee 0.75, amend 0.50, introduce 0.25.';

create index if not exists roll_calls_bill_idx
  on public.roll_calls (bill_id);
create index if not exists roll_calls_bill_slug_idx
  on public.roll_calls (bill_slug);
create index if not exists roll_calls_ga_chamber_idx
  on public.roll_calls (ga, chamber);
create index if not exists roll_calls_vote_date_idx
  on public.roll_calls (vote_date desc);

drop trigger if exists set_roll_calls_updated_at on public.roll_calls;
create trigger set_roll_calls_updated_at
  before update on public.roll_calls
  for each row execute function public.set_updated_at();


-- =============================================================================
-- TABLE: legislator_vote_exceptions
-- -----------------------------------------------------------------------------
-- Crossover / absence rows. The scorecard's JS resolver defaults to
-- party-line votes; any member who broke party line or has a hand-recorded
-- NV / E gets a row here. (chamber, district, roll_call_id) is unique so a
-- second insert for the same member-vote updates rather than duplicates.
-- =============================================================================
create table if not exists public.legislator_vote_exceptions (
  id             uuid        primary key default gen_random_uuid(),
  roll_call_id   uuid        not null references public.roll_calls(id) on delete cascade,
  roll_call_slug text        not null,                       -- denormalized for JS round-trip

  chamber        text        not null
                   check (chamber in ('house', 'senate')),
  district       integer     not null check (district > 0),
  vote           text        not null
                   check (vote in ('Y', 'N', 'NV', 'E')),

  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (chamber, district, roll_call_id)
);

comment on table public.legislator_vote_exceptions is
  'Crossover rows: legislators whose vote on a roll call differed from their party-line default, or whose absence was specifically recorded. The JS resolver treats these as authoritative over the party-line fallback.';

create index if not exists legislator_vote_exceptions_member_idx
  on public.legislator_vote_exceptions (chamber, district);
create index if not exists legislator_vote_exceptions_roll_call_idx
  on public.legislator_vote_exceptions (roll_call_id);

drop trigger if exists set_legislator_vote_exceptions_updated_at on public.legislator_vote_exceptions;
create trigger set_legislator_vote_exceptions_updated_at
  before update on public.legislator_vote_exceptions
  for each row execute function public.set_updated_at();


-- =============================================================================
-- Row Level Security
-- -----------------------------------------------------------------------------
-- The scorecard page is fully public, so anon can SELECT every row. Writes
-- are service_role only: automation, the daily verification job, and
-- migrations themselves.
-- =============================================================================
alter table public.bills                         enable row level security;
alter table public.roll_calls                    enable row level security;
alter table public.legislator_vote_exceptions    enable row level security;

drop policy if exists "bills public read" on public.bills;
create policy "bills public read"
  on public.bills
  for select
  to anon, authenticated
  using (is_active = true);

drop policy if exists "roll_calls public read" on public.roll_calls;
create policy "roll_calls public read"
  on public.roll_calls
  for select
  to anon, authenticated
  using (true);

drop policy if exists "legislator_vote_exceptions public read" on public.legislator_vote_exceptions;
create policy "legislator_vote_exceptions public read"
  on public.legislator_vote_exceptions
  for select
  to anon, authenticated
  using (true);

drop policy if exists "bills service_role writes" on public.bills;
create policy "bills service_role writes"
  on public.bills for all to service_role using (true) with check (true);

drop policy if exists "roll_calls service_role writes" on public.roll_calls;
create policy "roll_calls service_role writes"
  on public.roll_calls for all to service_role using (true) with check (true);

drop policy if exists "legislator_vote_exceptions service_role writes" on public.legislator_vote_exceptions;
create policy "legislator_vote_exceptions service_role writes"
  on public.legislator_vote_exceptions for all to service_role using (true) with check (true);


-- =============================================================================
-- SEED: bills
-- -----------------------------------------------------------------------------
-- Seeds the bill catalog with the set of bills currently tracked by the
-- scorecard. Additional bills not yet represented in roll_calls can be added
-- here and will appear on the scorecard as "tracked but not yet scored."
-- =============================================================================
insert into public.bills (slug, label, title, ga, stance, summary, status, display_order)
values
  -- Active anti-equality bills, on the floor or moving (10..29)
  ('hb249',      'HB 249',          'Drag Ban',                                  '136th', 'anti',
     'Criminalizes "adult cabaret performances" in any venue where a minor could be present. Targets drag artists.',
     'pending-senate', 10),
  ('sb34',       'SB 34',           'Ten Commandments Classroom Displays',       '136th', 'anti',
     'Requires a copy of the Ten Commandments to be displayed in every Ohio public school classroom.',
     'pending-house', 20),

  -- Active anti-equality, in committee or introduced (30..59)
  ('hb798',      'HB 798',          'Omnibus Anti-Trans Bill',                   '136th', 'anti',
     'Sweeping bill bundling multiple anti-trans provisions into a single statute.',
     'introduced', 30),
  ('hb796',      'HB 796',          'Prison Trans Housing Ban',                  '136th', 'anti',
     'Bars Ohio Department of Rehabilitation and Correction from housing transgender prisoners by gender identity.',
     'introduced', 32),
  ('hb693',      'HB 693',          'Affirming Families First Act',              '136th', 'anti',
     'Limits parental and provider authority over gender-affirming care for minors.',
     'in-committee', 34),
  ('hb602',      'HB 602',          'Pride Flag Ban on State Property',          '136th', 'anti',
     'Restricts which flags may be flown at state and local public buildings.',
     'in-committee', 36),
  ('hb457',      'HB 457',          'Politically-Motivated Crimes',              '136th', 'anti',
     'Creates a new criminal classification with carve-outs that exclude LGBTQ+ Ohioans from protections.',
     'in-committee', 38),
  ('hb190',      'HB 190',          'Given Name Act (Forced Outing)',            '136th', 'anti',
     'Requires schools to use a student''s legal name and notify parents of any change.',
     'in-committee', 40),
  ('hb155',      'HB 155',          'K-12 DEI Ban',                              '136th', 'anti',
     'Extends the higher-ed DEI ban into K-12 schools.',
     'in-committee', 42),
  ('sb113',      'SB 113',          'Senate DEI Ban (Schools)',                  '136th', 'anti',
     'Senate companion to the K-12 DEI ban.',
     'in-committee', 44),
  ('hb172',      'HB 172',          'Minor Mental Health Consent',               '136th', 'anti',
     'Restricts a minor''s ability to access mental health care without parental consent.',
     'in-committee', 46),
  ('sb274',      'SB 274',          'Senate Companion to HB 172',                '136th', 'anti',
     'Senate companion to HB 172.',
     'in-committee', 48),
  ('hb196',      'HB 196',          'Deadnaming Candidates Bill',                '136th', 'anti',
     'Requires candidates for office who have changed their legal name to disclose former names on the ballot.',
     'in-committee', 50),
  ('hb262',      'HB 262',          'Designate Natural Family Month',            '136th', 'anti',
     'Establishes a "Natural Family Month" with statutory language excluding same-sex parents.',
     'in-committee', 52),

  -- Anti-equality, signed or overridden into law (60..79)
  ('sb1',        'SB 1',            'DEI Ban (Higher Ed)',                       '136th', 'anti',
     'Bans DEI programming in Ohio public universities and restricts classroom discussion of "controversial" topics.',
     'signed', 60),
  ('sb104',      'SB 104',          'Bathroom Ban',                              '135th', 'anti',
     'Attached a K-12 and higher-ed bathroom/locker-room restriction to a College Credit Plus vehicle.',
     'signed', 62),
  ('hb8',        'HB 8',            'Parents'' Bill of Rights (Forced Outing)',  '135th', 'anti',
     'Requires schools to disclose a student''s gender identity to parents and to notify parents of any "sexuality content" instruction.',
     'signed', 64),
  ('hb68',       'HB 68',           'Gender-Affirming Care Ban + Sports Ban',    '135th', 'anti',
     'Bans gender-affirming medical care for minors and bars transgender women and girls from participating in girls'' and women''s sports.',
     'signed-override', 66),

  -- Pro-equality bills (80..99)
  ('sb70',       'SB 70',           'Ohio Fairness Act',                         '136th', 'pro',
     'Adds sexual orientation and gender identity to Ohio''s nondiscrimination protections in employment, housing, and public accommodations.',
     'in-committee', 80),
  ('hb136',      'HB 136',          'Ohio Fairness Act (House)',                 '136th', 'pro',
     'House companion to SB 70.',
     'in-committee', 82),
  ('sb71',       'SB 71',           'Conversion Therapy Ban',                    '136th', 'pro',
     'Bans licensed mental health professionals from practicing conversion therapy on minors.',
     'in-committee', 84),
  ('hb300',      'HB 300',          'Conversion Therapy Ban (House)',            '136th', 'pro',
     'House companion to SB 71.',
     'introduced', 86),
  ('hjr4',       'HJR 4',           'Marriage Equality Act',                     '136th', 'pro',
     'Constitutional amendment removing the dormant 2004 same-sex marriage ban from the Ohio Constitution.',
     'in-committee', 88),
  ('hb327',      'HB 327',          'PRIDE Act',                                 '136th', 'pro',
     'Strengthens hate-crime, school, and workplace protections for LGBTQ+ Ohioans.',
     'in-committee', 90),
  ('sb211',      'SB 211',          'Love Makes a Family Week',                  '136th', 'pro',
     'Designates an annual "Love Makes a Family Week" recognizing LGBTQ+ families.',
     'introduced', 92),

  -- Mixed (100..109)
  ('hb306',      'HB 306',          'Hate Crimes Act (Excludes Trans Protections)', '136th', 'mixed',
     'Adds aggravating sentencing factors for hate crimes but pointedly omits gender identity from the protected classes.',
     'in-committee', 100),

  -- Historical / 135th-GA scoring context (200..299)
  ('sb1-135',    'SB 1 (135th)',    'Higher Ed Reform (DEI precursor)',          '135th', 'anti',
     'Prior-GA version of the higher-ed DEI restrictions that passed the Senate but did not clear the House in the 135th GA.',
     'died-house', 200),
  ('sb34-135',   'SB 34 (135th)',   'Liquor Control and Beer Act',               '135th', 'pro',
     'Non-LGBTQ+ bill kept in the dataset for roster completeness; all members had a recorded vote.',
     'signed', 202),
  ('hb602-135',  'HB 602 (135th)',  'Pride Flag Ban Precursor',                  '135th', 'anti',
     'Prior-GA predecessor restricting which flags may be flown at public buildings; cleared committee but never reached a floor vote.',
     'died', 204)
on conflict (slug) do update set
  label         = excluded.label,
  title         = excluded.title,
  ga            = excluded.ga,
  stance        = excluded.stance,
  summary       = excluded.summary,
  status        = excluded.status,
  display_order = excluded.display_order,
  updated_at    = now();


-- =============================================================================
-- SEED: roll_calls
-- -----------------------------------------------------------------------------
-- One row per recorded roll call vote, sourced from the official Ohio General
-- Assembly journals of record. On conflict the row is updated in place so
-- re-running this migration against an updated editorial dataset stays
-- idempotent. bill_id is resolved via a subquery on public.bills(slug) so the
-- seed does not depend on hand-entered UUIDs.
-- =============================================================================
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
     'Sen. Blessing III (R-8) and Sen. Patton (R-24) crossed to vote N.'),
  ('sb1-136-h-cmte',
     (select id from public.bills where slug = 'sb1'),
     'sb1', 'SB 1', 'Higher Ed DEI Ban',
     'house', 'committee', 'House Higher Education Committee',
     '2025-03-19', 'Reported 9-4', 9, 4, 'anti', '136th',
     'Committee report clearing SB 1 to the House floor.'),
  ('sb1-136-h-pass',
     (select id from public.bills where slug = 'sb1'),
     'sb1', 'SB 1', 'Higher Ed DEI Ban',
     'house', 'pass', 'House Passage',
     '2025-03-19', 'Passed 59-34', 59, 34, 'anti', '136th',
     'DEI ban cleared House on party line with limited R defections.'),
  ('sb1-136-s-concur',
     (select id from public.bills where slug = 'sb1'),
     'sb1', 'SB 1', 'Higher Ed DEI Ban',
     'senate', 'concur', 'Senate Concurrence',
     '2025-03-26', 'Concurred 20-11', 20, 11, 'anti', '136th',
     'Senate concurrence sending SB 1 to the Governor. Blessing III and Patton crossed again to N.'),

  -- SB 34 (136th), Ten Commandments
  ('sb34-136-s-cmte',
     (select id from public.bills where slug = 'sb34'),
     'sb34', 'SB 34', 'Ten Commandments Classroom Displays',
     'senate', 'committee', 'Senate Education Committee',
     '2025-11-18', 'Reported 4-2', 4, 2, 'anti', '136th',
     'Committee reported substitute bill clearing to the Senate floor.'),
  ('sb34-136-s-pass',
     (select id from public.bills where slug = 'sb34'),
     'sb34', 'SB 34', 'Ten Commandments Classroom Displays',
     'senate', 'pass', 'Senate Passage',
     '2025-11-19', 'Passed 23-10', 23, 10, 'anti', '136th',
     'Ten Commandments display requirement, party-line Senate passage.'),

  -- HB 68 (135th), gender-affirming care + sports ban
  ('hb68-h-cmte',
     (select id from public.bills where slug = 'hb68'),
     'hb68', 'HB 68', 'Gender-Affirming Care + Sports Ban',
     'house', 'committee', 'House Public Health Committee',
     '2023-06-14', 'Reported 7-6', 7, 6, 'anti', '135th',
     'House committee reported substitute bill.'),
  ('hb68-h-pass',
     (select id from public.bills where slug = 'hb68'),
     'hb68', 'HB 68', 'Gender-Affirming Care + Sports Ban',
     'house', 'pass', 'House Original Passage',
     '2023-06-21', 'Passed 64-28', 64, 28, 'anti', '135th',
     'Original House passage before Senate sports-ban amendment.'),
  ('hb68-s-cmte',
     (select id from public.bills where slug = 'hb68'),
     'hb68', 'HB 68', 'Gender-Affirming Care + Sports Ban',
     'senate', 'committee', 'Senate Government Oversight Committee',
     '2023-12-13', 'Reported 4-1', 4, 1, 'anti', '135th',
     'Senate committee reported substitute bill adding sports-ban language.'),
  ('hb68-s-pass',
     (select id from public.bills where slug = 'hb68'),
     'hb68', 'HB 68', 'Gender-Affirming Care + Sports Ban',
     'senate', 'pass', 'Senate Passage (with Sports Ban amendment)',
     '2023-12-13', 'Passed 24-8', 24, 8, 'anti', '135th',
     'Sen. Nathan Manning (R-13) voted N, sole R crossover.'),
  ('hb68-h-concur',
     (select id from public.bills where slug = 'hb68'),
     'hb68', 'HB 68', 'Gender-Affirming Care + Sports Ban',
     'house', 'concur', 'House Concurrence',
     '2023-12-13', 'Concurred 62-27', 62, 27, 'anti', '135th',
     'House concurred in Senate amendments, sending HB 68 to the Governor. Rep. Callender (R-57) voted N.'),
  ('hb68-h-override',
     (select id from public.bills where slug = 'hb68'),
     'hb68', 'HB 68', 'Gender-Affirming Care + Sports Ban',
     'house', 'override', 'House Veto Override',
     '2024-01-10', 'Override 65-28', 65, 28, 'anti', '135th',
     'Rep. Jamie Callender (R-57) voted N on override.'),
  ('hb68-s-override',
     (select id from public.bills where slug = 'hb68'),
     'hb68', 'HB 68', 'Gender-Affirming Care + Sports Ban',
     'senate', 'override', 'Senate Veto Override',
     '2024-01-24', 'Override 24-8', 24, 8, 'anti', '135th',
     'Sen. Nathan Manning (R-13) voted N, sole R crossover on override.'),

  -- HB 8 (135th), Parents' Bill of Rights / forced outing
  ('hb8-h-cmte',
     (select id from public.bills where slug = 'hb8'),
     'hb8', 'HB 8', 'Parents'' Bill of Rights (Forced Outing)',
     'house', 'committee', 'House Primary and Secondary Education Committee',
     '2023-06-14', 'Reported 10-5', 10, 5, 'anti', '135th',
     'House committee reported amended bill.'),
  ('hb8-h-pass',
     (select id from public.bills where slug = 'hb8'),
     'hb8', 'HB 8', 'Parents'' Bill of Rights (Forced Outing)',
     'house', 'pass', 'House Passage',
     '2023-06-21', 'Passed 65-29', 65, 29, 'anti', '135th',
     'Reps. Andrea White (R-36), Gayle Manning (R-52), Jamie Callender (R-57) voted N.'),
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

  -- SB 104 (135th), bathroom ban amendment
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

  -- SB 1 (135th), higher-ed DEI precursor
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
  bill_id     = excluded.bill_id,
  bill_slug   = excluded.bill_slug,
  bill_label  = excluded.bill_label,
  bill_title  = excluded.bill_title,
  chamber     = excluded.chamber,
  stage       = excluded.stage,
  label       = excluded.label,
  vote_date   = excluded.vote_date,
  result      = excluded.result,
  yeas        = excluded.yeas,
  nays        = excluded.nays,
  stance      = excluded.stance,
  ga          = excluded.ga,
  notes       = excluded.notes,
  updated_at  = now();


-- =============================================================================
-- SEED: legislator_vote_exceptions
-- -----------------------------------------------------------------------------
-- Hand-recorded party-line crossovers and confirmed absences, sourced from
-- the same official Ohio General Assembly journals as the roll_calls seed.
-- roll_call_id is resolved via a subquery on public.roll_calls.roll_call_slug
-- so this seed stays independent of hand-entered UUIDs.
-- =============================================================================
insert into public.legislator_vote_exceptions
  (roll_call_id, roll_call_slug, chamber, district, vote, notes)
values
  -- HB 249 (136th), drag ban passage
  ((select id from public.roll_calls where roll_call_slug = 'hb249-h-pass'),
     'hb249-h-pass', 'house', 57, 'N',
     'Callender, sole R to vote against drag ban.'),

  -- HB 68 (135th), gender-affirming care + sports ban
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

  -- HB 8 (135th), forced outing
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

  -- SB 104 (135th), bathroom ban
  ((select id from public.roll_calls where roll_call_slug = 'sb104-h-pass'),
     'sb104-h-pass', 'house', 57, 'N',
     'Callender, against SB 104 House passage with bathroom-ban amendment.'),

  -- SB 1 (136th), higher-ed DEI ban
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
  vote       = excluded.vote,
  notes      = excluded.notes,
  updated_at = now();


-- =============================================================================
-- GRANTS (belt-and-suspenders; RLS already scopes access)
-- =============================================================================
grant select on public.bills                         to anon, authenticated;
grant select on public.roll_calls                    to anon, authenticated;
grant select on public.legislator_vote_exceptions    to anon, authenticated;
