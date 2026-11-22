# Directory host verification

Private deployment-only source snapshot. Public website verification, not a final launch.

Use Node22. Build: `npm ci && npm run build`. Start: `npm run start -- --hostname 0.0.0.0 --port $PORT`.

Required verification settings: `DIRECTORY_WRITE_PAUSED=true`, `DIRECTORY_VERIFICATION_MODE=true`, assigned HTTPS origin, and intended public Supabase URL/publishable key. No database runtime, Turnstile or service-role secret is needed for this read-only phase. No database schema, grants, application rows or Cloudflare configuration changes.

The service is suspended after its bounded verification window. Noindex is not access control. The full development project and its private test evidence are not included in this deployment-only snapshot.
