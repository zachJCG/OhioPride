-- =====================================================================
-- 20260612000000_compliance_ledgers.sql
--
-- The data-entry side of the Compliance module (/admin/compliance).
--
-- WHY:
--   The compliance pages (Contribution / Expense / Loan) could only
--   *export* an Ohio SOS CFOFS upload file from a spreadsheet the
--   treasurer maintained offline. There was nowhere to enter, store, or
--   edit the underlying transactions inside the admin. These three flat
--   ledgers back the in-admin forms, and the same CFOFS exporter
--   (admin/compliance/cfofs-browser.js) runs over them to produce the
--   Schedule 31-A / 31-B / 31-N(C) upload files.
--
-- DESIGN:
--   - One flat table per CFOFS schedule. Columns track the official
--     CFOFS template fields one-for-one so export is a straight mapping.
--   - Money is integer cents, matching public.expenses / founding_members.
--   - created_by is stamped from the JWT email by a BEFORE INSERT trigger
--     so the client can't spoof it.
--   - RLS mirrors public.expenses: admin read via is_admin(); write
--     gated on has_permission('finance','write'); service_role bypasses.
--   - No new permission module — the compliance nav already keys off the
--     existing 'finance' module (read).
--
-- NEW SURFACES:
--   - public.compliance_contributions   (Schedule 31-A)
--   - public.compliance_expenditures    (Schedule 31-B)
--   - public.compliance_loans           (Schedule 31-N debt / 31-C loan)
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 0. Shared creator-stamp trigger function
-- ---------------------------------------------------------------------
create or replace function public.stamp_compliance_creator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_by := nullif(coalesce(auth.jwt() ->> 'email', ''), '');
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. Contributions — Schedule 31-A
-- ---------------------------------------------------------------------
create table if not exists public.compliance_contributions (
  id                          uuid primary key default gen_random_uuid(),

  first_name                  text,
  middle_name                 text,
  last_name                   text,
  suffix                      text,
  non_individual              text,                 -- org name (XOR with person name)
  pac_reg_number              text,

  address                     text,
  city                        text,
  state                       text default 'OH',
  zip                         text,
  employer                    text,                 -- employer / occupation / labor org

  form_of_contribution        text,                 -- SOS code or label; blank => export default
  contribution_date           date,
  amount_cents                integer not null default 0 check (amount_cents >= 0),

  other_income_type           text,
  event_date                  date,
  inkind_description          text,
  received_at_event           boolean not null default false,
  name_of_creditor            text,
  amount_debt_remaining_cents integer check (amount_debt_remaining_cents >= 0),

  created_by                  text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

comment on table public.compliance_contributions is
  'CFOFS Schedule 31-A contributions. Data-entry side of /admin/compliance/contribution; cfofs-browser.js exports the SOS upload CSV from these rows. Admin read via is_admin(); write via finance:write.';

create index if not exists compliance_contributions_date_idx
  on public.compliance_contributions (contribution_date desc);

-- ---------------------------------------------------------------------
-- 2. Expenditures — Schedule 31-B
-- ---------------------------------------------------------------------
create table if not exists public.compliance_expenditures (
  id                  uuid primary key default gen_random_uuid(),

  first_name          text,
  middle_name         text,
  last_name           text,
  suffix              text,
  non_individual      text,

  address             text,
  city                text,
  state               text default 'OH',
  zip                 text,

  expenditure_date    date,
  amount_cents        integer not null default 0 check (amount_cents >= 0),
  purpose             text,
  event_date          date,
  candidate_or_issue  text,                          -- Form 31U only
  support_oppose      text,                          -- '1' support / '2' oppose
  office              text,                          -- Form 31U only
  party_fund          text,                          -- Form 31M only

  created_by          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.compliance_expenditures is
  'CFOFS Schedule 31-B expenditures. Data-entry side of /admin/compliance/expense.';

create index if not exists compliance_expenditures_date_idx
  on public.compliance_expenditures (expenditure_date desc);

-- ---------------------------------------------------------------------
-- 3. Loans & debts — Schedule 31-N (debt) / 31-C (loan)
-- ---------------------------------------------------------------------
create table if not exists public.compliance_loans (
  id                       uuid primary key default gen_random_uuid(),

  first_name               text,
  middle_name              text,
  last_name                text,
  suffix                   text,
  non_individual           text,
  pac_reg_number           text,

  address                  text,
  city                     text,
  state                    text default 'OH',
  zip                      text,
  employer                 text,

  date_incurred            date,
  prior_amount_cents       integer check (prior_amount_cents >= 0),
  outstanding_balance_cents integer check (outstanding_balance_cents >= 0),
  purpose                  text,
  forgiven                 boolean not null default false,
  amount_incurred_cents    integer check (amount_incurred_cents >= 0),
  payment_date             date,
  payment_amount_cents     integer check (payment_amount_cents >= 0),
  schedule_code            text not null default '31N'
                             check (schedule_code in ('31N','31C')),

  created_by               text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on table public.compliance_loans is
  'CFOFS Schedule 31-N (debt) / 31-C (loan) rows. Data-entry side of /admin/compliance/loan. schedule_code picks the schedule per row.';

create index if not exists compliance_loans_date_idx
  on public.compliance_loans (date_incurred desc);

-- ---------------------------------------------------------------------
-- 4. Triggers (updated_at + created_by stamp) for all three
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'compliance_contributions','compliance_expenditures','compliance_loans'
  ] loop
    execute format('drop trigger if exists set_%1$s_updated_at on public.%1$s', t);
    execute format(
      'create trigger set_%1$s_updated_at before update on public.%1$s '
      'for each row execute function public.set_updated_at()', t);

    execute format('drop trigger if exists trg_%1$s_stamp_creator on public.%1$s', t);
    execute format(
      'create trigger trg_%1$s_stamp_creator before insert on public.%1$s '
      'for each row execute function public.stamp_compliance_creator()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5. RLS  (mirrors public.expenses)
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'compliance_contributions','compliance_expenditures','compliance_loans'
  ] loop
    execute format('alter table public.%1$s enable row level security', t);

    execute format('drop policy if exists "admin can read %1$s"  on public.%1$s', t);
    execute format('drop policy if exists "finance can write %1$s" on public.%1$s', t);
    execute format('drop policy if exists "%1$s service_role all" on public.%1$s', t);

    execute format(
      'create policy "admin can read %1$s" on public.%1$s '
      'for select to authenticated using (public.is_admin())', t);

    execute format(
      'create policy "finance can write %1$s" on public.%1$s '
      'for all to authenticated '
      'using (public.has_permission(''finance'',''write'')) '
      'with check (public.has_permission(''finance'',''write''))', t);

    execute format(
      'create policy "%1$s service_role all" on public.%1$s '
      'for all to service_role using (true) with check (true)', t);

    execute format(
      'grant select, insert, update, delete on public.%1$s to authenticated', t);
  end loop;
end $$;
