import type { Metadata } from 'next';
import LoginForm from '../../../components/auth/LoginForm';

export const metadata: Metadata = {
  title: 'تسجيل الدخول — Directory',
  robots: { index: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';

  return (
    <div className="max-w-md mx-auto bg-white border border-line rounded-2xl p-6">
      <h1 className="font-display text-2xl font-extrabold mb-6">تسجيل الدخول</h1>
      <LoginForm next={safeNext} />
    </div>
  );
}
