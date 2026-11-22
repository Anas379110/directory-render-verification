'use client';

import { useState } from 'react';
import { createClient } from '../../lib/supabase/client';

type Mode = 'login' | 'signup';

export default function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<Mode>('login');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'confirm-email'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
          body: JSON.stringify({ email, password }),
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
        const { error } = await supabase.auth.signUp({ email, password });
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

      {errorMsg && (
        <p className="text-red-600 text-sm" role="alert" aria-live="polite" aria-atomic="true">
          {errorMsg}
        </p>
      )}

      <button
        type="submit"
        disabled={status === 'submitting'}
        className="w-full bg-brand text-white font-semibold px-4 py-2.5 rounded-lg disabled:opacity-50"
      >
        {status === 'submitting' ? 'جارٍ المعالجة...' : mode === 'login' ? 'دخول' : 'إنشاء حساب'}
      </button>

      <button
        type="button"
        onClick={() => {
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
