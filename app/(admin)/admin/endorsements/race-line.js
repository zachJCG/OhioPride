'use client';
// The race, as the admin shows it: office on its own line, then chips for
// the jurisdiction (district and county), the cycle, and party. The queue
// card and the candidate header both render this so a judge's county reads
// the same in both places, and its absence is a visible gap rather than a
// silently shorter line.
import { districtLabel, countyLabel, isFutureCycle, cycleYearOf } from '../../../../lib/endorsement-race.mjs';

export function RaceLine({ app, party = true }) {
  if (!app) return null;
  const district = districtLabel(app.district);
  const county = countyLabel(app.county);
  // County is the jurisdiction for every judicial and local race, so on those
  // its absence is a fact the reader needs, not a blank.
  const wantsCounty = app.endorsement_path === 'judicial' || app.endorsement_path === 'local';
  const nextCycle = isFutureCycle(app);
  const year = app.election_year ? String(app.election_year) : null;

  return (
    <div className="race">
      <div className="race-office">{app.office_sought || 'Office not recorded'}</div>
      <div className="race-meta">
        {district && <span className="race-pill race-pill-place">{district}</span>}
        {county && <span className="race-pill race-pill-place">{county}</span>}
        {!county && wantsCounty && <span className="race-pill race-pill-missing">County not on file</span>}
        {app.is_special_election
          ? <span className="race-pill race-pill-special">{year ? `${year} special` : 'Special election'}</span>
          : year && <span className={`race-pill race-pill-cycle${nextCycle ? ' race-pill-next' : ''}`}>{nextCycle ? `${cycleYearOf(app)} · next cycle` : year}</span>}
        {party && app.party && <span className="race-party">{app.party}</span>}
      </div>
    </div>
  );
}
