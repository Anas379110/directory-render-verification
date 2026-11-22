import { createServerSupabaseClient } from '../../../lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import ReviewForm from '../../../components/ReviewForm';

export const dynamic = 'force-dynamic';

export default async function BusinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    notFound();
  }
  const supabase = await createServerSupabaseClient();

  const { data: business } = await supabase
    .from('businesses')
    .select('*, categories(name)')
    .eq('id', id)
    .eq('status', 'approved') // RLS تفرض هذا أصلًا؛ صراحة هنا لوضوح النية بالكود
    .single();

  if (!business) return notFound();

  const { data: reviews } = await supabase
    .from('reviews')
    .select('rating, comment, created_at')
    .eq('business_id', id)
    .eq('status', 'approved')
    .order('created_at', { ascending: false });

  // الجلسة تُقرأ من الخادم لاختيار عرض النموذج أو دعوة الدخول؛ الإنفاذ الفعلي في مسار الـAPI
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const count = reviews?.length ?? 0;
  const avg = count > 0 ? ((reviews ?? []).reduce((s, r) => s + r.rating, 0) / count).toFixed(1) : null;
  const categoryName = (business.categories as { name: string } | null)?.name ?? null;

  return (
    <article>
      <header className="bg-white border border-line rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-4">
          <span className="w-14 h-14 rounded-xl bg-brand text-white font-display font-extrabold text-2xl flex items-center justify-center">
            {business.name.trim().charAt(0)}
          </span>
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-extrabold">{business.name}</h1>
            {categoryName && <p className="text-sm text-ink-soft mt-1">{categoryName}</p>}
          </div>
        </div>
        {business.description && <p className="text-ink-soft leading-relaxed mt-4">{business.description}</p>}
        {avg && (
          <p className="mt-4 border-t border-line pt-4">
            <span className="text-gold text-lg">★</span>{' '}
            <span className="font-display font-bold text-lg">{avg}</span>{' '}
            <span className="text-ink-soft text-sm">من {count} {count === 1 ? 'تقييم معتمد' : 'تقييمات معتمدة'}</span>
          </p>
        )}
      </header>

      <h2 className="font-display text-xl font-bold mb-3">التقييمات</h2>
      <div className="mb-6">
        {user ? (
          <ReviewForm key={user.id} businessId={id} ownerId={user.id} enableAttemptResume={process.env.DIRECTORY_WRITE_MODE==='restricted'} />
        ) : (
          <p className="bg-white border border-line rounded-2xl p-4 text-sm text-ink-soft">
            <Link href={`/login?next=/business/${id}`} className="text-brand font-semibold underline">
              سجّل الدخول
            </Link>{' '}
            لتتمكن من إضافة تقييمك. تُراجَع كل التقييمات قبل ظهورها.
          </p>
        )}
      </div>
      {!reviews || reviews.length === 0 ? (
        <p className="text-ink-soft">لا توجد تقييمات بعد.</p>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r, i) => (
            <li key={i} className="border border-line rounded-2xl p-4 bg-white">
              <span className="text-gold">{'★'.repeat(r.rating)}<span className="text-line">{'★'.repeat(5 - r.rating)}</span></span>
              {r.comment && <p className="text-sm mt-2 leading-relaxed">{r.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
