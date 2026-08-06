// Shared vocab for the endorsements module. Status values mirror the live
// endorsement_applications CHECK constraint; votes mirror endorsement_reviews.
export const STATUS_ORDER = ['submitted', 'under_review', 'endorsed', 'declined', 'withdrawn'];
export const STATUS_LABEL = {
  submitted: 'Submitted', under_review: 'Under review', endorsed: 'Endorsed',
  declined: 'Declined', withdrawn: 'Withdrawn',
};
export const PATH_LABEL = { statewide: 'Statewide', federal: 'Federal', local: 'Local', judicial: 'Judicial' };
export const VOTE_ORDER = ['endorse', 'lean_endorse', 'neutral', 'lean_decline', 'decline', 'abstain', 'recuse'];
export const VOTE_LABEL = {
  endorse: 'Endorse', lean_endorse: 'Lean endorse', neutral: 'Neutral',
  lean_decline: 'Lean decline', decline: 'Decline', abstain: 'Abstain', recuse: 'Recuse',
};

export function tallyOf(reviews) {
  const t = { for: 0, against: 0, other: 0 };
  for (const r of reviews) {
    if (r.vote === 'endorse' || r.vote === 'lean_endorse') t.for++;
    else if (r.vote === 'decline' || r.vote === 'lean_decline') t.against++;
    else t.other++;
  }
  return t;
}
