/* =============================================================================
 * Race to 100: the queries.
 * -----------------------------------------------------------------------------
 * Every function takes a supabase-js client as its first argument so the same
 * code serves the admin console (browser client, caller's session, RLS gated
 * by is_admin()) and the API routes (service role). Nothing here decides who
 * may call it; that is the policies' job.
 *
 * Column lists are spelled out rather than `*` so a schema addition cannot
 * silently widen what the console pulls into the browser.
 * ========================================================================== */

export const APPLICATION_COLUMNS =
  'id, created_at, updated_at, status, status_changed_at, first_name, last_name, pronouns, ' +
  'email, phone, city, county, zip, is_out, party, target_race_id, race_other, office_sought, ' +
  'jurisdiction, race_level, ballot_path, cycle_id, has_filed, previous_offices, previous_races, ' +
  'signature_experience, signature_experience_note, help_needed, help_other, why_running, ' +
  'anything_else, consent_contact, consent_share_with_mentors, source, contact_id, ' +
  'endorsement_application_id, assigned_to, mentor_network_contact_id, mentor_name, priority, ' +
  'next_action, next_action_date, internal_notes';

/* The embeds the list and detail pages read alongside the row. The FK names
 * are spelled out because candidate_applications has two paths to
 * admin_users-shaped data (assigned_to) and PostgREST needs to be told which. */
const RACE_EMBED = 'target_race:target_races!candidate_applications_target_race_id_fkey(id, slug, jurisdiction, office, county, region, tier, filing_deadline)';
const ASSIGNEE_EMBED = 'assignee:admin_users!candidate_applications_assigned_to_fkey(id, full_name, email)';
const CYCLE_EMBED = 'cycle:election_cycles!candidate_applications_cycle_id_fkey(id, slug, label)';

export const RACE_ADMIN_COLUMNS =
  'id, created_at, updated_at, cycle_id, election_year, rank, tier, slug, jurisdiction, county, ' +
  'region, office, seats, race_level, ballot_path, incumbent_name, incumbent_is_out, is_open_seat, ' +
  'lean, filing_deadline, filing_deadline_note, rationale, needs_verification, verification_note, ' +
  'recruit_status, is_public, is_vetted, sort_order';

/** Applications for the list page, new first, then newest. */
export async function listApplications(sb) {
  return sb
    .from('candidate_applications')
    .select(`${APPLICATION_COLUMNS}, ${RACE_EMBED}, ${ASSIGNEE_EMBED}`)
    .order('created_at', { ascending: false });
}

/** One application with its race, assignee and cycle. */
export async function getApplication(sb, id) {
  return sb
    .from('candidate_applications')
    .select(`${APPLICATION_COLUMNS}, user_agent, ${RACE_EMBED}, ${ASSIGNEE_EMBED}, ${CYCLE_EMBED}`)
    .eq('id', id)
    .maybeSingle();
}

/** Patch an application. Returns the updated row with embeds. */
export async function updateApplication(sb, id, patch) {
  return sb
    .from('candidate_applications')
    .update(patch)
    .eq('id', id)
    .select(`${APPLICATION_COLUMNS}, ${RACE_EMBED}, ${ASSIGNEE_EMBED}, ${CYCLE_EMBED}`)
    .maybeSingle();
}

/** Activity rows for one application, newest first. */
export async function listActivity(sb, applicationId) {
  return sb
    .from('candidate_application_activity')
    .select('id, created_at, application_id, actor_email, kind, body')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: false });
}

/**
 * Record something that happened to an application.
 * @param {string} kind note | status_change | assignment | mentor_match | call | email | meeting | referral
 */
export async function insertActivity(sb, { applicationId, kind, body, actorEmail }) {
  return sb
    .from('candidate_application_activity')
    .insert({ application_id: applicationId, kind, body: body || null, actor_email: actorEmail || null })
    .select('id, created_at, application_id, actor_email, kind, body')
    .maybeSingle();
}

/** Every target race, public or not, in rank order. Admin only by policy. */
export async function listRaces(sb) {
  return sb.from('target_races').select(RACE_ADMIN_COLUMNS).order('rank', { ascending: true });
}

export async function updateRace(sb, id, patch) {
  return sb.from('target_races').update(patch).eq('id', id).select(RACE_ADMIN_COLUMNS).maybeSingle();
}

export async function insertRace(sb, row) {
  return sb.from('target_races').insert(row).select(RACE_ADMIN_COLUMNS).maybeSingle();
}

/** Applications grouped by race, for the race grid's expand rows and the scoreboard. */
export async function listApplicationsByRace(sb) {
  return sb
    .from('candidate_applications')
    .select('id, first_name, last_name, status, target_race_id')
    .not('target_race_id', 'is', null);
}

/**
 * The Race to 100 scoreboard numbers, from a race list and the per-race
 * applications. Pure, so the dashboard tile and the races page agree.
 */
export function scoreboard(races, apps) {
  const withApplicant = new Set((apps || []).map((a) => a.target_race_id).filter(Boolean));
  const byTier = {};
  for (const r of races || []) byTier[r.tier] = (byTier[r.tier] || 0) + 1;
  return {
    total: (races || []).length,
    byTier,
    withApplicant: (races || []).filter((r) => withApplicant.has(r.id)).length,
    filed: (races || []).filter((r) => r.recruit_status === 'filed').length,
    endorsed: (races || []).filter((r) => r.recruit_status === 'endorsed').length,
  };
}

/** Active admins, for the assign-to select. */
export async function listActiveAdmins(sb) {
  return sb.from('admin_users').select('id, full_name, email').eq('is_active', true).order('full_name');
}

/**
 * People who hold or have held elected office, for the mentor typeahead.
 * There is no single flag for this yet (see docs/race-to-100.md), so it reads
 * the signals that exist: the "elected" and "legislator" tags, the
 * Government / Elected Official sector, and a title that names an office.
 * contacts with an elected_official role are included for the day that role
 * exists; today the query simply returns none from there.
 */
export async function listMentorCandidates(sb) {
  const [network, contacts] = await Promise.all([
    sb
      .from('network_contacts')
      .select('id, full_name, title, organization, sector, tags, city, county')
      .or(
        'tags.cs.{elected},tags.cs.{legislator},tags.cs.{former-elected-official},' +
        'sector.ilike.Government / Elected%,' +
        'title.ilike.%representative%,title.ilike.%senator%,title.ilike.%council%,' +
        'title.ilike.%mayor%,title.ilike.%commissioner%,title.ilike.%judge%,' +
        'title.ilike.%trustee%,title.ilike.%board of education%',
      )
      .order('full_name'),
    sb
      .from('contacts')
      .select('id, full_name, city, county')
      .contains('roles', ['elected_official'])
      .eq('is_merged', false)
      .order('full_name'),
  ]);
  const people = [];
  for (const n of network.data || []) {
    people.push({
      key: `network:${n.id}`,
      networkContactId: n.id,
      name: n.full_name,
      detail: [n.title, n.organization].filter(Boolean).join(', ') || n.sector || '',
      place: [n.city, n.county].filter(Boolean).join(', '),
    });
  }
  for (const c of contacts.data || []) {
    people.push({
      key: `contact:${c.id}`,
      networkContactId: null,
      name: c.full_name,
      detail: 'Elected official (contacts)',
      place: [c.city, c.county].filter(Boolean).join(', '),
    });
  }
  return { data: people, error: network.error || contacts.error || null };
}
