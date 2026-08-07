// Shared vocab for the endorsements module. Status values mirror the live
// endorsement_applications CHECK constraint; votes mirror endorsement_reviews.
export const STATUS_ORDER = ['submitted', 'under_review', 'endorsed', 'declined', 'withdrawn'];
export const STATUS_LABEL = {
  submitted: 'Submitted', under_review: 'Under review', endorsed: 'Endorsed',
  declined: 'Declined', withdrawn: 'Withdrawn',
};
export const PATH_LABEL = { statewide: 'Statewide', federal: 'Federal', local: 'Local', judicial: 'Judicial' };
// A board vote is a decision, not a temperature. Anything a member wants to
// say beyond yes/no/abstain goes in the recommendation line next to the vote.
export const VOTE_ORDER = ['yes', 'no', 'abstain'];
export const VOTE_LABEL = { yes: 'Yes', no: 'No', abstain: 'Abstain' };

export function tallyOf(reviews) {
  const t = { yes: 0, no: 0, abstain: 0 };
  for (const r of reviews) {
    if (r.vote === 'yes') t.yes++;
    else if (r.vote === 'no') t.no++;
    else t.abstain++;
  }
  return t;
}
