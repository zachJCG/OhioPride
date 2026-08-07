// Shared vocab for the endorsements module. Status values mirror the live
// endorsement_applications CHECK constraint; votes mirror endorsement_reviews.
export const STATUS_ORDER = ['submitted', 'under_review', 'endorsed', 'declined', 'withdrawn'];
export const STATUS_LABEL = {
  submitted: 'Submitted', under_review: 'Under review', endorsed: 'Endorsed',
  declined: 'Declined', withdrawn: 'Withdrawn',
};
export const PATH_LABEL = { statewide: 'Statewide', federal: 'Federal', local: 'Local', judicial: 'Judicial' };
// A board vote is a decision, not a temperature: endorse, decline, or abstain.
// The words match the statuses the vote drives (endorsed / declined). Anything
// a member wants to say beyond the three goes in the recommendation line.
export const VOTE_ORDER = ['endorse', 'decline', 'abstain'];
export const VOTE_LABEL = { endorse: 'Endorse', decline: 'Decline', abstain: 'Abstain' };

export function tallyOf(reviews) {
  const t = { endorse: 0, decline: 0, abstain: 0 };
  for (const r of reviews) {
    if (r.vote === 'endorse') t.endorse++;
    else if (r.vote === 'decline') t.decline++;
    else t.abstain++;
  }
  return t;
}
