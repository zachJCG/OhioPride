/* The "Apply for Endorsement" section of /endorsements.
 *
 * One card per published election cycle, in three states. The state is read
 * from `is_open` on the view, which the database computes with the same
 * function the insert policy uses, so a card can never invite an application
 * the database would refuse.
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
  cycleDate,
  cycleDateTime,
  cycleState,
  CYCLE_STATE_LABEL,
} from '../../../lib/election-cycles.mjs';

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

  return (
    <li className={`cycle-card is-${state}`}>
      <p className="cycle-state">{CYCLE_STATE_LABEL[state]}</p>
      <h3 className="cycle-label">{cycle.label}</h3>
      {cycle.jurisdiction && cycle.jurisdiction !== 'Statewide' && (
        <p className="cycle-jurisdiction">{cycle.jurisdiction}</p>
      )}

      <dl className="cycle-facts">
        <Row label="Election Day" value={cycleDate(cycle.election_date)} />
        {isOpen ? (
          <Row label="Applications due" value={cycleDateTime(cycle.applications_close_at)} />
        ) : state === 'upcoming' ? (
          <Row label="Applications open" value={cycleDate(cycle.applications_open_at)} />
        ) : (
          <Row label="Applications closed" value={cycleDateTime(cycle.applications_close_at)} />
        )}
        <Row label="Ohio filing deadline" value={cycleDateTime(cycle.filing_deadline)} />
      </dl>

      {isOpen && (
        <Link
          href={`${screeningPath}?cycle=${encodeURIComponent(cycle.slug)}`}
          className="endorse-btn primary cycle-cta"
        >
          Apply for Endorsement
        </Link>
      )}
    </li>
  );
}

export default function CycleList({ cycles, loadFailed, screeningPath }) {
  if (loadFailed) {
    return (
      <section className="endorse-cycles" aria-labelledby="cycles-title">
        <div className="endorse-cycles-head">
          <p className="eyebrow">Apply for Endorsement</p>
          <h2 id="cycles-title">Which elections we are taking applications for.</h2>
        </div>
        <p className="cycle-empty">
          We could not load the application deadlines just now. Email{' '}
          <a href="mailto:zach@ohiopride.org">zach@ohiopride.org</a> and we will tell you where
          things stand.
        </p>
      </section>
    );
  }

  if (!cycles.length) return null;

  return (
    <section className="endorse-cycles" aria-labelledby="cycles-title">
      <div className="endorse-cycles-head">
        <p className="eyebrow">Apply for Endorsement</p>
        <h2 id="cycles-title">Which elections we are taking applications for.</h2>
        <p className="lede">
          Every election we endorse in has its own application window. Deadlines below are Eastern
          time.
        </p>
      </div>

      <ul className="cycle-grid">
        {cycles.map((cycle) => (
          <CycleCard key={cycle.id} cycle={cycle} screeningPath={screeningPath} />
        ))}
      </ul>

      <p className="cycle-doctrine">
        We do not endorse candidates who have not applied, and we do not take final endorsement
        action in any race until after the filing deadline has passed.
      </p>
    </section>
  );
}
