/* The "Apply for Endorsement" section of /endorsements.
 *
 * The copy above the cards is the post-election application copy (2026-11-05):
 * the year, the petition deadline lines, and the Secretary of State calendar
 * link. The year and the lines are BUILT from the cycles, so a date on this
 * page is always a date the database holds; the literal fallbacks only render
 * when the cycles cannot be read at all.
 *
 * Below it, one card per published election cycle, in three states. The state
 * is read from `is_open` on the view, which the database computes with the
 * same function the insert policy uses, so a card can never invite an
 * application the database would refuse.
 *
 * Accessibility notes that are requirements, not preferences:
 *
 *   - Every card prints its state as words ("Accepting applications",
 *     "Applications closed"). Colour is never the only difference between an
 *     open card and a closed one.
 *   - Body text on every card, closed ones included, uses --end-text-gray,
 *     measured at 6.6:1 on the card background. --end-text-dim is 3.8:1 there
 *     and is deliberately not used for anything a person has to read.
 *   - Deadlines are real text in Eastern time with the zone spelled out. There
 *     is no countdown; a clock that says "3 days left" is not a deadline.
 *   - A closed cycle renders no button. It does not get a disabled control
 *     that looks tappable and does nothing.
 */

import Link from 'next/link';
import {
  applicationYear,
  cycleDate,
  cycleDateTime,
  cycleState,
  deadlineLines,
  filingDeadline,
  nextReviewRound,
  APPLICATION_YEAR_FALLBACK,
  CYCLE_STATE_LABEL,
  DEADLINE_LINES_FALLBACK,
  SOS_CALENDAR_LABEL,
  SOS_CALENDAR_URL,
} from '../../../lib/election-cycles.mjs';

/* The short link, so every "Apply" on the site is one URL people can repeat
 * out loud. It is a 301 to the form (next.config.mjs). */
export const APPLY_PATH = '/apply';

function Row({ label, value }) {
  if (!value) return null;
  return (
    <div className="cycle-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function CycleCard({ cycle, screeningPath }) {
  const state = cycleState(cycle);
  const isOpen = state === 'open';
  /* Applications open 18 months out, so an open cycle's own deadline can be
     most of a year away. When a board review round is still ahead, that is the
     date a candidate can actually act on, and it goes first. It is not a gate:
     the form stays open until the deadline below it either way. */
  const reviewRound = isOpen ? nextReviewRound(cycle) : null;

  return (
    <li className={`cycle-card is-${state}`}>
      <p className="cycle-state">{CYCLE_STATE_LABEL[state]}</p>
      <h3 className="cycle-label">{cycle.label}</h3>

      <dl className="cycle-facts">
        <Row label="Election Day" value={cycleDate(cycle.election_date)} />
        {reviewRound && <Row label="Next board review" value={cycleDateTime(reviewRound)} />}
        {isOpen ? (
          <Row label="Applications close" value={cycleDateTime(cycle.applications_close_at)} />
        ) : state === 'upcoming' ? (
          <Row label="Applications open" value={cycleDate(cycle.applications_open_at)} />
        ) : (
          <Row label="Applications closed" value={cycleDateTime(cycle.applications_close_at)} />
        )}
        <Row label="Ohio petition filing deadline" value={cycleDateTime(filingDeadline(cycle))} />
      </dl>

      {cycle.carries_forward_to_label && (
        /* A race that holds no primary is not a race with no cycle. Saying so
           on the card is cheaper than answering it by email every spring. */
        <p className="cycle-carry">
          Races with no primary carry forward to the {cycle.carries_forward_to_label}.
        </p>
      )}

      {isOpen && (
        <Link
          href={`${screeningPath}?cycle=${encodeURIComponent(cycle.slug)}`}
          className="endorse-btn primary cycle-cta"
        >
          Apply for endorsement
        </Link>
      )}
    </li>
  );
}

/* The copy deck's application paragraph, with the year from the data.
 *
 * The literal fallbacks render only when the cycles could not be read. A
 * successful read with nothing open is a normal state (early voting has
 * started and the next cycle is not seeded yet, or staff closed the window
 * with an override), and it says so rather than printing dates for elections
 * the cards beneath call closed. */
function ApplicationCopy({ cycles, loadFailed }) {
  const year = loadFailed ? APPLICATION_YEAR_FALLBACK : applicationYear(cycles);
  const lines = loadFailed ? DEADLINE_LINES_FALLBACK : deadlineLines(cycles);

  if (!year) {
    return (
      <p className="lede">
        We are between application windows. Deadlines for every election are listed below.
      </p>
    );
  }

  return (
    <>
      <p className="lede">
        {year} municipal, township, school board, and special elections across Ohio. Our board
        decides after the filing deadline for your race.
      </p>
      <ul className="cycle-deadlines">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
        <li>Confirm your race&apos;s deadline with your county board of elections.</li>
      </ul>
      <p className="cycle-calendar">
        <a href={SOS_CALENDAR_URL} target="_blank" rel="noopener noreferrer">
          {SOS_CALENDAR_LABEL}
        </a>
      </p>
    </>
  );
}

export default function CycleList({ cycles, loadFailed, screeningPath }) {
  // A read that succeeded with no published cycle at all: nothing to say.
  if (!loadFailed && !(cycles || []).length) return null;
  const anyOpen = !loadFailed && (cycles || []).some((c) => c.is_open);

  return (
    <section className="endorse-cycles" aria-labelledby="cycles-title">
      <div className="endorse-cycles-head">
        <p className="eyebrow">Apply for Endorsement</p>
        <h2 id="cycles-title">Which elections we are taking applications for.</h2>
        <ApplicationCopy cycles={cycles} loadFailed={loadFailed} />
      </div>

      {loadFailed ? (
        <p className="cycle-empty">
          We could not load the application deadlines just now. Email{' '}
          <a href="mailto:zach@ohiopride.org">zach@ohiopride.org</a> and we will tell you where
          things stand.
        </p>
      ) : cycles.length ? (
        <ul className="cycle-grid">
          {cycles.map((cycle) => (
            <CycleCard key={cycle.id} cycle={cycle} screeningPath={screeningPath} />
          ))}
        </ul>
      ) : null}

      {(anyOpen || loadFailed) && (
        <p className="cycle-apply">
          <Link href={APPLY_PATH} className="endorse-btn primary">
            Apply for endorsement
          </Link>
        </p>
      )}

      <p className="cycle-doctrine">
        We do not endorse candidates who have not applied, and we do not take final endorsement
        action in any race until candidates are certified.
      </p>

      <p className="cycle-doctrine">
        Dates shown are the statewide deadlines set by the Ohio Secretary of State. Charter
        municipalities and county boards of elections set their own signature requirements and can
        vary certain deadlines. Candidates should confirm their own filing dates with their county
        board of elections.
      </p>
    </section>
  );
}
