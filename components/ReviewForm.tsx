'use client';

import { WRITE_PAUSED_MESSAGE } from '../lib/db/write-maintenance-message';
import { useState } from 'react';
import { useAttemptResume } from './useAttemptResume';
import WriteOutcomeNotice from './WriteOutcomeNotice';

type SubmitState = 'idle' | 'submitting' | 'pending-review' | 'duplicate' | 'paused' | 'error';

/**
 * نموذج إضافة تقييم — يستهلك المسار الموجود POST /api/businesses/[id]/reviews دون تعديله.
 * يُعرض فقط لمن تحقق الخادم من جلسته؛ المسار نفسه يفرض الدخول (401) ويشتق user_id من الجلسة.
 * التقييم يدخل pending دائمًا ولا يظهر علنًا قبل اعتماده من مرحلة إشراف مستقلة.
 */
export default function ReviewForm({ businessId,ownerId,enableAttemptResume=false }: { businessId: string;ownerId?:string;enableAttemptResume?:boolean }) {
  const attempt=useAttemptResume(`review:${businessId}`,ownerId,enableAttemptResume);
  const pendingRequestId=attempt.pendingId;
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [state, setState] = useState<SubmitState>('idle');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if(pendingRequestId||state==='submitting'||state==='paused')return;
    if (rating < 1 || rating > 5) return;
    setState('submitting');
    let attemptId:string|null=null;let receivedFailure=false;
    try {
      attemptId=attempt.begin();
      const res = await fetch(`/api/businesses/${businessId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json',...(attemptId?{'x-write-attempt-id':attemptId}:{}) },
        body: JSON.stringify({ rating, comment: comment.trim() || undefined }),
      });
      if (res.status === 201) {
        attempt.clear();setState('pending-review');
      } else if (res.status === 409) {
        attempt.clear();setState('duplicate');
      } else {
        const body=await res.json().catch(()=>null);
        if(res.status===503&&body?.code==='WRITE_PAUSED'){receivedFailure=true;attempt.clear();setState('paused');return;}
        if(body?.code==='WRITE_OUTCOME_UNKNOWN'&&typeof body.requestId==='string'){attempt.uncertain(body.requestId);setState('idle');return;}
        receivedFailure=true;attempt.clear();setState('error');
      }
    } catch {
      if(attemptId&&!receivedFailure){attempt.uncertain(attemptId);setState('idle');return;}
      setState('error');
    }
  }

  if (state === 'pending-review') {
    return (
      <p role="status" className="bg-white border border-line rounded-2xl p-4 text-sm text-brand font-semibold">
        شكرًا لك — تقييمك قيد المراجعة ولن يظهر قبل اعتماده.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-line rounded-2xl p-4 space-y-3">
      <div>
        <span className="block text-sm font-semibold mb-1">تقييمك</span>
        <div className="flex gap-1" role="radiogroup" aria-label="التقييم من 1 إلى 5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} من 5`}
              onClick={() => setRating(n)}
              className={`text-2xl leading-none focus:outline-none focus:ring-2 focus:ring-brand rounded ${n <= rating ? 'text-gold' : 'text-line'}`}
            >
              ★
            </button>
          ))}
        </div>
      </div>
      <div>
        <label htmlFor="review-comment" className="block text-sm font-semibold mb-1">
          تعليقك (اختياري)
        </label>
        <textarea
          id="review-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={1000}
          rows={3}
          className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          placeholder="شاركنا تجربتك"
        />
      </div>
      {state === 'duplicate' && (
        <p role="alert" className="text-sm text-red-700">لقد قيّمت هذه الشركة من قبل.</p>
      )}
      {state === 'paused' && <p role="alert" className="text-sm text-red-700">{WRITE_PAUSED_MESSAGE}</p>}
      {state === 'error' && (
        <p role="alert" className="text-sm text-red-700">تعذر إرسال التقييم، حاول مرة أخرى.</p>
      )}
      {pendingRequestId&&<WriteOutcomeNotice requestId={pendingRequestId} onConfirmed={()=>{attempt.clear();setState('pending-review');}}/>}
      <button
        type="submit"
        disabled={state==='paused'||rating === 0 || state === 'submitting'||!!pendingRequestId}
        className="text-sm font-bold text-white bg-brand px-4 py-2 rounded-lg disabled:opacity-50"
      >
        {state==='paused'?'الإرسال متوقف للصيانة':pendingRequestId?'بانتظار التحقق':state === 'submitting' ? 'جارٍ الإرسال…' : 'إرسال التقييم'}
      </button>
    </form>
  );
}
