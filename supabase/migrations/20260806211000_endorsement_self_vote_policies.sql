-- Let every board member vote on endorsements from their own account.
--
-- The 2026-08-06 endorsement_reviews policies gated insert/update on
-- has_permission('endorsements','write'), but the board_member role only
-- carries endorsements:read, so most of the board could not cast a vote.
-- Voting is self-scoped by design: any endorsements reader may insert or
-- update the review row whose reviewer_email is their own JWT email, and
-- may append their own activity entries. Write-permission holders keep the
-- ability to manage all rows; delete stays write-only.

drop policy if exists er_insert on public.endorsement_reviews;
create policy er_insert
  on public.endorsement_reviews for insert
  to authenticated
  with check (
    public.has_permission('endorsements', 'write')
    or (
      public.has_permission('endorsements', 'read')
      and reviewer_email = (auth.jwt() ->> 'email')::citext
    )
  );

drop policy if exists er_update on public.endorsement_reviews;
create policy er_update
  on public.endorsement_reviews for update
  to authenticated
  using (
    public.has_permission('endorsements', 'write')
    or (
      public.has_permission('endorsements', 'read')
      and reviewer_email = (auth.jwt() ->> 'email')::citext
    )
  )
  with check (
    public.has_permission('endorsements', 'write')
    or (
      public.has_permission('endorsements', 'read')
      and reviewer_email = (auth.jwt() ->> 'email')::citext
    )
  );

drop policy if exists eact_insert on public.endorsement_activity;
create policy eact_insert
  on public.endorsement_activity for insert
  to authenticated
  with check (
    public.has_permission('endorsements', 'write')
    or (
      public.has_permission('endorsements', 'read')
      and actor_email = (auth.jwt() ->> 'email')
    )
  );
