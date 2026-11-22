'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Script from 'next/script';

type Turnstile = {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  remove(id: string): void;
  reset(id: string): void;
};
/** Supabase Auth consumes this token. Do not call local Siteverify with it. */
export default function AuthChallenge({ onToken, generation }: { onToken: (value: string) => void; generation: number }) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const previousGeneration = useRef(generation);
  const callback = useRef(onToken);
  const [problem, setProblem] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState('');
  useEffect(() => { callback.current = onToken; }, [onToken]);
  const failed = useCallback((message: string, code?: unknown) => {
    callback.current('');
    setProblem(message);
    setErrorCode(typeof code === 'string' && /^\d{3,6}$/.test(code) ? code : '');
  }, []);
  const render = useCallback(() => {
    const api = (window as unknown as { turnstile?: Turnstile }).turnstile;
    if (!api || !container.current || widget.current !== null || !process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) return;
    try {
      widget.current = api.render(container.current, {
        sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
        callback: (value: string) => { setProblem(null); setErrorCode(''); callback.current(value); },
        'error-callback': (code: string) => failed('تعذر إكمال التحقق الأمني. أعد المحاولة. إذا استمرت المشكلة، جرّب شبكة أخرى وأرسل رمز الخطأ إلى الدعم.', code),
        'expired-callback': () => failed('انتهت صلاحية التحقق الأمني. أعد التحقق قبل المتابعة.'),
        'timeout-callback': () => failed('انتهت مهلة التحقق الأمني. أعد المحاولة.'),
        'unsupported-callback': () => failed('هذا المتصفح لا يدعم التحقق الأمني. افتح الصفحة في إصدار حديث من Chrome أو Safari.'),
      });
    } catch {
      failed('تعذر تحميل التحقق الأمني. أعد تحميل الصفحة وحاول مجددًا.');
    }
  }, [failed]);
  useEffect(() => {
    // External widget setup can throw synchronously; report that failure in the UI.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    render();
    return () => {
      const api = (window as unknown as { turnstile?: Turnstile }).turnstile;
      if (widget.current !== null) api?.remove(widget.current);
      widget.current = null;
    };
  }, [render]);
  useEffect(() => {
    if (previousGeneration.current === generation) return;
    previousGeneration.current = generation;
    callback.current('');
    const api = (window as unknown as { turnstile?: Turnstile }).turnstile;
    if (widget.current !== null) api?.reset(widget.current);
  }, [generation]);
  const retry = () => {
    callback.current('');
    setProblem(null); setErrorCode('');
    const api = (window as unknown as { turnstile?: Turnstile }).turnstile;
    if (api && widget.current !== null) api.reset(widget.current);
    else window.location.reload();
  };
  return <>
    <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onLoad={render} onReady={render} onError={() => failed('تعذر الاتصال بخدمة التحقق الأمني. تحقق من اتصالك ومن السماح بتحميل challenges.cloudflare.com ثم أعد المحاولة.')} />
    <div ref={container} />
    {problem && <div className="space-y-2 rounded border border-red-200 bg-red-50 p-3">
      <p role="alert">{problem}{errorCode && <> <span>رمز الخطأ: <bdi>{errorCode}</bdi></span></>}</p>
      <button type="button" onClick={retry} className="underline font-semibold text-brand">إعادة التحقق الأمني</button>
    </div>}
    {!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && <p role="alert">التحقق الأمني غير مهيأ حاليًا.</p>}
  </>;
}
