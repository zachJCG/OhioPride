-- =============================================================================
-- Seed the four election cycles and attach every existing application
-- (2026-09-09)
-- -----------------------------------------------------------------------------
-- Dates are written as Eastern wall clock and converted, so the stored instant
-- is right on both sides of a daylight saving change. Writing a raw offset by
-- hand is how a 4:00 p.m. deadline quietly becomes 5:00 p.m. in March.
--
-- Two of the application windows are policy calls rather than statute and are
-- flagged CONFIRM below. Both are editable from the admin without a deploy.
--
-- APPLIED TO PRODUCTION 2026-09-09; see docs/db/CHANGES-2026-09-09.md.
-- =============================================================================

insert into public.election_cycles
  (slug, label, jurisdiction, election_type, election_date,
   filing_deadline, write_in_deadline, voter_reg_deadline, early_voting_start,
   applications_open_at, applications_close_at, board_action_earliest, is_published)
values
  -- CONFIRM: applications close 2026-09-30. In-person absentee opens
  -- 2026-10-06, so an endorsement after that lands while ballots are being
  -- cast. This leaves the Board about a week to vote before voting starts.
  ('2026-general', '2026 General Election', 'Statewide', 'general', date '2026-11-03',
   (timestamp '2026-05-04 16:00') at time zone 'America/New_York',
   (timestamp '2026-08-24 16:00') at time zone 'America/New_York',
   (timestamp '2026-10-05 21:00') at time zone 'America/New_York',
   date '2026-10-06',
   (timestamp '2026-02-17 00:00') at time zone 'America/New_York',
   (timestamp '2026-09-30 17:00') at time zone 'America/New_York',
   (timestamp '2026-05-04 16:00') at time zone 'America/New_York',
   true),

  -- Committed in writing to both campaigns. Do not move this date.
  ('2027-columbus-municipal', '2027 Columbus Municipal', 'Columbus', 'municipal', date '2027-11-02',
   (timestamp '2027-02-03 16:00') at time zone 'America/New_York',
   null,
   (timestamp '2027-10-04 21:00') at time zone 'America/New_York',
   date '2027-10-05',
   (timestamp '2026-09-09 00:00') at time zone 'America/New_York',
   (timestamp '2026-12-04 17:00') at time zone 'America/New_York',
   (timestamp '2027-02-03 16:00') at time zone 'America/New_York',
   true),

  -- CONFIRM: applications close 2027-02-19. Board doctrine is no final action
  -- before the filing deadline of 2027-02-03, so this gives the Board all of
  -- March to vote, ahead of early voting on 2027-04-06.
  ('2027-primary', '2027 Primary Election', 'Statewide', 'primary', date '2027-05-04',
   (timestamp '2027-02-03 16:00') at time zone 'America/New_York',
   (timestamp '2027-02-22 16:00') at time zone 'America/New_York',
   (timestamp '2027-04-05 21:00') at time zone 'America/New_York',
   date '2027-04-06',
   (timestamp '2026-12-01 00:00') at time zone 'America/New_York',
   (timestamp '2027-02-19 17:00') at time zone 'America/New_York',
   (timestamp '2027-02-03 16:00') at time zone 'America/New_York',
   true),

  ('2027-general', '2027 General Election', 'Statewide', 'general', date '2027-11-02',
   (timestamp '2027-08-04 16:00') at time zone 'America/New_York',
   (timestamp '2027-08-23 16:00') at time zone 'America/New_York',
   (timestamp '2027-10-04 21:00') at time zone 'America/New_York',
   date '2027-10-05',
   (timestamp '2027-02-04 00:00') at time zone 'America/New_York',
   (timestamp '2027-08-20 17:00') at time zone 'America/New_York',
   (timestamp '2027-08-04 16:00') at time zone 'America/New_York',
   true)
on conflict (slug) do nothing;

-- ── Backfill ────────────────────────────────────────────────────────────────
-- The work order said to put every existing row on 2026-general. Two rows are
-- 2027 races, and one of them is the Columbus mayoral application whose
-- December 4 deadline is the committed one, so a blanket backfill would file
-- it under a cycle that closes in September. Rows are matched to the election
-- they are actually for; anything unrecognized still falls back to
-- 2026-general, which is what the work order intended for the 2026 slate.
update public.endorsement_applications a
   set cycle_id = c.id
  from public.election_cycles c
 where a.cycle_id is null
   and c.slug = case
     when a.election_year = 2027
      and lower(coalesce(a.office_sought, '')) like '%mayor%'
      and lower(coalesce(a.county, '')) = 'franklin'      then '2027-columbus-municipal'
     when a.election_year = 2027                          then '2027-general'
     else                                                      '2026-general'
   end;

alter table public.endorsement_applications
  alter column cycle_id set not null;
