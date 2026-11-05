-- =============================================================================
-- Post-election refresh, phase 1 follow-up (2026-11-05): review fixes
-- -----------------------------------------------------------------------------
-- Four things the review of 20261105000000 turned up. All additive or
-- narrowing; nothing here drops data.
--
--   1. Views are read surfaces. Supabase's default privileges hand anon and
--      authenticated INSERT, UPDATE and DELETE on every view, and eleven of
--      the views in this schema (public_endorsements, founding_members_public,
--      pride_events_public, public_target_races, person_modules,
--      submissions_inbox, volunteers_admin, intern_applications_admin,
--      v_committee_eligibility, call_time_followups_due,
--      call_time_prospect_timeline) are simple enough that Postgres treats
--      them as auto-updatable. They are owner-privileged (postgres,
--      BYPASSRLS), so a write through them never meets the base table's RLS:
--      the public anon key could PATCH or DELETE an endorsed candidate's
--      application row through public_endorsements. No application code
--      writes through any view (checked 2026-11-05), so DML is revoked on all
--      of them and SELECT is left as it was.
--
--   2. Leaving the endorsed status clears what only an endorsee may carry.
--      The publish guard constraint (endorsement_published_requires_endorsed)
--      refused a plain `set status = 'withdrawn'` on a published row because
--      only the admin page cleared is_published. The status trigger now
--      clears is_published, result and result_note itself, so a SQL editor,
--      a bulk action or a webhook can change status without knowing the rule.
--
--   3. cycle follows the election and the corrected year. The fill trigger
--      only filled a null, so moving a row to another election by cycle_id,
--      or a staff correction of election_year in the admin, left cycle stale.
--      It now re-derives on a cycle_id change and follows election_year when
--      that is what changed.
--
--   4. The anon insert gate pins the result and publish columns. Nothing on
--      the form sends them, and nothing should: a submission arriving with
--      result = 'won' would have published that result the day the Board
--      endorsed. Rewritten rather than supplemented, because permissive
--      policies are OR'd.
-- =============================================================================

-- ── 1. Views are read surfaces ──────────────────────────────────────────────
do $$
declare v record;
begin
  for v in select schemaname, viewname from pg_views where schemaname = 'public' loop
    execute format(
      'revoke insert, update, delete, truncate, references, trigger on %I.%I from anon, authenticated',
      v.schemaname, v.viewname
    );
  end loop;
end $$;

-- ── 2. Leaving endorsed clears endorsee-only columns ────────────────────────
create or replace function public.endorsement_stamp_endorsed_at()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.status = 'endorsed' and old.status is distinct from 'endorsed' then
    new.endorsed_at := coalesce(new.endorsed_at, new.reviewed_at, now());
  elsif new.status is distinct from 'endorsed' then
    new.endorsed_at := null;
    -- Nothing is public, and no race result stands, for anyone the Board has
    -- not endorsed. Column-specific triggers do not see values another
    -- trigger changed, so the result stamp is set here as well.
    new.is_published := false;
    if new.result is not null or new.result_note is not null then
      new.result_updated_at := now();
    end if;
    new.result := null;
    new.result_note := null;
  end if;
  return new;
end;
$$;

comment on function public.endorsement_stamp_endorsed_at() is
  'Stamps endorsed_at when a row becomes endorsed; when it leaves endorsed, clears endorsed_at, is_published, result and result_note so the publish guard and the results archive never see a non-endorsee.';

-- ── 3. cycle follows the election and the corrected year ────────────────────
create or replace function public.endorsement_fill_cycle()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    -- Moved to another election, cycle not set by hand: re-derive it.
    if new.cycle_id is distinct from old.cycle_id and new.cycle is not distinct from old.cycle then
      new.cycle := null;
    end if;
    -- Staff corrected the year in the admin, cycle not set by hand: follow it.
    if new.election_year is distinct from old.election_year
       and new.cycle is not distinct from old.cycle
       and new.election_year is not null then
      new.cycle := new.election_year::smallint;
    end if;
  end if;
  if new.cycle is null and new.cycle_id is not null then
    select extract(year from c.election_date)::smallint
      into new.cycle
      from public.election_cycles c
     where c.id = new.cycle_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_endorsement_fill_cycle on public.endorsement_applications;
create trigger trg_endorsement_fill_cycle
  before insert or update of cycle_id, cycle, election_year on public.endorsement_applications
  for each row execute function public.endorsement_fill_cycle();

-- ── 4. The insert gate, restated with the new columns pinned ────────────────
drop policy if exists "anon can submit applications" on public.endorsement_applications;
create policy "anon can submit applications" on public.endorsement_applications
  for insert to anon
  with check (
    status = 'submitted'
    and reviewer_notes is null
    and reviewed_by is null
    and reviewed_at is null
    and endorsed_at is null
    and (photo_path is null or photo_path like ('submissions/' || id::text || '/%'))
    and cycle_id is not null
    and was_late = false
    and public.cycle_accepts_applications(cycle_id)
    and is_published is not true
    and result is null
    and result_note is null
    and result_updated_at is null
  );

-- ── 5. Catalog: belt and braces for a database built from migrations ────────
update public.endorsement_office_options
   set race_level = 'township'
 where path = 'local' and label = 'Township Fiscal Officer' and race_level is null;
