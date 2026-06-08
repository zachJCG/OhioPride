// src/lib/data/pipeline.ts
// Donor / prospect pipeline data access — reads the EXISTING Supabase views with the
// authenticated server client so RLS returns the rows that already exist.
//
// The three pipelines in the Ohio Pride database:
//   - prospects_pipeline        (general fundraising prospects, 168 rows)
//   - pac_pipeline              (hard-money PAC donors, 31 rows)
//   - c4_pipeline               (c4 / soft-money prospects, 97 rows)
// Plus summary views:
//   - prospects_pipeline_summary, pac_pipeline_by_stage, c4_pipeline_by_stage
//   - fundraising_dashboard
//
// All of these are `security_invoker` views, so they ONLY return data when queried with
// an authenticated session (see lib/supabase/server.ts for the full explanation).

import { createClient } from '@/lib/supabase/server';

export type PipelineKind = 'prospects' | 'pac' | 'c4';

const VIEW: Record<PipelineKind, { board: string; summary: string }> = {
  prospects: { board: 'prospects_pipeline', summary: 'prospects_pipeline_summary' },
  pac: { board: 'pac_pipeline', summary: 'pac_pipeline_by_stage' },
  c4: { board: 'c4_pipeline', summary: 'c4_pipeline_by_stage' },
};

export type PipelineRow = Record<string, unknown> & {
  id: string;
  full_name: string | null;
  stage: string | null;
  status: string | null;
  priority: string | null;
  region: string | null;
  county: string | null;
  owner_name: string | null;
  ask_target_cents: number | null;
  committed_amount_cents: number | null;
  capacity_estimate_cents: number | null;
  next_action: string | null;
  next_action_date: string | null;
  last_activity_at: string | null;
};

export async function getPipeline(kind: PipelineKind): Promise<PipelineRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(VIEW[kind].board)
    .select('*')
    .order('priority', { ascending: true })
    .order('next_action_date', { ascending: true, nullsFirst: false });

  if (error) {
    // Surface RLS / auth problems loudly instead of silently rendering an empty board.
    console.error(`[pipeline:${kind}] read failed:`, error.message);
    throw new Error(`Failed to load ${kind} pipeline: ${error.message}`);
  }
  return (data ?? []) as PipelineRow[];
}

export async function getPipelineSummary(kind: PipelineKind) {
  const supabase = await createClient();
  const { data, error } = await supabase.from(VIEW[kind].summary).select('*');
  if (error) {
    console.error(`[pipeline:${kind}] summary read failed:`, error.message);
    throw new Error(`Failed to load ${kind} summary: ${error.message}`);
  }
  return data ?? [];
}

export async function getFundraisingDashboard() {
  const supabase = await createClient();
  const { data, error } = await supabase.from('fundraising_dashboard').select('*').single();
  if (error) {
    console.error('[fundraising_dashboard] read failed:', error.message);
    throw new Error(`Failed to load fundraising dashboard: ${error.message}`);
  }
  return data;
}

// Health check used by the README's verification step. Returns the row count the
// authenticated user can actually see — if this is > 0, the "no data showing" bug is fixed.
export async function pipelineHealthCheck() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const counts: Record<string, number> = {};
  for (const v of ['prospects_pipeline', 'pac_pipeline', 'c4_pipeline']) {
    const { count } = await supabase.from(v).select('*', { count: 'exact', head: true });
    counts[v] = count ?? 0;
  }
  return { authenticatedAs: user?.email ?? null, visibleRows: counts };
}
