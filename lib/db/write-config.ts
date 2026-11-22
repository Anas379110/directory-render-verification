import { NextRequest, NextResponse } from 'next/server';
import { createWriteHandlers, type WriteBoundaryDependencies } from './write-handlers';
import type { WriterPool } from './writer-transaction';

/** Local default-off route preparation. Activation needs coordinated approval. */
export interface RestrictedWriterConfig {
  mode: 'legacy' | 'restricted';
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  ca?: string;
}
export function readRestrictedWriterConfig(env: Readonly<Record<string, string | undefined>>): RestrictedWriterConfig {
  const mode = env.DIRECTORY_WRITE_MODE;
  if (!mode || mode === 'legacy') return { mode: 'legacy' };
  if (mode !== 'restricted') throw new Error('Unknown writer mode');
  const required = ['DIRECTORY_DB_HOST', 'DIRECTORY_DB_USER', 'DIRECTORY_DB_PASSWORD', 'DIRECTORY_DB_CA'] as const;
  if (required.some(key => !env[key]?.trim())) throw new Error('Incomplete restricted writer configuration');
  const host = env.DIRECTORY_DB_HOST!;
  const user = env.DIRECTORY_DB_USER!;
  // Prevent a configuration typo from selecting the administrator as ordinary writer.
  if (!user.startsWith('directory_app_runtime.') || /[\s/@:]/.test(user)) throw new Error('Invalid restricted writer identity');
  if (/[\s/@:]/.test(host)) throw new Error('Invalid database host');
  const port = Number(env.DIRECTORY_DB_PORT ?? '6543');
  if (port !== 6543) throw new Error('Unverified database port');
  if (!env.DIRECTORY_DB_CA!.includes('-----BEGIN CERTIFICATE-----')) throw new Error('Missing database CA certificate');
  return { mode, host, port, database: 'postgres', user, password: env.DIRECTORY_DB_PASSWORD, ca: env.DIRECTORY_DB_CA };
}

export type WriterPoolOptions = {
  host: string; port: number; database: string; user: string; password: string;
  ssl: { rejectUnauthorized: true; servername: string; ca: string };
  max: 2; connectionTimeoutMillis: 12000; idleTimeoutMillis: 5000;
  statement_timeout: 8000; query_timeout: 10000;
};
export interface DurableWriteIntent {
  kind: 'business' | 'review'; recordId: string; ownerId: string; requestHash?: string;
}
/** Must persist before BEGIN; an exception blocks the write, never falls back.
 * This interface is not a claim that a production durable store has been wired.
 */
export interface DurableOutcomeStore {
  intent(value: DurableWriteIntent): Promise<void|'new'|'existing'>;
  settle(value: DurableWriteIntent & { outcome: 'committed' | 'failed' | 'unknown' }): void | Promise<void>;
}
export function prepareNextWriteRoutes(input: {
  env: Readonly<Record<string, string | undefined>>;
  createPool(options: WriterPoolOptions): WriterPool;
  outcomes?: DurableOutcomeStore;
  dependencies: Omit<WriteBoundaryDependencies, 'pool' | 'recordOutcome'>;
  legacy: {
    business(request: NextRequest): Promise<NextResponse>;
    review(request: NextRequest, id: string): Promise<NextResponse>;
  };
}) {
  const config = readRestrictedWriterConfig(input.env);
  if (config.mode === 'legacy') return input.legacy;
  if (!input.outcomes) throw new Error('Durable outcome storage is required');
  const store = input.outcomes;
  // No connection URL whose parsing can override TLS; password stays out of logs/errors.
  const pool = input.createPool({
    host: config.host!, port: config.port!, database: config.database!, user: config.user!, password: config.password!,
    ssl: { rejectUnauthorized: true, servername: config.host!, ca: config.ca! },
    max: 2, connectionTimeoutMillis: 12000, idleTimeoutMillis: 5000, statement_timeout: 8000, query_timeout: 10000,
  });
  return createWriteHandlers({ ...input.dependencies, pool,
    recordIntent: event => store.intent(event),
    recordOutcome: event => store.settle(event),
  });
}
