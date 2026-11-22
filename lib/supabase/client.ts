import { createBrowserClient } from '@supabase/ssr';
import { sessionCookieOptions } from '../auth/session-cookie-options';

// anon key فقط — كل استعلام من هنا يمر عبر RLS الكاملة (لا service_role هنا إطلاقًا)
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: sessionCookieOptions(
        typeof window === 'undefined' ? undefined : window.location.origin,
        process.env.NODE_ENV === 'production',
      ),
    }
  );
}
