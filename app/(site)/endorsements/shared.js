/* Bits the grid (client), the profile and the results pages (server) render.
 * No hooks and no 'use client', so it can be imported from either side. The
 * one import, lib/endorsement-results.mjs, is import-free for the same
 * reason. */

import { resultBadge, resultKey } from '../../../lib/endorsement-results.mjs';

const Check = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="3,8 7,12 13,4" />
  </svg>
);

export function EndorsedPill() {
  return (
    <span className="endorsed-pill">
      <Check />
      Endorsed by Ohio Pride PAC
    </span>
  );
}

/* The election result as a badge: Elected, Re-elected, Not elected, or Result
 * pending. The words come from lib/endorsement-results.mjs, the same rule the
 * home page, the profile and the admin use. Elected and Re-elected are Light
 * Blue with the check; Not elected and Result pending share one neutral style
 * (pending is dashed). Never red: a race we lost is not a mark against the
 * candidate. The label is always printed, so colour is never the only cue. */
export function ResultBadge({ c }) {
  const key = resultKey(c);
  return (
    <span className={`result-badge is-${key}`}>
      {key === 'won' && <Check />}
      {resultBadge(c)}
    </span>
  );
}

/* The "could not load" state. One copy of it, so the grid and the results
 * page say the same thing when Supabase does not answer, and neither ever
 * renders a zero it did not read. */
export function LoadFailed({ retryHref }) {
  return (
    <div className="endorse-state error">
      <h2>We couldn&apos;t load endorsements</h2>
      <p>
        There was a problem fetching the latest endorsement list. Please refresh the page or try
        again in a moment.
      </p>
      <a className="btn-action" href={retryHref}>
        Try again
      </a>
    </div>
  );
}

/* The card teaser. Editorial summary when someone has written one, otherwise
 * the candidate's own bio, trimmed. The full bio still renders on the profile;
 * this is the trailer, not a second copy of the film. */
export function cardTeaser(candidate) {
  const summary = candidate.content?.summary;
  if (summary) return summary;
  if (!candidate.bio) return null;
  const flat = candidate.bio.replace(/\s+/g, ' ').trim();
  if (flat.length <= 220) return flat;
  const cut = flat.slice(0, 220);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:.]$/, '')}…`;
}
