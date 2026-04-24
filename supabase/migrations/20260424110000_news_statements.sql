-- =============================================================================
-- Ohio Pride PAC, Migration 7: Public statements (news_statements + scoring hook)
-- -----------------------------------------------------------------------------
-- Backs the "Public Statements" section that renders on any scorecard
-- card whose legislator has a non-zero N subscore. Mirrors the JS
-- editorial source at /js/news-statements.js — same columns, same
-- scoring convention.
--
-- Two moving parts:
--
--   1. public.news_statements
--      One row per recorded statement. Columns match the JS object
--      literal keys so the JS dataset seeds cleanly. Sentiment drives
--      the sign of the impact:
--          pro  -> +points (rewards the member)
--          anti -> -points once multiplied by the internal sign
--      `points` is stored as a positive integer (1..3); the sign comes
--      from sentiment. This is the same shape js/news-statements.js
--      uses (pro items contribute +points, anti items contribute
--      negative points via the summarizer).
--
--   2. public.legislator_news_total(chamber, district)
--      Convenience function that returns the signed net suitable for
--      plugging into the `n` argument of public.legislator_score().
--
-- This migration leaves legislator_score() unchanged — the existing
-- signature takes n as a caller-supplied integer. Callers that want
-- DB-driven n can now pass:
--   public.legislator_score(chamber, district, party,
--     sponsorship,
--     public.legislator_news_total(chamber, district))
--
-- Depends on Migration 4 (chamber enum convention) and Migration 6
-- (legislator_score).
-- =============================================================================


-- =============================================================================
-- TABLE: news_statements
-- -----------------------------------------------------------------------------
-- Matches the JS editorial layer one-to-one. (chamber, district, slug)
-- is unique so upserts from the JS dataset stay idempotent.
-- =============================================================================
create table if not exists public.news_statements (
  id            uuid        primary key default gen_random_uuid(),
  slug          text        not null,                    -- stable id, e.g. "57-h-01"
  chamber       text        not null
                  check (chamber in ('house', 'senate')),
  district      integer     not null check (district > 0),
  statement_date date       not null,

  sentiment     text        not null
                  check (sentiment in ('pro', 'anti')),
  points        integer     not null
                  check (points between 1 and 3),

  headline      text        not null,
  context       text,
  source_url    text,
  notes         text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (chamber, district, slug)
);

comment on table public.news_statements is
  'Public statements / press / floor-speech records that feed a legislator''s N subscore. Mirrors js/news-statements.js NEWS_STATEMENTS.';
comment on column public.news_statements.points is
  'Unsigned magnitude 1..3. Sign comes from sentiment: pro -> +points, anti -> -points.';

create index if not exists news_statements_member_idx
  on public.news_statements (chamber, district);
create index if not exists news_statements_date_idx
  on public.news_statements (statement_date desc);
create index if not exists news_statements_sentiment_idx
  on public.news_statements (sentiment);

drop trigger if exists set_news_statements_updated_at on public.news_statements;
create trigger set_news_statements_updated_at
  before update on public.news_statements
  for each row execute function public.set_updated_at();


-- =============================================================================
-- FUNCTION: legislator_news_total(chamber, district) -> integer
-- -----------------------------------------------------------------------------
-- Signed net of a legislator's N statements. Clamped to -5..+5 to match
-- the band js/scorecard-data.js uses for the n component. Callers can
-- pipe this straight into public.legislator_score(..., news => X).
-- =============================================================================
create or replace function public.legislator_news_total(
  p_chamber  text,
  p_district integer
)
returns integer
language sql
stable
as $$
  with scored as (
    select
      case when sentiment = 'pro' then  points
           when sentiment = 'anti' then -points
           else 0
      end as signed_points
    from public.news_statements
    where chamber = lower(p_chamber)
      and district = p_district
  )
  select greatest(-5, least(5, coalesce(sum(signed_points), 0)::integer))
  from scored;
$$;

comment on function public.legislator_news_total(text, integer) is
  'Clamped signed net of news_statements.points for the given legislator. Feed directly into legislator_score(..., news).';


