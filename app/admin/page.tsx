import { getRestrictedModerationStore } from '../../lib/db/restricted-moderation';
import { requireAdmin } from '../../lib/auth/requireAdmin';
import { createAdminSupabaseClient } from '../../lib/supabase/server';
import ApproveRejectButtons from './ApproveRejectButtons';
import ReviewModerationButtons from './ReviewModerationButtons';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

type PendingReview = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  businesses: { name: string } | { name: string }[] | null;
};

const reviewBusinessName = (r: PendingReview) =>
  (Array.isArray(r.businesses) ? r.businesses[0]?.name : r.businesses?.name) ?? '—';

const reviewStars = (rating: number) => (
  <>
    <span className="text-gold">{'\u2605'.repeat(rating)}</span>
    <span className="text-line">{'\u2605'.repeat(5 - rating)}</span>
  </>
);

export default async function AdminQueuePage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/'); // لا صفحة "غير مصرَّح" تكشف وجود لوحة إدارية — إعادة توجيه صامتة

  const restricted = getRestrictedModerationStore();
  let pending: { id: string; name: string; created_at: string }[] | null;
  let pendingReviews: PendingReview[] | null;
  if (restricted) {
    pending = await restricted.listBusinesses(admin.userId) as typeof pending;
    pendingReviews = await restricted.listReviews(admin.userId) as typeof pendingReviews;
  } else {
  const supabaseAdmin = createAdminSupabaseClient();
  const { data: oldPending } = await supabaseAdmin
    .from('businesses')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  const { data: oldPendingReviews } = await supabaseAdmin
    .from('reviews')
    .select('id, rating, comment, created_at, businesses(name)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

    pending = oldPending;
    pendingReviews = oldPendingReviews as PendingReview[] | null;
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold mb-6">طابور المراجعة</h1>
      {!pending || pending.length === 0 ? (
        <p className="text-ink-soft">لا توجد طلبات معلّقة.</p>
      ) : (
        <div className="bg-white border border-line rounded-2xl p-4 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-line text-right text-ink-soft">
                <th className="py-2">الاسم</th>
                <th>تاريخ الطلب</th>
                <th>إجراء</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((b: { id: string; name: string; created_at: string }) => (
                <tr key={b.id} className="border-b border-line last:border-b-0">
                  <td className="py-3 font-medium">{b.name}</td>
                  <td className="text-ink-soft">{new Intl.DateTimeFormat('ar').format(new Date(b.created_at))}</td>
                  <td className="flex gap-2 py-2">
                    <ApproveRejectButtons id={b.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h2 className="font-display text-xl font-extrabold mt-10 mb-4">طابور التقييمات</h2>
      {!pendingReviews || pendingReviews.length === 0 ? (
        <p className="text-ink-soft">لا توجد تقييمات معلّقة.</p>
      ) : (
        <>
          {/* شاشات صغيرة: بطاقات مكدّسة بأزرار ظاهرة دائمًا */}
          <ul className="md:hidden space-y-3">
            {(pendingReviews as PendingReview[]).map((r) => (
              <li key={r.id} className="bg-white border border-line rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{reviewBusinessName(r)}</span>
                  <span className="text-ink-soft text-xs whitespace-nowrap">
                    {new Intl.DateTimeFormat('ar').format(new Date(r.created_at))}
                  </span>
                </div>
                <div>{reviewStars(r.rating)}</div>
                {r.comment && <p className="text-ink-soft text-sm leading-relaxed break-words">{r.comment}</p>}
                <ReviewModerationButtons id={r.id} />
              </li>
            ))}
          </ul>
          {/* شاشات متوسطة فأكبر: جدول */}
          <div className="hidden md:block bg-white border border-line rounded-2xl p-4 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-line text-right text-ink-soft">
                <th className="py-2">الشركة</th>
                <th>التقييم</th>
                <th>التعليق</th>
                <th>التاريخ</th>
                <th>إجراء</th>
              </tr>
            </thead>
            <tbody>
              {(pendingReviews as PendingReview[]).map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-b-0">
                    <td className="py-3 font-medium">{reviewBusinessName(r)}</td>
                    <td>{reviewStars(r.rating)}</td>
                    <td className="text-ink-soft max-w-48 truncate">{r.comment ?? '—'}</td>
                    <td className="text-ink-soft">{new Intl.DateTimeFormat('ar').format(new Date(r.created_at))}</td>
                    <td className="py-2">
                      <ReviewModerationButtons id={r.id} />
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
          </div>
        </>
      )}
    </div>
  );
}
