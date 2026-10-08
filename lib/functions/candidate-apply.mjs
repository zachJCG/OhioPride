/* =============================================================================
 * Vercel Function: candidate-apply
 * -----------------------------------------------------------------------------
 * Receives the Race to 100 recruitment form (/candidate-apply).
 *
 *   POST /api/candidate-apply   JSON body, see SCHEMA below
 *
 * What one submission does, in order:
 *
 *   1. Validates with zod, rejects the honeypot and anything filled in under
 *      two seconds, normalises the email to lowercase.
 *   2. Inserts the candidate_applications row under the service role. Anon
 *      could insert too, but the steps after need to read contacts and write
 *      back contact_id, which anon cannot.
 *   3. Links or creates the contacts row by email. An existing person gets
 *      'candidate' appended to roles[] and 'candidate-apply' to sources[]
 *      (no duplicates) and blanks filled; a new person is inserted with
 *      full_name, first_name, last_name, email, phone, city, county, zip and
 *      email_optin = consent_contact. contacts.name is GENERATED and is never
 *      written. The resulting id goes onto the application.
 *   4. Writes a candidate_application_activity note.
 *   5. Emails staff (zach@ohiopride.org plus every active endorsements chair)
 *      through lib/notify.mjs.
 *
 * Steps 3 to 5 are best effort: once the application row exists the response
 * is 200 with its id, whatever happens after. A candidate must never see an
 * error for a submission that is already in the database.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY (see notify)
 * ============================================================================= */

import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { notifySubmission, recipientsFor } from '../notify.mjs';
import { HELP_KEYS } from '../candidates.mjs';

const MIN_FILL_MS = 2000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_CYCLE_SLUG = '2027-general';

const trimmed = (max) => z.string().trim().max(max);
const optional = (max) => trimmed(max).transform((s) => s || null).nullable().optional();

const PREVIOUS_RACE = z.object({
  office: trimmed(160),
  year: z.coerce.number().int().min(1900).max(2100).nullable().optional(),
  result: z.enum(['won', 'lost', 'primary_loss', 'withdrew', 'unopposed']).nullable().optional(),
  vote_share: z.coerce.number().min(0).max(100).nullable().optional(),
  notes: trimmed(500).optional().default(''),
});

