'use client';
import { useState } from 'react';
export default function WriteOutcomeNotice({requestId,onConfirmed}:{requestId:string;onConfirmed:()=>void}) {
  const [checking,setChecking]=useState(false);
  const [message,setMessage]=useState('لم تتأكد نتيجة الإرسال بعد. أوقفنا إعادة الإرسال لتجنب تكرار الطلب.');
  async function check(){
    setChecking(true);
    try {
      const response=await fetch(`/api/write-attempts/${requestId}`,{cache:'no-store'});
      const body=await response.json();
      if(response.ok&&body.status==='committed'){onConfirmed();return;}
      setMessage(response.status===401?'سجّل الدخول مجددًا للتحقق من طلبك. لا تُعد الإرسال.':'لم تتأكد النتيجة بعد. احتفظ بهذه الصفحة ولا تُعد الإرسال.');
    } catch {setMessage('تعذر التحقق الآن. لم نُعد إرسال طلبك.');}
    finally {setChecking(false);}
  }
  return <section role="status" aria-live="polite" className="border border-amber-300 bg-amber-50 text-amber-950 rounded-xl p-4 space-y-3">
    <p className="font-semibold text-sm">{message}</p>
    <p className="text-xs break-all">مرجع الطلب: <span dir="ltr" className="block mt-1 font-mono">{requestId}</span></p>
    <button type="button" disabled={checking} onClick={check} className="border border-amber-800 rounded-lg px-3 py-2 text-sm disabled:opacity-50">{checking?'جارٍ التحقق...':'تحقق من نتيجة الطلب'}</button>
  </section>;
}
