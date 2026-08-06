'use client';
// Browser Supabase client for /admin pages (cookie-based session shared with
// the middleware and, through the storage adapter in admin-shell.js, with the
// not-yet-ported static admin pages).
// Connection values come from lib/supabase-public.mjs, which falls back to the
// public project literals so this never throws on a missing build var.
import { createBrowserClient } from '@supabase/ssr';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../../lib/supabase-public.mjs';

let client;
export function supabase() {
  if (!client) {
    client = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return client;
}
