import type { Metadata } from 'next';
import Link from 'next/link';
import { Tajawal, IBM_Plex_Sans_Arabic } from 'next/font/google';
import MobileNav from '../components/MobileNav';
import { createServerSupabaseClient } from '../lib/supabase/server';
import './globals.css';
import { readSiteConfig } from '../lib/site-config';

const tajawal = Tajawal({ subsets: ['arabic'], weight: ['500', '700', '800'], variable: '--font-tajawal' });
const plex = IBM_Plex_Sans_Arabic({ subsets: ['arabic'], weight: ['400', '500', '600'], variable: '--font-plex' });

const site = readSiteConfig();

export const metadata: Metadata = {
  title: 'Directory — دليل خدمات ومعلومات',
  description: 'دليل شركات وخدمات قانونية وعقارية وتعليمية',
  metadataBase: site.origin ? new URL(site.origin) : undefined,
  alternates: site.origin ? { canonical: '/' } : undefined,
  robots: site.canIndex ? { index: true, follow: true } : { index: false, follow: false, noarchive: true },
  openGraph: {
    type: 'website',
    locale: 'ar_AR',
    url: site.origin ? '/' : undefined,
    title: 'Directory — دليل خدمات ومعلومات',
    description: 'دليل شركات وخدمات قانونية وعقارية وتعليمية',
  },
};

/**
 * حالة الترويسة من جلسة الخادم: زائر → دخول/تسجيل، مسجّل → حسابي، مدير → لوحة المدير أيضًا.
 * فحص المدير هو نفسه المعتمد في requireAdmin (app_metadata.role — لا يعدّله المستخدم بنفسه).
 */
async function getHeaderSession(): Promise<{ loggedIn: boolean; isAdmin: boolean }> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return { loggedIn: false, isAdmin: false };
  }
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return { loggedIn: !!user, isAdmin: user?.app_metadata?.role === 'admin' };
  } catch {
    return { loggedIn: false, isAdmin: false };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { loggedIn, isAdmin } = await getHeaderSession();
  return (
    <html lang="ar" dir="rtl" className={`${tajawal.variable} ${plex.variable}`}>
      <body className="font-arabic bg-sand text-ink min-h-screen flex flex-col">
        <header className="bg-white border-b border-line">
          <nav className="max-w-5xl mx-auto flex items-center justify-between py-3 px-4">
            <div className="flex items-center">
              <MobileNav loggedIn={loggedIn} isAdmin={isAdmin} />
              <Link href="/" className="ml-2 flex items-center gap-2 text-brand">
                <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand to-brand-dark text-white font-display font-extrabold text-lg flex items-center justify-center">د</span>
                <span className="text-xl font-display font-extrabold">دليل الشركات</span>
              </Link>
            </div>
            <div className="hidden md:flex items-center gap-3">
              {loggedIn ? (
                <>
                  {isAdmin && (
                    <Link href="/admin" className="text-sm font-semibold text-brand px-4 py-2 rounded-lg border-[1.5px] border-brand">
                      لوحة المدير
                    </Link>
                  )}
                  <Link href="/account" className="text-sm font-bold text-[#3D2F05] bg-gold px-4 py-2 rounded-lg">
                    حسابي
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/login" className="text-sm font-semibold text-brand px-4 py-2 rounded-lg border-[1.5px] border-brand">
                    دخول
                  </Link>
                  <Link href="/register" className="text-sm font-bold text-[#3D2F05] bg-gold px-4 py-2 rounded-lg">
                    سجّل شركتك
                  </Link>
                </>
              )}
            </div>
          </nav>
        </header>
        <main className="flex-1 max-w-5xl mx-auto px-4 py-8 w-full">{children}</main>
        <footer className="bg-brand-dark text-[#B9D6D2] text-sm">
          <div className="max-w-5xl mx-auto px-4 py-6 flex flex-wrap gap-4 justify-between items-center">
            <p className="font-display font-bold text-white">دليل الشركات</p>
            <div className="flex gap-4">
              <Link href="/about">من نحن</Link>
              <Link href="/contact">اتصل بنا</Link>
              <Link href="/privacy">سياسة الخصوصية</Link>
              <Link href="/terms">شروط الاستخدام</Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
