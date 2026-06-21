-- ============================================================
-- Ohio Pride Admin — Elections seed: Hardin Primary '27 (CAMPAIGN ROW ONLY)
--
-- This seeds ONLY the election_campaigns row, using the goals stated in
-- the build packet. The 193 Columbus polling locations and 549 precincts
-- are authoritative Franklin County Board of Elections precinct-GIS data
-- that was NOT included in the build packet, so they are intentionally
-- NOT seeded here (fabricating BOE records would be wrong).
--
-- Drop the real `election_polling_locations` / `election_precincts` insert
-- statements below this row once the BOE GIS export is available. Until
-- then the dashboard loads and shows the recruit/roster surface with an
-- empty site grid (sites: 0 of 0), which is the correct "awaiting BOE
-- site finalization (~5 weeks out)" planning state.
--
-- coverage_target is left NULL on purpose — the packet does not give a
-- figure distinct from goal_volunteers (1,100), so we do not invent one.
-- ============================================================

insert into public.election_campaigns
  (id, name, candidate, office, jurisdiction, election_date, election_kind,
   status, goal_volunteers, goal_sites, goal_precincts, coverage_target, notes)
values
  ('hardin-primary-27',
   'Hardin Primary ''27',
   null,                       -- candidate: pre-endorsement, not yet filed
   null,                       -- office: TBD until candidate files
   'Columbus',
   '2027-05-04',
   'primary',
   'planning',
   1100,                       -- goal_volunteers (recruit goal)
   193,                        -- goal_sites
   549,                        -- goal_precincts
   null,                       -- coverage_target (no distinct figure in packet)
   'Planning, pre-endorsement. Deploys after the Board endorsement vote and the candidate files. Locations/precincts to be seeded from the Franklin County BOE precinct GIS once finalized (~5 weeks before the election).')
on conflict (id) do nothing;
