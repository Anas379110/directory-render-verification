import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center" aria-labelledby="not-found-title">
      <h1 id="not-found-title" className="text-3xl font-bold mb-4">الصفحة غير موجودة</h1>
      <p className="text-neutral-600 mb-6">تعذر العثور على الشركة أو الصفحة المطلوبة.</p>
      <Link href="/" className="text-brand underline">العودة إلى الدليل</Link>
    </div>
  );
}
