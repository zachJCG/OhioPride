/* =============================================================================
 * Netlify Function: bills
 * -----------------------------------------------------------------------------
 * Returns the full tracked-bill list plus the three hero stats shown on the
 * /issues page header (Bills Tracked, Passed a Chamber, In Committee) and the
 * Last Updated timestamp.
 *
 * Endpoint (after deploy):
 *   GET /.netlify/functions/bills
 *   -> {
 *        ok: true,
 *        last_updated: { date: "04/22/26", time: "05:35 PM EDT", iso: "..." },
 *        stats: { bills_tracked, passed_a_chamber, in_committee },
 *        bills: [
 *          {
 *            id: "hb249", bill: "HB 249", title: "...", nickname: "...",
 *            officialTitle: "...", stance: "anti", status: "passed-house",
 *            statusLabel: "...", statusColor: "#...", categories: [...],
 *            categoryLabels: [...], description: "...", sponsors: "...",
 *            lastAction: "...", nextDate: "...", houseVote: "...",
 *            chamber: "house", currentStep: 5, pipelineDates: {...},
 *            url: "/issues/hb249",
 *            legislatureUrl: "...", textUrl: "..."
 *          },
 *          ...
 *        ]
 *      }
 *
 * The bill object shape is deliberately identical to the legacy BILLS array
 * in js/bill-data.js so the existing renderBills() in issues.html keeps working.
 * ============================================================================= */

import { createClient } from '@supabase/supabase-js';

// Map DB status -> UI status/statusLabel/statusColor/currentStep
// currentStep matches the HOUSE_STEPS / SENATE_STEPS index in js/bill-pipeline.js.
function statusPresentation(status, chamberOfOrigin) {
  switch (status) {
    case 'introduced':
      return { statusKey: 'introduced', label: 'Introduced', color: '#3b82f6', step: 0 };
    case 'in_committee':
      return { statusKey: 'in-committee', label: 'In Committee', color: '#f59e0b', step: 2 };
    case 'reported_from_committee':
      return { statusKey: 'in-committee', label: 'Reported from Committee', color: '#f59e0b', step: 3 };
    case 'passed_house':
      return { statusKey: 'passed-house', label: 'Passed House → In Senate', color: '#dc2626', step: chamberOfOrigin === 'house' ? 5 : 7 };
    case 'passed_senate':
      return { statusKey: 'passed-senate', label: 'Passed Senate → In House', color: '#dc2626', step: chamberOfOrigin === 'senate' ? 5 : 7 };
    case 'passed_both':
      return { statusKey: 'passed-both', label: 'Passed Both Chambers', color: '#dc2626', step: 8 };
    case 'enacted':
      return { statusKey: 'enacted', label: 'Enacted', color: '#7f1d1d', step: 8 };
    case 'vetoed':
      return { statusKey: 'vetoed', label: 'Vetoed', color: '#64748b', step: 8 };
    case 'dead':
      return { statusKey: 'dead', label: 'Dead', color: '#64748b', step: 8 };
    default:
      return { statusKey: 'introduced', label: 'Introduced', color: '#3b82f6', step: 0 };
  }
}

// Map DB category -> { filter slug, pretty label } pairs the existing filter
// buttons in issues.html use. Pro-equality civil rights bills show the
// "civil-rights" filter chip; the rest line up with issues.html labels.
function categoryPresentation(category, stance) {
  switch (category) {
    case 'anti_trans':
      return [{ slug: 'anti-trans', label: 'Anti-Trans' }];
    case 'civil_rights':
      return [{ slug: 'civil-rights', label: 'Civil Rights' }];
    case 'healthcare':
      return [{ slug: 'healthcare', label: 'Healthcare' }];
    case 'education_dei':
      return [{ slug: 'education', label: 'Education / DEI' }];
    case 'expression':
      return [{ slug: 'expression', label: 'Expression' }];
    case 'youth_family':
      return [{ slug: 'youth', label: 'Youth / Family' }];
    case 'elections':
      return [{ slug: 'elections', label: 'Elections / Privacy' }];
    case 'corrections':
      return [{ slug: 'corrections', label: 'Corrections' }];
    default:
      return [{ slug: 'other', label: 'Other' }];
  }
}

