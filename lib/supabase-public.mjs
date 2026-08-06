/* Public Supabase connection values, shared by browser, middleware, and the
 * server functions that build a caller-JWT client.
 *
 * These two values are public by design: the anon key is the browser-facing
 * key and RLS is the enforcement layer, which is why the same pair already
 * ships inline in public/admin/admin-shell.js and admin-auth.js.
 *
 * They are literals here, not env-only, because depending on env vars alone
 * broke production twice on 2026-08-06:
 *   - NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY were never set, so
 *     createBrowserClient threw on undefined and the login page rendered
 *     "Application error: a client-side exception", while the middleware
 *     session gate silently failed open.
 *   - SUPABASE_ANON_KEY was never set either (the anon key had always lived
 *     inline in the browser files), so every function that builds a
 *     caller-JWT client returned server_misconfigured: admin-user-manage
 *     (password saves), admin-dashboard, admin-board-retreat,
 *     admin-contacts-import, and endorsement-pdf.
 *
 * Env still wins where it is set, so a preview or fork can point elsewhere.
 * NEXT_PUBLIC_* is read as a literal process.env.X expression on purpose:
 * that exact form is what Next inlines into client bundles at build time.
 *
 * The service-role key is NEVER here — it stays server-only in
 * SUPABASE_SERVICE_ROLE_KEY and has no fallback, by design.
 */

const FALLBACK_URL = 'https://dkdxefzhttkmjhdbkvqn.supabase.co';
const FALLBACK_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrZHhlZnpodHRrbWpoZGJrdnFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MTk5NjksImV4cCI6MjA5MjM5NTk2OX0.l6wUMIdUX5Es4Jvh8fRTvnlYrMQKzYy_NEGBFJ1iMj4';

// Build-time inlined in client bundles; undefined server-side unless set.
const PUBLIC_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLIC_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Server-side names. Absent in the browser, which is fine — the reads above
// and the literals below cover it.
const serverEnv = (typeof process !== 'undefined' && process.env) ? process.env : {};

export const SUPABASE_URL = PUBLIC_URL || serverEnv.SUPABASE_URL || FALLBACK_URL;
export const SUPABASE_ANON_KEY = PUBLIC_ANON_KEY || serverEnv.SUPABASE_ANON_KEY || FALLBACK_ANON_KEY;
