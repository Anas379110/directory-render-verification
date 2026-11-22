import { getRestrictedModerationStore } from '../../../../../lib/db/restricted-moderation';
import { readJson } from '../../../../../lib/validation/read-json';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '../../../../../lib/auth/requireAdmin';
import { createAdminSupabaseClient } from '../../../../../lib/supabase/server';
import { moderationDecisionSchema } from '../../../../../lib/validation/schemas';
import { enforceRateLimit, RATE_LIMIT_RULES } from '../../../../../lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = enforceRateLimit(request, 'admin:patch', RATE_LIMIT_RULES.adminModeration);
  if (limited) return limited;

  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'صلاحيات غير كافية' }, { status: 403 });
  }

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'معرّف الشركة غير صالح' }, { status: 400 });
  }
  const body = await readJson(request);
  if (!body.success) return body.response;
  const parsed = moderationDecisionSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // The database transaction must commit both writes or neither. Actor comes
  // from verified server auth, never from the request body.
  try {
    const restricted = getRestrictedModerationStore();
    if (restricted) {
      try {
        const data = await restricted.moderateBusiness(admin.userId, id, parsed.data);
        return NextResponse.json({ data });
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
        const statuses: Record<string, number> = { PT400: 400, PT403: 403, PT404: 404, PT409: 409 };
        const status = Object.hasOwn(statuses, code) ? statuses[code] : 500;
        return NextResponse.json({ error: status === 409 ? 'تمت مراجعة هذا الطلب بالفعل' : 'تعذر حفظ القرار وسجل التدقيق' }, { status });
      }
    }
    const supabaseAdmin = createAdminSupabaseClient();
    const { data, error } = await supabaseAdmin.rpc('moderate_business_atomic', {
      p_business_id: id,
      p_actor_id: admin.userId,
      p_decision: parsed.data.decision,
      p_reason: parsed.data.rejectionReason ?? null,
    });
    if (error) {
      const errors: Record<string, { status: number; message: string }> = {
        PT400: { status: 400, message: 'قرار المراجعة غير صالح' },
        PT403: { status: 403, message: 'صلاحيات غير كافية' },
        PT404: { status: 404, message: 'الشركة غير موجودة' },
        PT409: { status: 409, message: 'تمت مراجعة هذا الطلب بالفعل' },
      };
      const failure = Object.hasOwn(errors, error.code) ? errors[error.code] : undefined;
      return NextResponse.json(
        { error: failure?.message ?? 'تعذر حفظ القرار وسجل التدقيق' },
        { status: failure?.status ?? 500 },
      );
    }
    if (!data) {
      return NextResponse.json({ error: 'تعذر حفظ القرار وسجل التدقيق' }, { status: 500 });
    }
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: 'تعذر حفظ القرار وسجل التدقيق' }, { status: 500 });
  }
}
