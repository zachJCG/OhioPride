/* Root middleware: server-side session gate for /admin/*.
 *
 * Replaces the client-side "flash then redirect" gate for ported admin pages.
 * The session lives in @supabase/ssr cookies; the static admin pages under
 * public/admin/ share the same cookies via the storage adapter inlined in
 * admin-shell.js / admin-auth.js, so one sign-in covers both worlds.
 *
 * The matcher is broad and the admin check is done on a lowercased pathname:
 * Next's rewrites match their sources case-insensitively (so /ADMIN/tasks
 * would still serve the static admin page), while matcher patterns are
 * case-sensitive — a '/admin/:path*' matcher alone would let mixed-case URLs
 * skip the gate. Non-admin requests exit after one string check.
 *
 * Fails open when the Supabase env is missing (e.g. a preview without env
 * vars): pages then fall back to their client-side gates, and RLS remains the
 * real enforcement layer either way.
 */
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  const lower = pathname.toLowerCase();

  if (!lower.startsWith('/admin')) return NextResponse.next();

  // Static assets under /admin/ (shell css/js, manifest, images) pass through.
  if (/\.[\w]+$/.test(lower)) return NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next();

  const res = NextResponse.next();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (cookies) =>
        cookies.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
    },
  });
  const { data: { user } } = await supabase.auth.getUser();

  // Carry any cookies the auth client refreshed onto whichever response we
  // return; dropping them on a redirect would discard a rotated token family.
  const withAuthCookies = (response) => {
    res.cookies.getAll().forEach((c) => response.cookies.set(c));
    return response;
  };

  // /admin/login is never bounced server-side: @supabase/ssr runs the PKCE
  // flow, so recovery and invite emails land there as /admin/login?code=...
  // and a redirect would strip the code before the client could exchange it.
  // The login page itself forwards already-signed-in visitors.
  const isLogin = lower.startsWith('/admin/login');
  if (!user && !isLogin) {
    const to = req.nextUrl.clone();
    to.pathname = '/admin/login';
    to.search = '';
    to.searchParams.set('next', pathname);
    return withAuthCookies(NextResponse.redirect(to));
  }
  return res;
}

// Broad matcher (see note above); the function itself narrows to /admin.
// Excludes Next internals and api routes outright.
export const config = {
  matcher: ['/((?!_next/|api/).*)'],
};
