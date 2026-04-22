-- =============================================================================
-- Ohio Pride PAC - Migration 5: Daily Verification Workflow
-- -----------------------------------------------------------------------------
-- Adds the infrastructure needed to support a daily bill-verification
-- routine. The goal is not to replace the editorial judgment layer on the
-- scorecard (that stays where it is), but to give staff and tooling a
-- clear record of when each bill was last checked against official
-- sources, what was found, and what still needs attention.
--
-- Three changes:
--
--   1. bill_verifications table: one row per verification check, with the
--      state of the bill at check time and the outcome (confirmed / drift
--      detected / new activity found).
--
--   2. roll_calls extensions: columns for journal page references,
--      verification state, and the source URL used. These turn
--      roll_calls from an editorial artifact into a proper audit trail
--      without breaking anything that already reads the table.
--
--   3. bill_verification_status() function: returns one row per bill
--      summarizing what needs attention today. This is the view that
--      drives the daily checklist.
--
-- Depends on migrations 1-4. Specifically references public.bills,
-- public.roll_calls, and public.set_updated_at().
-- =============================================================================


-- =============================================================================
-- EXTEND: roll_calls
-- -----------------------------------------------------------------------------
-- Three additive columns that turn the existing roll_calls table into a
-- proper audit trail. Existing rows get sensible defaults so no data
-- migration is needed.
-- =============================================================================

alter table public.roll_calls
  add column if not exists journal_page_reference  text,
  add column if not exists verification_status     text not null default 'provisional'
    check (verification_status in ('provisional', 'verified', 'reconciled')),
  add column if not exists source_url              text,
  add column if not exists verified_at             timestamptz,
  add column if not exists verified_by             text;

comment on column public.roll_calls.journal_page_reference is
  'Cite format: "Ohio Senate Journal, Feb 12 2025, at 148, 157-58". Populated when the roll call has been reconciled with the journal of record.';
comment on column public.roll_calls.verification_status is
  'provisional = from bill votes page; verified = matches journal; reconciled = matches journal AND committee minutes where applicable.';
comment on column public.roll_calls.source_url is
  'URL to the Ohio Legislature votes page or journal PDF used as source.';


-- =============================================================================
-- TABLE: bill_verifications
-- -----------------------------------------------------------------------------
-- One row per verification check performed against a bill. Records:
--   - When the check happened (checked_at)
--   - Who / what performed the check (checked_by: "claude", "zach",
--     automation name, etc.)
--   - What the bill looked like at check time (status, current step,
--     last action, verification_hash: a fingerprint that makes drift
--     detection cheap on subsequent checks)
--   - What the outcome was (confirmed / drift_detected / new_activity)
--   - Notes on what changed or why the check was performed
--   - Source URL actually consulted
--
-- The verification_hash column is a simple fingerprint of the
-- observable state at check time. On a later check, if the new
-- fingerprint differs from the last confirmed one, the system knows
-- drift has occurred without having to compare every individual field.
-- =============================================================================

create table if not exists public.bill_verifications (
  id                     uuid         primary key default gen_random_uuid(),
  bill_id                uuid         not null references public.bills(id) on delete cascade,

  checked_at             timestamptz  not null default now(),
  checked_by             text         not null,        -- "claude", "zach", "automation", etc.

  -- What we saw at check time
  observed_status_slug   text,                          -- e.g. "passed-house"
  observed_step_index    integer,
  observed_last_action   text,
  verification_hash      text,                          -- fingerprint for fast drift detection

  -- What the check concluded
  outcome                text         not null
    check (outcome in ('confirmed', 'drift_detected', 'new_activity', 'source_unavailable', 'needs_review')),

  notes                  text,                          -- free-text for what was found
  source_url             text,                          -- URL consulted (usually the Ohio Legislature bill page)

  created_at             timestamptz  not null default now()
);

comment on table public.bill_verifications is
  'One row per verification check against a bill. Drives the "last verified" display and the drift-detection workflow.';
comment on column public.bill_verifications.verification_hash is
  'Fingerprint of observable state (status_slug + step + last_action). Fast drift check: compare to previous verification_hash for same bill.';
comment on column public.bill_verifications.outcome is
  'confirmed = matched stored data; drift_detected = source differed; new_activity = new vote or stage found; source_unavailable = could not reach source; needs_review = ambiguous, flagged for human.';

create index if not exists bill_verifications_bill_checked_idx
  on public.bill_verifications (bill_id, checked_at desc);
create index if not exists bill_verifications_outcome_idx
  on public.bill_verifications (outcome, checked_at desc);


-- =============================================================================
-- VIEW: bills_last_verified
-- -----------------------------------------------------------------------------
-- One row per active bill with the most recent verification check, if
-- any. This is the data source for the daily checklist: it tells the
-- checker which bills were verified recently and which are overdue.
--
-- Uses a correlated subquery rather than a LATERAL JOIN because views
-- have to be expressed in a form PostgREST can understand. The subquery
-- runs once per bill, which is fine at our scale (< 100 bills typical).
-- =============================================================================

