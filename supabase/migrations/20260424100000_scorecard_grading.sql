-- =============================================================================
-- Ohio Pride PAC, Migration 6: Scorecard grading (SQL-side scoring)
-- -----------------------------------------------------------------------------
-- Up to now the public scorecard computed per-legislator scores in the
-- browser from js/voting-records.js. This migration lands the same
-- scoring logic in Postgres so a legislator's net voting points,
-- normalized score (0-100), and letter grade (A+ through F) can be read
-- directly from a SQL function or view — same answer the page shows,
-- same basis the methodology documents.
--
-- Two building blocks:
--
--   1. public.event_weight(stage text) -> numeric
--      Mirrors EVENT_WEIGHTS in voting-records.js:
--        override 1.25, concur/pass 1.00, committee 0.75,
--        amend 0.50, introduce 0.25.
--
--   2. public.resolve_legislator_vote(chamber, district, party, roll_call_id)
--      Mirrors resolveVote(): exception row wins; party-line default
--      otherwise (anti bill: R->Y, D->N; pro bill: R->N, D->Y);
--      mixed/independent -> NV.
--
-- Two consumer surfaces:
--
--   A. public.legislator_voting_net(chamber, district, party) -> record
--      Sums weighted pro/anti points across every roll call that
--      member was eligible for. Returns pro_votes, anti_votes, net,
--      pro_points, anti_points.
--
--   B. public.legislator_score(chamber, district, party, s, n) -> record
--      Applies the scoring formula the UI uses:
--        v = clamp(round(net), -5, +5)
--        raw = v + s + n
--        score = clamp(round(50 + raw*5), 0, 100)
--      ...and maps to the same six-tier grade scale the site uses.
--      s and n default to 0 so the function can be called with just
--      the chamber/district/party when sponsorship and news scores
--      aren't available yet.
--
-- Depends on Migration 4 (bills, roll_calls, legislator_vote_exceptions).
-- Scoring logic MUST stay in sync with:
--   - js/voting-records.js  (EVENT_WEIGHTS, resolveVote, voteImpact)
--   - js/scorecard-data.js  (calcScore, calcGrade, GRADE_SCALE)
--   - scorecard/methodology.html  (public documentation)
-- =============================================================================


-- =============================================================================
-- event_weight(stage) -> numeric
-- -----------------------------------------------------------------------------
-- Weighting ladder. Any stage not in the ladder resolves to 1.0 — matches
-- the JS fallback "EVENT_WEIGHTS[stage] != null ? EVENT_WEIGHTS[stage] : 1.0".
-- =============================================================================
create or replace function public.event_weight(p_stage text)
returns numeric
language sql
immutable
as $$
  select case p_stage
    when 'override'  then 1.25
    when 'concur'    then 1.00
    when 'pass'      then 1.00
    when 'committee' then 0.75
    when 'amend'     then 0.50
    when 'introduce' then 0.25
    else             1.00
  end::numeric;
$$;

comment on function public.event_weight(text) is
  'Scorecard event-stage multiplier. Must match EVENT_WEIGHTS in js/voting-records.js.';


-- =============================================================================
-- resolve_legislator_vote(chamber, district, party, roll_call_id) -> text
-- -----------------------------------------------------------------------------
-- Returns 'Y' | 'N' | 'NV' | 'E' | '-':
--   1. exception row (hand-recorded crossover / absence) wins
--   2. roll call belongs to a different chamber -> '-'
--   3. otherwise, party-line default:
--        anti bill:  R -> Y, D -> N, else NV
--        pro bill:   R -> N, D -> Y, else NV
--        mixed bill: NV
--
-- Note: SEATED_SINCE (the JS-side seating table) has no SQL equivalent
-- yet. A member predating a roll call's vote_date is therefore scored
-- as if they were seated. Migration 7 will add a legislators roster
-- with first_seated, at which point this function gains a seating
-- guard and can return '-' for members who weren't seated.
-- =============================================================================
create or replace function public.resolve_legislator_vote(
  p_chamber       text,
  p_district      integer,
  p_party         text,
  p_roll_call_id  uuid
)
returns text
language plpgsql
stable
as $$
declare
  v_rc_chamber text;
  v_stance     text;
  v_exc_vote   text;
begin
  select rc.chamber, rc.stance
    into v_rc_chamber, v_stance
    from public.roll_calls rc
   where rc.id = p_roll_call_id;

  if not found then
    return '-';
  end if;

  if v_rc_chamber is distinct from lower(p_chamber) then
    return '-';
  end if;

  select e.vote
    into v_exc_vote
    from public.legislator_vote_exceptions e
   where e.roll_call_id = p_roll_call_id
     and e.chamber      = lower(p_chamber)
     and e.district     = p_district
   limit 1;

  if v_exc_vote is not null then
    return v_exc_vote;
  end if;

  if v_stance = 'anti' then
    if p_party = 'R' then return 'Y';
    elsif p_party = 'D' then return 'N';
    else return 'NV';
    end if;
  elsif v_stance = 'pro' then
    if p_party = 'R' then return 'N';
    elsif p_party = 'D' then return 'Y';
    else return 'NV';
    end if;
  end if;

  return 'NV';
end;
$$;

comment on function public.resolve_legislator_vote(text, integer, text, uuid) is
  'Returns the Y/N/NV/E/- vote for a legislator on a roll call. Exception rows win over party-line defaults.';


