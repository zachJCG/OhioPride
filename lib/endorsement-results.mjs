/* ===========================================================================
 * lib/endorsement-results.mjs
 * ---------------------------------------------------------------------------
 * The one set of rules for election results: the badge a candidate shows, the
 * line under their name on the profile, the order a results list is read in,
 * and the seat label on a portrait. The home page (through
 * /api/endorsement-results), /endorsements, /endorsements/2026, the profile
 * and the admin all read these, so a count or a badge can never disagree
 * between two surfaces.
 *
 * Plain ESM with no imports: client components can use it as well as server
 * pages and route handlers.
 *
 * Results are data. Nothing here knows who won; it only knows how to say it.
 * The strings are the work order's copy deck, word for word.
 * ======================================================================== */

/** Mirrors the endorsement_result_valid check constraint. */
export const RESULT_VALUES = ['won', 'lost', 'pending'];

/** /endorsements/2026 groups, in reading order. Empty groups are skipped. */
export const RESULT_GROUPS = [
  { key: 'won', heading: 'Elected.' },
  { key: 'lost', heading: 'Not elected this cycle.' },
  { key: 'pending', heading: 'Result pending.' },
];

/* A candidate here is either a decorated row from lib/endorsements.mjs
 * ({ result, incumbent, cycle, ... }) or an API row ({ result, incumbent }). */
const isIncumbent = (c) => c?.incumbent === true;

/**
 * The group a result belongs in. A null result (endorsed, race not called or
 * not yet held) reads as pending: a results page never drops a candidate.
 */
export function resultKey(c) {
  return c?.result === 'won' || c?.result === 'lost' ? c.result : 'pending';
}

/** The public badge: Re-elected, Elected, Not elected, or Result pending. */
export function resultBadge(c) {
  const key = resultKey(c);
  if (key === 'won') return isIncumbent(c) ? 'Re-elected' : 'Elected';
  if (key === 'lost') return 'Not elected';
  return 'Result pending';
}

/**
 * Ohio's general election: the Tuesday after the first Monday in November.
 * Same rule as generalElectionDate() in lib/endorsement-race.mjs, restated so
 * this module keeps no imports.
 */
export function electionDayLabel(year) {
  const y = Number(year);
  if (!Number.isInteger(y) || y < 2000) return null;
  const firstOfNov = new Date(Date.UTC(y, 10, 1));
  const firstMonday = 1 + ((8 - firstOfNov.getUTCDay()) % 7);
  const day = firstMonday + 1;
  return `November ${day}, ${y}`;
}

/**
 * The line under the candidate's name on their profile, or null when there is
 * nothing to say (no cycle on the row). Copy deck, phase 3:
 *   Re-elected November 3, 2026.  |  Elected November 3, 2026.
 *   Endorsed in 2026. Not elected. |  2026 result pending.
 */
export function resultLine(c) {
  // Number(null) is 0, so test the raw value first: a row with no cycle has
  // no election to report on.
  if (c?.cycle === null || c?.cycle === undefined || c?.cycle === '') return null;
  const year = Number(c.cycle);
  if (!Number.isInteger(year) || year < 2000) return null;
  const key = resultKey(c);
  if (key === 'won') return `${isIncumbent(c) ? 'Re-elected' : 'Elected'} ${electionDayLabel(year)}.`;
  if (key === 'lost') return `Endorsed in ${year}. Not elected.`;
  return `${year} result pending.`;
}

/**
 * Ballot order for a results list (work order 7.4): statewide, state senate,
 * state house, county, judicial. Federal, state board, municipal, township
 * and school board slot in where a reader would expect them.
 *
 * Reads the raw race_level enum and the office text, because the enum does
 * not split the Senate from the House.
 */
export function raceRank(c) {
  const level = c?.raceLevel ?? c?.race_level ?? null;
  const path = c?.path ?? c?.endorsement_path ?? null;
  const office = String(c?.officeSought ?? c?.office_sought ?? c?.office ?? '').toLowerCase();
  if (level === 'judicial_trial' || level === 'judicial_appellate' || path === 'judicial') return 9;
  if (level === 'statewide_executive') return 0;
  if (level === 'us_congress' || path === 'federal') return 1;
  if (level === 'general_assembly' || path === 'statewide') {
    if (/\bsenate\b/.test(office)) return 2;
    if (/\bhouse\b|\brepresentative/.test(office)) return 3;
    return 0; // statewide path with no chamber in the office: an executive seat
  }
  if (level === 'state_board_of_education') return 4;
  if (level === 'county') return 5;
  if (level === 'municipal') return 6;
  if (level === 'township') return 7;
  if (level === 'school_board') return 8;
  return /\bcounty\b/.test(office) ? 5 : 6;
}

const SUFFIX = /^(jr|sr|ii|iii|iv)\.?$/i;

/** "J. Noah Spinner" sorts as Spinner; "Jr." and friends are not surnames. */
export function lastNameKey(name) {
  const parts = String(name || '').trim().split(/\s+/);
  while (parts.length > 1 && SUFFIX.test(parts[parts.length - 1])) parts.pop();
  return (parts[parts.length - 1] || '').toLowerCase();
}

/** Ballot order, then last name, then full name. Sorts on the display name. */
export function compareByRace(a, b) {
  const ra = Number.isFinite(a?.raceRank) ? a.raceRank : raceRank(a);
  const rb = Number.isFinite(b?.raceRank) ? b.raceRank : raceRank(b);
  return (
    ra - rb ||
    lastNameKey(a?.name).localeCompare(lastNameKey(b?.name), 'en', { sensitivity: 'base' }) ||
    String(a?.name || '').localeCompare(String(b?.name || ''), 'en')
  );
}

/**
 * The seat under a portrait: "Ohio House, District 6", "Ohio Senate, District
 * 3", or the office alone when the district is not a number (a county office,
 * a court, an editorial note such as "Incumbent").
 */
export function seatLabel(c) {
  const office = String(c?.office || '')
    .replace(/^Ohio House of Representatives$/i, 'Ohio House')
    .replace(/^State Senate$/i, 'Ohio Senate')
    .trim();
  const district = String(c?.district || '').trim();
  const m =
    district.match(/^(?:(?:House|Senate)\s+)?District\s+(\d+)$/i) ||
    (/^\d+$/.test(district) ? [district, district] : null);
  return m ? `${office}, District ${m[1]}` : office;
}

/** { total, won, lost, pending } for a list of candidates. */
export function countResults(list) {
  const counts = { total: 0, won: 0, lost: 0, pending: 0 };
  for (const c of list || []) {
    counts.total += 1;
    counts[resultKey(c)] += 1;
  }
  return counts;
}

/** Candidates grouped in RESULT_GROUPS order, each group in ballot order. */
export function groupResults(list) {
  return RESULT_GROUPS.map((g) => ({
    ...g,
    candidates: (list || []).filter((c) => resultKey(c) === g.key).sort(compareByRace),
  })).filter((g) => g.candidates.length > 0);
}
