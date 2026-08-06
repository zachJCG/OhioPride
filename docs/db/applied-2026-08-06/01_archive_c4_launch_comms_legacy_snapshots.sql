-- ALREADY APPLIED to the live Supabase project (dkdxefzhttkmjhdbkvqn) on 2026-08-06 via MCP.
-- Kept in the repo for history/parity. DO NOT re-apply.

create schema if not exists archive;
comment on schema archive is 'Cold storage for retired modules and pre-migration snapshots (2026-08-06 admin overhaul). Not exposed via the API; service_role/postgres only.';
revoke all on schema archive from public, anon, authenticated;

create table archive.c4_prospects_20260806 as select * from public.c4_prospects;
create table archive.c4_prospect_activities_20260806 as select * from public.c4_prospect_activities;
create table archive.sponsorship_tiers_c4_20260806 as select * from public.sponsorship_tiers where entity = 'c4';
create table archive.launch_signups_20260806 as select * from public.launch_signups;
create table archive.admin_emails_20260806 as select * from public.admin_emails;

alter table public.founding_members_recon_backup_20260612 set schema archive;
alter table public.donors_dedup_backup_20260701 set schema archive;
