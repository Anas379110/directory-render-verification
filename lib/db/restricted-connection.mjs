/** Shared by the server adapter and its non-public read-only startup check. */
export function readRestrictedWriterConfig(env) {
  const mode = env.DIRECTORY_WRITE_MODE;
  if (!mode || mode === 'legacy') return { mode: 'legacy' };
  if (mode !== 'restricted') throw new Error('Unknown writer mode');
  const required = ['DIRECTORY_DB_HOST', 'DIRECTORY_DB_USER', 'DIRECTORY_DB_PASSWORD', 'DIRECTORY_DB_CA'];
  if (required.some(key => !env[key]?.trim())) throw new Error('Incomplete restricted writer configuration');
  const host = env.DIRECTORY_DB_HOST;
  const user = env.DIRECTORY_DB_USER;
  if (!user.startsWith('directory_app_runtime.') || /[\s/@:]/.test(user)) throw new Error('Invalid restricted writer identity');
  if (/[\s/@:]/.test(host)) throw new Error('Invalid database host');
  const port = Number(env.DIRECTORY_DB_PORT ?? '6543');
  if (port !== 6543) throw new Error('Unverified database port');
  if (!env.DIRECTORY_DB_CA.includes('-----BEGIN CERTIFICATE-----')) throw new Error('Missing database CA certificate');
  return { mode, host, port, database: 'postgres', user, password: env.DIRECTORY_DB_PASSWORD, ca: env.DIRECTORY_DB_CA };
}
export function restrictedPoolOptions(config) {
  if (config.mode !== 'restricted') throw new Error('Restricted writer configuration required');
  return {
    host: config.host, port: config.port, database: config.database, user: config.user, password: config.password,
    ssl: { rejectUnauthorized: true, servername: config.host, ca: config.ca },
    max: 2, connectionTimeoutMillis: 12000, idleTimeoutMillis: 5000, statement_timeout: 8000, query_timeout: 10000,
  };
}
