-- =============================================================================
-- verify-after-reset.sql
-- -----------------------------------------------------------------------------
-- Smoke test that runs after 20260527000000_scorecard_clean_reset.sql.
-- Each query should return either no rows (clean state) or known-good counts.
-- =============================================================================

-- 1. Roster shape: 99 + 33 = 132 active legislators, no duplicates.
select chamber, count(*) as members
  from public.legislators
 where is_active
 group by chamber
 order by chamber;

select chamber, district, count(*) as rows
  from public.legislators
 where is_active
 group by chamber, district
having count(*) > 1;

-- 2. Evidence counts match the live scorecard.
select 'roll_calls'                 as table_name, count(*) from public.roll_calls
union all
select 'legislator_vote_exceptions' as table_name, count(*) from public.legislator_vote_exceptions
union all
select 'legislator_sponsorships'    as table_name, count(*) from public.legislator_sponsorships
union all
select 'score_snapshots (current)'  as table_name, count(*) from public.score_snapshots where is_current
order by table_name;

-- 3. Referential integrity: every roll_call / sponsorship points at a real bill.
select rc.bill_slug, rc.roll_call_slug
  from public.roll_calls rc
  left join public.bills b on b.slug = rc.bill_slug
 where b.slug is null;

select ls.bill_slug, ls.legislator_id
  from public.legislator_sponsorships ls
  left join public.bills b on b.slug = ls.bill_slug
 where b.slug is null;

-- 4. Every active legislator has exactly one current snapshot.
select l.id, l.full_name, count(s.*) as snapshots
  from public.legislators l
  left join public.score_snapshots s
    on s.legislator_id = l.id and s.is_current
 where l.is_active
 group by l.id, l.full_name
having count(s.*) <> 1;

-- 5. Grade distribution.
select grade, count(*) as members
  from public.legislator_scorecard
 group by grade
 order by case grade
            when 'A+' then 1 when 'A' then 2 when 'A-' then 3
            when 'B'  then 4 when 'C' then 5 when 'D' then 6
            else 7
          end;

-- 6. Top 5 champions and bottom 5 hostiles — eyeball check.
select chamber, district, party, full_name, composite_score, grade
  from public.legislator_scorecard
 order by composite_score desc, full_name
 limit 5;

select chamber, district, party, full_name, composite_score, grade
  from public.legislator_scorecard
 order by composite_score asc, full_name
 limit 5;

-- 7. Bills with no roll_calls and no sponsorships — tracked-but-unscored.
select b.slug, b.label, b.stance
  from public.bills b
  left join public.roll_calls rc on rc.bill_slug = b.slug
  left join public.legislator_sponsorships ls on ls.bill_slug = b.slug
 where b.is_active and rc.id is null and ls.legislator_id is null
 order by b.display_order, b.slug;
