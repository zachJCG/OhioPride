/* =============================================================================
 * Endorsements: one description of the race, and one idea of "the cycle".
 * -----------------------------------------------------------------------------
 * The queue card, the candidate page, the board packet, and the staff email all
 * print what a candidate is running for. Before this module each of them built
 * that line on its own, and none of them knew about county, so a judge read as
 * "Court of Common Pleas (General Division)" with nothing to say which county.
 *
 * The same four surfaces also need to agree on which applications belong to
 * the election in front of us and which are next cycle's, so that a 2027
 * council candidate who applies in mid-2026 has a place to sit without
 * cluttering this year's queue, and rolls into the current queue on its own
 * once this year's general election is behind us.
 *
 * Plain ESM with no imports so it can be used from a client component, a
 * server route, and an edge function alike.
 * ========================================================================== */

/** "Hamilton County" from a stored short name, or null. */
export function countyLabel(county) {
  const c = String(county || '').trim();
  return c ? `${c} County` : null;
}

/** "District 28" from a stored district, without doubling a typed prefix. */
export function districtLabel(district) {
  const d = String(district || '').trim();
  if (!d) return null;
  return /^(district|ward|precinct|city|village|township|county)\b/i.test(d) ? d : `District ${d}`;
}

/**
 * The pieces of the race line, in order: office, district, county, then the
 * cycle. County comes after district because a House seat is "District 28,
 * Hamilton County" and a judgeship is just "Probate Court · Montgomery County".
 *
 * `includeParty` is off by default: the public site never shows party and the
 * admin surfaces that do want it add it themselves.
 */
export function raceParts(row, { includeParty = false, includeCycle = true } = {}) {
  if (!row) return [];
  const parts = [row.office_sought, districtLabel(row.district), countyLabel(row.county)];
  if (includeParty) parts.push(row.party);
  if (includeCycle) {
    if (row.is_special_election) parts.push(row.election_year ? `${row.election_year} special election` : 'Special election');
    else if (row.election_year) parts.push(String(row.election_year));
  }
  return parts.filter(Boolean);
}

export function raceLabel(row, sep = ' · ', opts) {
  return raceParts(row, opts).join(sep);
}

/* ── Cycles ─────────────────────────────────────────────────────────────── */

/** Ohio's general election: the first Tuesday after the first Monday in November. */
export function generalElectionDate(year) {
  const firstOfNov = new Date(year, 10, 1);
  const firstMonday = 1 + ((8 - firstOfNov.getDay()) % 7);
  return new Date(year, 10, firstMonday + 1, 23, 59, 59);
}

/**
 * The election year the PAC is working toward right now. It is this calendar
 * year until the polls close in November, then next year: an application for
 * 2027 filed in September 2026 is "next cycle" until election night, when it
 * becomes current without anyone touching the row.
 */
export function currentCycleYear(now = new Date()) {
  const y = now.getFullYear();
  return now > generalElectionDate(y) ? y + 1 : y;
}

/**
 * The cycle an application belongs to. A special election with no year, and
 * any row that never said, count as the current cycle: they are happening now
 * or the staff need to fix the year, and either way they belong in the queue.
 */
export function cycleYearOf(row, now = new Date()) {
  const y = Number(row?.election_year);
  return Number.isFinite(y) && y > 0 ? y : currentCycleYear(now);
}

export function isFutureCycle(row, now = new Date()) {
  return cycleYearOf(row, now) > currentCycleYear(now);
}

/* ── Time in stage ──────────────────────────────────────────────────────── */

/**
 * Whole days since the status last changed. Reads status_changed_at, which the
 * database stamps only on a status change; it falls back to created_at for a
 * row from before that column existed. It never reads updated_at, which moves
 * on every write and is the reason "days in stage" used to reset whenever
 * someone saved a note.
 */
export function daysInStage(row, now = Date.now()) {
  const since = row?.status_changed_at || row?.created_at;
  if (!since) return null;
  const ms = +now - new Date(since).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 86400000)) : null;
}

export function daysInStageLabel(row, now) {
  const d = daysInStage(row, now);
  if (d == null) return '';
  return d === 0 ? 'today' : d === 1 ? '1 day' : `${d} days`;
}

/* ── Who submitted it ───────────────────────────────────────────────────── */

export const SUBMITTED_BY_LABEL = {
  candidate: 'The candidate',
  campaign_staff: 'Campaign staff',
  pac_staff: 'Ohio Pride PAC staff',
};

/** "Campaign staff · Jane Doe, campaign manager", or "The candidate". */
export function submittedByLabel(row) {
  const kind = SUBMITTED_BY_LABEL[row?.submitted_by_kind] || SUBMITTED_BY_LABEL.candidate;
  if (!row || row.submitted_by_kind === 'candidate' || !row.submitted_by_kind) return kind;
  const who = [row.submitted_by_name, row.submitted_by_role].filter(Boolean).join(', ');
  return who ? `${kind} · ${who}` : kind;
}
