/* Public Supabase connection values for browser and middleware code.
 *
 * These two values are public by design: the anon key is the browser-facing
 * key and RLS is the enforcement layer, which is why the same pair already
 * ships inline in public/admin/admin-shell.js and admin-auth.js.
 *
 * They are literals here, not env-only, so /admin keeps working when the
 * NEXT_PUBLIC_* build vars are absent. Depending on those vars alone took
 * the admin down once (2026-08-06): createBrowserClient throws on undefined
 * inputs, which surfaced as "Application error: a client-side exception" on
 * the login page, and the middleware gate silently failed open.
 *
 * Setting NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel
 * still wins, so a preview or fork can point at a different project.
 *
 * The service-role key is NEVER here — it stays server-only in
 * SUPABASE_SERVICE_ROLE_KEY, read exclusively by lib/functions/*.
 */

const FALLBACK_URL = 'https://dkdxefzhttkmjhdbkvqn.supabase.co';
const FALLBACK_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrZHhlZnpodHRrbWpoZGJrdnFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MTk5NjksImV4cCI6MjA5MjM5NTk2OX0.l6wUMIdUX5Es4Jvh8fRTvnlYrMQKzYy_NEGBFJ1iMj4';

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_URL;
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_ANON_KEY;
