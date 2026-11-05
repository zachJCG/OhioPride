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
 * The three window rules, so the words here match the data:
 *
 *   OPEN      18 months before Election Day.
 *   CLOSE     when early voting starts, because an endorsement that lands
 *             after ballots are being cast has spent most of its value.
 *   ANNOUNCE  not before the filing deadline has passed, which is why a card
 *             prints the petition deadline beside the application deadline.
 *             They are different dates doing different jobs and a candidate
 *             reading one for the other would miss a ballot.
 *
 * Plain ESM with no imports beyond the connection values, so the server page,
 * a client component, and the static application form can all use it.
 * ========================================================================== */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-public.mjs';

export const ET = 'America/New_York';

/** The columns every surface reads. Keep in step with public_election_cycles. */
export const CYCLE_COLUMNS =
  'id,slug,label,election_type,election_date,petition_filing_deadline,' +
  'independent_deadline,write_in_deadline,voter_reg_deadline,early_voting_start,' +
  'applications_open_at,early_review_close_at,applications_close_at,' +
  'board_action_earliest,carries_forward_to_slug,carries_forward_to_label,' +
  'is_open,is_upcoming';

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

/**
 * Whether the next board review round is still ahead.
 *
 * Applications open 18 months before Election Day, so a cycle's own deadline
 * can be the better part of a year out and reads as "no hurry" when there is a
 * review round in eight weeks. This is what lets a card lead with the round
 * instead. It is a display decision only: the round is not a gate, and a
 * candidate who misses it is still inside the window until the deadline.
 */
export function nextReviewRound(cycle) {
  const at = cycle?.early_review_close_at;
  if (!at) return null;
  const d = new Date(at);
  if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) return null;
  return at;
}

/**
 * The filing deadline that actually settles the field for THIS election, which
 * is not the same question for a primary and a general.
 *
 * Ohio runs two petitions. The party petition (declaration of candidacy) is 90
 * days before the election. The independent nominating petition is the day
 * before the primary, and an independent who files it appears on the GENERAL
 * ballot, not the primary one.
 *
 * So a general takes the later of the two, because either can still add a name
 * to it, and a primary takes the party petition alone. Taking the later of the
 * two on a primary prints a date after the primary has already been held,
 * which is how the 2027 primary card first read "May 3, 2027" for an election
 * on May 4.
 */
export function filingDeadline(cycle) {
  const party = cycle?.petition_filing_deadline || null;
  const indep = cycle?.independent_deadline || null;
  if (cycle?.election_type === 'primary') return party;
  if (!party) return indep;
  if (!indep) return party;
  return new Date(indep) > new Date(party) ? indep : party;
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

/* ── The application copy, from the data ───────────────────────────────── */

/**
 * The election year the form is taking applications for: the earliest year
 * among the open cycles, or null when nothing is open. "Applications for 2027
 * races are open." is built from this, never typed.
 */
export function applicationYear(cycles) {
  const years = openCycles(cycles)
    .map((c) => Number(String(c.election_date || '').slice(0, 4)))
    .filter((y) => Number.isFinite(y) && y > 0);
  return years.length ? Math.min(...years) : null;
}

/**
 * The petition deadline lines under the application copy, one per open cycle,
 * in the post-election copy deck's wording:
 *
 *   Races with a May 4, 2027 primary: petitions are due February 3, 2027.
 *   Races without a primary, on the November 2, 2027 ballot: petitions are
 *   due August 4, 2027.
 *
 * Generated from the cycles so the dates printed are the dates the database
 * holds. The application form carries the same template inline (it is a
 * static page and cannot import this module); keep the two in step.
 */
export function deadlineLines(cycles) {
  const open = [...openCycles(cycles)].sort((a, b) =>
    String(a.election_date || '').localeCompare(String(b.election_date || '')),
  );
  const lines = [];
  for (const c of open) {
    const day = cycleDate(c.election_date);
    const due = cycleDate(filingDeadline(c));
    if (!day || !due) continue;
    if (c.election_type === 'primary') {
      lines.push(`Races with a ${day} primary: petitions are due ${due}.`);
    } else if (c.election_type === 'general') {
      lines.push(`Races without a primary, on the ${day} ballot: petitions are due ${due}.`);
    }
  }
  return lines;
}

/* What the pages print when the cycles cannot be read. The live data renders
 * these exact strings; they are here so a Supabase blip never leaves the
 * section blank. Re-verify against the Secretary of State calendar before
 * changing either. */
export const DEADLINE_LINES_FALLBACK = [
  'Races with a May 4, 2027 primary: petitions are due February 3, 2027.',
  'Races without a primary, on the November 2, 2027 ballot: petitions are due August 4, 2027.',
];
export const APPLICATION_YEAR_FALLBACK = 2027;
export const SOS_CALENDAR_URL = 'https://www.ohiosos.gov/assets/election-calendar-2027.pdf';
export const SOS_CALENDAR_LABEL = 'Ohio Secretary of State 2027 election calendar';

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
