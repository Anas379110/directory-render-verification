export interface RestrictedWriterConfig {
  mode: 'legacy' | 'restricted';
  host?: string; port?: number; database?: string; user?: string; password?: string; ca?: string;
}
export type WriterPoolOptions = {
  host: string; port: number; database: string; user: string; password: string;
  ssl: { rejectUnauthorized: true; servername: string; ca: string };
  max: 2; connectionTimeoutMillis: 12000; idleTimeoutMillis: 5000; statement_timeout: 8000; query_timeout: 10000;
};
export function readRestrictedWriterConfig(env: Readonly<Record<string, string | undefined>>): RestrictedWriterConfig;
export function restrictedPoolOptions(config: RestrictedWriterConfig): WriterPoolOptions;
