import { pausedWriteResponse } from '../../../../../lib/db/write-maintenance';
import { getRestrictedWriteHandlers } from '../../../../../lib/db/restricted-writes';
import { readJson } from '../../../../../lib/validation/read-json';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '../../../../../lib/supabase/server';
import { reviewSchema } from '../../../../../lib/validation/schemas';
import { enforceRateLimit, RATE_LIMIT_RULES } from '../../../../../lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const paused = pausedWriteResponse();
  if (paused) return paused;
  try {
    const restricted=getRestrictedWriteHandlers();
    if (restricted) return await restricted.review(request,(await params).id);
  } catch {
    return NextResponse.json({error:'تعذر حفظ التقييم'},{status:500});
  }
  const limited = enforceRateLimit(request, 'reviews:post', RATE_LIMIT_RULES.review);
  if (limited) return limited;

  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // FR3/US2 — تقييم يتطلب تسجيل دخول، لا زوار مجهولين (يمنع Spam)
  if (!user) {
    return NextResponse.json({ error: 'يجب تسجيل الدخول لإضافة تقييم' }, { status: 401 });
  }

  const body = await readJson(request);
  if (!body.success) return body.response;
  const parsed = reviewSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // user_id يُشتقّ من الجلسة دائمًا — لا يُقرأ من مدخلات العميل (يمنع انتحال هوية مقيّم آخر)
  // القيد Unique(business_id, user_id) بقاعدة البيانات يفرض تقييمًا واحدًا لكل مستخدم لكل شركة
  const { data, error } = await supabase
    .from('reviews')
    .insert({
    business_id: id,
      user_id: user.id,
      rating: parsed.data.rating,
      comment: parsed.data.comment,
      status: 'pending', // FR3 — يدخل pending دائمًا، لا نشر مباشر
    })
    .select()
    .single();

  if (error) {
    // خطأ قيد Unique = المستخدم قيّم هذه الشركة من قبل
    if (error.code === '23505') {
      return NextResponse.json({ error: 'لقد قيّمت هذه الشركة من قبل' }, { status: 409 });
    }
    return NextResponse.json({ error: 'تعذر حفظ التقييم' }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
