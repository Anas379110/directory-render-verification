import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { sessionCookieOptions } from '../auth/session-cookie-options';
import { readSiteConfig } from '../site-config';

/**
 * عميل بصلاحيات المستخدم الموثّق (anon key + جلسته) — يخضع لـRLS الكاملة.
 * يُستخدم بكل Route Handler عادي (تسجيل شركة، إضافة تقييم، قراءة عامة).
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const cookieOptions = sessionCookieOptions(readSiteConfig().origin, process.env.NODE_ENV === 'production');
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set({
                name,
                value,
                ...options,
                ...cookieOptions,
                ...(options.maxAge === 0 ? { expires: new Date(0) } : {}),
              });
            }
          } catch {
            // RSC cannot persist cookies. Page refresh/deletion runs in proxy;
            // Route Handlers use this complete batch adapter directly.
          }
        },
      },
    }
  );
}

/**
 * عميل service_role — يتجاوز RLS بالكامل. حصريًا لمسارات app/api/admin/* بعد التحقق
 * من دور Admin صراحة بالكود. ممنوع استيراده بأي ملف Client Component (AGENTS.md/CLAUDE.md).
 */
export function createAdminSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
