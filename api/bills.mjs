/* =============================================================================
 * Netlify Function: bills
 * -----------------------------------------------------------------------------
 * Replaces /js/bill-data.js as the live data source for /issues and the
 * per-bill detail pages under /issues/<slug>.html.
 *
 * Responses are shaped to be a drop-in for the existing front-end:
 *   - GET /.netlify/functions/bills          -> { ok: true, last_updated, bills: [...] }
 *   - GET /.netlify/functions/bills?slug=hb249 -> { ok: true, bill: {..., votes: [...], pipeline: [...] } }
 *
 * The `bills` array fields match the keys the existing `BILLS` constant uses
 * in /js/bill-data.js (id, bill, title, nickname, stance, status,
 * statusLabel, statusColor, categories, categoryLabels, description,
 * sponsors, lastAction, nextDate, houseVote, chamber, currentStep,
 * pipelineDates, url, legislatureUrl, textUrl) so we can swap the data
 * source without touching the renderer in /issues.html.
 * ============================================================================= */

import { createClient } from '@supabase/supabase-js';

const json = (status, body, cacheSeconds = 300) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds * 2}, stale-while-revalidate=1800`,
    },
  });

function reshapeBill(row, pipelineSteps) {
  const pipelineDates = {};
  (pipelineSteps || []).forEach(p => {
    if (p.bill_slug !== row.slug) return;
    if (p.happened_on) {
      pipelineDates[p.step_index] = new Date(p.happened_on)
        .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } else if (p.step_label) {
      pipelineDates[p.step_index] = p.step_label;
    }
  });

  return {
    id:             row.slug,
    bill:           row.label,
    title:          row.title,
    nickname:       row.nickname || '',
    officialTitle:  row.official_title || row.title,
    stance:         row.stance,
    status:         row.status,
    statusLabel:    row.status_label || row.status,
    statusColor:    row.status_color || '#999',
    categories:     row.categories || [],
    categoryLabels: row.category_labels || [],
    description:    row.summary || '',
    sponsors:       row.sponsors_text || '',
    lastAction:     row.last_action || '',
    nextDate:       row.next_date || '',
    houseVote:      row.house_vote || '',
    chamber:        row.chamber || 'house',
    currentStep:    row.current_step ?? 0,
    pipelineDates,
    url:            row.url            || `/issues/${row.slug}`,
    legislatureUrl: row.legislature_url || '',
    textUrl:        row.text_url       || '',
  };
}

export default async (req) => {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { ok: false, error: 'missing_supabase_env' }, 0);
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const url  = new URL(req.url);
  const slug = url.searchParams.get('slug');

  // ---- Single bill detail ----
  if (slug) {
    const [billRes, pipelineRes, rollCallsRes] = await Promise.all([
      supabase.from('bills').select('*').eq('slug', slug).maybeSingle(),
      supabase.from('bill_pipeline_steps').select('*').eq('bill_slug', slug).order('step_index'),
      supabase.from('roll_calls').select('*').eq('bill_slug', slug).order('vote_date', { ascending: false }),
    ]);

    if (billRes.error)      return json(500, { ok: false, error: billRes.error.message }, 0);
    if (!billRes.data)      return json(404, { ok: false, error: 'bill_not_found' }, 60);
    if (pipelineRes.error)  return json(500, { ok: false, error: pipelineRes.error.message }, 0);
    if (rollCallsRes.error) return json(500, { ok: false, error: rollCallsRes.error.message }, 0);

    return json(200, {
      ok: true,
      bill: reshapeBill(billRes.data, pipelineRes.data || []),
      roll_calls: rollCallsRes.data || [],
      fetched_at: new Date().toISOString(),
    });
  }

  // ---- Full list ----
  const [billsRes, pipelineRes] = await Promise.all([
    supabase.from('bills')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('slug'),
    supabase.from('bill_pipeline_steps').select('*').order('step_index'),
  ]);

  if (billsRes.error)    return json(500, { ok: false, error: billsRes.error.message }, 0);
  if (pipelineRes.error) return json(500, { ok: false, error: pipelineRes.error.message }, 0);

  const bills = (billsRes.data || []).map(b => reshapeBill(b, pipelineRes.data || []));

  // last_updated comes from the most recent updated_at across bills + pipeline
  const allTimes = [
    ...(billsRes.data    || []).map(b => b.updated_at),
    ...(pipelineRes.data || []).map(p => p.updated_at),
  ].filter(Boolean).sort();
  const newest = allTimes[allTimes.length - 1] || new Date().toISOString();
  const newestDate = new Date(newest);

  return json(200, {
    ok: true,
    last_updated: {
      iso:   newest,
      date:  newestDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }),
      time:  newestDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }),
    },
    bills,
    fetched_at: new Date().toISOString(),
  });
};
