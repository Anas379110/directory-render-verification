import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/**
 * عميل بصلاحيات المستخدم الموثّق (anon key + جلسته) — يخضع لـRLS الكاملة.
 * يُستخدم بكل Route Handler عادي (تسجيل شركة، إضافة تقييم، قراءة عامة).
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // قراءة الجلسة من مكوّن خادم (RSC) لا تسمح بتعديل الكوكيز — التجاهل آمن هنا
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {
            // كما في set أعلاه
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
