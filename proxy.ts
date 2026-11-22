import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { sessionCookieOptions } from './lib/auth/session-cookie-options';
import { readSiteConfig } from './lib/site-config';

/**
 * Refresh shared sessions before server-rendered pages read them. RSC cannot
 * persist refreshed/deleted cookies itself. Ordinary pages stay public;
 * requireAdmin inside admin handlers remains the final authorization check.
 */
export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isApi = pathname === '/api/admin' || pathname.startsWith('/api/admin/');
  const protectedAdmin = isApi || pathname === '/admin' || pathname.startsWith('/admin/');
  const cookieOptions = sessionCookieOptions(readSiteConfig().origin, process.env.NODE_ENV === 'production');
  const pending = new Map<string, { value: string; options: CookieOptions }>();
  let response = NextResponse.next({ request });

  function attachSessionCookies(target: NextResponse) {
    for (const [name, { value, options }] of pending) {
      target.cookies.set(name, value, {
        ...options,
        ...cookieOptions,
        // Keep deletion effective through middleware-to-RSC cookie merging.
        // A zero Max-Age alone can be lost when the framework reparses it.
        ...(options.maxAge === 0 ? { expires: new Date(0) } : {}),
      });
    }
    if (pending.size || protectedAdmin) target.headers.set('Cache-Control', 'private, no-store');
    return target;
  }
  function deny() {
    const target = isApi
      ? NextResponse.json({ error: 'غير مصرَّح' }, { status: 401 })
      : NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname)}`, request.url));
    return attachSessionCookies(target);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return protectedAdmin ? deny() : response;

  try {
    const supabase = createServerClient(url, key, {
      cookieOptions,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          for (const { name, value, options } of cookiesToSet) {
            request.cookies.set(name, value);
            pending.set(name, { value, options });
          }
          // Keep both the updated request for RSC and every pending response
          // cookie, including chunk deletions and repeated SDK callbacks.
          response = attachSessionCookies(NextResponse.next({ request }));
        },
      },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (protectedAdmin && (!user || user.app_metadata?.role !== 'admin')) return deny();
  } catch {
    // An Auth outage must not grant admin access or break public page rendering.
    if (protectedAdmin) return deny();
  }
  return attachSessionCookies(response);
}

// Normal API handlers can persist cookies themselves. Refresh page sessions
// before RSC reads them; retain the separate admin API authorization boundary.
export const config = {
  matcher: ['/((?!api/|_next/|favicon.ico|robots.txt|sitemap.xml).*)', '/api/admin/:path*'],
};
