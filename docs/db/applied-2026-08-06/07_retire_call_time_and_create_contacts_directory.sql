-- ALREADY APPLIED to the live Supabase project (dkdxefzhttkmjhdbkvqn) on 2026-08-06 via MCP.
-- Kept in the repo for history/parity. DO NOT re-apply.

create table if not exists archive.call_dispositions_20260806 as select * from public.call_dispositions;
drop view if exists public.call_time_queue;
drop function if exists public.log_call_activity;
drop function if exists public.snooze_prospect;
drop table if exists public.call_dispositions;

-- One streamlined contacts + donor directory (see live definition: public.contacts_directory).
-- security_invoker view over contacts + donors rollup + founding/volunteer/network/newsletter flags.
