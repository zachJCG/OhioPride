import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client (service role). Used by API route handlers and
 * by server components for the footer leadership block. Returns `null` when
 * env vars are missing so callers can fall back gracefully — the same
 * "fail open" pattern the original Netlify functions used.
 */
export function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
