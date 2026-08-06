/* Root middleware: server-side session gate for /admin/*.
 *
 * Replaces the client-side "flash then redirect" gate for ported admin pages.
 * The session lives in @supabase/ssr cookies; the static admin pages under
 * public/admin/ share the same cookies via the storage adapter inlined in
 * admin-shell.js / admin-auth.js, so one sign-in covers both worlds.
 *
 * Fails open when the Supabase env is missing (e.g. a preview without env
 * vars): pages then fall back to their client-side gates, and RLS remains the
 * real enforcement layer either way.
 */
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(req) {
  const { pathname } = req.nextUrl;

  // Static assets under /admin/ (shell css/js, manifest, images) pass through.
  if (/\.[\w]+$/.test(pathname)) return NextResponse.next();

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

  const isLogin = pathname.startsWith('/admin/login');
  if (!user && !isLogin) {
    const to = req.nextUrl.clone();
    to.pathname = '/admin/login';
    to.search = '';
    to.searchParams.set('next', pathname);
    return NextResponse.redirect(to);
  }
  if (user && isLogin) {
    const to = req.nextUrl.clone();
    to.pathname = '/admin/dashboard';
    to.search = '';
    return NextResponse.redirect(to);
  }
  return res;
}

export const config = { matcher: ['/admin/:path*'] };
