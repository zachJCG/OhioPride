// src/lib/supabase/client.ts
// Browser Supabase client for Client Components. Reads the session from cookies set by
// middleware, so RLS sees the signed-in admin on client-side queries too.

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
