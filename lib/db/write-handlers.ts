import { verificationWriterResponse } from './verification-write-guard';
import { randomUUID, createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { businessRegistrationSchema, reviewSchema } from '../validation/schemas';
import { readJson } from '../validation/read-json';
import { withWriterIdentity, UnknownCommitOutcomeError, type WriterPool, type WriterConnection } from './writer-transaction';

async function insertOne(connection: WriterConnection, sql: string, params: unknown[]) {
  const result = await connection.query(sql, params) as { rows: unknown[] };
  if (result.rows.length !== 1) throw new Error('Expected exactly one inserted record');
  return result.rows[0];
}

async function existingAttempt(pool:WriterPool,kind:'business'|'review',id:string,owner:string){
  const record=await withWriterIdentity(pool,owner,async connection=>{
    await connection.query('SET TRANSACTION READ ONLY');
    const sql=kind==='business'?'SELECT * FROM public.businesses WHERE id=$1 AND owner_id=$2':'SELECT * FROM public.reviews WHERE id=$1 AND user_id=$2';
    return (await connection.query(sql,[id,owner]) as {rows:unknown[]}).rows[0];
  });
  if(record)return NextResponse.json({data:record},{status:201});
  return NextResponse.json({error:'لم تتأكد نتيجة الإرسال بعد. لا تُعد الإرسال حتى التحقق.',code:'WRITE_OUTCOME_UNKNOWN',requestId:id},{status:500});
}

/** Dependencies bound only on the server. */
export interface WriteBoundaryDependencies {
  pool: WriterPool;
  getUser(): Promise<{ id: string } | null>;
  checkLimit(request: NextRequest, scope: 'business' | 'review'): NextResponse | null;
  verifyBusinessToken(token: string): Promise<boolean>;
  newRecordId?(): string;
  recordIntent?(event: { kind: 'business' | 'review'; recordId: string; ownerId: string; requestHash?: string }): Promise<void|'new'|'existing'>;
  recordOutcome?(event: { kind: 'business' | 'review'; recordId: string; ownerId: string; outcome: 'committed' | 'failed' | 'unknown' }): void | Promise<void>;
}

/** Matches existing JSON response contracts for the restricted path. */
export function createWriteHandlers(deps: WriteBoundaryDependencies) {
  const outcome = async (kind: 'business' | 'review', recordId: string, ownerId: string, state: 'committed' | 'failed' | 'unknown') => {
    // Telemetry failure after a commit must not turn a successful write into a retry.
    try { await deps.recordOutcome?.({kind,recordId,ownerId,outcome:state}); } catch { /* keep original outcome */ }
  };
  return {
    async business(request: NextRequest) {
      const limited = deps.checkLimit(request, 'business');
      if (limited) return limited;
      const user = await deps.getUser();
      if (!user) return NextResponse.json({ error: 'يجب تسجيل الدخول أولًا' }, { status: 401 });
      const verificationDenial = verificationWriterResponse(user.id);
      if (verificationDenial) return verificationDenial;
      const body = await readJson(request);
      if (!body.success) return body.response;
      const parsed = businessRegistrationSchema.safeParse(body.data);
      if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
      if (!(await deps.verifyBusinessToken(parsed.data.turnstileToken))) {
        return NextResponse.json({ error: 'فشل التحقق الأمني (Turnstile)' }, { status: 400 });
      }
      const recordId = request.headers.get('x-write-attempt-id') ?? deps.newRecordId?.() ?? randomUUID();
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(recordId))return NextResponse.json({error:'مرجع طلب غير صالح'},{status:400});
      try {
        const requestHash=createHash('sha256').update(JSON.stringify(['business',user.id,parsed.data.name,parsed.data.description??null,parsed.data.categoryId])).digest('hex');
        const claim=await deps.recordIntent?.({kind:'business',recordId,ownerId:user.id,requestHash});
        if(claim==='existing')return await existingAttempt(deps.pool,'business',recordId,user.id);

        const record = await withWriterIdentity(deps.pool, user.id, conn => insertOne(conn,
          "INSERT INTO public.businesses (id,owner_id,name,description,category_id,status) VALUES ($1,$2,$3,$4,$5,'pending') RETURNING *",
          [recordId, user.id, parsed.data.name, parsed.data.description ?? null, parsed.data.categoryId],
        ));
        await outcome('business',recordId,user.id,'committed');
        return NextResponse.json({ data: record }, { status: 201 });
      } catch (error) {
        if(typeof error==='object'&&error!==null&&'code' in error&&error.code==='WRITE_ATTEMPT_CONFLICT')return NextResponse.json({error:'مرجع الطلب مستخدم لعملية مختلفة'},{status:409});
        await outcome('business',recordId,user.id,error instanceof UnknownCommitOutcomeError ? 'unknown' : 'failed');
        if (error instanceof UnknownCommitOutcomeError) return NextResponse.json({error:'لم تتأكد نتيجة الإرسال بعد. لا تُعد الإرسال حتى التحقق.',code:'WRITE_OUTCOME_UNKNOWN',requestId:recordId},{status:500});
        return NextResponse.json({ error: 'تعذر حفظ الطلب' }, { status: 500 });
      }
    },
    async review(request: NextRequest, businessId: string) {
      const limited = deps.checkLimit(request, 'review');
      if (limited) return limited;
      const user = await deps.getUser();
      if (!user) return NextResponse.json({ error: 'يجب تسجيل الدخول لإضافة تقييم' }, { status: 401 });
      const verificationDenial = verificationWriterResponse(user.id);
      if (verificationDenial) return verificationDenial;
      const body = await readJson(request);
      if (!body.success) return body.response;
      const parsed = reviewSchema.safeParse(body.data);
      if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
      const recordId = request.headers.get('x-write-attempt-id') ?? deps.newRecordId?.() ?? randomUUID();
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(recordId))return NextResponse.json({error:'مرجع طلب غير صالح'},{status:400});
      try {
        const requestHash=createHash('sha256').update(JSON.stringify(['review',user.id,businessId,parsed.data.rating,parsed.data.comment??null])).digest('hex');
        const claim=await deps.recordIntent?.({kind:'review',recordId,ownerId:user.id,requestHash});
        if(claim==='existing')return await existingAttempt(deps.pool,'review',recordId,user.id);

        const record = await withWriterIdentity(deps.pool, user.id, conn => insertOne(conn,
          "INSERT INTO public.reviews (id,business_id,user_id,rating,comment,status) VALUES ($1,$2,$3,$4,$5,'pending') RETURNING *",
          [recordId, businessId, user.id, parsed.data.rating, parsed.data.comment ?? null],
        ));
        await outcome('review',recordId,user.id,'committed');
        return NextResponse.json({ data: record }, { status: 201 });
      } catch (error) {
        if(typeof error==='object'&&error!==null&&'code' in error&&error.code==='WRITE_ATTEMPT_CONFLICT')return NextResponse.json({error:'مرجع الطلب مستخدم لعملية مختلفة'},{status:409});
        await outcome('review',recordId,user.id,error instanceof UnknownCommitOutcomeError ? 'unknown' : 'failed');
        if (error instanceof UnknownCommitOutcomeError) return NextResponse.json({error:'لم تتأكد نتيجة الإرسال بعد. لا تُعد الإرسال حتى التحقق.',code:'WRITE_OUTCOME_UNKNOWN',requestId:recordId},{status:500});
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
          return NextResponse.json({ error: 'لقد قيّمت هذه الشركة من قبل' }, { status: 409 });
        }
        return NextResponse.json({ error: 'تعذر حفظ التقييم' }, { status: 500 });
      }
    },
  };
}