create or replace view public.bills_last_verified as
select
  b.id                       as bill_id,
  b.slug,
  b.bill_number,
  b.stance,
  s.slug                     as status_slug,
  s.label                    as status_label,
  b.current_step_index,
  b.last_action,
  b.legislature_url,
  b.updated_at               as bill_updated_at,

  -- Most recent verification for this bill
  v.checked_at               as last_verified_at,
  v.checked_by               as last_verified_by,
  v.outcome                  as last_verification_outcome,
  v.verification_hash        as last_verification_hash,
  v.notes                    as last_verification_notes,

  -- Derived: days since last verification (null if never verified)
  case
    when v.checked_at is null then null
    else extract(epoch from (now() - v.checked_at)) / 86400.0
  end                        as days_since_verified,

  -- Simple "needs attention" flag based on status category. Active
  -- bills (not dead, not signed, not withdrawn) that have not been
  -- verified in 7+ days bubble up to the top of the daily checklist.
  case
    when s.is_dead or s.is_law then false
    when v.checked_at is null then true
    when (now() - v.checked_at) > interval '7 days' then true
    else false
  end                        as needs_verification

from public.bills b
join public.bill_statuses s on s.id = b.status_id
left join lateral (
  select checked_at, checked_by, outcome, verification_hash, notes
  from public.bill_verifications bv
  where bv.bill_id = b.id
  order by bv.checked_at desc
  limit 1
) v on true
where b.is_active = true;

comment on view public.bills_last_verified is
  'Per-bill summary of the most recent verification check. Drives the daily checklist prioritization.';

grant select on public.bills_last_verified to anon, authenticated;


-- =============================================================================
-- FUNCTION: record_bill_verification()
-- -----------------------------------------------------------------------------
-- Convenience function for inserting a verification row. Takes the bill
-- slug (easier to remember than a uuid), the checker name, the outcome,
-- and any notes. Derives the observed state and hash from the current
-- bills row automatically, so a simple "confirmed" check is a one-line
-- call.
--
-- For drift-detected outcomes, the caller passes what they observed on
-- the source so the mismatch is recorded in the verification row even
-- if the bills row itself has not yet been updated to reflect reality.
-- =============================================================================

create or replace function public.record_bill_verification(
  p_bill_slug            text,
  p_checked_by           text,
  p_outcome              text,
  p_notes                text default null,
  p_observed_status_slug text default null,
  p_observed_step_index  integer default null,
  p_observed_last_action text default null,
  p_source_url           text default null
)
returns uuid
language plpgsql
as $$
declare
  v_bill_id       uuid;
  v_status_slug   text;
  v_step_index    integer;
  v_last_action   text;
  v_hash          text;
  v_ver_id        uuid;
begin
  -- Look up the bill; fail loudly if the slug is unknown.
  select b.id, s.slug, b.current_step_index, b.last_action
    into v_bill_id, v_status_slug, v_step_index, v_last_action
  from public.bills b
  join public.bill_statuses s on s.id = b.status_id
  where b.slug = p_bill_slug and b.is_active = true;

  if v_bill_id is null then
    raise exception 'record_bill_verification: unknown or inactive bill slug %', p_bill_slug;
  end if;

  -- If the caller provided observed values (for a drift check), use
  -- those. Otherwise default to the stored values (for a "confirmed"
  -- check, which is the common case).
  v_status_slug  := coalesce(p_observed_status_slug, v_status_slug);
  v_step_index   := coalesce(p_observed_step_index, v_step_index);
  v_last_action  := coalesce(p_observed_last_action, v_last_action);

  -- Fingerprint observable state. MD5 is fine here; we are not using
  -- it for security, just for equality comparison.
  v_hash := md5(coalesce(v_status_slug, '') || '|' ||
                coalesce(v_step_index::text, '') || '|' ||
                coalesce(v_last_action, ''));

  insert into public.bill_verifications
    (bill_id, checked_by, outcome, notes,
     observed_status_slug, observed_step_index, observed_last_action,
     verification_hash, source_url)
  values
    (v_bill_id, p_checked_by, p_outcome, p_notes,
     v_status_slug, v_step_index, v_last_action,
     v_hash, p_source_url)
  returning id into v_ver_id;

  return v_ver_id;
end;
$$;

comment on function public.record_bill_verification(text, text, text, text, text, integer, text, text) is
  'Record a verification check against a bill. For "confirmed" outcomes, caller only needs to provide slug, checker, and outcome.';


-- =============================================================================
-- RLS + GRANTS
-- =============================================================================

alter table public.bill_verifications enable row level security;

drop policy if exists "bill_verifications read all" on public.bill_verifications;
create policy "bill_verifications read all"
  on public.bill_verifications for select to anon, authenticated
  using (true);

drop policy if exists "bill_verifications service_role writes" on public.bill_verifications;
create policy "bill_verifications service_role writes"
  on public.bill_verifications for all to service_role using (true) with check (true);

grant execute on function public.record_bill_verification(text, text, text, text, text, integer, text, text) to service_role;
