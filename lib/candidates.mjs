/* =============================================================================
 * Race to 100: the vocabulary and read path for 2027 candidate recruitment.
 * -----------------------------------------------------------------------------
 * Shared by the public target race list (/2027/races), the recruitment form
 * (/candidate-apply), its API, and the admin module (/admin/candidate). Every
 * label a person reads for a tier, a status, a help topic or a filing wave is
 * defined once here so the public page and the console cannot drift apart.
 *
 * Copy rules that apply to everything in this file and everything that reads
 * it: "out" (never the o-word the style guide bans); "only statewide LGBTQ+ PAC", never "first"; no em
 * or en dashes; no disclaimer beyond the one the site footer carries.
 *
 * Plain ESM with no imports beyond the connection values, so server pages,
 * client components and node tests can all use it.
 *
 * Shapes (JSDoc stands in for the TypeScript types the work order named; the
 * repo is JavaScript by decision, see docs/nextjs-migration.md):
 *
 * @typedef {'protect'|'opportunity'|'pickup'|'pipeline'} TargetRaceTier
 * @typedef {'new'|'contacted'|'matched'|'in_program'|'referred_to_endorsement'|'closed'} CandidateAppStatus
 * @typedef {'petitions'|'filing'|'campaign_plan'|'fundraising'|'messaging'|'compliance'|'field'|'digital'|'mentor'|'endorsement_process'|'other'} HelpNeeded
 *
 * @typedef {object} TargetRace
 * @property {string} id
 * @property {number} election_year
 * @property {number} rank
 * @property {TargetRaceTier} tier
 * @property {string} slug
 * @property {string} jurisdiction
 * @property {string|null} county
 * @property {string} region
 * @property {string} office
 * @property {number} seats
 * @property {string|null} race_level
 * @property {string|null} ballot_path
 * @property {string|null} incumbent_name
 * @property {boolean} incumbent_is_out
 * @property {boolean} is_open_seat
 * @property {string|null} lean
 * @property {string|null} filing_deadline  YYYY-MM-DD or null
 * @property {string|null} filing_deadline_note
 * @property {string|null} rationale
 * @property {boolean} needs_verification
 * @property {string} recruit_status
 *
 * @typedef {object} PreviousRace
 * @property {string} office
 * @property {number|null} year
 * @property {'won'|'lost'|'primary_loss'|'withdrew'|'unopposed'|''} result
 * @property {number|null} vote_share
 * @property {string} notes
 *
 * @typedef {object} CandidateApplication
 * @property {string} id
 * @property {string} created_at
 * @property {CandidateAppStatus} status
 * @property {string} status_changed_at
 * @property {string} first_name
 * @property {string} last_name
 * @property {string|null} pronouns
 * @property {string} email
 * @property {string|null} phone
 * @property {string|null} city
 * @property {string|null} county
 * @property {string|null} zip
 * @property {'yes'|'no'|'prefer_not_to_say'|null} is_out
 * @property {string|null} party
 * @property {string|null} target_race_id
 * @property {string|null} race_other
 * @property {string|null} office_sought
 * @property {string|null} jurisdiction
 * @property {string|null} race_level
 * @property {string|null} ballot_path
 * @property {string|null} cycle_id
 * @property {boolean|null} has_filed
 * @property {string|null} previous_offices
 * @property {PreviousRace[]} previous_races
 * @property {'none'|'helped_circulate'|'circulated_own'|'managed_drive'|null} signature_experience
 * @property {string|null} signature_experience_note
 * @property {HelpNeeded[]} help_needed
 * @property {string|null} help_other
 * @property {string|null} why_running
 * @property {string|null} anything_else
 * @property {boolean} consent_contact
 * @property {boolean} consent_share_with_mentors
 * @property {string|null} contact_id
 * @property {string|null} endorsement_application_id
 * @property {string|null} assigned_to
 * @property {string|null} mentor_network_contact_id
 * @property {string|null} mentor_name
 * @property {'low'|'normal'|'high'|'urgent'|null} priority
 * @property {string|null} next_action
 * @property {string|null} next_action_date
 * @property {string|null} internal_notes
 *
 * @typedef {object} CandidateActivity
 * @property {string} id
 * @property {string} created_at
 * @property {string} application_id
 * @property {string|null} actor_email
 * @property {'note'|'status_change'|'assignment'|'mentor_match'|'call'|'email'|'meeting'|'referral'} kind
 * @property {string|null} body
 * ========================================================================== */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-public.mjs';

