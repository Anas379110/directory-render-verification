'use client';

import { useState } from 'react';

export default function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSignOut() {
    setBusy(true);
    setErrorMsg(null);
    try {
      // خروج عبر مسار الخادم: حذف كوكي الجلسة في الاستجابة بشكل متزامن وموثوق
      // (حذفه من عميل المتصفح مؤجّل مثل كتابته، وقد يبقي الخادم يرى جلسة قديمة)
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (!res.ok) {
        // فشل مؤكد: لا تحويل ولا ادعاء خروج — اعرض حالة إعادة المحاولة
        setErrorMsg('تعذر تسجيل الخروج، أعد المحاولة');
        return;
      }
    } catch {
      setErrorMsg('تعذر تسجيل الخروج، أعد المحاولة');
      return;
    } finally {
      setBusy(false);
    }
    // النجاح فقط هو من يحوّل للرئيسية بعد تأكيد إنهاء الجلسة
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- مقصود: router.push قد يقدّم حمولة مخزّنة بترويسة قديمة
    window.location.assign('/');
  }

  return (
    <div>
      {errorMsg && (
        <p className="text-red-600 text-sm mb-3" role="alert" aria-live="polite" aria-atomic="true">
          {errorMsg}
        </p>
      )}
      <button
        type="button"
        onClick={handleSignOut}
        disabled={busy}
        className="bg-red-600 text-white font-semibold px-4 py-2.5 rounded-lg disabled:opacity-50"
      >
        {busy ? 'جارٍ الخروج...' : 'تسجيل الخروج'}
      </button>
    </div>
  );
}