-- =============================================================================
-- Row Level Security
-- -----------------------------------------------------------------------------
-- The scorecard "Public Statements" section is public, so anon SELECT is
-- allowed. service_role gets full write for automation + migrations.
-- =============================================================================
alter table public.news_statements enable row level security;

drop policy if exists "news_statements public read" on public.news_statements;
create policy "news_statements public read"
  on public.news_statements
  for select
  to anon, authenticated
  using (true);

drop policy if exists "news_statements service_role writes" on public.news_statements;
create policy "news_statements service_role writes"
  on public.news_statements for all to service_role using (true) with check (true);


-- =============================================================================
-- GRANTS
-- =============================================================================
grant select  on public.news_statements                           to anon, authenticated;
grant execute on function public.legislator_news_total(text, integer) to anon, authenticated;


-- =============================================================================
-- SEED: news_statements
-- -----------------------------------------------------------------------------
-- One row per entry in js/news-statements.js. Keep in sync when the
-- editorial dataset changes. (chamber, district, slug) conflict rules
-- make the seed idempotent.
-- =============================================================================
insert into public.news_statements
  (slug, chamber, district, statement_date, sentiment, points, headline, context)
values
  ('1-h-01',  'house',  1,  '2025-06-01', 'pro',  2, 'Primary sponsor of HB 306 (Hate Crimes Act)',
     'Jarrells re-introduced the Hate Crimes Act, extending protected-class coverage to gender identity and sexual orientation.'),
  ('8-h-01',  'house',  8,  '2025-04-01', 'pro',  1, 'Medical-professional testimony against HB 68 impact on pediatric care',
     'Somani, a physician, publicly criticized the pediatric-care carve-out in HB 68 during hearings.'),
  ('11-h-01', 'house', 11,  '2025-05-01', 'pro',  2, 'Primary sponsor HB 136 (Fairness Act) + co-sponsor HB 300 (conversion therapy ban)',
     'Lett has been a sustained champion on both the Fairness Act and the conversion-therapy ban.'),
  ('13-h-01', 'house', 13,  '2025-06-01', 'pro',  3, 'Hosts annual Pride press conference; vocal LGBTQ+ advocate',
     'Rader has hosted multi-caucus Pride press events and spoken on the House floor in defense of trans youth.'),
  ('21-h-01', 'house', 21,  '2025-06-01', 'pro',  1, 'Participated in Pride Month press conference',
     'Synenberg joined the Democratic caucus Pride press event and voted against every tracked anti-LGBTQ+ bill.'),
  ('22-h-01', 'house', 22,  '2025-03-01', 'pro',  1, 'Co-sponsor of HB 327 (PRIDE Act)',
     'Brewer added his name to the PRIDE Act coalition and voted the bloc''s line on anti-equality bills.'),
  ('24-h-01', 'house', 24,  '2023-12-01', 'pro',  1, 'Vocal opponent of HB 68 in the 135th GA',
     'Isaacsohn spoke repeatedly against HB 68 during floor debate in the 135th General Assembly.'),
  ('28-h-01', 'house', 28,  '2025-03-01', 'pro',  2, 'Primary sponsor HB 300 (conversion therapy ban) and HB 327 (PRIDE Act)',
     'Brownlee is primary on two of the caucus''s most visible pro-equality bills this GA.'),
  ('57-h-01', 'house', 57,  '2024-01-10', 'pro',  3, 'Only Republican to vote against HB 68, HB 6, HB 8, and HB 249',
     'Callender on the floor: "I am a Republican because I believe in empowering individuals and limiting government."'),

  ('36-h-01', 'house', 36,  '2024-12-18', 'pro',  1, 'Voted against HB 8 (forced outing) on floor passage',
     'White broke with her caucus on HB 8 while otherwise voting party line on anti-LGBTQ+ bills.'),
  ('52-h-01', 'house', 52,  '2024-12-18', 'pro',  1, 'Voted against HB 8 + original HB 6 sports ban in committee',
     'G. Manning broke with caucus on HB 8 and the original HB 6 sports-ban language.'),

  ('12-h-01', 'house', 12,  '2025-06-01', 'anti', 1, 'Primary sponsor Sub HB 96 (anti-LGBTQ+ budget provisions)',
     'Stewart authored the substitute budget that folded in anti-equality provisions targeting schools.'),
  ('37-h-01', 'house', 37,  '2025-02-01', 'anti', 1, 'Co-sponsor of HB 6 (House companion to SB 1 DEI ban)',
     'Young co-sponsored the House companion of the DEI ban that Cirino led in the Senate.'),
  ('40-h-01', 'house', 40,  '2025-05-01', 'anti', 3, 'Primary sponsor HB 196 (trans candidate disclosure); BCI documents re: minor',
     'Creech authored HB 196 requiring trans candidates to self-disclose. Separately, BCI documents referenced a misconduct allegation involving a minor relative.'),
  ('44-h-01', 'house', 44,  '2025-06-01', 'anti', 3, 'Primary/co-sponsor of 8+ anti-LGBTQ+ bills (most prolific author of the 136th GA)',
     'Williams''s bills this GA include HB 249, 155, 190, 262, 693, 796, 798 — the largest single-member anti-LGBTQ+ slate.'),
  ('61-h-01', 'house', 61,  '2025-03-01', 'anti', 2, 'Primary sponsor HB 155 (DEI ban), HB 262 (Natural Family Month)',
     'Lear has paired anti-DEI legislation with an explicitly anti-equality rhetorical frame ("Natural Family Month").'),
  ('78-h-01', 'house', 78,  '2025-01-01', 'anti', 1, 'Advanced anti-LGBTQ+ agenda as former Senate President',
     'Huffman, now in the House, was Senate President during HB 68 and SB 104 passage and pushed them to the floor.'),
  ('80-h-01', 'house', 80,  '2025-04-01', 'anti', 2, 'Primary sponsor HB 190 (Given Names Act) + HB 172 (mental-health consent removal)',
     'Newman authored two targeted bills; has documented ties to Center for Christian Virtue (SPLC-designated anti-LGBTQ group).'),
  ('84-h-01', 'house', 84,  '2026-03-25', 'anti', 2, 'Primary sponsor HB 249 (drag ban); vocal anti-LGBTQ+ advocate',
     'King''s HB 249 passed the House 63-32. She is a repeat co-sponsor of HB 196 and has framed anti-equality bills in Christian-nationalist terms on the floor.'),
  ('88-h-01', 'house', 88,  '2024-01-10', 'anti', 3, 'Compared trans people to "Lucifer"; primary sponsor HB 68',
     'Click compared trans people to "Lucifer" during override debate; separately named in misconduct-related allegations involving minors.'),
  ('94-h-01', 'house', 94,  '2025-02-01', 'anti', 1, 'Primary sponsor HB 507 (School Chaplain Act)',
     'Ritter authored the School Chaplain Act, a vehicle for religious-exemption rollbacks in public schools.'),
  ('99-h-01', 'house', 99,  '2025-01-01', 'anti', 1, 'Votes far-right position on every tracked anti-LGBTQ+ bill',
     'Fowler Arthur is a reliable floor vote for anti-LGBTQ+ legislation and affiliated with far-right caucus positioning.'),

  ('6-s-01',  'senate', 6,  '2021-04-01', 'pro',  1, 'Prior service in the Ohio House (Dayton-area district)',
     'Blackshear was sworn into the Ohio House of Representatives in 2021 and represented a Dayton-area district before his election to the State Senate. House tenure included consistent Democratic-caucus votes against the precursor anti-LGBTQ+ bills of the 134th and 135th GAs.'),
  ('6-s-02',  'senate', 6,  '2024-01-10', 'pro',  2, 'Voted N on HB 68 House override (135th GA, as state representative)',
     'As a state representative, Blackshear voted N on the House override of HB 68 (gender-affirming care + sports ban) on 2024-01-10 — the highest-stakes equality vote of the 135th GA. The override carried 65-28 with the Republican supermajority.'),
  ('6-s-03',  'senate', 6,  '2023-06-21', 'pro',  1, 'Voted N on HB 8 (Parents'' Bill of Rights / forced outing) House passage',
     'Blackshear voted N on the House passage of HB 8 (Parents'' Bill of Rights / forced outing) on 2023-06-21, joining the Democratic caucus against the bill that became law later that GA.'),
  ('6-s-04',  'senate', 6,  '2024-06-26', 'pro',  1, 'Voted N on SB 104 (bathroom ban) House passage with amendment',
     'Blackshear voted N on the House passage of SB 104 on 2024-06-26 after the bathroom/locker-room restriction was attached as an amendment in the House Higher Education Committee.'),
  ('9-s-01',  'senate', 9,  '2024-11-13', 'pro',  1, 'Vocal opponent of SB 104 (bathroom ban) during concurrence debate',
     'Ingram took the floor during SB 104 concurrence and voted N with the Democratic caucus.'),
  ('11-s-01', 'senate', 11, '2024-01-24', 'pro',  1, 'Said "Just let me live" during HB 68 override debate',
     'Hicks-Hudson: "Just let me live." Quoted widely in coverage of the HB 68 override.'),
  ('13-s-01', 'senate', 13, '2024-01-24', 'pro',  2, 'Only Senate Republican to vote against HB 68 override',
     'N. Manning was the sole R to break on the Senate override of HB 68, the bill''s highest-stakes vote.'),
  ('16-s-01', 'senate', 16, '2025-03-01', 'pro',  1, 'Co-sponsor SB 71 (conversion therapy ban)',
     'Liston joined the SB 71 coalition and votes the bloc line on anti-equality bills.'),
  ('21-s-01', 'senate', 21, '2024-01-24', 'pro',  1, 'Criticized "state-sponsored bullying of trans youth" during HB 68 override',
     'Smith on the Senate floor: "This is state-sponsored bullying of trans youth."'),
  ('23-s-01', 'senate', 23, '2025-01-01', 'pro',  3, 'Senate Minority Leader; primary sponsor SB 70, SB 71, SB 211',
     'Antonio is Ohio''s first openly LGBTQ+ legislator and the caucus''s lead on SB 70 (Fairness Act, 12th introduction), SB 71, and SB 211.'),
  ('25-s-01', 'senate', 25, '2024-01-24', 'pro',  1, 'Motioned to adjourn in protest against HB 68 override vote',
     'DeMora filed a procedural motion to adjourn on the override day, a visible protest against the vote''s scheduling. He did not co-sponsor HB 68 or any tracked anti-equality bill.'),
  ('28-s-01', 'senate', 28, '2025-06-01', 'pro',  1, 'Reliable N vote on every tracked anti-LGBTQ+ bill in Senate',
     'Weinstein has voted with the Democratic caucus against every tracked anti-LGBTQ+ bill of the 135th and 136th GAs.'),
  ('8-s-01',  'senate', 8,  '2024-12-18', 'pro',  1, 'Voted against HB 8 (forced outing) in Senate',
     'Blessing III broke with caucus on HB 8 and SB 1 concurrence while otherwise voting party line.'),

  ('14-s-01', 'senate', 14, '2025-11-19', 'anti', 1, 'Primary sponsor SB 34 (Ten Commandments in schools)',
     'Johnson authored SB 34 requiring Ten Commandments displays in public-school classrooms.'),
  ('18-s-01', 'senate', 18, '2024-01-24', 'anti', 3, 'Primary sponsor SB 1 (DEI ban); religious arguments for HB 68 override',
     'Cirino led the Senate DEI ban (SB 1) and delivered religious-framed arguments for the HB 68 override. Also co-sponsor SB 104 (bathroom ban) and SB 274.'),
  ('19-s-01', 'senate', 19, '2025-02-01', 'anti', 2, 'Called DEI "institutional discrimination"; primary sponsor SB 113, SB 274',
     'Brenner framed DEI as "institutional discrimination" in floor remarks. Co-sponsor SB 104 (bathroom ban).'),
  ('27-s-01', 'senate', 27, '2024-01-24', 'anti', 2, 'Made anti-trans statements during HB 68 override debate',
     'Roegner delivered anti-trans remarks during the override debate and voted Y to override.')
on conflict (chamber, district, slug) do update set
  statement_date = excluded.statement_date,
  sentiment      = excluded.sentiment,
  points         = excluded.points,
  headline       = excluded.headline,
  context        = excluded.context,
  source_url     = excluded.source_url,
  notes          = excluded.notes,
  updated_at     = now();
