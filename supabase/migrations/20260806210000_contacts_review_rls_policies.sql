-- Close three RLS gaps the streamlined Contacts module runs into
-- (all flagged by the Supabase advisors as rls_enabled_no_policy or missing
-- command coverage). Pattern matches the neighboring policies: is_admin()
-- for admin console access, service_role already bypasses RLS.
--
-- 1. donors had select/update policies but no insert, so the person page's
--    "Add gift/check" action could never write.
-- 2. email_bounce_review had RLS on with no policies, so the review queue's
--    bounce context read as empty for every admin.
-- 3. signup_sheet_scans likewise (scan metadata backs the OCR review flow).

create policy "admin can insert donors"
  on public.donors for insert
  to authenticated
  with check (public.is_admin());

create policy "admin can read bounce review"
  on public.email_bounce_review for select
  to authenticated
  using (public.is_admin());

create policy "admin can update bounce review"
  on public.email_bounce_review for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admin can read signup sheet scans"
  on public.signup_sheet_scans for select
  to authenticated
  using (public.is_admin());
