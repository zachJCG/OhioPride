-- =============================================================================
-- Election cycles v2: the three statewide cycles and the window rules
-- (2026-09-10)
-- -----------------------------------------------------------------------------
-- Dates are written as Eastern wall clock and converted, so the stored instant
-- is right on both sides of a daylight saving change. Writing a raw offset by
-- hand is how a 4:00 p.m. deadline quietly becomes 5:00 p.m. in March.
--
-- Three window rules, set by the board on 2026-09-10. They replace the two
-- dates the v2 work order had flagged CONFIRM, and they are rules rather than
-- per-cycle judgment calls, so a future cycle gets them by default:
--
--   OPEN    18 months before Election Day. A candidate deciding to run two
--           years out can apply the moment they decide.
--
--   CLOSE   when early voting starts. An endorsement that lands after ballots
--           are being cast has spent most of its value, so the application
--           window ends the instant the first ballot can be marked. The stored
--           deadline is midnight Eastern at the top of that day, which makes
--           the day before early voting the last full day to submit.
--
--   ANNOUNCE  not before the filing deadline has passed. Board doctrine: no
--           final endorsement action until the field is set. For a primary
--           that is the party petition deadline; for a general it is the later
--           of the party petition and the independent nominating petition,
--           because either one can still add a name to that ballot.
--
-- The dates the deadlines are derived FROM are still seeded literally from the
-- published Secretary of State calendar, never computed. Ohio moves statutory
-- deadlines for holidays under R.C. 1.14 and the arithmetic drifts.
--
-- Re-verify against the Secretary of State calendar before publishing any date.
-- =============================================================================

-- ── 2027 general first, so 2027-primary's carry-forward resolves ────────────
insert into public.election_cycles
  (slug, label, election_type, election_date,
   petition_filing_deadline, independent_deadline, write_in_deadline,
   voter_reg_deadline, early_voting_start,
   applications_open_at, early_review_close_at, applications_close_at,
   board_action_earliest, is_published)
values
  ('2027-general', '2027 General Election', 'general', date '2027-11-02',
   (timestamp '2027-08-04 16:00') at time zone 'America/New_York',
   (timestamp '2027-05-03 16:00') at time zone 'America/New_York',
   (timestamp '2027-08-23 16:00') at time zone 'America/New_York',
   (timestamp '2027-10-04 21:00') at time zone 'America/New_York',
   date '2027-10-05',
   -- 18 months before Election Day 2027-11-02
   (timestamp '2026-05-02 00:00') at time zone 'America/New_York',
   (timestamp '2026-12-04 17:00') at time zone 'America/New_York',
   -- early voting opens 2027-10-05
   (timestamp '2027-10-05 00:00') at time zone 'America/New_York',
   -- later of the party petition and the independent petition
   (timestamp '2027-08-04 16:00') at time zone 'America/New_York',
   true)
on conflict (slug) do nothing;

insert into public.election_cycles
  (slug, label, election_type, election_date,
   petition_filing_deadline, independent_deadline, write_in_deadline,
   voter_reg_deadline, early_voting_start,
   applications_open_at, early_review_close_at, applications_close_at,
   board_action_earliest, is_published)
values
  ('2027-primary', '2027 Primary Election', 'primary', date '2027-05-04',
   (timestamp '2027-02-03 16:00') at time zone 'America/New_York',
   (timestamp '2027-05-03 16:00') at time zone 'America/New_York',
   (timestamp '2027-02-22 16:00') at time zone 'America/New_York',
   (timestamp '2027-04-05 21:00') at time zone 'America/New_York',
   date '2027-04-06',
   -- 18 months before Election Day 2027-05-04
   (timestamp '2025-11-04 00:00') at time zone 'America/New_York',
   (timestamp '2026-12-04 17:00') at time zone 'America/New_York',
   -- early voting opens 2027-04-06
   (timestamp '2027-04-06 00:00') at time zone 'America/New_York',
   -- a primary's field is set by the party petition deadline
   (timestamp '2027-02-03 16:00') at time zone 'America/New_York',
   true)
on conflict (slug) do nothing;

-- ── Bring all three onto the v2 columns and the window rules ────────────────
-- Written as updates rather than relying on the inserts above, because
-- 2026-general already exists from the v1 seed and 2027-primary may too.

update public.election_cycles set
  petition_filing_deadline = (timestamp '2026-02-04 16:00') at time zone 'America/New_York',
  independent_deadline     = (timestamp '2026-05-04 16:00') at time zone 'America/New_York',
  write_in_deadline        = (timestamp '2026-08-24 16:00') at time zone 'America/New_York',
  voter_reg_deadline       = (timestamp '2026-10-05 21:00') at time zone 'America/New_York',
  early_voting_start       = date '2026-10-06',
  applications_open_at     = (timestamp '2025-05-03 00:00') at time zone 'America/New_York',
  early_review_close_at    = null,
  applications_close_at    = (timestamp '2026-10-06 00:00') at time zone 'America/New_York',
  board_action_earliest    = (timestamp '2026-05-04 16:00') at time zone 'America/New_York',
  carries_forward_to       = null,
  is_published             = true
where slug = '2026-general';

