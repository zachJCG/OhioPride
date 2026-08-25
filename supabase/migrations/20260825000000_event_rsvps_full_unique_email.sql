-- =============================================================================
-- event_rsvps: make the (event_id, email) unique index a full index
-- -----------------------------------------------------------------------------
-- form-submit records RSVPs with an upsert on (event_id, email). Postgres can
-- only infer a partial unique index for ON CONFLICT when the conflict clause
-- repeats the index's WHERE predicate, and supabase-js cannot send one — so
-- every RSVP that carried an email failed with 42P10 ("no unique or exclusion
-- constraint matching the ON CONFLICT specification") and was never written.
-- The submission still landed in form_submissions, which is why the loss was
-- invisible until the endpoint started reporting rsvp: false.
--
-- A full unique index keeps the same behavior for the rows the partial one
-- covered, and NULL emails remain distinct under it, so the no-email insert
-- path is unaffected.
-- =============================================================================

drop index if exists public.uq_event_rsvps_event_email;

create unique index uq_event_rsvps_event_email
  on public.event_rsvps (event_id, email);
