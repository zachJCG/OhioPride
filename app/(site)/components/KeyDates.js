/* The 2027 key dates strip. Shared by /2027/races and the /candidate-apply
 * success screen so a candidate sees the same four dates in both places.
 *
 * Every date comes from election_cycles through keyDatesFrom(); nothing here
 * is typed in. A cycle row that is missing a date simply drops its card
 * rather than showing a guess. Server safe: no hooks, no browser APIs. */

import { isoDay, keyDatesFrom, shortDate } from '../../../lib/candidates.mjs';
import './key-dates.css';

export default function KeyDates({ cycles, heading = '2027 key dates', compact = false }) {
  const dates = keyDatesFrom(cycles);
  if (!dates.length) return null;
  return (
    <section className={`keydates${compact ? ' is-compact' : ''}`} aria-labelledby="keydates-title">
      <h2 id="keydates-title" className="keydates-title">{heading}</h2>
      <ol className="keydates-list">
        {dates.map((d) => (
          <li key={d.key} className="keydates-card">
            <time className="keydates-date" dateTime={isoDay(d.date)}>{shortDate(d.date)}</time>
            <span className="keydates-label">{d.label}</span>
            <span className="keydates-note">{d.note}</span>
          </li>
        ))}
      </ol>
      <p className="keydates-foot">All times Eastern. Confirm your own deadline with your county board of elections.</p>
    </section>
  );
}
