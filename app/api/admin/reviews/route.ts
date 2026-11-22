import { getRestrictedModerationStore } from '../../../../lib/db/restricted-moderation';
import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/auth/requireAdmin';
import { createAdminSupabaseClient } from '../../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'صلاحيات غير كافية' }, { status: 403 });
  }

  try {
    const restricted = getRestrictedModerationStore();
    if (restricted) return NextResponse.json({ data: await restricted.listReviews(admin.userId) });
  } catch { return NextResponse.json({ error: 'تعذر تحميل طابور المراجعة' }, { status: 500 }); }

  // service_role يتجاوز RLS عمدًا هنا — مسموح فقط بعد requireAdmin أعلاه (لا استخدام آخر بالكود)
  const supabaseAdmin = createAdminSupabaseClient();
  const { data, error } = await supabaseAdmin
    .from('reviews')
    .select('id, rating, comment, created_at, businesses(name)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true }); // الأقدم أولًا — نفس اتفاق طابور الشركات

  if (error) return NextResponse.json({ error: 'تعذر تحميل طابور التقييمات' }, { status: 500 });
  return NextResponse.json({ data });
}
