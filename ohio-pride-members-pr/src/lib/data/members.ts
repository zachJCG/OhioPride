// src/lib/data/members.ts
// Members module data access. Reads members_crm (NO public/vetted filter), newest first.
// Uses the authenticated server client so RLS (is_admin) returns all members.

import { createClient } from '@/lib/supabase/server';
import type { MemberCrmRow } from '@/types/members';

export interface MemberFilters {
  search?: string; // name/email
  county?: string;
  region?: string; // unused unless you add region to founding_members
}

// Default sort = NEWEST member first (by contribution date, then founding number).
export async function getMembers(filters: MemberFilters = {}): Promise<MemberCrmRow[]> {
  const supabase = await createClient();
  let q = supabase.from('members_crm').select('*');

  if (filters.county) q = q.eq('county', filters.county);
  if (filters.search) q = q.or(`full_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);

  // Newest first. The view is already ordered, but we set it explicitly so it survives PostgREST.
  q = q.order('contributed_at', { ascending: false, nullsFirst: false }).order('founding_number', {
    ascending: false,
    nullsFirst: false,
  });

  const { data, error } = await q;
  if (error) throw new Error(`members read failed: ${error.message}`);
  return (data ?? []) as MemberCrmRow[];
}

export async function getMember(id: string): Promise<MemberCrmRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('members_crm').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`member read failed: ${error.message}`);
  return data as MemberCrmRow | null;
}

// County rollup for the members module (uses the existing leaderboard view if you prefer
// the public one; this counts ALL members regardless of vetting).
export async function getMemberCountyRollup() {
  const supabase = await createClient();
  const { data, error } = await supabase.from('members_crm').select('county');
  if (error) throw new Error(`member county rollup failed: ${error.message}`);
  const counts: Record<string, number> = {};
  for (const r of data ?? []) {
    const c = (r as { county: string | null }).county ?? 'Unspecified';
    counts[c] = (counts[c] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([county, count]) => ({ county, count }))
    .sort((a, b) => b.count - a.count);
}

export async function getMemberStats() {
  const supabase = await createClient();
  const [{ count: total }, { count: vetted }, { count: oh }] = await Promise.all([
    supabase.from('members_crm').select('*', { count: 'exact', head: true }),
    supabase.from('members_crm').select('*', { count: 'exact', head: true }).eq('is_vetted', true),
    supabase.from('members_crm').select('*', { count: 'exact', head: true }).eq('state', 'OH'),
  ]);
  return { total: total ?? 0, vetted: vetted ?? 0, ohio: oh ?? 0, target: 1969 };
}
