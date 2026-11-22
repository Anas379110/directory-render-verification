import { createServerSupabaseClient } from '../lib/supabase/server';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

type BizRow = { id: string; name: string; description: string | null; categories: { name: string } | null };

export default async function HomePage() {
  let businesses: BizRow[] | null = null;
  const ratings: Record<string, { sum: number; count: number }> = {};
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const supabase = await createServerSupabaseClient();
    const result = await supabase
      .from('businesses')
      .select('id, name, description, categories(name)')
      .eq('status', 'approved'); // مطابق لـRLS، طبقة أمان مزدوجة
    businesses = (result.data as BizRow[] | null) ?? null;
    const ids = (businesses ?? []).map((b) => b.id);
    if (ids.length > 0) {
      // تقييمات معتمدة فقط؛ المتوسط يُحسب من بيانات حقيقية ويُخفى عند غيابها
      const rev = await supabase
        .from('reviews')
        .select('business_id, rating')
        .eq('status', 'approved')
        .in('business_id', ids);
      for (const r of rev.data ?? []) {
        const acc = ratings[r.business_id] ?? { sum: 0, count: 0 };
        acc.sum += r.rating;
        acc.count += 1;
        ratings[r.business_id] = acc;
      }
    }
  }

  return (
    <div>
      <section className="rounded-2xl bg-gradient-to-br from-brand to-brand-dark text-white px-6 py-10 mb-8">
        <h1 className="font-display text-3xl md:text-4xl font-extrabold leading-snug mb-3">دليل الشركات والخدمات</h1>
        <p className="text-[#D8E8E5] text-base md:text-lg leading-relaxed max-w-xl">
          تصفّح الشركات المعتمدة بعد المراجعة، واقرأ تقييمات العملاء قبل قرارك.
        </p>
      </section>

      {!businesses || businesses.length === 0 ? (
        <p className="text-ink-soft">لا توجد شركات منشورة بعد.</p>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {businesses.map((b) => {
            const agg = ratings[b.id];
            const avg = agg && agg.count > 0 ? (agg.sum / agg.count).toFixed(1) : null;
            return (
              <Link
                key={b.id}
                href={`/business/${b.id}`}
                className="block border border-line rounded-2xl p-5 bg-white hover:shadow-lg hover:-translate-y-0.5 transition"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-12 h-12 rounded-xl bg-brand text-white font-display font-extrabold text-xl flex items-center justify-center">
                    {b.name.trim().charAt(0)}
                  </span>
                  <div>
                    <h3 className="font-display text-lg font-bold">{b.name}</h3>
                    {b.categories?.name && <p className="text-sm text-ink-soft">{b.categories.name}</p>}
                  </div>
                </div>
                {b.description && <p className="text-sm text-ink-soft leading-relaxed line-clamp-2 mb-3">{b.description}</p>}
                {avg && (
                  <p className="text-sm border-t border-line pt-3">
                    <span className="text-gold">★</span>{' '}
                    <span className="font-display font-bold">{avg}</span>{' '}
                    <span className="text-ink-soft text-xs">({agg.count} {agg.count === 1 ? 'تقييم' : 'تقييمات'})</span>
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
