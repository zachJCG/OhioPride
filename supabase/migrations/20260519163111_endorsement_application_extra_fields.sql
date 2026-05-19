-- =====================================================================
-- Ohio Pride PAC: Endorsement application form fields update
--
-- Adds columns introduced by the screening-form refresh:
--   - First / middle / last name captured as separate fields. The
--     concatenated value continues to live in candidate_name so existing
--     reads (incl. the public_endorsements view) keep working.
--   - is_special_election: true when the candidate selected
--     "Special Election" instead of a calendar year.
--   - q5_not_applicable: true when the candidate's office does not vote
--     on legislation (Q5 is irrelevant). When set, q5_vote_against_rollbacks
--     is left NULL.
--
-- Idempotent: safe to re-run.
--
-- Re-stamped from 20260508000000 to 20260519163111: the original was
-- backdated behind already-applied migrations, so version-ordering
-- runners permanently skipped it and the live DB never gained these
-- columns. That made every browser endorsement submission fail (the
-- form inserts these fields as the anon role).
-- =====================================================================

alter table public.endorsement_applications
  add column if not exists first_name           text,
  add column if not exists middle_name          text,
  add column if not exists last_name            text,
  add column if not exists is_special_election  boolean not null default false,
  add column if not exists q5_not_applicable    boolean not null default false;