export const ET = 'America/New_York';

/** Where the two calls to action go. */
export const APPLY_PATH = '/candidate-apply';
export const RACES_PATH = '/2027/races';
export const ENDORSEMENT_PATH = '/endorsement/screening';

/* ── Tiers ─────────────────────────────────────────────────────────────── */

/** Tier order on the public page and the admin scoreboard. */
export const TIER_ORDER = ['protect', 'opportunity', 'pickup', 'pipeline'];

/** The short word on a card tag and a filter chip. Never the enum value. */
export const TIER_LABEL = {
  protect: 'Protect',
  opportunity: 'Open Seats',
  pickup: 'Competitive',
  pipeline: 'Pipeline',
};

/** Section heading and intro on /2027/races. */
export const TIER_SECTION = {
  protect: {
    title: 'Protect',
    intro: 'Out LGBTQ+ Ohioans already serving. We keep them in office.',
  },
  opportunity: {
    title: 'Open Seats and Marquee Races',
    intro: 'High-impact seats where a pro-equality candidate can win.',
  },
  pickup: {
    title: 'Competitive Pickups',
    intro: 'Purple cities and suburbs where the right candidate flips the seat.',
  },
  pipeline: {
    title: 'Pipeline and Stretch',
    intro: 'Townships, villages, and school boards that build the bench.',
  },
};

/* ── Regions ───────────────────────────────────────────────────────────── */

export const REGION_ORDER = ['Northeast', 'Northwest', 'Central', 'Southwest', 'Southeast'];

/* ── Office type (derived, never stored) ───────────────────────────────── */

export const OFFICE_TYPE_ORDER = ['mayor', 'council', 'school_board', 'township', 'judge', 'other'];
export const OFFICE_TYPE_LABEL = {
  mayor: 'Mayor',
  council: 'Council',
  school_board: 'School Board',
  township: 'Township',
  judge: 'Judge',
  other: 'Other',
};

/**
 * Which filter chip a race answers to. Derived from race_level first, and from
 * the office text for municipal seats, so "Mayor and Council" counts as a
 * mayoral race and "Council At-Large" as a council race.
 */
export function officeTypeOf(race) {
  const level = race?.race_level || '';
  const office = String(race?.office || '').toLowerCase();
  if (level === 'judicial_trial' || level === 'judicial_appellate' || /\bjudge\b/.test(office)) return 'judge';
  if (level === 'school_board' || /board of education|school board|governing board/.test(office)) return 'school_board';
  if (level === 'township' || /trustee|fiscal officer/.test(office)) return 'township';
  if (/\bmayor\b/.test(office)) return 'mayor';
  if (/council|commission|president of council/.test(office)) return 'council';
  return 'other';
}

/* ── Ballot path ───────────────────────────────────────────────────────── */

/** Plain words for the ballot_path enum, as the card tag reads them. */
export const BALLOT_PATH_LABEL = {
  party_petition: 'Partisan',
  nonpartisan: 'Nonpartisan',
  independent: 'Petition',
  write_in: 'Write-in',
};

/** The race_level values a candidate can pick when their race is not listed. */
export const RACE_LEVEL_OPTIONS = [
  ['municipal', 'City or village (mayor, council, auditor)'],
  ['school_board', 'School board'],
  ['township', 'Township (trustee, fiscal officer)'],
  ['county', 'County office'],
  ['judicial_trial', 'Judge, trial court'],
  ['judicial_appellate', 'Judge, court of appeals'],
  ['general_assembly', 'Ohio House or Senate'],
  ['state_board_of_education', 'State Board of Education'],
  ['us_congress', 'U.S. Congress'],
  ['statewide_executive', 'Statewide office'],
];

export const BALLOT_PATH_OPTIONS = [
  ['nonpartisan', 'Nonpartisan (petition, no party primary)'],
  ['party_petition', 'Partisan (party primary)'],
  ['independent', 'Independent petition'],
  ['write_in', 'Write-in'],
];

/* ── Dates ─────────────────────────────────────────────────────────────── */