const SCHEMA = z.object({
  first_name: trimmed(80).min(1),
  last_name: trimmed(80).min(1),
  pronouns: optional(40),
  email: z.string().trim().toLowerCase().email().max(320),
  phone: z.string().trim().regex(/^\d{10}$/, 'phone must be ten digits'),
  city: optional(120),
  county: optional(60),
  zip: z.union([z.string().trim().regex(/^\d{5}(-\d{4})?$/), z.literal(''), z.null()]).optional()
    .transform((s) => s || null),
  is_out: z.enum(['yes', 'no', 'prefer_not_to_say']).nullable().optional(),
  party: optional(40),
  target_race_id: z.string().regex(UUID_RE).nullable().optional(),
  race_other: optional(240),
  office_sought: optional(160),
  jurisdiction: optional(160),
  race_level: z.enum([
    'statewide_executive', 'us_congress', 'general_assembly', 'state_board_of_education',
    'judicial_appellate', 'judicial_trial', 'county', 'municipal', 'township', 'school_board',
  ]).nullable().optional(),
  ballot_path: z.enum(['party_petition', 'independent', 'nonpartisan', 'write_in']).nullable().optional(),
  has_filed: z.boolean().nullable().optional(),
  previous_offices: optional(2000),
  previous_races: z.array(PREVIOUS_RACE).max(6).default([]),
  signature_experience: z.enum(['none', 'helped_circulate', 'circulated_own', 'managed_drive']),
  signature_experience_note: optional(1000),
  help_needed: z.array(z.enum(HELP_KEYS)).min(1).max(HELP_KEYS.length),
  help_other: optional(500),
  why_running: trimmed(1000).min(1),
  anything_else: optional(4000),
  consent_contact: z.literal(true),
  consent_share_with_mentors: z.boolean().default(true),
  started_at: z.coerce.number().optional(),
  website: z.string().optional(), // honeypot
}).refine((v) => v.target_race_id || (v.office_sought && v.jurisdiction), {
  message: 'Pick a race or describe the one you are running in.',
  path: ['target_race_id'],
});

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function dedupe(list, extra) {
  const out = [];
  const seen = new Set();
  for (const v of [...(list || []), ...extra]) {
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/** Step 3. Returns the contacts.id or null; never throws. */
async function linkContact(sb, app) {
  try {
    const { data: existing, error: readErr } = await sb
      .from('contacts')
      .select('id, roles, sources, full_name, first_name, last_name, phone, city, county, zip, is_merged, merged_into')
      .eq('email', app.email)
      .maybeSingle();
    if (readErr) throw readErr;

    if (existing) {
      // A merged record points at its survivor; attach the application there.
      const target = existing.is_merged && existing.merged_into ? existing.merged_into : existing.id;
      const patch = {
        roles: dedupe(existing.roles, ['candidate']),
        sources: dedupe(existing.sources, ['candidate-apply']),
        full_name: existing.full_name || `${app.first_name} ${app.last_name}`,
        first_name: existing.first_name || app.first_name,
        last_name: existing.last_name || app.last_name,
        phone: existing.phone || app.phone,
        city: existing.city || app.city,
        county: existing.county || app.county,
        zip: existing.zip || app.zip,
      };
      const { error } = await sb.from('contacts').update(patch).eq('id', target);
      if (error) throw error;
      return target;
    }

    const { data: created, error: insErr } = await sb
      .from('contacts')
      .insert({
        full_name: `${app.first_name} ${app.last_name}`,
        first_name: app.first_name,
        last_name: app.last_name,
        email: app.email,
        phone: app.phone,
        city: app.city,
        county: app.county,
        zip: app.zip,
        roles: ['candidate'],
        sources: ['candidate-apply'],
        source: 'candidate-apply',
        email_optin: app.consent_contact,
      })
      .select('id')
      .single();
    if (insErr) throw insErr;
    return created.id;
  } catch (err) {
    console.error('candidate-apply: contact link failed', err);
    return null;
  }
}

/** Step 5 recipients: the default list plus every active endorsements chair. */
async function chairRecipients(sb) {
  try {
    const { data } = await sb
      .from('admin_user_roles')
      .select('admin_users!inner(email, is_active)')
      .eq('role_slug', 'endorsements_chair');
    return (data || [])
      .map((r) => r.admin_users)
      .filter((u) => u && u.is_active && u.email)
      .map((u) => String(u.email));
  } catch (err) {
    console.error('candidate-apply: could not read endorsements chairs', err);
    return [];
  }
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

  let raw;
  try { raw = await req.json(); }
  catch { return json(400, { ok: false, error: 'invalid_json', message: 'The form could not be read.' }); }

  // Bots fill every field. People never see this one.
  if (raw && typeof raw.website === 'string' && raw.website.trim()) {
    return json(200, { ok: true, id: null });
  }
  if (raw && typeof raw.started_at === 'number' && Date.now() - raw.started_at < MIN_FILL_MS) {
    return json(400, { ok: false, error: 'too_fast', message: 'Please take a moment and try again.' });
  }

  const parsed = SCHEMA.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return json(400, {
      ok: false,
      error: 'invalid',
      field: first?.path?.join('.'),
      message: first?.message ? `Please check the form: ${first.path.join('.')} ${first.message}.` : 'Please check the form.',
    });
  }
  const v = parsed.data;

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('candidate-apply: missing supabase env');
    return json(500, { ok: false, error: 'server_misconfigured', message: 'The form is not available right now.' });
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  /* The race decides the cycle. A race that is not on the list defaults to the
   * general, because that is the ballot nearly every local seat is on. */
  let race = null;
  let cycleId = null;
  if (v.target_race_id) {
    const { data } = await sb
      .from('target_races')
      .select('id, slug, cycle_id, jurisdiction, office, race_level, ballot_path, county')
      .eq('id', v.target_race_id)
      .maybeSingle();
    race = data || null;
    cycleId = race?.cycle_id || null;
  }
  if (!cycleId) {
    const { data } = await sb.from('election_cycles').select('id').eq('slug', DEFAULT_CYCLE_SLUG).maybeSingle();
    cycleId = data?.id || null;
  }

  const row = {
    first_name: v.first_name,
    last_name: v.last_name,
    pronouns: v.pronouns || null,
    email: v.email,
    phone: v.phone,
    city: v.city || null,
    county: v.county || null,
    zip: v.zip || null,
    is_out: v.is_out || null,
    party: v.party || null,
    target_race_id: race?.id || null,
    race_other: race ? null : (v.race_other || [v.jurisdiction, v.office_sought].filter(Boolean).join(': ') || null),
    office_sought: race?.office || v.office_sought || null,
    jurisdiction: race?.jurisdiction || v.jurisdiction || null,
    race_level: race?.race_level || v.race_level || null,
    ballot_path: race?.ballot_path || v.ballot_path || null,
    cycle_id: cycleId,
    has_filed: v.has_filed ?? null,
    previous_offices: v.previous_offices || null,
    previous_races: v.previous_races.map((r) => ({
      office: r.office,
      year: r.year ?? null,
      result: r.result ?? null,
      vote_share: r.vote_share ?? null,
      notes: r.notes || '',
    })),
    signature_experience: v.signature_experience,
    signature_experience_note: v.signature_experience_note || null,
    help_needed: v.help_needed,
    help_other: v.help_needed.includes('other') ? v.help_other || null : null,
    why_running: v.why_running,
    anything_else: v.anything_else || null,
    consent_contact: true,
    consent_share_with_mentors: !!v.consent_share_with_mentors,
    source: 'candidate-apply',
    user_agent: (req.headers.get('user-agent') || '').slice(0, 500) || null,
    status: 'new',
  };

  const { data: app, error: insErr } = await sb
    .from('candidate_applications')
    .insert(row)
    .select('id, first_name, last_name, email, jurisdiction, race_other, office_sought, county')
    .single();
  if (insErr || !app) {
    console.error('candidate-apply: insert failed', insErr);
    return json(500, { ok: false, error: 'insert_failed', message: 'Your application could not be saved. Please try again.' });
  }

  /* From here on the application exists; nothing below may change the answer. */
  try {
    const contactId = await linkContact(sb, { ...row, consent_contact: true });
    if (contactId) {
      const { error } = await sb.from('candidate_applications').update({ contact_id: contactId }).eq('id', app.id);
      if (error) console.error('candidate-apply: contact_id write failed', error);
    }
  } catch (err) {
    console.error('candidate-apply: contact step failed', err);
  }

  try {
    const { error } = await sb.from('candidate_application_activity').insert({
      application_id: app.id,
      kind: 'note',
      body: 'Application submitted from /candidate-apply',
      actor_email: null,
    });
    if (error) console.error('candidate-apply: activity insert failed', error);
  } catch (err) {
    console.error('candidate-apply: activity step failed', err);
  }

  try {
    const where = app.jurisdiction || app.race_other || 'race not listed';
    const chairs = await chairRecipients(sb);
    await notifySubmission({
      kind: 'candidate',
      to: [...recipientsFor('candidate'), ...chairs],
      subject: `New candidate application: ${app.first_name} ${app.last_name}, ${where}`,
      title: `New candidate application: ${app.first_name} ${app.last_name}`,
      replyTo: app.email,
      fields: {
        Name: `${app.first_name} ${app.last_name}`,
        Pronouns: row.pronouns,
        Email: app.email,
        Phone: row.phone,
        'City / county': [row.city, row.county].filter(Boolean).join(', '),
        Race: race ? `${race.jurisdiction}: ${race.office}` : row.race_other,
        'Already filed': row.has_filed == null ? 'Not sure' : row.has_filed ? 'Yes' : 'No',
        'Help needed': row.help_needed,
        'Why running': row.why_running,
        'Mentor sharing': row.consent_share_with_mentors ? 'Allowed' : 'Not allowed',
      },
      adminPath: `/admin/candidate/${app.id}`,
      adminLabel: 'Open the application',
    });
  } catch (err) {
    console.error('candidate-apply: notify step failed', err);
  }

  return json(200, { ok: true, id: app.id });
};
