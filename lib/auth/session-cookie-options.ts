/**
 * HTTPS auth cookies must not be sent over cleartext connections.
 * The only explicit HTTP exception is loopback development. The server passes
 * its validated configured origin, never a request Host or forwarded header;
 * the browser passes its own actual location.origin.
 *
 * Do not add HttpOnly here: the existing browser Supabase client shares this
 * cookie store. SameSite, path, lifetime and cookie names retain SDK defaults.
 */
export function sessionCookieOptions(
  origin: string | undefined,
  production: boolean,
): { secure: boolean } {
  if (!origin) return { secure: production };
  try {
    const url = new URL(origin);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    const plainLoopback = url.protocol === 'http:' && loopback &&
      !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash;
    return { secure: !plainLoopback };
  } catch {
    return { secure: true };
  }
}
