// Shared vocab for the endorsements module. Status values mirror the live
// endorsement_applications CHECK constraint; votes mirror endorsement_reviews.
export const STATUS_ORDER = ['submitted', 'under_review', 'endorsed', 'declined', 'withdrawn'];
export const STATUS_LABEL = {
  submitted: 'Submitted', under_review: 'Under review', endorsed: 'Endorsed',
  declined: 'Declined', withdrawn: 'Withdrawn',
};
export const PATH_LABEL = { statewide: 'Statewide', federal: 'Federal', local: 'Local', judicial: 'Judicial' };

/* The race levels, in the order a ballot runs: statewide down to the local
 * board. These are labels only. Whether a level is reviewed descriptive-only
 * is decided by requires_descriptive_only() in SQL and reaches the queue as
 * the computed `descriptive_only` column, so the rule is never restated here.
 * Keep in step with the public.race_level enum. */
export const RACE_LEVEL_ORDER = [
  'statewide_executive',
  'us_congress',
  'general_assembly',
  'state_board_of_education',
  'judicial_appellate',
  'judicial_trial',
  'county',
  'municipal',
  'township',
  'school_board',
];

export const RACE_LEVEL_LABEL = {
  statewide_executive: 'Statewide executive',
  us_congress: 'U.S. Congress',
  general_assembly: 'General Assembly',
  state_board_of_education: 'State Board of Education',
  judicial_appellate: 'Judicial, appellate',
  judicial_trial: 'Judicial, trial',
  county: 'County',
  municipal: 'Municipal',
  township: 'Township',
  school_board: 'School board',
};
// A board vote is a decision, not a temperature: endorse, decline, or abstain.
// The words match the statuses the vote drives (endorsed / declined). Anything
// a member wants to say beyond the three goes in the recommendation line.
export const VOTE_ORDER = ['endorse', 'decline', 'abstain'];
export const VOTE_LABEL = { endorse: 'Endorse', decline: 'Decline', abstain: 'Abstain' };

// The private bucket the application form and the candidate page share.
// Policies: anon may only insert under submissions/<application id>/, reads
// need endorsements:read, and staff uploads go under staff/<application id>/.
export const PHOTO_BUCKET = 'endorsement-photos';

export function tallyOf(reviews) {
  const t = { endorse: 0, decline: 0, abstain: 0 };
  for (const r of reviews) {
    if (r.vote === 'endorse') t.endorse++;
    else if (r.vote === 'decline') t.decline++;
    else t.abstain++;
  }
  return t;
}
