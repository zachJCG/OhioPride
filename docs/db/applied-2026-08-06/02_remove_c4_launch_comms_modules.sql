-- ALREADY APPLIED to the live Supabase project (dkdxefzhttkmjhdbkvqn) on 2026-08-06 via MCP.
-- Kept in the repo for history/parity. DO NOT re-apply.

drop view if exists public.c4_pipeline;
drop view if exists public.c4_pipeline_by_stage;

drop view if exists public.fundraising_dashboard;
create view public.fundraising_dashboard with (security_invoker = true) as
select
  (( select coalesce(sum(fm.amount_cents), 0)::bigint from public.founding_members fm)
   + (select coalesce(sum(d.amount_cents), 0)::bigint from public.donors d where d.source is distinct from 'founding_member')) as secured_pac_cents,
  (select count(*) from public.founding_members) as founding_members_count,
  1969 as founding_members_target,
  (select count(*) from public.donors d where d.source is distinct from 'founding_member') as other_pac_donors_count,
  (select count(*) from public.pac_prospects p where p.status = 'active' and p.stage not in ('secured','declined','lapsed')) as pac_pipeline_count,
  (select coalesce(sum(p.committed_amount_cents), 0)::bigint from public.pac_prospects p where p.status = 'active') as pac_committed_cents,
  (select coalesce(sum(p.capacity_estimate_cents), 0)::numeric from public.pac_prospects p where p.status = 'active') as pac_capacity_cents,
  0::bigint  as c4_pipeline_count,
  0::bigint  as c4_committed_cents,
  0::numeric as c4_capacity_cents;
grant select on public.fundraising_dashboard to authenticated;
revoke select on public.fundraising_dashboard from anon;

drop function if exists public.c4_prospect_set_stage;
drop table if exists public.c4_prospect_activities;
drop table if exists public.c4_prospects;
drop function if exists public.c4_touch_last_contacted;

delete from public.sponsorship_tiers where entity = 'c4';

truncate table public.launch_signups;
revoke all on public.launch_signups from anon;

delete from public.role_permissions where module in ('c4_prospects','launch','news');
