// src/lib/data/networking.ts
// Read-side data access for the networking module (authenticated server client).

import { createClient } from '@/lib/supabase/server';
import type {
  NetworkContactDirectoryRow,
  NetworkTargetPath,
  NetworkByRegionRow,
  NetworkContact,
  NetworkBusinessCard,
} from '@/types/networking';

export interface DirectoryFilters {
  region?: string;
  county?: string;
  search?: string;
  targetsOnly?: boolean;
  connectorsOnly?: boolean;
  warmth?: string;
}

export async function getDirectory(filters: DirectoryFilters = {}): Promise<NetworkContactDirectoryRow[]> {
  const supabase = await createClient();
  let q = supabase.from('network_contacts_directory').select('*').neq('status', 'archived');

  if (filters.region) q = q.eq('region', filters.region);
  if (filters.county) q = q.eq('county', filters.county);
  if (filters.warmth) q = q.eq('warmth', filters.warmth);
  if (filters.targetsOnly) q = q.eq('is_target', true);
  if (filters.connectorsOnly) q = q.eq('is_connector', true);
  if (filters.search) q = q.ilike('full_name', `%${filters.search}%`);

  q = q.order('priority', { ascending: true }).order('full_name', { ascending: true });

  const { data, error } = await q;
  if (error) throw new Error(`networking directory read failed: ${error.message}`);
  return (data ?? []) as NetworkContactDirectoryRow[];
}

// "How do we get to X" — every target with its ranked connector paths.
export async function getTargetPaths(region?: string): Promise<NetworkTargetPath[]> {
  const supabase = await createClient();
  let q = supabase.from('network_target_paths').select('*');
  if (region) q = q.eq('target_region', region);
  q = q.order('best_strength', { ascending: false }).order('target_priority', { ascending: true });
  const { data, error } = await q;
  if (error) throw new Error(`target paths read failed: ${error.message}`);
  return (data ?? []) as NetworkTargetPath[];
}

export async function getRegionRollup(): Promise<NetworkByRegionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('network_by_region').select('*');
  if (error) throw new Error(`region rollup read failed: ${error.message}`);
  return (data ?? []) as NetworkByRegionRow[];
}

export async function getContact(id: string): Promise<NetworkContact | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('network_contacts').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`contact read failed: ${error.message}`);
  return data as NetworkContact | null;
}

// Both directions for a contact: who can reach them, and who they can reach.
export async function getContactPaths(contactId: string) {
  const supabase = await createClient();
  const [{ data: inbound }, { data: outbound }] = await Promise.all([
    supabase.from('network_intro_paths').select('*').eq('target_id', contactId).order('strength', { ascending: false }),
    supabase.from('network_intro_paths').select('*').eq('connector_id', contactId).order('strength', { ascending: false }),
  ]);
  return { inbound: inbound ?? [], outbound: outbound ?? [] };
}

export async function getContactActivities(contactId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('network_activities')
    .select('*')
    .eq('contact_id', contactId)
    .order('occurred_at', { ascending: false });
  if (error) throw new Error(`activities read failed: ${error.message}`);
  return data ?? [];
}

export async function getCardInbox(): Promise<NetworkBusinessCard[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('network_business_cards')
    .select('*')
    .eq('status', 'inbox')
    .order('captured_at', { ascending: false });
  if (error) throw new Error(`card inbox read failed: ${error.message}`);
  return (data ?? []) as NetworkBusinessCard[];
}

// Signed URL for a private card image (bucket: network-cards).
export async function getCardImageUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage.from('network-cards').createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}
