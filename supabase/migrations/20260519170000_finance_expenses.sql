-- =====================================================================
-- 20260519170000_finance_expenses.sql
--
-- Low-key QuickBooks: the expense side of /admin/finance/budget.
--
-- WHY:
--   Revenue is already in the DB (public.founding_members, fed by the
--   hourly ActBlue sync). There was no place to log money going OUT —
--   vendor fees, table space at a Pride festival, printing, etc. This
--   adds a single, fast expense ledger that the budget page reads
--   alongside donor revenue to show a running net position.
--
-- DESIGN:
--   - One flat table. No GL accounts, no double-entry. Treasurer adds a
--     row in seconds (vendor + amount + date), everything else optional.
--   - amount_cents (integer) to stay consistent with founding_members.
--   - created_by is stamped from the JWT email by a BEFORE INSERT
--     trigger so the client never has to send it and can't spoof it.
--   - RLS mirrors public.volunteers: admin-only read/write via
--     public.is_admin(); service_role bypasses for any future function.
--
-- NEW SURFACES:
--   - public.expenses
--   - role_permissions: 'finance' module (read/write) for super_admin,
--     treasurer; read for board_member.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. Expense ledger
-- ---------------------------------------------------------------------
create table if not exists public.expenses (
  id             uuid primary key default gen_random_uuid(),

  incurred_on    date        not null default current_date,
  vendor         text        not null,
  description    text,
  category       text        not null default 'General',
  amount_cents   integer     not null check (amount_cents >= 0),

  payment_method text,
  reference      text,
  notes          text,

  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint expenses_vendor_not_blank check (length(btrim(vendor)) > 0)
);

comment on table public.expenses is
  'Flat expense ledger for /admin/finance/budget. Revenue side comes from public.founding_members; this is the money-out side. Admin-only via is_admin().';
comment on column public.expenses.amount_cents is
  'Expense amount in cents (>= 0), matching founding_members.amount_cents.';
comment on column public.expenses.category is
  'Free-text bucket (Vendor/Booth, Printing, Travel, Software, ...). Not an enum on purpose — added on the fly.';
comment on column public.expenses.reference is
  'External receipt / order number, e.g. an Akron Pride Festival order #.';
comment on column public.expenses.created_by is
  'Stamped from the JWT email by trg_expenses_stamp_creator. Do not trust a client-supplied value.';

create index if not exists expenses_incurred_on_idx on public.expenses (incurred_on desc);
create index if not exists expenses_category_idx    on public.expenses (category);

-- ---------------------------------------------------------------------
-- 2. Triggers
-- ---------------------------------------------------------------------
drop trigger if exists set_expenses_updated_at on public.expenses;
create trigger set_expenses_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

-- Stamp created_by from the caller's JWT email; ignore anything the
-- client tries to send for that column.
create or replace function public.stamp_expense_creator()
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

drop trigger if exists trg_expenses_stamp_creator on public.expenses;
create trigger trg_expenses_stamp_creator
  before insert on public.expenses
  for each row execute function public.stamp_expense_creator();

-- ---------------------------------------------------------------------
-- 3. RLS  (mirrors public.volunteers: admin-only read/write)
-- ---------------------------------------------------------------------
alter table public.expenses enable row level security;

drop policy if exists "admin can read expenses"   on public.expenses;
drop policy if exists "admin can write expenses"   on public.expenses;
drop policy if exists "expenses service_role all"  on public.expenses;

create policy "admin can read expenses"
  on public.expenses
  for select
  to authenticated
  using (public.is_admin());

create policy "admin can write expenses"
  on public.expenses
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "expenses service_role all"
  on public.expenses
  for all
  to service_role
  using (true)
  with check (true);

grant select, insert, update, delete on public.expenses to authenticated;

-- ---------------------------------------------------------------------
-- 4. Permissions catalog: a 'finance' module for the budget page
-- ---------------------------------------------------------------------
-- super_admin already short-circuits every module in has_permission(),
-- but we add explicit rows so the catalog stays complete and the
-- client-side nav filter (admin-shell.js can()) is consistent.
insert into public.role_permissions (role_slug, module, action) values
  ('super_admin','finance','read'),
  ('super_admin','finance','write'),
  ('super_admin','finance','admin'),
  ('treasurer','finance','read'),
  ('treasurer','finance','write'),
  ('board_member','finance','read')
on conflict do nothing;
