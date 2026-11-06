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

/* Election results, admin side. The values mirror the endorsement_result_valid
 * check constraint; '' is "Not set" and saves as null (endorsed, race not held
 * or not called yet). The public words (Elected, Re-elected, Not elected,
 * Result pending) come from resultBadge() in lib/endorsement-results.mjs, so
 * the admin and the site can never disagree about what a result reads as.
 * These labels are only for the control that records one. */
export const RESULT_ORDER = ['', 'pending', 'won', 'lost'];
export const RESULT_ADMIN_LABEL = {
  '': 'Not set', pending: 'Result pending', won: 'Elected', lost: 'Not elected',
};

/* The badge a recorded result wears in the admin. Elected and Re-elected are
 * light blue, Not elected is neutral (never the red badge-bad), pending is
 * amber. The theme's badge-review text (#B7791F on #FDF3E7) is about 3.3:1,
 * under the 4.5:1 the results work asks for, so the pending badge darkens its
 * text to #8A5A12 (5.4:1). Drop the override once badge-review is darkened in
 * admin-theme.css. */
export const RESULT_BADGE = {
  won: { className: 'badge badge-founding' },
  lost: { className: 'badge badge-muted' },
  pending: { className: 'badge badge-review', style: { color: '#8A5A12' } },
};

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
