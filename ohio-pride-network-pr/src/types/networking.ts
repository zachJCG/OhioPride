// src/types/networking.ts
// Hand-written types for the networking module. If you run Supabase TypeGen, you can
// replace these with generated types; these are kept self-contained for the drop-in.

export type Warmth = 'cold' | 'warm' | 'hot';
export type InfluenceTier = 'principal' | 'connector' | 'gatekeeper' | 'staffer' | 'contact';
export type Priority = 'low' | 'medium' | 'high';
export type ContactStatus = 'active' | 'dormant' | 'do_not_contact' | 'archived';
export type IntroStatus = 'potential' | 'requested' | 'made' | 'declined' | 'blocked';

// Ohio Pride regional taxonomy (mirrors the prospects pipeline values).
export const REGIONS = [
  'Statewide',
  'Greater Columbus',
  'Greater Cincinnati',
  'Greater Cleveland',
  'Greater Dayton',
  'Akron/Canton',
  'Toledo',
  'Southeast Ohio',
  'National',
  'Out-of-state',
] as const;

export interface NetworkContact {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  organization: string | null;
  sector: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  website: string | null;
  city: string | null;
  county: string | null;
  region: string | null;
  state: string | null;
  zip: string | null;
  influence_tier: InfluenceTier | null;
  relationship_strength: number | null;
  warmth: Warmth | null;
  is_target: boolean;
  is_connector: boolean;
  priority: Priority | null;
  status: ContactStatus | null;
  do_not_contact: boolean;
  owner_id: string | null;
  card_image_path: string | null;
  tags: string[];
  source: string | null;
  how_they_help: string | null;
  ask_context: string | null;
  last_contacted_at: string | null;
  next_action: string | null;
  next_action_date: string | null;
  notes: string | null;
}

export interface NetworkContactDirectoryRow extends NetworkContact {
  owner_name: string | null;
  activity_count: number;
  last_activity_at: string | null;
  inbound_path_count: number; // # of connectors who can reach this person
  outbound_intro_count: number; // # of people this person can introduce us to
}

export interface NetworkIntroduction {
  id: string;
  connector_id: string;
  target_id: string;
  relationship_label: string | null;
  strength: number;
  status: IntroStatus;
  confidence: string | null;
  notes: string | null;
  requested_at: string | null;
  made_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NetworkTargetPath {
  target_id: string;
  target_name: string;
  target_org: string | null;
  target_region: string | null;
  target_county: string | null;
  target_tier: InfluenceTier | null;
  target_priority: Priority | null;
  path_count: number;
  best_strength: number;
  paths_made: number;
  connector_paths: string; // "Jane Doe (Statewide, 5/5, potential); ..."
}

export interface NetworkByRegionRow {
  region: string;
  contact_count: number;
  target_count: number;
  connector_count: number;
  hot_count: number;
  warm_count: number;
  actions_due: number;
}

export interface NetworkBusinessCard {
  id: string;
  created_at: string;
  created_by: string | null;
  image_path: string | null;
  raw_notes: string | null;
  parsed: Record<string, unknown>;
  captured_at: string;
  event_context: string | null;
  location: string | null;
  region: string | null;
  county: string | null;
  status: 'inbox' | 'processed' | 'discarded';
  contact_id: string | null;
}
