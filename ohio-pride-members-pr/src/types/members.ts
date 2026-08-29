// src/types/members.ts
export interface MemberCrmRow {
  id: string;
  founding_number: number | null;
  display_name: string;
  full_name: string | null;
  email: string | null;
  city: string | null;
  county: string | null;
  state: string | null;
  elected_office: string | null;
  jurisdiction: string | null;
  tier: string | null;
  amount_cents: number | null;
  recurrence: string | null;
  public_quote: string | null;
  is_public: boolean;
  is_vetted: boolean;
  contributed_at: string | null;
  member_since: string | null;
  created_at: string;
  updated_at: string;
  donor_id: string | null;
  donor_source: string | null;
  prospect_id: string | null;
  prospect_stage: string | null;
}
