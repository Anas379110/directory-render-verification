import { readJson } from '../../../../lib/validation/read-json';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '../../../../lib/supabase/server';
import { enforceRateLimit, RATE_LIMIT_RULES } from '../../../../lib/rate-limit';

export const dynamic = 'force-dynamic';

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

/**
 * دخول عبر الخادم: كوكي الجلسة يُكتب هنا في استجابة Route Handler بشكل متزامن وموثوق.
 * (الكتابة من عميل المتصفح مؤجّلة وقد تصل بعد أول تنقّل، فتظهر الترويسة بحالة زائر.)
 * نفس مزوّد البريد/كلمة المرور، بلا تغيير في سياسة المصادقة.
 */
export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, 'auth:login', RATE_LIMIT_RULES.login);
  if (limited) return limited;

  const body = await readJson(request);
  if (!body.success) return body.response;
  const parsed = loginSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    return NextResponse.json({ error: 'بيانات الدخول غير صحيحة' }, { status: 401 });
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
