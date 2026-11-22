import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { readJson } from '../../../../lib/validation/read-json';
import { createServerSupabaseClient } from '../../../../lib/supabase/server';
import { enforceRateLimit, RATE_LIMIT_RULES } from '../../../../lib/rate-limit';
export const dynamic = 'force-dynamic';
/** PKCE code exchange only. No token/URL logging and no caller-selected redirect. */
export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, 'auth:confirm', RATE_LIMIT_RULES.login);
  if (limited) return limited;
  const body = await readJson(request);
  if (!body.success) return body.response;
  const parsed = z.object({ code: z.string().min(1).max(4096) }).safeParse(body.data);
  if (!parsed.success) return NextResponse.json({ error: 'رابط غير صالح' }, { status: 400 });
  try {
    const client = await createServerSupabaseClient();
    const { error } = await client.auth.exchangeCodeForSession(parsed.data.code);
    return NextResponse.json(error ? { error: 'تعذر تأكيد الحساب' } : { ok: true }, { status: error ? 400 : 200, headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'تعذر تأكيد الحساب' }, { status: 500, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
