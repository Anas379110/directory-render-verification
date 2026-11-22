import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '../../../lib/supabase/server';
import SignOutButton from '../../../components/auth/SignOutButton';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'حسابي — Directory',
  robots: { index: false },
};

export default async function AccountPage() {
  let email: string | null = null;
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    email = user?.email ?? null;
  } catch {
    email = null; // بيئة بلا إعداد مصادقة = غير مسجّل
  }

  if (!email) redirect('/login?next=/account');

  return (
    <div className="max-w-md mx-auto bg-white border border-line rounded-2xl p-6">
      <h1 className="font-display text-2xl font-extrabold mb-6">حسابي</h1>
      <p className="mb-6">
        مسجّل الدخول باسم: <span dir="ltr" className="font-medium">{email}</span>
      </p>
      <SignOutButton />
    </div>
  );
}
