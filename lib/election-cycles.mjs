/* =============================================================================
 * Election cycles: the read path and the words for them.
 * -----------------------------------------------------------------------------
 * An endorsement application belongs to an election, and an election decides
 * whether it is still taking applications. That decision lives in one place,
 * `public.cycle_is_open()` in the database, and reaches every surface through
 * `public_election_cycles.is_open`. Nothing here recomputes it from the dates:
 * a page that decided for itself would disagree with the insert policy the
 * moment someone set an override, and the candidate would be the one to find
 * out.
 *
 * Everything a person reads is Eastern time with the zone spelled out. A
 * candidate in Cincinnati and a campaign manager in Los Angeles have to see
 * the same deadline, and the one they see has to be the one the database
 * enforces.
 *
 * Plain ESM with no imports beyond the connection values, so the server page,
 * a client component, and the static application form can all use it.
 * ========================================================================== */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-public.mjs';

export const ET = 'America/New_York';

/** The columns every surface reads. Keep in step with public_election_cycles. */
export const CYCLE_COLUMNS =
  'id,slug,label,jurisdiction,election_type,election_date,filing_deadline,' +
  'write_in_deadline,voter_reg_deadline,early_voting_start,applications_open_at,' +
  'applications_close_at,board_action_earliest,is_open,is_upcoming';

/* ── Words ──────────────────────────────────────────────────────────────── */

/**
 * "September 30, 2026".
 *
 * A bare YYYY-MM-DD is a calendar day, not an instant: election_date and
 * early_voting_start are DATE columns. Parsing "2026-11-03" gives UTC midnight,
 * and rendering that in Eastern time moves Election Day to November 2. Bare
 * dates are therefore read and printed in UTC, and only real timestamps are
 * converted to Eastern.
 */
const BARE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function cycleDate(value) {
  if (!value) return null;
  const bare = BARE_DATE.exec(String(value));
  const d = bare ? new Date(Date.UTC(+bare[1], +bare[2] - 1, +bare[3])) : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
    timeZone: bare ? 'UTC' : ET,
  });
}

/** "5:00 PM ET". The zone is part of the string on purpose; never drop it. */
export function cycleTime(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const t = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: ET });
  return `${t.replace(/\s?([AP])M$/i, (m, p) => ` ${p.toUpperCase()}M`)} ET`;
}

/** "September 30, 2026 at 5:00 PM ET", the full form used for deadlines. */
export function cycleDateTime(value) {
  const d = cycleDate(value);
  const t = cycleTime(value);
  return d && t ? `${d} at ${t}` : d;
}

/**
 * The state a cycle is in, as a word rather than a colour. Open and closed
 * have to be told apart without seeing colour at all, so every card prints
 * this label.
 */
export function cycleState(cycle) {
  if (!cycle) return 'closed';
  if (cycle.is_open) return 'open';
  if (cycle.is_upcoming) return 'upcoming';
  return 'closed';
}

export const CYCLE_STATE_LABEL = {
  open: 'Accepting applications',
  upcoming: 'Not open yet',
  closed: 'Applications closed',
};

/** The one line under a card that says what a candidate can do about it. */
export function cycleStateDetail(cycle) {
  const state = cycleState(cycle);
  if (state === 'open') return `Applications due ${cycleDateTime(cycle.applications_close_at)}`;
  if (state === 'upcoming') return `Applications open ${cycleDate(cycle.applications_open_at)}`;
  return `Applications closed ${cycleDateTime(cycle.applications_close_at)}`;
}

/** The message a candidate gets when a submission is refused as late. */
export function closedMessage(cycle) {
  const label = cycle?.label || 'this election';
  const when = cycleDateTime(cycle?.applications_close_at);
  const tail = when ? ` closed on ${when}.` : ' are closed.';
  return `Applications for the ${label}${tail} If you believe you are receiving this in error, email zach@ohiopride.org.`;
}

/* ── Sorting ────────────────────────────────────────────────────────────── */

/* Open first, because that is the only group anyone can act on, then the ones
 * about to open, then what has already closed. Inside a group, the election
 * that comes soonest goes first. */
const STATE_RANK = { open: 0, upcoming: 1, closed: 2 };

export function sortCycles(cycles) {
  return [...(cycles || [])].sort((a, b) => {
    const r = STATE_RANK[cycleState(a)] - STATE_RANK[cycleState(b)];
    if (r !== 0) return r;
    return String(a.election_date || '').localeCompare(String(b.election_date || ''));
  });
}

export const openCycles = (cycles) => (cycles || []).filter((c) => c.is_open);

/* ── Read ───────────────────────────────────────────────────────────────── */

/**
 * Published cycles, newest election last. Reads the view with the anon key:
 * every column it exposes is public, and `override_note` is deliberately not
 * among them because it records internal reasoning.
 *
 * Never throws. A Supabase blip should render the section empty rather than
 * 500 a page candidates reach from an email.
 */
export async function getElectionCycles({ revalidate = 300 } = {}) {
  const query = new URLSearchParams({ select: CYCLE_COLUMNS, order: 'election_date.asc' });
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/public_election_cycles?${query}`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        accept: 'application/json',
      },
      // Shorter than the endorsement list: a deadline passing has to show up
      // on the page without waiting for a deploy or a ten minute window.
      next: { revalidate },
    });
    if (!res.ok) throw new Error(`public_election_cycles responded ${res.status}`);
    const rows = await res.json();
    return { ok: true, cycles: sortCycles(Array.isArray(rows) ? rows : []) };
  } catch (err) {
    console.error('Failed to load election cycles:', err);
    return { ok: false, cycles: [] };
  }
}