update public.election_cycles set
  petition_filing_deadline = (timestamp '2027-02-03 16:00') at time zone 'America/New_York',
  independent_deadline     = (timestamp '2027-05-03 16:00') at time zone 'America/New_York',
  write_in_deadline        = (timestamp '2027-02-22 16:00') at time zone 'America/New_York',
  voter_reg_deadline       = (timestamp '2027-04-05 21:00') at time zone 'America/New_York',
  early_voting_start       = date '2027-04-06',
  applications_open_at     = (timestamp '2025-11-04 00:00') at time zone 'America/New_York',
  early_review_close_at    = (timestamp '2026-12-04 17:00') at time zone 'America/New_York',
  applications_close_at    = (timestamp '2027-04-06 00:00') at time zone 'America/New_York',
  board_action_earliest    = (timestamp '2027-02-03 16:00') at time zone 'America/New_York',
  carries_forward_to       = (select id from public.election_cycles g where g.slug = '2027-general'),
  is_published             = true
where slug = '2027-primary';

update public.election_cycles set
  petition_filing_deadline = (timestamp '2027-08-04 16:00') at time zone 'America/New_York',
  independent_deadline     = (timestamp '2027-05-03 16:00') at time zone 'America/New_York',
  write_in_deadline        = (timestamp '2027-08-23 16:00') at time zone 'America/New_York',
  voter_reg_deadline       = (timestamp '2027-10-04 21:00') at time zone 'America/New_York',
  early_voting_start       = date '2027-10-05',
  applications_open_at     = (timestamp '2026-05-02 00:00') at time zone 'America/New_York',
  early_review_close_at    = (timestamp '2026-12-04 17:00') at time zone 'America/New_York',
  applications_close_at    = (timestamp '2027-10-05 00:00') at time zone 'America/New_York',
  board_action_earliest    = (timestamp '2027-08-04 16:00') at time zone 'America/New_York',
  carries_forward_to       = null,
  is_published             = true
where slug = '2027-general';

-- ── Office catalog: which race level each office implies ────────────────────
-- The prefill for the application's race_level select. Null where the office
-- genuinely does not decide it (a party committee seat, an "other" catch-all)
-- and the applicant has to say.
update public.endorsement_office_options set race_level = case label
  when 'Governor / Lt. Governor'                    then 'statewide_executive'
  when 'Attorney General'                           then 'statewide_executive'
  when 'Secretary of State'                         then 'statewide_executive'
  when 'State Auditor'                              then 'statewide_executive'
  when 'State Treasurer'                            then 'statewide_executive'
  when 'Ohio House of Representatives'              then 'general_assembly'
  when 'Ohio Senate'                                then 'general_assembly'
  when 'State Board of Education'                   then 'state_board_of_education'
  when 'U.S. House of Representatives'              then 'us_congress'
  when 'U.S. Senate'                                then 'us_congress'
  when 'Ohio Supreme Court'                         then 'judicial_appellate'
  when 'Ohio Court of Appeals'                      then 'judicial_appellate'
  when 'Court of Common Pleas (General Division)'   then 'judicial_trial'
  when 'Domestic Relations Court'                   then 'judicial_trial'
  when 'Juvenile Court'                             then 'judicial_trial'
  when 'Probate Court'                              then 'judicial_trial'
  when 'Municipal Court'                            then 'judicial_trial'
  when 'County Court'                               then 'judicial_trial'
  when 'Other Judicial Office'                      then 'judicial_trial'
  when 'Mayor'                                      then 'municipal'
  when 'City / Village Council'                     then 'municipal'
  when 'Township Trustee'                           then 'township'
  when 'County Commissioner'                        then 'county'
  when 'County Auditor / Recorder / Treasurer / Clerk' then 'county'
  when 'Prosecuting Attorney (County / City)'       then 'county'
  when 'Sheriff'                                    then 'county'
  when 'Board of Education / School Board'          then 'school_board'
  else null
end::public.race_level;

-- ── Backfill race_level on existing applications ────────────────────────────
-- Through the catalog where the office matches it, then by the office text for
-- the rows whose office_sought was typed rather than picked. Anything still
-- unresolved stays null: an application filed before the question existed is
-- not going to be classified by guessing.
update public.endorsement_applications a
   set race_level = o.race_level
  from public.endorsement_office_options o
 where a.race_level is null
   and o.race_level is not null
   and lower(btrim(a.office_sought)) = lower(btrim(o.label));

update public.endorsement_applications a
   set race_level = case
     when a.office_sought ~* 'supreme court|court of appeals'        then 'judicial_appellate'
     when a.office_sought ~* '\ycourt\y|judge|justice'               then 'judicial_trial'
     when a.office_sought ~* '(ohio|state) (house|senate)|general assembly'
                                                                      then 'general_assembly'
     when a.office_sought ~* 'board of education|school board'       then 'school_board'
     when a.office_sought ~* 'u\.?s\.?|congress'                     then 'us_congress'
     when a.office_sought ~* 'township'                              then 'township'
     when a.office_sought ~* 'county'                                then 'county'
     when a.office_sought ~* 'mayor|\ycouncil\y'                     then 'municipal'
     when a.office_sought ~* 'governor|attorney general|secretary of state|auditor|treasurer'
                                                                      then 'statewide_executive'
     else null
   end::public.race_level
 where a.race_level is null;
