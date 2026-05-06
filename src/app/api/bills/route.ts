import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

interface BillRow {
  slug: string;
  label: string;
  title: string;
  nickname: string | null;
  official_title: string | null;
  stance: string | null;
  status: string | null;
  status_label: string | null;
  status_color: string | null;
  categories: string[] | null;
  category_labels: string[] | null;
  summary: string | null;
  sponsors_text: string | null;
  last_action: string | null;
  next_date: string | null;
  house_vote: string | null;
  chamber: string | null;
  current_step: number | null;
  url: string | null;
  legislature_url: string | null;
  text_url: string | null;
  updated_at: string | null;
}

interface PipelineRow {
  bill_slug: string;
  step_index: number;
  step_label: string | null;
  happened_on: string | null;
  updated_at: string | null;
}

function reshapeBill(row: BillRow, pipeline: PipelineRow[]) {
  const pipelineDates: Record<number, string> = {};
  for (const p of pipeline) {
    if (p.bill_slug !== row.slug) continue;
    if (p.happened_on) {
      pipelineDates[p.step_index] = new Date(p.happened_on)
        .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } else if (p.step_label) {
      pipelineDates[p.step_index] = p.step_label;
    }
  }

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

function jsonWithCache(body: unknown, status: number, cacheSeconds: number) {
  return NextResponse.json(body, {
    status,
    headers: cacheSeconds > 0
      ? { 'cache-control': `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds * 2}, stale-while-revalidate=1800` }
      : {},
  });
}

/**
 * GET /api/bills
 * GET /api/bills?slug=hb249
 * Mirrors netlify/functions/bills.mjs.
 */
export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return jsonWithCache({ ok: false, error: 'missing_supabase_env' }, 500, 0);

  const slug = req.nextUrl.searchParams.get('slug');

  if (slug) {
    const [billRes, pipelineRes, rollCallsRes] = await Promise.all([
      supabase.from('bills').select('*').eq('slug', slug).maybeSingle(),
      supabase.from('bill_pipeline_steps').select('*').eq('bill_slug', slug).order('step_index'),
      supabase.from('roll_calls').select('*').eq('bill_slug', slug).order('vote_date', { ascending: false }),
    ]);

    if (billRes.error)      return jsonWithCache({ ok: false, error: billRes.error.message      }, 500, 0);
    if (!billRes.data)      return jsonWithCache({ ok: false, error: 'bill_not_found'           }, 404, 60);
    if (pipelineRes.error)  return jsonWithCache({ ok: false, error: pipelineRes.error.message  }, 500, 0);
    if (rollCallsRes.error) return jsonWithCache({ ok: false, error: rollCallsRes.error.message }, 500, 0);

    return jsonWithCache(
      {
        ok: true,
        bill: reshapeBill(billRes.data as BillRow, (pipelineRes.data || []) as PipelineRow[]),
        roll_calls: rollCallsRes.data || [],
        fetched_at: new Date().toISOString(),
      },
      200,
      300,
    );
  }

  const [billsRes, pipelineRes] = await Promise.all([
    supabase.from('bills').select('*').eq('is_active', true).order('display_order', { ascending: true }).order('slug'),
    supabase.from('bill_pipeline_steps').select('*').order('step_index'),
  ]);

  if (billsRes.error)    return jsonWithCache({ ok: false, error: billsRes.error.message    }, 500, 0);
  if (pipelineRes.error) return jsonWithCache({ ok: false, error: pipelineRes.error.message }, 500, 0);

  const bills = ((billsRes.data || []) as BillRow[]).map(b => reshapeBill(b, (pipelineRes.data || []) as PipelineRow[]));

  const allTimes = [
    ...((billsRes.data    || []) as BillRow[]).map(b => b.updated_at),
    ...((pipelineRes.data || []) as PipelineRow[]).map(p => p.updated_at),
  ].filter((t): t is string => Boolean(t)).sort();
  const newest = allTimes[allTimes.length - 1] || new Date().toISOString();
  const newestDate = new Date(newest);

  return jsonWithCache(
    {
      ok: true,
      last_updated: {
        iso:  newest,
        date: newestDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }),
        time: newestDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }),
      },
      bills,
      fetched_at: new Date().toISOString(),
    },
    200,
    300,
  );
}
