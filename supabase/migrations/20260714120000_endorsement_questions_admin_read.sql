-- Endorsement questions: let admins read the full catalog, including inactive
-- rows. The public policy ("anyone can read active questions") only exposes
-- active rows. The admin endorsements console labels each `responses` jsonb key
-- by joining against endorsement_questions, and a key can point at a question
-- that was later retired (active = false). Without this policy those retired
-- keys would render with no label on historical submissions.
--
-- Read-only, admin-scoped, additive. Does not touch the applied
-- refine_endorsement_paths_judicial_v2 migration or any question data.

drop policy if exists "admin can read all questions" on public.endorsement_questions;

create policy "admin can read all questions"
  on public.endorsement_questions
  for select
  to authenticated
  using (public.is_admin());