// Build the "Rep. First Last (R-NN), Rep. ... " string the issues.html card
// template expects.
function formatSponsors(sponsorRows) {
  if (!Array.isArray(sponsorRows) || sponsorRows.length === 0) return '';
  // primary first, then co_sponsor, then by district for stability
  const ordered = [...sponsorRows].sort((a, b) => {
    if (a.role !== b.role) return a.role === 'primary' ? -1 : 1;
    return (a.legislator?.district ?? 999) - (b.legislator?.district ?? 999);
  });
  return ordered
    .map(s => {
      const leg = s.legislator || {};
      const honorific = leg.chamber === 'senate' ? 'Sen.' : 'Rep.';
      const partyDistrict = leg.party && leg.district
        ? ` (${leg.party}-${leg.district})`
        : '';
      return `${honorific} ${leg.full_name || 'Unknown'}${partyDistrict}`;
    })
    .join(', ');
}

// Format the big date header ("04/22/26") + EDT/EST time string from a Date.
function formatLastUpdated(d) {
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const yy = String(d.getUTCFullYear()).slice(2);
  const timeStr = d.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  // Determine EDT vs EST by asking Intl for the short tz name at that instant.
  const zone = d.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'short',
  }).split(' ').pop();
  return {
    date: `${mm}/${dd}/${yy}`,
    time: `${timeStr} ${zone}`,
    iso: d.toISOString(),
  };
}

export default async (_req, _context) => {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ ok: false, error: 'missing_supabase_env' }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Pull bills with sponsors (legislator join) in one round-trip.
  const { data: bills, error: billsErr } = await supabase
    .from('bills')
    .select(`
      bill_number, slug, title, official_title, stance, category, status,
      chamber_of_origin, introduced_on, last_action_on, last_action_text,
      next_expected_action, summary, what_it_does,
      official_bill_url, bill_text_pdf_url,
      is_featured, seed_priority, updated_at,
      bill_sponsors (
        role, sponsorship_date,
        legislator:legislators ( full_name, chamber, party, district )
      )
    `)
    .eq('is_active', true)
    .order('seed_priority', { ascending: true, nullsFirst: false })
    .order('bill_number',  { ascending: true });

  if (billsErr) {
    return new Response(
      JSON.stringify({ ok: false, error: 'supabase_query_failed', message: billsErr.message }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }

  // Pull the hero stats from the RPC so the page always matches the number
  // that powers the /scorecard card ("Bills Tracked").
  const { data: statsRows, error: statsErr } = await supabase.rpc('issue_tracker_stats');
  if (statsErr) {
    return new Response(
      JSON.stringify({ ok: false, error: 'supabase_rpc_failed', message: statsErr.message }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
  const stats = Array.isArray(statsRows) ? statsRows[0] : statsRows;

  // Shape bills into the exact payload issues.html expects.
  const shaped = (bills || []).map(b => {
    const pres = statusPresentation(b.status, b.chamber_of_origin);
    const cats = categoryPresentation(b.category, b.stance);
    const lastActionDate = b.last_action_on
      ? new Date(b.last_action_on + 'T00:00:00Z')
      : null;
    const lastAction = b.last_action_text
      ? (lastActionDate
          ? `${b.last_action_text} (as of ${lastActionDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })})`
          : b.last_action_text)
      : '';

    return {
      id: b.slug,
      bill: b.bill_number,
      title: b.title,
      nickname: '',
      officialTitle: b.official_title || b.title,
      stance: b.stance,
      status: pres.statusKey,
      statusLabel: pres.label,
      statusColor: pres.color,
      categories: cats.map(c => c.slug),
      categoryLabels: cats.map(c => c.label),
      description: b.summary || b.what_it_does || '',
      sponsors: formatSponsors(b.bill_sponsors),
      lastAction,
      nextDate: b.next_expected_action || '',
      chamber: b.chamber_of_origin,
      currentStep: pres.step,
      pipelineDates: {}, // detailed pipeline lives in bill_actions; left empty here
      url: `/issues/${b.slug}`,
      legislatureUrl: b.official_bill_url || '',
      textUrl: b.bill_text_pdf_url || '',
    };
  });

  // Pick the newest updated_at as the "Last Updated" stamp.
  const newest = shaped.length
    ? bills.reduce((max, b) => {
        const t = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return t > max ? t : max;
      }, 0)
    : Date.now();
  const lastUpdated = formatLastUpdated(new Date(newest || Date.now()));

  return new Response(
    JSON.stringify({
      ok: true,
      last_updated: lastUpdated,
      stats: {
        bills_tracked:    stats?.active_bills ?? shaped.length,
        passed_a_chamber: stats?.passed_a_chamber ?? 0,
        in_committee:     stats?.in_committee ?? 0,
      },
      bills: shaped,
      fetched_at: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        // Bill data updates after every committee hearing and floor vote. 60s
        // is responsive enough to feel live after a manual Supabase update,
        // without slamming the DB on every page load.
        'cache-control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
      },
    }
  );
};
