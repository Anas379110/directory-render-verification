'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '../../lib/supabase/client';

import AuthChallenge from './AuthChallenge';

type Mode = 'login' | 'signup';

export default function LoginForm({ next }: { next: string }) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const challengeRequired = process.env.NEXT_PUBLIC_AUTH_CAPTCHA === 'true';
  const [captchaToken, setCaptchaToken] = useState('');
  const [generation, setGeneration] = useState(0);
  const confirmed = useRef(false);
  useEffect(() => {
    const code = new URL(window.location.href).searchParams.get('code');
    if (!code || confirmed.current) return;
    confirmed.current = true;
    window.history.replaceState(null, '', '/login');
    fetch('/api/auth/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })
      .then(response => { if (!response.ok) setErrorMsg('تعذر إكمال تأكيد الحساب. يمكنك محاولة تسجيل الدخول بعد تأكيد البريد.'); })
      .catch(() => setErrorMsg('تعذر إكمال تأكيد الحساب. حاول تسجيل الدخول مجددًا.'));
  }, []);
  const [mode, setMode] = useState<Mode>('login');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'confirm-email'>('idle');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (challengeRequired && !captchaToken) { setErrorMsg('أكمل التحقق الأمني أولًا'); return; }
    setStatus('submitting');
    setErrorMsg(null);

    const form = new FormData(e.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');

    try {
      if (mode === 'login') {
        // دخول عبر مسار الخادم: كوكي الجلسة يُكتب في الاستجابة بشكل متزامن، فتظهر
        // الترويسة والصفحات بالحالة الصحيحة من أول تنقّل (كتابة كوكي عميل المتصفح مؤجّلة)
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, ...(challengeRequired ? { captchaToken } : {}) }),
        });
        if (res.status === 401) {
          setStatus('idle');
          setErrorMsg('بيانات الدخول غير صحيحة');
          return;
        }
        if (res.status === 429) {
          setStatus('idle');
          setErrorMsg('محاولات كثيرة، انتظر قليلًا ثم أعد المحاولة');
          return;
        }
        if (!res.ok) {
          setStatus('idle');
          setErrorMsg('تعذر تسجيل الدخول، حاول لاحقًا');
          return;
        }
        window.location.assign(next);
      } else {
        const supabase = createClient();
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: new URL('/login', window.location.origin).href, ...(challengeRequired ? { captchaToken } : {}) } });
        if (error) {
          setStatus('idle');
          setErrorMsg('تعذر إنشاء الحساب، تحقق من البريد أو جرّب لاحقًا');
          return;
        }
        setStatus('confirm-email');
      }
    } catch {
      // يشمل غياب متغيرات البيئة محليًا أو انقطاع الشبكة — رسالة صادقة بدل صفحة خطأ
      setStatus('idle');
      setErrorMsg('المصادقة غير مهيأة في هذه البيئة حاليًا');
    } finally {
      if (challengeRequired) { setCaptchaToken(''); setGeneration(value => value + 1); }
    }
  }

  if (status === 'confirm-email') {
    return (
      <div role="status" aria-live="polite" aria-atomic="true" className="bg-green-50 border border-green-200 text-green-800 rounded p-4">
        تم إنشاء حسابك. تحقق من بريدك الإلكتروني لتأكيد الحساب ثم سجّل الدخول.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-1">البريد الإلكتروني</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full border border-line rounded-lg px-3 py-2 bg-white"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-1">كلمة المرور</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          className="w-full border border-line rounded-lg px-3 py-2 bg-white"
        />
      </div>

      {challengeRequired && <AuthChallenge onToken={setCaptchaToken} generation={generation} />}

      {errorMsg && (
        <p className="text-red-600 text-sm" role="alert" aria-live="polite" aria-atomic="true">
          {errorMsg}
        </p>
      )}

      <button
        type="submit"
        disabled={status === 'submitting' || (challengeRequired && !captchaToken)}
        className="w-full bg-brand text-white font-semibold px-4 py-2.5 rounded-lg disabled:opacity-50"
      >
        {status === 'submitting' ? 'جارٍ المعالجة...' : mode === 'login' ? 'دخول' : 'إنشاء حساب'}
      </button>

      <button
        type="button"
        onClick={() => {
          setCaptchaToken(''); setGeneration(value => value + 1);
          setMode(mode === 'login' ? 'signup' : 'login');
          setErrorMsg(null);
        }}
        className="w-full text-sm font-semibold text-brand underline"
      >
        {mode === 'login' ? 'لا حساب لديك؟ أنشئ حسابًا جديدًا' : 'لديك حساب؟ سجّل الدخول'}
      </button>
    </form>
  );
}
