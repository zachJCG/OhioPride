/* =============================================================================
 * Endorsements: the shared read path for the public pages.
 * -----------------------------------------------------------------------------
 * One place that knows how to turn `public_endorsements` rows into the objects
 * app/(site)/endorsements renders, so the grid and the profile page can never
 * disagree about a candidate's slug, office level, or endorsement date.
 *
 * Reads the view with the anon key rather than the service role: every column
 * the view exposes is already public, and the anon key has a literal fallback
 * in lib/supabase-public.mjs, so this cannot be taken down by an unset env var
 * the way the admin was on 2026-08-06.
 *
 * The view is the only public surface. Since 2026-08-08 anon has no SELECT on
 * endorsement_applications at all, so nothing here can leak a campaign email,
 * a signature, a disclosure, or an endorsement that has not been announced.
 * ========================================================================== */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-public.mjs';
import { contentFor } from './endorsement-content.mjs';
import { slugify } from './endorsement-slug.mjs';

export { slugify };

/* How an Ohio Pride endorsement actually happens. Rendered on /endorsements,
 * on the application form, and on the confirmation page, so a candidate reads
 * the same four steps wherever they land.
 *
 * There is no interview step. The Screening Committee works from the
 * application and the public record; keep it that way in every surface that
 * describes this process, including endorsement_path_meta.process_note in
 * Supabase, which the application form renders per office type. */
export const ENDORSEMENT_PROCESS = [
  {
    n: 1,
    title: 'You apply',
    body:
      'Candidates for federal, state, and local office in Ohio fill out the questionnaire for the office they are seeking. Applications are accepted on a rolling basis.',
  },
  {
    n: 2,
    title: 'Our Screening Committee reviews',
    body:
      'The committee reads your answers against the public record: votes, sponsorships, public statements, and our legislative scorecard where you have served. We do our own research rather than asking you to sit for an interview.',
  },
  {
    n: 3,
    title: 'Our Board votes',
    body:
      'The committee brings the file to the Board with what it found. Every board member votes to endorse, decline, or abstain, and the decision is recorded.',
  },
  {
    n: 4,
    title: 'We tell you either way',
    body:
      'Every applicant hears from us by email. Endorsed candidates are published here with our full statement, and we go to work for them.',
  },
];

/** Fallback classifier for rows that predate the path-aware application. */
function classifyOffice(office) {
  const s = String(office || '').toLowerCase();
  if (!s) return 'local';
  if (/\bjudge\b|\bjustice\b|\bcourt\b/.test(s)) return 'judicial';
  if (/\bu\.?\s?s\.?\b|\bunited states\b|\bcongress(?:ional|woman|man)?\b|\bpresident\b|\bfederal\b/.test(s)) return 'federal';
  if (/\bohio (?:senate|house|statehouse)\b/.test(s)) return 'state';
  if (/\bstate (?:senate|house|representative|senator|treasurer|auditor|board of education)\b/.test(s)) return 'state';
  if (/\bgovernor\b|\battorney general\b|\bsecretary of state\b/.test(s)) return 'state';
  if (/\b(?:ohio )?supreme court\b/.test(s)) return 'judicial';
  return 'local';
}

/* The application's own path is the authoritative answer; the title regex is
 * only there for the handful of rows submitted before the form asked. */
const PATH_TO_LEVEL = { statewide: 'state', federal: 'federal', local: 'local', judicial: 'judicial' };

export const LEVEL_LABEL = {
  all: 'All',
  federal: 'Federal',
  state: 'State',
  local: 'Local',
  judicial: 'Judicial',
};

export function levelOf(row) {
  return PATH_TO_LEVEL[row?.endorsement_path] || classifyOffice(row?.office_sought);
}

/** Absolute URL for a campaign site typed without a scheme. */
export function normalizeUrl(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function initial(name) {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  return (first[0] || '?').toUpperCase();
}

/** "July 1, 2026" in Eastern time, so a late-evening decision keeps its date. */
export function formatDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  });
}

/** A view row plus its editorial entry, flattened into what the pages render. */
function decorate(row) {
  const content = contentFor(row);
  return {
    id: row.id,
    /* The application carries the candidate's legal name, which is not always
     * the name they campaign under. An editorial entry may supply the display
     * name; Supabase stays the record of what was filed. */
    name: content?.name || row.candidate_name,
    pronouns: row.pronouns || null,
    /* The questionnaire stores the option the candidate picked, which is not
     * always what a reader should see: "County Auditor / Recorder / Treasurer
     * / Clerk" is a dropdown, and a district can arrive as a bare "6". An
     * editorial entry may supply the display label; Supabase stays the record
     * of what was actually applied for. */
    office: content?.office || row.office_sought || '',
    district: content?.district || row.district || null,
    electionYear: row.election_year || null,
    website: normalizeUrl(row.website),
    bio: row.bio || null,
    endorsedAt: row.endorsed_at || null,
    level: levelOf(row),
    slug: content?.slug || slugify(row.candidate_name),
    content,
  };
}

/**
 * Every published endorsement, newest cycle first.
 *
 * Returns `{ ok, candidates }`. A failed fetch resolves to `ok: false` with an
 * empty list rather than throwing: a Supabase blip should render the "we could
 * not load these" state, not a 500 on a page people reach from a mailer.
 */
export async function getEndorsements() {
  const query = new URLSearchParams({
    select: 'id,candidate_name,pronouns,office_sought,district,election_year,website,bio,endorsed_at,endorsement_path',
    order: 'election_year.desc.nullslast,endorsed_at.desc.nullslast,candidate_name.asc',
  });

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/public_endorsements?${query}`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        accept: 'application/json',
      },
      // Endorsements change a few times a cycle. Ten minutes keeps the page
      // static and fast while still picking up a new one without a deploy.
      next: { revalidate: 600 },
    });
    if (!res.ok) throw new Error(`public_endorsements responded ${res.status}`);
    const rows = await res.json();
    return { ok: true, candidates: (Array.isArray(rows) ? rows : []).map(decorate) };
  } catch (err) {
    console.error('Failed to load endorsements:', err);
    return { ok: false, candidates: [] };
  }
}

/** One candidate by slug, or null. */
export async function getEndorsement(slug) {
  const { candidates } = await getEndorsements();
  return candidates.find((c) => c.slug === slug) || null;
}