/* A DATE column is a calendar day, not an instant. filing_deadline and
 * election_date are DATE; petition_filing_deadline is a timestamptz. Bare
 * dates are printed in UTC so "2027-02-03" never reads as February 2, and
 * real timestamps are converted to Eastern time. */
const BARE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDate(value) {
  if (!value) return null;
  const bare = BARE_DATE.exec(String(value));
  const d = bare ? new Date(Date.UTC(+bare[1], +bare[2] - 1, +bare[3])) : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return { d, tz: bare ? 'UTC' : ET };
}

/** "Feb 3, 2027". */
export function shortDate(value) {
  const p = parseDate(value);
  if (!p) return null;
  return p.d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: p.tz });
}

/** "February 3". The chip label for a filing wave. */
export function monthDay(value) {
  const p = parseDate(value);
  if (!p) return null;
  return p.d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: p.tz });
}

/** "2027-02-03" for any date-like value, in the zone that applies to it. */
export function isoDay(value) {
  const p = parseDate(value);
  if (!p) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: p.tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(p.d);
}

/** The one line on a race card about when petitions are due. */
export function filingLine(race) {
  const when = shortDate(race?.filing_deadline);
  return when ? `File by ${when}` : 'Filing date to be confirmed';
}

/**
 * Which filing wave a race belongs to, as a filter key. The key is the day
 * itself ("2027-02-03") so the chips are built from whatever dates the data
 * holds; "tbc" is the group with no confirmed date.
 */
export function filingWaveOf(race) {
  return isoDay(race?.filing_deadline) || 'tbc';
}

export const FILING_TBC_LABEL = 'Date to be confirmed';

/* ── Key dates ─────────────────────────────────────────────────────────── */

/**
 * The four 2027 dates a candidate needs, read from election_cycles rather
 * than typed in. Order is chronological. Each card is { date, label, note }.
 * Dates are DATE or timestamptz values from the rows, never literals.
 */
export function keyDatesFrom(cycles) {
  const bySlug = Object.fromEntries((cycles || []).map((c) => [c.slug, c]));
  const primary = bySlug['2027-primary'];
  const general = bySlug['2027-general'];
  const out = [];
  if (primary?.petition_filing_deadline) {
    out.push({
      key: 'primary-filing',
      date: primary.petition_filing_deadline,
      label: 'Petition filing',
      note: 'Partisan primaries, Columbus, Toledo, Dayton, and Franklin County Municipal Court',
    });
  }
  if (primary?.election_date) {
    out.push({ key: 'primary', date: primary.election_date, label: 'Primary', note: 'Primary Election Day' });
  }
  if (general?.petition_filing_deadline) {
    out.push({
      key: 'general-filing',
      date: general.petition_filing_deadline,
      label: 'Petition filing',
      note: 'Most school boards, townships, and nonpartisan councils',
    });
  }
  if (general?.election_date) {
    out.push({ key: 'general', date: general.election_date, label: 'General Election', note: 'Election Day' });
  }
  return out;
}

/* ── Candidate application vocabulary ──────────────────────────────────── */

export const STATUS_ORDER = ['new', 'contacted', 'matched', 'in_program', 'referred_to_endorsement', 'closed'];
export const STATUS_LABEL = {
  new: 'New',
  contacted: 'Contacted',
  matched: 'Matched with a mentor',
  in_program: 'In program',
  referred_to_endorsement: 'Referred to endorsement',
  closed: 'Closed',
};

export const PRIORITY_ORDER = ['low', 'normal', 'high', 'urgent'];

export const RECRUIT_STATUS_ORDER = ['open', 'recruiting', 'candidate_identified', 'filed', 'endorsed', 'closed'];
export const RECRUIT_STATUS_LABEL = {
  open: 'Open',
  recruiting: 'Recruiting',
  candidate_identified: 'Candidate identified',
  filed: 'Filed',
  endorsed: 'Endorsed',
  closed: 'Closed',
};

