import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '../../../../lib/supabase/server';
import { enforceRateLimit, RATE_LIMIT_RULES } from '../../../../lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * خروج عبر الخادم: حذف كوكي الجلسة يتم هنا في استجابة Route Handler بشكل متزامن
 * (حذفه من عميل المتصفح مؤجّل مثل كتابته، وقد يبقي الخادم يرى جلسة قديمة).
 */
export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, 'auth:logout', RATE_LIMIT_RULES.logout);
  if (limited) return limited;

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    return NextResponse.json({ error: 'تعذر تسجيل الخروج، أعد المحاولة' }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
