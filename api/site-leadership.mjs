/* =============================================================================
 * Vercel Function: site-leadership
 * -----------------------------------------------------------------------------
 * Returns the active officer roster for a given legal entity, defaulting to
 * the PAC. Used by the website footer template and by any page that needs
 * to render the "Paid for by" disclaimer.
 *
 * The tricky thing this endpoint solves: the standard Ohio PAC disclaimer
 * must list the Director and the Treasurer by name. Hardcoding those names
 * in site-template.js means that if you ever change officers, you edit the
 * JS file, deploy, and pray you caught every other place the names appear.
 * With this endpoint + the site_leadership table, there is exactly one row
 * to update and every rendered surface picks up the change on its next
 * cache refresh.
 *
 * Query parameters:
 *   ?entity=pac  (default)
 *   ?entity=c4
 *   ?entity=c3
 *
 * Response shape:
 *   {
 *     ok: true,
 *     entity: "pac",
 *     officers: [
 *       { title: "Director",  full_name: "Zachary R. Joseph", required_on_disclaimer: true },
 *       { title: "Treasurer", full_name: "David Donofrio",    required_on_disclaimer: true }
 *     ],
 *     disclaimer: "Paid for by Ohio Pride PAC. Zachary R. Joseph, Director. David Donofrio, Treasurer."
 *   }
 *
 * The `disclaimer` field is pre-assembled server-side because getting the
 * punctuation right ("Director. David..." with a period, not a comma) matters
 * for compliance and we do not want three different pages each formatting it
 * their own slightly-different way.
 * ============================================================================= */

import { createClient } from '@supabase/supabase-js';

// Maps our internal entity codes to the full legal names that appear in the
// disclaimer. Keep this list in sync with the check constraint on
// site_leadership.entity in the SQL migration.
const ENTITY_LEGAL_NAMES = {
  pac: 'Ohio Pride PAC',
  c4:  'Ohio Pride Action',
  c3:  'Ohio Pride Foundation', // placeholder — update when c(3) is named
};

function buildDisclaimer(entity, officers) {
  const entityName = ENTITY_LEGAL_NAMES[entity] || 'Ohio Pride PAC';
  const requiredOfficers = officers.filter(o => o.required_on_disclaimer);

  if (requiredOfficers.length === 0) {
    // Safe minimum: if the table somehow has no required officers, we still
    // return the legally-required paid-for-by prefix rather than an empty
    // string. A partial disclaimer is never preferable to no disclaimer at
    // all in a compliance context.
    return `Paid for by ${entityName}.`;
  }

  // "Paid for by Ohio Pride PAC. Zachary R. Joseph, Director. David Donofrio, Treasurer."
  const officerParts = requiredOfficers
    .map(o => `${o.full_name}, ${o.title}.`)
    .join(' ');

  return `Paid for by ${entityName}. ${officerParts}`;
}

export default async function handler(req, res) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ ok: false, error: 'missing_supabase_env' });
  }

  // Parse ?entity= from the query string; fall back to the default entity.
  let entity = 'pac';
  const q = String(req.query.entity || '').trim().toLowerCase();
  if (q && ['pac', 'c4', 'c3'].includes(q)) {
    entity = q;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from('site_leadership')
    .select('title, full_name, is_required_on_disclaimer, display_order')
    .eq('entity', entity)
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    return res.status(500).json({ ok: false, error: 'supabase_query_failed', message: error.message });
  }

  const officers = (data || []).map(row => ({
    title: row.title,
    full_name: row.full_name,
    required_on_disclaimer: row.is_required_on_disclaimer,
  }));

  // Leadership changes very rarely. Long cache, but not so long that an
  // officer change takes a whole day to propagate.
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=900, stale-while-revalidate=3600');
  return res.status(200).json({
    ok: true,
    entity,
    entity_legal_name: ENTITY_LEGAL_NAMES[entity],
    officers,
    disclaimer: buildDisclaimer(entity, officers),
    fetched_at: new Date().toISOString(),
  });
}
