-- =============================================================================
-- Endorsements: process cleanup (2026-08-08)
-- -----------------------------------------------------------------------------
-- Five changes, all driven by the endorsement refresh that removed the
-- candidate interview from the process and moved /endorsements onto the App
-- Router:
--
--   1. Close the anon read on endorsement_applications. The anon key ships in
--      the browser, and the table policy let anyone SELECT * on any endorsed
--      row: campaign email and phone, the typed signature, the conflicts
--      disclosure, internal reviewer notes, and who decided. It also ignored
--      is_published, so an endorsement held back for an announcement was
--      readable the moment its status flipped. The public page reads the
--      public_endorsements view instead, which is owner-privileged and so
--      keeps working with no anon policy on the base table.
--
--   2. Give the endorsement date its own column. public_endorsements.endorsed_at
--      was really updated_at, so fixing a typo in a bio silently moved the
--      published endorsement date. endorsed_at is now stamped once, when the
--      status becomes 'endorsed', and cleared if the row leaves that status.
--
--   3. Retire the interview. Ohio Pride does not interview candidates: the
--      Screening Committee reads the application against the public record and
--      the Board votes. endorsement_path_meta.interview_note becomes
--      process_note and carries the real sequence; the judicial intro loses its
--      interview sentence.
--
--   4. Backfill endorsement_path on the applications that predate the
--      path-aware form. Without it the admin packet cannot tell which
--      questionnaire a candidate answered.
--
--   5. Drop two columns nothing writes: submission_ip (impossible to populate
--      from a browser-side insert, zero rows) and generated_pdf_path (packets
--      are rendered on demand by /api/endorsement-pdf, zero rows).
--
-- Deliberately NOT dropped: the legacy q1..q10 answer columns. Their mirror in
-- responses is lossy (values only, no q*_explanation text) and the original
-- prompts are no longer recoverable, so dropping them would degrade the
-- deliberation record for ten real applications. Both readers (the admin
-- candidate page and the PDF packet) keep their fallback.
-- =============================================================================

-- ── 1. Anon no longer reads the applications table ──────────────────────────
drop policy if exists "anon can read endorsed candidates" on public.endorsement_applications;
revoke select on public.endorsement_applications from anon;

comment on table public.endorsement_applications is
  'Candidate endorsement applications. Anon may INSERT (a submission) but never '
  'SELECT: the public surface is the public_endorsements view, which exposes '
  'only the published columns of published endorsements.';

-- ── 2. endorsed_at is a real column, stamped on the decision ────────────────
alter table public.endorsement_applications
  add column if not exists endorsed_at timestamptz;

comment on column public.endorsement_applications.endorsed_at is
  'When the Board endorsed this candidate. Stamped once by the status trigger '
  'and cleared if the row leaves endorsed. This is the date the public page '
  'shows -- do not reuse updated_at for it.';

update public.endorsement_applications
   set endorsed_at = coalesce(reviewed_at, updated_at)
 where status = 'endorsed'
   and endorsed_at is null;

create or replace function public.endorsement_stamp_endorsed_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'endorsed' and old.status is distinct from 'endorsed' then
    new.endorsed_at := coalesce(new.endorsed_at, new.reviewed_at, now());
  elsif new.status is distinct from 'endorsed' then
    -- Leaving the endorsed state retires the date, so a later re-endorsement
    -- stamps fresh rather than publishing the old one.
    new.endorsed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_endorsement_stamp_endorsed_at on public.endorsement_applications;
create trigger trg_endorsement_stamp_endorsed_at
  before update of status on public.endorsement_applications
  for each row execute function public.endorsement_stamp_endorsed_at();

-- The view keeps its column names and types; endorsed_at now reads the real
-- column, and endorsement_path is appended so the public page can group by the
-- office level the candidate actually applied under instead of pattern
-- matching the office title.
create or replace view public.public_endorsements as
  select id,
         candidate_name,
         pronouns,
         office_sought,
         district,
         election_year,
         website,
         bio,
         is_out,
         coalesce(endorsed_at, reviewed_at, updated_at) as endorsed_at,
         endorsement_path::text                         as endorsement_path
    from public.endorsement_applications
   where status = 'endorsed'
     and is_published;

-- ── 3. The process has no interview step ────────────────────────────────────
alter table public.endorsement_path_meta
  rename column interview_note to process_note;

comment on column public.endorsement_path_meta.process_note is
  'What happens after this application is submitted, shown on the form. Ohio '
  'Pride does not interview candidates -- keep this describing review, Board '
  'vote, and notification.';

update public.endorsement_path_meta
   set process_note = 'After you submit, our Screening Committee reads your answers '
                      'alongside your public record, then brings the file to our Board '
                      'for a vote. Everything we need is in this application and the '
                      'public record, so there is no interview step. We email every '
                      'applicant with the outcome either way.'
 where path in ('statewide', 'federal', 'local');

update public.endorsement_path_meta
   set process_note = 'After you submit, our Screening Committee reads your written '
                      'decisions and public record alongside this application, then '
                      'brings the file to our Board for a vote. There is no interview '
                      'step, and nothing in our process asks you to comment on a matter '
                      'that could come before your court. We email every applicant with '
                      'the outcome either way.'
 where path = 'judicial';

update public.endorsement_path_meta
   set intro_body = 'The judiciary is not an advocacy branch. A judge''s duty is to the '
                    'law, to fairness, and to access: making sure every person who walks '
                    'into a courtroom believes they will receive equal treatment. Our '
                    'questions are written to respect that duty, and we read your public '
                    'record and written decisions alongside what you tell us here.'
 where path = 'judicial';

-- ── 4. Backfill the questionnaire path on pre-catalog applications ──────────
-- Only where the office makes the path unambiguous; anything else stays null
-- and shows as "path not recorded" in the admin.
update public.endorsement_applications
   set endorsement_path = 'statewide'
 where endorsement_path is null
   and office_sought ~* '^(ohio (house|senate)|state (house|senate)|ohio state )';

update public.endorsement_applications
   set endorsement_path = 'local'
 where endorsement_path is null
   and office_sought ~* '(council|township|mayor|school board|city )';

-- ── 5. Drop the two columns nothing writes ──────────────────────────────────
-- The anon INSERT policy names generated_pdf_path, so it is rebuilt without it.
drop policy if exists "anon can submit applications" on public.endorsement_applications;

alter table public.endorsement_applications
  drop column if exists submission_ip,
  drop column if exists generated_pdf_path;

create policy "anon can submit applications"
  on public.endorsement_applications
  for insert to anon
  with check (
    status = 'submitted'
    and reviewer_notes is null
    and reviewed_by is null
    and reviewed_at is null
    and endorsed_at is null
  );