/** The help topics, in form order. Keys are what help_needed stores. */
export const HELP_OPTIONS = [
  ['petitions', 'Petitions and signature collection'],
  ['filing', 'Filing deadlines and paperwork'],
  ['campaign_plan', 'Campaign plan and timeline'],
  ['fundraising', 'Fundraising'],
  ['messaging', 'Messaging and communications'],
  ['compliance', 'Campaign finance and CFOFS compliance'],
  ['field', 'Door knocking and field program'],
  ['digital', 'Website and social media'],
  ['mentor', 'A mentor who has won a similar race'],
  ['endorsement_process', 'Understanding the endorsement process'],
  ['other', 'Something else'],
];
export const HELP_LABEL = Object.fromEntries(HELP_OPTIONS);
export const HELP_KEYS = HELP_OPTIONS.map(([k]) => k);

export const SIGNATURE_OPTIONS = [
  ['none', 'I have never collected signatures'],
  ['helped_circulate', 'I have helped circulate petitions for someone else'],
  ['circulated_own', 'I have circulated my own petitions'],
  ['managed_drive', 'I have managed a signature drive'],
];
export const SIGNATURE_LABEL = Object.fromEntries(SIGNATURE_OPTIONS);

export const RACE_RESULT_OPTIONS = [
  ['won', 'Won'],
  ['lost', 'Lost general'],
  ['primary_loss', 'Lost primary'],
  ['withdrew', 'Withdrew'],
  ['unopposed', 'Unopposed'],
];
export const RACE_RESULT_LABEL = Object.fromEntries(RACE_RESULT_OPTIONS);

export const IS_OUT_OPTIONS = [
  ['yes', 'Yes'],
  ['no', 'No'],
  ['prefer_not_to_say', 'Prefer not to say'],
];
export const IS_OUT_LABEL = Object.fromEntries(IS_OUT_OPTIONS);

export const PARTY_OPTIONS = ['Democrat', 'Republican', 'Independent', 'Nonpartisan', 'Other'];

export const ACTIVITY_KIND_LABEL = {
  note: 'Note',
  status_change: 'Status change',
  assignment: 'Assignment',
  mentor_match: 'Mentor match',
  call: 'Call',
  email: 'Email',
  meeting: 'Meeting',
  referral: 'Referral',
};
/** The kinds a person can pick when adding a note by hand. */
export const MANUAL_ACTIVITY_KINDS = ['note', 'call', 'email', 'meeting'];

/** The name of the race an application is for, listed or not. */
export function applicationRaceLabel(app) {
  const race = app?.target_race;
  if (race?.jurisdiction) return `${race.jurisdiction}: ${race.office}`;
  if (app?.race_other) return app.race_other;
  const parts = [app?.jurisdiction, app?.office_sought].filter(Boolean);
  return parts.length ? parts.join(': ') : 'Race not given';
}

/** "Columbus: City Council District 9 (file by Feb 3, 2027)". */
export function raceOptionLabel(race) {
  const when = shortDate(race?.filing_deadline);
  return `${race.jurisdiction}: ${race.office} (${when ? `file by ${when}` : 'filing date to be confirmed'})`;
}

/* ── Slugs ─────────────────────────────────────────────────────────────── */

/** "Grove City" + "Council Ward 4" -> "grove-city-council-ward-4". */
export function raceSlug(jurisdiction, office) {
  return [jurisdiction, office]
    .map((s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, ' '))
    .join(' ')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-|-$/g, '');
}

/* ── Read ──────────────────────────────────────────────────────────────── */

export const RACE_COLUMNS =
  'id,election_year,rank,tier,slug,jurisdiction,county,region,office,seats,race_level,' +
  'ballot_path,incumbent_name,incumbent_is_out,is_open_seat,lean,filing_deadline,' +
  'filing_deadline_note,rationale,needs_verification,recruit_status';

/**
 * Every public, vetted target race in rank order. Reads the view with the
 * anon key; never throws, so a Supabase blip renders an empty list rather
 * than a 500 on a page candidates reach from a social post.
 *
 * @returns {Promise<{ok: boolean, races: TargetRace[]}>}
 */
export async function getTargetRaces({ revalidate = 300 } = {}) {
  const query = new URLSearchParams({ select: RACE_COLUMNS, order: 'rank.asc' });
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/public_target_races?${query}`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        accept: 'application/json',
      },
      next: { revalidate },
    });
    if (!res.ok) throw new Error(`public_target_races responded ${res.status}`);
    const rows = await res.json();
    return { ok: true, races: Array.isArray(rows) ? rows : [] };
  } catch (err) {
    console.error('Failed to load target races:', err);
    return { ok: false, races: [] };
  }
}
