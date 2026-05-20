-- =============================================================================
-- 20260520120000_bills_admin_alignment.sql
-- Reconciles /admin/bills with /admin/legislators, /scorecard, and /issues.
--
-- The live public.bills schema already has the columns /admin/bills writes
-- to (bill_number, chamber_of_origin, general_assembly, category,
-- introduced_on, last_action_on, is_featured, what_it_does, impact,
-- equality_impact_note, legal_risks, official_bill_url, bill_text_pdf_url,
-- enacted_text_url). The additive column DDL and legacy backfills from the
-- earlier bundle draft were aimed at a variant that still used label/chamber/
-- categories — those columns don't exist on this database, so we keep only
-- the bits that actually apply.
--
-- Idempotent. Safe to re-apply.
-- =============================================================================

-- Indexes for the admin grid sorts.
create index if not exists bills_bill_number_idx     on public.bills (bill_number);
create index if not exists bills_status_idx          on public.bills (status);
create index if not exists bills_introduced_on_idx   on public.bills (introduced_on);
create index if not exists bills_last_action_on_idx  on public.bills (last_action_on);

-- Reaffirm INSERT/UPDATE/DELETE grants for the admin client.
-- RLS bills:write policy was added in 20260520020000_scorecard_publishing.sql.
grant insert, update, delete on public.bills to authenticated;

-- Helper: deterministic slug suggestion when the intern creates a bill.
create or replace function public.suggest_bill_slug(p_bill_number text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(coalesce(p_bill_number, ''), '\s+', '', 'g'));
$$;

grant execute on function public.suggest_bill_slug(text) to anon, authenticated;
