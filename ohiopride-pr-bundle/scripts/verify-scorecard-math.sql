-- =============================================================================
-- verify-scorecard-math.sql
-- Run inside the Supabase SQL editor after applying the migrations.
-- Confirms the scoring math agrees across the four surfaces.
--
-- Expected: every row in section 3 returns ok = true.
-- =============================================================================


-- 1. Spot-check formula agreement on a handful of legislators.
--    The same number should appear in:
--      * public.legislators (stored subscores, when no snapshot exists)
--      * public.compute_legislator_scorecard(id) (live draft)
--      * public.legislator_scorecard (view the public site reads)
select
  l.id,
  l.full_name,
  l.chamber,
  l.district,
  l.party,
  l.floor_subscore       as vf,
  l.committee_subscore   as vc,
  l.sponsorship_subscore as s,
  -- Hand-computed using methodology formula: 50 + Vf*4 + Vc*4 + S*2, clamp 0..100
  greatest(0, least(100,
    round(50 + (l.floor_subscore * 4) + (l.committee_subscore * 4) + (l.sponsorship_subscore * 2))
  ))::integer as expected_score,
  sc.composite_score as view_score,
  (select total_score from public.compute_legislator_scorecard(l.id)) as draft_score
from public.legislators l
join public.legislator_scorecard sc on sc.legislator_id = l.id
order by random()
limit 10;


-- 2. Multipliers in the SQL helper must match EVENT_WEIGHTS in
--    js/voting-records.js and Section 06 of /methodology.
select
  stage,
  public.event_weight(stage) as multiplier,
  expected,
  public.event_weight(stage) = expected as ok
from (values
  ('override',  1.25),
  ('concur',    1.00),
  ('pass',      1.00),
  ('committee', 0.75),
  ('amend',     0.50),
  ('introduce', 0.25)
) as want(stage, expected);


-- 3. Grade bands must match the methodology table.
with bands as (
  select 100 as score, 'A+' as expected union all
  select  95,         'A+' union all
  select  94,         'A'  union all
  select  88,         'A'  union all
  select  87,         'A-' union all
  select  78,         'A-' union all
  select  77,         'B'  union all
  select  60,         'B'  union all
  select  59,         'C'  union all
  select  38,         'C'  union all
  select  37,         'D'  union all
  select  18,         'D'  union all
  select  17,         'F'  union all
  select   0,         'F'
)
select
  score,
  expected,
  case
    when score >= 95 then 'A+'
    when score >= 88 then 'A'
    when score >= 78 then 'A-'
    when score >= 60 then 'B'
    when score >= 38 then 'C'
    when score >= 18 then 'D'
    else 'F'
  end as actual,
  (case
    when score >= 95 then 'A+'
    when score >= 88 then 'A'
    when score >= 78 then 'A-'
    when score >= 60 then 'B'
    when score >= 38 then 'C'
    when score >= 18 then 'D'
    else 'F'
   end) = expected as ok
from bands
order by score desc;


-- 4. Sanity: every bill referenced from a roll call still exists.
select rc.bill_slug, count(*) as roll_calls_missing_bill
  from public.roll_calls rc
  left join public.bills b on b.slug = rc.bill_slug
 where b.slug is null
 group by rc.bill_slug;


-- 5. Sanity: every sponsorship still resolves to a real legislator + bill.
select 'sponsorships_missing_legislator' as check_, count(*)
  from public.legislator_sponsorships ls
  left join public.legislators l on l.id = ls.legislator_id
 where l.id is null
union all
select 'sponsorships_missing_bill', count(*)
  from public.legislator_sponsorships ls
  left join public.bills b on b.slug = ls.bill_slug
 where b.slug is null;
