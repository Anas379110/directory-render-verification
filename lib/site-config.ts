type SiteEnvironment = Readonly<Record<string, string | undefined>>;

/** Server-owned origin only. Request Host/forwarded headers never choose canonicals. */
export function readSiteConfig(env: SiteEnvironment = process.env) {
  const flag = env.DIRECTORY_VERIFICATION_MODE;
  // A misspelled nonempty verification flag must not accidentally allow indexing.
  const verification = flag !== undefined && flag !== '' && flag !== 'false';
  const configured = env.NEXT_PUBLIC_SITE_URL?.trim() || env.RENDER_EXTERNAL_URL?.trim();
  let origin: string | undefined;
  let local = false;
  if (configured) {
    try {
      const url = new URL(configured);
      local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if (!url.username && !url.password && url.pathname === '/' && !url.search && !url.hash &&
          (url.protocol === 'https:' || (local && url.protocol === 'http:'))) {
        origin = url.origin;
      }
    } catch { /* Invalid origin disables indexing; never invent a domain. */ }
  }
  return { origin, verification, canIndex: !!origin && !local && !verification };
}
