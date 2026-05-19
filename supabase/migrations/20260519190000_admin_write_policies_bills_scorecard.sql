-- =============================================================================
-- 20260519020000_admin_write_policies_bills_scorecard.sql
-- -----------------------------------------------------------------------------
-- Lets signed-in admins with the right permission edit bills / legislators /
-- sponsorships / pipeline / roll_calls / vote_exceptions directly from the
-- /admin browser session, instead of going through a service-role Netlify
-- function. Anon read policies and service_role full access are unchanged.
--
-- The policies key off public.has_permission(module, action) from
-- 20260510010000_admin_roles_and_permissions.sql. A user with
--   ('bills','write')      or ('bills','admin')        manages the bill catalog.
--   ('legislators','write') or ('legislators','admin') manages the scorecard.
-- super_admin already has every (module, action) pair, so directors can do
-- both without extra setup.
--
-- Idempotent: drops then recreates each policy.
-- =============================================================================

-- ---- bills ------------------------------------------------------------------
drop policy if exists "bills admin write"          on public.bills;
drop policy if exists "bills admin update"         on public.bills;
drop policy if exists "bills admin delete"         on public.bills;

create policy "bills admin write"
  on public.bills
  for insert
  to authenticated
  with check (
    public.has_permission('bills', 'write') or public.has_permission('bills', 'admin')
  );

create policy "bills admin update"
  on public.bills
  for update
  to authenticated
  using (
    public.has_permission('bills', 'write') or public.has_permission('bills', 'admin')
  )
  with check (
    public.has_permission('bills', 'write') or public.has_permission('bills', 'admin')
  );

create policy "bills admin delete"
  on public.bills
  for delete
  to authenticated
  using (
    public.has_permission('bills', 'admin')
  );

-- ---- bill_pipeline_steps ----------------------------------------------------
drop policy if exists "bill_pipeline admin write"  on public.bill_pipeline_steps;
drop policy if exists "bill_pipeline admin update" on public.bill_pipeline_steps;
drop policy if exists "bill_pipeline admin delete" on public.bill_pipeline_steps;

create policy "bill_pipeline admin write"
  on public.bill_pipeline_steps
  for insert
  to authenticated
  with check (
    public.has_permission('bills', 'write') or public.has_permission('bills', 'admin')
  );

create policy "bill_pipeline admin update"
  on public.bill_pipeline_steps
  for update
  to authenticated
  using (
    public.has_permission('bills', 'write') or public.has_permission('bills', 'admin')
  )
  with check (
    public.has_permission('bills', 'write') or public.has_permission('bills', 'admin')
  );

create policy "bill_pipeline admin delete"
  on public.bill_pipeline_steps
  for delete
  to authenticated
  using (
    public.has_permission('bills', 'write') or public.has_permission('bills', 'admin')
  );

-- ---- legislators ------------------------------------------------------------
drop policy if exists "legislators admin write"    on public.legislators;
drop policy if exists "legislators admin update"   on public.legislators;
drop policy if exists "legislators admin delete"   on public.legislators;

create policy "legislators admin write"
  on public.legislators
  for insert
  to authenticated
  with check (
    public.has_permission('legislators', 'write') or public.has_permission('legislators', 'admin')
  );

create policy "legislators admin update"
  on public.legislators
  for update
  to authenticated
  using (
    public.has_permission('legislators', 'write') or public.has_permission('legislators', 'admin')
  )
  with check (
    public.has_permission('legislators', 'write') or public.has_permission('legislators', 'admin')
  );

create policy "legislators admin delete"
  on public.legislators
  for delete
  to authenticated
  using (
    public.has_permission('legislators', 'admin')
  );

-- ---- legislator_sponsorships ------------------------------------------------
drop policy if exists "legislator_sponsorships admin write"  on public.legislator_sponsorships;
drop policy if exists "legislator_sponsorships admin update" on public.legislator_sponsorships;
drop policy if exists "legislator_sponsorships admin delete" on public.legislator_sponsorships;

create policy "legislator_sponsorships admin write"
  on public.legislator_sponsorships
  for insert
  to authenticated
  with check (
    public.has_permission('legislators', 'write') or public.has_permission('legislators', 'admin')
  );

create policy "legislator_sponsorships admin update"
  on public.legislator_sponsorships
  for update
  to authenticated
  using (
    public.has_permission('legislators', 'write') or public.has_permission('legislators', 'admin')
  )
  with check (
    public.has_permission('legislators', 'write') or public.has_permission('legislators', 'admin')
  );

create policy "legislator_sponsorships admin delete"
  on public.legislator_sponsorships
  for delete
  to authenticated
  using (
    public.has_permission('legislators', 'write') or public.has_permission('legislators', 'admin')
  );

-- ---- roll_calls -------------------------------------------------------------
drop policy if exists "roll_calls admin write"  on public.roll_calls;
drop policy if exists "roll_calls admin update" on public.roll_calls;
drop policy if exists "roll_calls admin delete" on public.roll_calls;

create policy "roll_calls admin write"
  on public.roll_calls
  for insert
  to authenticated
  with check (
    public.has_permission('legislators', 'write') or public.has_permission('legislators', 'admin')
  );

create policy "roll_calls admin update"
  on public.roll_calls
  for update
  to authenticated
  using (
    public.has_permission('legislators', 'write') or public.has_permission('legislators', 'admin')
  )
  with check (
    public.has_permission('legislators', 'write') or public.has_permission('legislators', 'admin')
  );

create policy "roll_calls admin delete"
  on public.roll_calls
  for delete
  to authenticated
  using (
    public.has_permission('legislators', 'admin')
  );

-- ---- legislator_vote_exceptions --------------------------------------------
drop policy if exists "legislator_vote_exceptions admin write"  on public.legislator_vote_exceptions;
drop policy if exists "legislator_vote_exceptions admin update" on public.legislator_vote_exceptions;
drop policy if exists "legislator_vote_exceptions admin delete" on public.legislator_vote_exceptions;

create policy "legislator_vote_exceptions admin write"
  on public.legislator_vote_exceptions
  for insert
  to authenticated
  with check (
    public.has_permission('legislators', 'write') or public.has_permission('legislators', 'admin')
  );

create policy "legislator_vote_exceptions admin update"
  on public.legislator_vote_exceptions
  for update
  to authenticated
  using (
    public.has_permission('legislators', 'write') or public.has_permission('legislators', 'admin')
  )
  with check (
    public.has_permission('legislators', 'write') or public.has_permission('legislators', 'admin')
  );

create policy "legislator_vote_exceptions admin delete"
  on public.legislator_vote_exceptions
  for delete
  to authenticated
  using (
    public.has_permission('legislators', 'admin')
  );
