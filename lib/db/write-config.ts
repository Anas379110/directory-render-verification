import { NextRequest, NextResponse } from 'next/server';
import { createWriteHandlers, type WriteBoundaryDependencies } from './write-handlers';
import type { WriterPool } from './writer-transaction';

// Pure shared configuration keeps the startup checker and actual adapter in agreement.
import { readRestrictedWriterConfig, restrictedPoolOptions } from './restricted-connection.mjs';
export { readRestrictedWriterConfig } from './restricted-connection.mjs';
export type { RestrictedWriterConfig, WriterPoolOptions } from './restricted-connection.mjs';
import type { WriterPoolOptions } from './restricted-connection.mjs';

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
  const pool = input.createPool(restrictedPoolOptions(config));
  return createWriteHandlers({ ...input.dependencies, pool,
    recordIntent: event => store.intent(event),
    recordOutcome: event => store.settle(event),
  });
}
