// Shared constants and pure helpers for the scorecard module.
// The vote resolver and the publish-state comparison mirror
// public.resolve_legislator_vote() and compute_legislator_scorecard()
// exactly, so the console shows the same grade the database will publish.

export const GRADE_RANK = { 'A+': 6, A: 5, 'A-': 4.5, B: 4, C: 3, D: 2, F: 1 };

export const STAGE_LABEL = {
  introduce: 'Introduce', amend: 'Amend', committee: 'Committee',
  pass: 'Floor passage', concur: 'Concurrence', override: 'Veto override',
};

export const FLOOR_STAGES = ['pass', 'concur', 'override'];
export const CMTE_STAGES = ['committee'];

export const STAGE_OPTIONS = [
  { value: 'committee', label: 'Committee report' },
  { value: 'pass', label: 'Floor passage' },
  { value: 'concur', label: 'Concurrence' },
  { value: 'override', label: 'Veto override' },
  { value: 'amend', label: 'Floor amendment' },
  { value: 'introduce', label: 'Introduce' },
];

export const VOTE_OPTIONS = ['Y', 'N', 'NV', 'E'];

export const VOTE_LABEL = { Y: 'Yes', N: 'No', NV: 'Did not vote', E: 'Excused' };

export const GRADE_SCALE = [
  { grade: 'A+', range: '95 to 100', label: 'Champion' },
  { grade: 'A', range: '88 to 94', label: 'Strong ally' },
  { grade: 'A-', range: '78 to 87', label: 'Reliable ally' },
  { grade: 'B', range: '60 to 77', label: 'Supportive' },
  { grade: 'C', range: '38 to 59', label: 'Mixed record' },
  { grade: 'D', range: '18 to 37', label: 'Unfriendly' },
  { grade: 'F', range: '0 to 17', label: 'Hostile' },
];

export const PUBLISH_STATES = [
  { key: '', label: 'All publish states' },
  { key: 'dirty', label: 'Has draft changes' },
  { key: 'unpub', label: 'Never published' },
  { key: 'clean', label: 'Up to date' },
];

export const PUBLISH_LABEL = {
  clean: 'Published',
  dirty: 'Draft changes',
  unpub: 'Never published',
};

export const PUBLISH_BADGE = {
  clean: 'badge badge-ok',
  dirty: 'badge badge-warn',
  unpub: 'badge badge-bad',
};

export function titleCase(s) {
  return String(s || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

export function partyName(p) {
  return p === 'D' ? 'Democratic' : p === 'R' ? 'Republican' : p === 'I' ? 'Independent' : p;
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtScore(s) {
  if (s == null || s === '') return null;
  const n = Number(s);
  return isNaN(n) ? null : Math.round(n * 10) / 10;
}

// Canonical grades from compute_legislator_score() are A+, A, A-, B, C, D, F.
// Anything else is treated as ungraded.
export function gradeClass(g) {
  switch (g) {
    case 'A+': return 'lg-grade-aplus';
    case 'A': return 'lg-grade-a';
    case 'A-': return 'lg-grade-aminus';
    case 'B': return 'lg-grade-b';
    case 'C': return 'lg-grade-c';
    case 'D': return 'lg-grade-d';
    case 'F': return 'lg-grade-f';
    default: return 'lg-grade-na';
  }
}

// Mirrors public.resolve_legislator_vote: with no recorded exception a member
// is assumed to have voted the party line for or against the bill stance.
export function defaultVoteFor(party, stance) {
  if (stance === 'anti') {
    if (party === 'R') return 'Y';
    if (party === 'D') return 'N';
    return 'NV';
  }
  if (stance === 'pro') {
    if (party === 'R') return 'N';
    if (party === 'D') return 'Y';
    return 'NV';
  }
  return 'NV';
}

// Exceptions key off (chamber, district, roll_call_id), not legislator id.
export function findException(exceptions, rollCallId, chamber, district) {
  for (const e of exceptions) {
    if (e.roll_call_id === rollCallId && e.chamber === chamber
        && Number(e.district) === Number(district)) {
      return e;
    }
  }
  return null;
}

export function resolveVote(legislator, rc, exceptions) {
  if (!rc || rc.chamber !== legislator.chamber) return { vote: '-', exception: null };
  const exc = findException(exceptions, rc.id, legislator.chamber, legislator.district);
  if (exc) return { vote: exc.vote, exception: exc };
  return { vote: defaultVoteFor(legislator.party, rc.stance), exception: null };
}

export function rollCallsFor(rollCalls, chamber, stages) {
  return rollCalls
    .filter((rc) => rc.chamber === chamber && stages.indexOf(rc.stage) !== -1)
    .sort((a, b) => new Date(b.vote_date || 0) - new Date(a.vote_date || 0));
}

export function activeBills(bills) {
  return bills
    .slice()
    .sort((a, b) => (a.display_order || 999) - (b.display_order || 999));
}

// clean = the live math matches the current snapshot, dirty = the public site
// is behind, unpub = nothing has ever been published for this member.
export function publishStateOf(draft, snap) {
  if (!snap) return 'unpub';
  if (!draft) return 'clean';
  const same =
    Number(draft.total_score) === Number(snap.total_score) &&
    draft.grade === snap.grade &&
    Number(draft.floor_score) === Number(snap.floor_score) &&
    Number(draft.committee_score) === Number(snap.committee_score) &&
    Number(draft.sponsorship_score) === Number(snap.sponsorship_score);
  return same ? 'clean' : 'dirty';
}
