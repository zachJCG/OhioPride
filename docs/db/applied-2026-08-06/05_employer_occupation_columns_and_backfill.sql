-- ALREADY APPLIED to the live Supabase project (dkdxefzhttkmjhdbkvqn) on 2026-08-06 via MCP.
-- Kept in the repo for history/parity. DO NOT re-apply.

alter table public.founding_members add column if not exists employer text;
alter table public.founding_members add column if not exists occupation text;
alter table public.contacts add column if not exists employer text;
alter table public.contacts add column if not exists occupation text;
-- Plus backfills executed live: compliance ledger -> donors.employer (unambiguous name matches only),
-- donors -> founding_members, donors -> contacts (latest gift wins), network organization/title -> contacts.
