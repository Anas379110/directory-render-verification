import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

/**
 * حماية حدودية لمسارات الإدارة (CLAUDE.md). طبقة أولى فقط: requireAdmin داخل كل
 * مسار يبقى المرجع النهائي للتخويل، وهذا الحد لا يستبدله. عند أي شك يفشل مغلقاً.
 */
export async function proxy(request: NextRequest) {
  const isApi = request.nextUrl.pathname.startsWith('/api/admin');
  const deny = () =>
    isApi
      ? NextResponse.json({ error: 'غير مصرَّح' }, { status: 401 })
      : NextResponse.redirect(
          new URL(`/login?next=${encodeURIComponent(request.nextUrl.pathname)}`, request.url)
        );

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return deny(); // بلا إعداد مصادقة = رفض، لا تمرير

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== 'admin') return deny();
  return response;
}

export const config = { matcher: ['/admin/:path*', '/api/admin/:path*'] };
