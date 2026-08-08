/* Bits both the grid (client) and the profile (server) render. No hooks and no
 * 'use client', so it can be imported from either side. */

export function EndorsedPill() {
  return (
    <span className="endorsed-pill">
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
      Endorsed by Ohio Pride PAC
    </span>
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