-- =============================================================================
-- legislator_voting_net(chamber, district, party) -> table(...)
-- -----------------------------------------------------------------------------
-- Aggregates the signed voting impact across every roll call the
-- member was eligible for. Same math as summarizeVotes() in JS.
--
--   On an anti bill: Y -> -1 * weight, N -> +1 * weight
--   On a pro bill:   Y -> +1 * weight, N -> -1 * weight
--   NV / E / - / mixed -> neutral
-- =============================================================================
create or replace function public.legislator_voting_net(
  p_chamber  text,
  p_district integer,
  p_party    text
)
returns table (
  pro_votes    integer,
  anti_votes   integer,
  pro_points   numeric,
  anti_points  numeric,
  net          numeric
)
language sql
stable
as $$
  with resolved as (
    select
      rc.id,
      rc.stance,
      rc.stage,
      public.resolve_legislator_vote(p_chamber, p_district, p_party, rc.id) as v
    from public.roll_calls rc
    where rc.chamber = lower(p_chamber)
  ),
  scored as (
    select
      case
        when stance = 'anti' and v = 'N' then  1 * public.event_weight(stage)
        when stance = 'pro'  and v = 'Y' then  1 * public.event_weight(stage)
        else 0::numeric
      end as pro_pts,
      case
        when stance = 'anti' and v = 'Y' then -1 * public.event_weight(stage)
        when stance = 'pro'  and v = 'N' then -1 * public.event_weight(stage)
        else 0::numeric
      end as anti_pts
    from resolved
    where v in ('Y', 'N')
  )
  select
    coalesce(sum(case when pro_pts  > 0 then 1 else 0 end), 0)::integer  as pro_votes,
    coalesce(sum(case when anti_pts < 0 then 1 else 0 end), 0)::integer  as anti_votes,
    round(coalesce(sum(pro_pts),  0)::numeric, 2) as pro_points,
    round(coalesce(sum(anti_pts), 0)::numeric, 2) as anti_points,
    round(coalesce(sum(pro_pts + anti_pts), 0)::numeric, 2) as net
  from scored;
$$;

comment on function public.legislator_voting_net(text, integer, text) is
  'Sums weighted pro/anti voting impact across eligible roll calls. Same logic as summarizeVotes() in js/voting-records.js.';


-- =============================================================================
-- legislator_score(chamber, district, party, sponsorship, news) -> table(...)
-- -----------------------------------------------------------------------------
-- Applies the public methodology formula.
--   v    = clamp(round(net),    -5, +5)
--   raw  = v + sponsorship + news
--   score = clamp(round(50 + raw*5), 0, 100)
--   grade = grade_scale_lookup(score)
-- sponsorship and news default to 0 so callers that only have
-- voting data can still use the function.
-- =============================================================================
create or replace function public.legislator_score(
  p_chamber     text,
  p_district    integer,
  p_party       text,
  p_sponsorship integer default 0,
  p_news        integer default 0
)
returns table (
  voting_net    numeric,
  vote_score_v  integer,
  sponsorship_s integer,
  news_n        integer,
  raw_score     integer,
  score         integer,
  grade         text,
  grade_label   text
)
language plpgsql
stable
as $$
declare
  v_net numeric;
  v_v   integer;
  v_raw integer;
  v_score integer;
begin
  select n.net
    into v_net
    from public.legislator_voting_net(p_chamber, p_district, p_party) n;

  v_v   := greatest(-5, least(5, round(coalesce(v_net, 0))::integer));
  v_raw := v_v + coalesce(p_sponsorship, 0) + coalesce(p_news, 0);
  v_score := greatest(0, least(100, round(50 + v_raw * 5)::integer));

  return query
    select
      coalesce(v_net, 0)::numeric      as voting_net,
      v_v                              as vote_score_v,
      coalesce(p_sponsorship, 0)       as sponsorship_s,
      coalesce(p_news, 0)              as news_n,
      v_raw                            as raw_score,
      v_score                          as score,
      case
        when v_score >= 90 then 'A+'
        when v_score >= 73 then 'A'
        when v_score >= 55 then 'B'
        when v_score >= 40 then 'C'
        when v_score >= 20 then 'D'
        else                    'F'
      end                              as grade,
      case
        when v_score >= 90 then 'Champion'
        when v_score >= 73 then 'Strong Ally'
        when v_score >= 55 then 'Supportive'
        when v_score >= 40 then 'Mixed Record'
        when v_score >= 20 then 'Unfriendly'
        else                    'Hostile'
      end                              as grade_label;
end;
$$;

comment on function public.legislator_score(text, integer, text, integer, integer) is
  'Returns the composite scorecard output for a legislator: voting net, v/s/n components, 0-100 score, and letter grade. Formula mirrors calcScore/calcGrade in js/scorecard-data.js.';


-- =============================================================================
-- GRANTS
-- -----------------------------------------------------------------------------
-- Anon read is fine for the public scorecard — every input these
-- functions touch is already covered by the "public read" RLS policies
-- on bills / roll_calls / legislator_vote_exceptions.
-- =============================================================================
grant execute on function public.event_weight(text)                                           to anon, authenticated;
grant execute on function public.resolve_legislator_vote(text, integer, text, uuid)           to anon, authenticated;
grant execute on function public.legislator_voting_net(text, integer, text)                   to anon, authenticated;
grant execute on function public.legislator_score(text, integer, text, integer, integer)      to anon, authenticated;
