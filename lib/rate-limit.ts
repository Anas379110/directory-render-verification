import { NextRequest, NextResponse } from 'next/server';

/**
 * محدد معدل داخلي بالذاكرة (نافذة ثابتة لكل نطاق+IP).
 * حدود معروفة وموثقة: عدّاد لكل نسخة خادم ويُصفَّر عند إعادة التشغيل، فهو حماية
 * لنسخة واحدة/بيئة محلية واختبار، وليس حماية موزعة. عند النشر تُضاف قاعدة
 * Cloudflare كطبقة أولى، ويمكن استبدال التخزين هنا بـRedis/DB دون تغيير الواجهة.
 */

export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

/** حدود نقاط الكتابة الحالية (CLAUDE.md: Rate Limiting على نقاط الكتابة) */
export const RATE_LIMIT_RULES = {
  businessRegistration: { limit: 5, windowMs: 60_000 },
  review: { limit: 5, windowMs: 60_000 },
  adminModeration: { limit: 30, windowMs: 60_000 },
  login: { limit: 10, windowMs: 60_000 },
  logout: { limit: 30, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>;

type Bucket = { count: number; resetAt: number };
const store = new Map<string, Bucket>();
export const MAX_RATE_LIMIT_BUCKETS = 5000;

export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

export function checkRateLimit(
  key: string,
  rule: RateLimitRule,
  now: number = Date.now()
): { allowed: boolean; retryAfterSeconds: number } {
  let bucket = store.get(key);
  if (!bucket || now >= bucket.resetAt) {
    if (!bucket && store.size >= MAX_RATE_LIMIT_BUCKETS) {
      // Keep active limits intact. Evicting an active identity would reset its quota.
      for (const [k, v] of store) {
        if (now >= v.resetAt) store.delete(k);
      }
      if (store.size >= MAX_RATE_LIMIT_BUCKETS) {
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(rule.windowMs / 1000)) };
      }
    }
    bucket = { count: 0, resetAt: now + rule.windowMs };
    store.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > rule.limit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/** يعيد استجابة 429 عند تجاوز الحد، أو null للمتابعة. يُستدعى أول كل معالج كتابة. */
export function enforceRateLimit(
  request: NextRequest,
  scope: string,
  rule: RateLimitRule
): NextResponse | null {
  const result = checkRateLimit(`${scope}:${clientIp(request)}`, rule);
  if (result.allowed) return null;
  return NextResponse.json(
    { error: 'طلبات كثيرة متتالية، أعد المحاولة بعد قليل' },
    { status: 429, headers: { 'Retry-After': String(result.retryAfterSeconds) } }
  );
}

/** للاختبارات فقط: تصفير كل العدّادات لعزل كل اختبار */
export function resetRateLimitStore(): void {
  store.clear();
}
