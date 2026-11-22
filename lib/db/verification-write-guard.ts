import { NextResponse } from 'next/server';
import { readSiteConfig } from '../site-config';

type Environment = Readonly<Record<string, string | undefined>>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** One server-configured verified actor. No email, role, body or header grants access. */
function policy(env: Environment) {
  const required = readSiteConfig(env).verification;
  const configured = env.DIRECTORY_VERIFICATION_WRITER_ID?.trim();
  return { required, actor: configured && uuid.test(configured) ? configured.toLowerCase() : undefined };
}
function denial(code: string, error: string, status: number) {
  return NextResponse.json({ code, error }, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

/** Call after the maintenance gate, before Auth/config/pool work on both POST routes. */
export function verificationWritePreflight(env: Environment = process.env): NextResponse | null {
  const { required, actor } = policy(env);
  return required && !actor
    ? denial('VERIFICATION_WRITES_UNCONFIGURED', 'الإرسال التجريبي غير مفعّل.', 503)
    : null;
}

/** Call only with the identity returned by server-side getUser, before token/body/DB work. */
export function verificationWriterResponse(verifiedUserId: string, env: Environment = process.env): NextResponse | null {
  const { required, actor } = policy(env);
  if (!required) return null;
  if (!actor) return verificationWritePreflight(env);
  return typeof verifiedUserId === 'string' && verifiedUserId.toLowerCase() === actor
    ? null
    : denial('VERIFICATION_WRITER_REQUIRED', 'الإرسال متاح لحساب الاختبار المحدد فقط.', 403);
}
