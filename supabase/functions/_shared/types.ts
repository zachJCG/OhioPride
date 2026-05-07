// =====================================================================
// Shared types for endorsement notification Edge Functions
// =====================================================================

/** Subset of endorsement_applications row that the notifications use. */
export interface EndorsementApplication {
  id: string;
  created_at: string;
  updated_at: string;
  status: "submitted" | "under_review" | "endorsed" | "declined" | "withdrawn";
  candidate_name: string;
  pronouns: string | null;
  office_sought: string;
  district: string | null;
  election_year: number | null;
  party: string | null;
  email: string;
  phone: string | null;
  website: string | null;
  is_out: "yes" | "no" | "prefer_not_to_say" | null;
}

/** Standard payload shape for SQL trigger -> Edge Function via pg_net. */
export interface WebhookPayload {
  record: EndorsementApplication;
  old_record?: Partial<EndorsementApplication> | null;
}
