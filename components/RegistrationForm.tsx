'use client';

import { WRITE_PAUSED_MESSAGE } from '../lib/db/write-maintenance-message';
import { useState, useEffect, useRef, useCallback } from 'react';
import Script from 'next/script';
import { useAttemptResume } from './useAttemptResume';
import WriteOutcomeNotice from './WriteOutcomeNotice';
import { businessRegistrationSchema } from '../lib/validation/schemas';

export default function RegistrationForm({ownerId,enableAttemptResume=false}:{ownerId?:string;enableAttemptResume?:boolean}={}) {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'paused' | 'error'>('idle');
  const attempt=useAttemptResume('business',ownerId,enableAttemptResume);
  const pendingRequestId=attempt.pendingId;
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loadingCategories, setLoadingCategories] = useState<boolean>(true);
  const [turnstileToken, setTurnstileToken] = useState<string>('');
  const [turnstileFailed, setTurnstileFailed] = useState(!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
  const widgetRef = useRef<HTMLDivElement>(null);

  // عرض صريح للأداة بمعالجات واضحة: نجاح يخزن التوكن، وخطأ/انتهاء يمسحانه فورًا
  // كي لا يُرسل توكن بالٍ للخادم (التحقق النهائي دائمًا خادمي fail-closed).
  const renderWidget = useCallback(() => {
    const w = (window as unknown as {
      turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => void };
    }).turnstile;
    const el = widgetRef.current;
    const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    // بلا مفتاح موقع مضبوط: لا نستدعي render أصلًا (يرمي خطأ JS) — نُظهر رسالة الفشل الصادقة
    if (!sitekey) return;
    if (!w || !el || el.childElementCount > 0) return;
    w.render(el, {
      sitekey,
      callback: (token: string) => {
        setTurnstileToken(token);
        setTurnstileFailed(false);
      },
      'error-callback': () => {
        setTurnstileToken('');
        setTurnstileFailed(true);
      },
      'expired-callback': () => {
        setTurnstileToken('');
      },
    });
  }, []);

  useEffect(() => {
    renderWidget(); // يغطي حالة السكربت المحمّل مسبقًا؛ onLoad يغطي التحميل اللاحق
  }, [renderWidget]);

  useEffect(() => {
    async function fetchCategories() {
      try {
        const resp = await fetch('/api/categories');
        if (resp.ok) {
          const json = await resp.json();
          setCategories(json.data);
        }
      } finally {
        setLoadingCategories(false);
      }
    }
    fetchCategories();
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if(pendingRequestId||status==='submitting'||status==='paused')return;
    setStatus('submitting');
    setErrorMsg(null);

    const form = new FormData(e.currentTarget);
    const payload = {
      name: form.get('name') as string,
      description: form.get('description') as string,
      categoryId: form.get('categoryId') as string,
      turnstileToken, // يُملأ من معالج الأداة الصريح؛ يُمسح عند خطأ/انتهاء التحدي
    };

    // فحص أمامي أولي فقط (UX) — التحقق الحقيقي دائمًا خادمي (CLAUDE.md، لا استثناء)
    const clientCheck = businessRegistrationSchema.safeParse(payload);
    if (!clientCheck.success) {
      setStatus('error');
      setErrorMsg('تحقق من الحقول المطلوبة');
      return;
    }

    let attemptId:string|null=null;let receivedFailure=false;
    try {
      attemptId=attempt.begin();
      const res = await fetch('/api/businesses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json',...(attemptId?{'x-write-attempt-id':attemptId}:{}) },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json();
        if(res.status===503&&body.code==='WRITE_PAUSED'){receivedFailure=true;attempt.clear();setStatus('paused');setErrorMsg(WRITE_PAUSED_MESSAGE);return;}
        if(body.code==='WRITE_OUTCOME_UNKNOWN'&&typeof body.requestId==='string'){attempt.uncertain(body.requestId);setStatus('error');return;}
        receivedFailure=true;attempt.clear();
        throw new Error(body.error?.formErrors?.[0] ?? body.error ?? 'حدث خطأ');
      }
      attempt.clear();setStatus('success');
    } catch (err) {
      if(attemptId&&!receivedFailure){attempt.uncertain(attemptId);setStatus('error');return;}
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'حدث خطأ غير متوقع');
      // توكن Turnstile يُستهلك مرة واحدة — امسحه وأعد ضبط الأداة لإتاحة محاولة جديدة
      setTurnstileToken('');
      (window as unknown as { turnstile?: { reset?: () => void } }).turnstile?.reset?.();
    }
  }

  if (status === 'success') {
    return (
      <div role="status" aria-live="polite" aria-atomic="true" className="bg-green-50 border border-green-200 text-green-800 rounded p-4">
        تم استلام طلبك بنجاح — طلبك الآن قيد المراجعة، وسيظهر بالدليل بعد الموافقة.
      </div>
    );
  }

  return (
    <>
      {/* السكربت الرسمي الوحيد لـTurnstile مع عرض صريح بالمعالجات (FR7، نموذج تسجيل الشركة فقط) */}
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" onLoad={renderWidget} />
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <div>
        <label htmlFor="name" className="block text-sm font-medium mb-1">اسم الشركة</label>
        <input id="name" name="name" required minLength={2} className="w-full border rounded px-3 py-2" />
      </div>
      <div>
        <label htmlFor="description" className="block text-sm font-medium mb-1">الوصف</label>
        <textarea id="description" name="description" className="w-full border rounded px-3 py-2" rows={4} />
      </div>
      <div>
        <label htmlFor="categoryId" className="block text-sm font-medium mb-1">التصنيف</label>
        <select
          id="categoryId"
          name="categoryId"
          required
          className="w-full border rounded px-3 py-2"
          disabled={loadingCategories}
        >
          <option value="">{loadingCategories ? 'جاري تحميل التصنيفات...' : 'اختر تصنيفًا...'}</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      {/* Cloudflare Turnstile — حاوية العرض الصريح (FR7). لا cf-turnstile class كي لا يتضمن تلقائيًا بلا معالجات */}
      <div ref={widgetRef} />
      {turnstileFailed && (
        <p className="text-red-600 text-sm" role="alert" aria-live="polite" aria-atomic="true">
          تعذر التحقق الأمني، أعد تحميل الصفحة أو حاول مجددًا
        </p>
      )}

      {errorMsg && (
        <p className="text-red-600 text-sm" aria-live="polite" aria-atomic="true">
          {errorMsg}
        </p>
      )}

      {pendingRequestId&&<WriteOutcomeNotice requestId={pendingRequestId} onConfirmed={()=>{attempt.clear();setStatus('success');}}/>}
      <button
        type="submit"
        disabled={status==='paused'||status === 'submitting'||!!pendingRequestId}
        className="bg-brand text-white px-4 py-2 rounded disabled:opacity-50"
      >
        {status==='paused'?'الإرسال متوقف للصيانة':pendingRequestId?'بانتظار التحقق':status === 'submitting' ? 'جارٍ الإرسال...' : 'إرسال للمراجعة'}
      </button>
    </form>
    </>
  );
}
