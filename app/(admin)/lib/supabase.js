'use client';
// Browser Supabase client for /admin pages (cookie-based session shared with middleware).
// Requires: npm i @supabase/ssr   Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
import { createBrowserClient } from '@supabase/ssr';

let client;
export function supabase() {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }
  return client;
}
