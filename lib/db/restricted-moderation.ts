import { Pool } from 'pg';
import { readRestrictedWriterConfig, restrictedPoolOptions } from './restricted-connection.mjs';
import { createRestrictedModerationStore } from './moderation-store';

let singleton: ReturnType<typeof createRestrictedModerationStore> | undefined;
/** Explicit, fail-closed activation. Not enabled in hosting by this local code. */
export function getRestrictedModerationStore() {
  const mode = process.env.DIRECTORY_MODERATION_MODE;
  if (!mode || mode === 'legacy') return null;
  if (mode !== 'restricted') throw new Error('Unknown moderation mode');
  if (singleton) return singleton;
  const config = readRestrictedWriterConfig(process.env);
  if (config.mode !== 'restricted') throw new Error('Restricted database configuration required for moderation');
  const pool = new Pool(restrictedPoolOptions(config));
  pool.on('error', () => {});
  singleton = createRestrictedModerationStore(pool);
  return singleton;
}
