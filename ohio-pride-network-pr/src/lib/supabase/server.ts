// src/lib/supabase/server.ts
// Authenticated server-side Supabase client for the Next.js App Router.
//
// WHY THIS FILE EXISTS (the donor-pipeline "no data showing" fix):
// The pipeline views (prospects_pipeline, pac_pipeline, c4_pipeline, fundraising_dashboard)
// are declared `security_invoker = on`, and the underlying tables' RLS SELECT policies
// require has_permission('<module>','read'), which reads the logged-in user's email from
// auth.jwt(). If a Server Component queries Supabase with a plain anon client (no user
// session attached), auth.jwt() is NULL -> has_permission() returns false -> the views
// return ZERO rows even though the data exists.
//
// This client wires the user's auth cookies into every request, so RLS sees the real
// signed-in admin and the pipeline returns rows. ALWAYS use this in Server Components,
// Route Handlers, and Server Actions that read RLS-protected data.

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component where cookies are read-only.
            // Safe to ignore when middleware (updateSession) is refreshing the session.
          }
        },
      },
    }
  );
}
