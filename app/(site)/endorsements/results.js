/* Election results cards: the winners wall on /endorsements and the cards on
 * /endorsements/2026.
 *
 * Server rendered with no client JS. Every label (badge, seat, order) comes
 * from lib/endorsement-results.mjs, the same rules the home page, the profile
 * and the admin read, so a badge here can never disagree with one elsewhere.
 * Nothing in this file knows who won.
 *
 * Accessibility, as requirements:
 *
 *   - The portrait is a real image with the work order's alt text, "Portrait
 *     of {name}.", and it sits outside any aria-hidden element so it is
 *     announced.
 *   - The heading comes first in the source and the photo is moved above it
 *     with CSS order, so a screen reader jumping by heading hears the name,
 *     the seat, the result and the photo of ONE candidate before the next.
 *   - Each card has exactly one link. On the wall it is the name; on the
 *     results page it is "View profile", with the name added for screen
 *     readers so twenty links do not all read the same. Either way the link
 *     is stretched over the card with ::after, so the face is clickable
 *     without a second tab stop.
 *   - Type never sits on a face: the name, seat and badge are under the photo.
 */

import Link from 'next/link';
import { resultKey, seatLabel } from '../../../lib/endorsement-results.mjs';
import { ResultBadge } from './shared';

/** The cycle the results archive covers, and where it lives. */
export const RESULTS_CYCLE = 2026;
export const RESULTS_PATH = '/endorsements/2026';
/** Its name in a breadcrumb or an ItemList: the H1 without the period. */
export const RESULTS_CRUMB = '2026 endorsements and results';

const profileHref = (c) => `/endorsements/${c.slug}`;

function Portrait({ c }) {
  if (!c.portrait) {
    return (
      <div className="result-card-photo placeholder" aria-hidden="true">
        {String(c.name || '').trim().charAt(0).toUpperCase() || '?'}
      </div>
    );
  }
  return (
    <div className="result-card-photo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={c.portrait} alt={`Portrait of ${c.name}.`} loading="lazy" decoding="async" />
    </div>
  );
}

/**
 * One candidate. `profileLink` adds the "View profile" link (the results
 * page); without it the name is the link (the winners wall).
 */
export function ResultCard({ c, profileLink = false }) {
  const seat = seatLabel(c);
  return (
    <li className={`result-card is-${resultKey(c)}`}>
      <div className="result-card-body">
        <h3 className="result-card-name">
          {profileLink ? (
            c.name
          ) : (
            <Link className="result-card-link" href={profileHref(c)}>
              {c.name}
            </Link>
          )}
        </h3>
        {seat && <p className="result-card-seat">{seat}</p>}
        <ResultBadge c={c} />
        {profileLink && (
          <Link className="result-card-link result-card-more" href={profileHref(c)}>
            View profile
            <span className="endorse-sr-only">{` of ${c.name}`}</span>
          </Link>
        )}
      </div>
      <Portrait c={c} />
    </li>
  );
}

/** A list of cards, in the order given. `variant` is 'wall' or 'cards'. */
export function ResultGrid({ candidates, variant = 'wall' }) {
  return (
    <ul role="list" className={`result-grid is-${variant}`}>
      {candidates.map((c) => (
        <ResultCard key={c.id || c.slug} c={c} profileLink={variant === 'cards'} />
      ))}
    </ul>
  );
}

/**
 * "Elected with Ohio Pride." on /endorsements, directly under the hero. The
 * caller renders it only when the cycle has at least one winner, and passes
 * the winners already in ballot order (getEndorsementResults().won). The
 * count is the length of that list, so it can never disagree with the faces.
 */
export function WinnersSection({ winners }) {
  return (
    <section className="endorse-winners" aria-labelledby="winners-title">
      <div className="endorse-results-head">
        <h2 id="winners-title">Elected with Ohio Pride.</h2>
        <p className="lede">{`${winners.length} candidates we endorsed won on November 3, 2026.`}</p>
      </div>
      <ResultGrid candidates={winners} variant="wall" />
      <p className="endorse-results-more">
        <Link href={RESULTS_PATH} className="endorse-btn secondary">
          See 2026 results
        </Link>
      </p>
    </section>
  );
}
