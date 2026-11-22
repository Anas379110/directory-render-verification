import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '../../../../lib/supabase/server';
import { getRestrictedAttemptStatus } from '../../../../lib/db/restricted-writes';
import { enforceRateLimit, RATE_LIMIT_RULES } from '../../../../lib/rate-limit';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  const limited=enforceRateLimit(request,'write-status:get',RATE_LIMIT_RULES.review);
  if(limited)return limited;
  const {id}=await params;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return NextResponse.json({error:'طلب غير موجود'},{status:404});
  const client=await createServerSupabaseClient();
  const {data:{user}}=await client.auth.getUser();
  if(!user)return NextResponse.json({error:'يجب تسجيل الدخول'},{status:401});
  try {
    const status=await getRestrictedAttemptStatus(id,user.id);
    if(status==='not-found')return NextResponse.json({error:'طلب غير موجود'},{status:404});
    return NextResponse.json({status},{headers:{'Cache-Control':'private, no-store'}});
  } catch {return NextResponse.json({error:'تعذر التحقق حاليًا'},{status:500});}
}
