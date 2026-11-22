import { Pool } from 'pg';
import { createServerSupabaseClient } from '../supabase/server';
import { enforceRateLimit, RATE_LIMIT_RULES } from '../rate-limit';
import { verifyTurnstile } from '../turnstile';
import { prepareNextWriteRoutes, readRestrictedWriterConfig } from './write-config';
import { postgresOutcomeStore, inspectWriteAttempt } from './write-outcomes';
import type { WriterPool } from './writer-transaction';

let statusPool: WriterPool | undefined;
let singleton: ReturnType<typeof prepareNextWriteRoutes> | undefined;
/** Disabled by default. No connection is created in legacy mode.
 * Production activation is NOT authorized by this local implementation.
 */
export function getRestrictedWriteHandlers() {
  if (readRestrictedWriterConfig(process.env).mode==='legacy') return null;
  if (singleton) return singleton;
  let writerPool: WriterPool | undefined;
  const outcomes = () => {
    if (!writerPool) throw new Error('Writer pool unavailable');
    return postgresOutcomeStore(writerPool);
  };
  singleton = prepareNextWriteRoutes({
    env:process.env,
    createPool: options => {
      const pool = new Pool(options);
      // Do not leak driver details/secrets or let an idle-client error crash the process.
      pool.on('error',()=>{});
      writerPool=pool;statusPool=pool;
      return pool;
    },
    outcomes: { intent:event=>outcomes().intent(event),settle:event=>outcomes().settle(event) },
    dependencies:{
      getUser:async()=> {
        const client=await createServerSupabaseClient();
        const result=await client.auth.getUser();
        return result.data.user ? {id:result.data.user.id} : null;
      },
      checkLimit:(request,scope)=>scope==='business'
        ? enforceRateLimit(request,'businesses:post',RATE_LIMIT_RULES.businessRegistration)
        : enforceRateLimit(request,'reviews:post',RATE_LIMIT_RULES.review),
      verifyBusinessToken:token=>verifyTurnstile(token,process.env.TURNSTILE_SECRET_KEY),
    },
    // This branch is impossible in restricted mode; never fall back on a database error.
    legacy: {
      business:async()=>{throw new Error('Unexpected legacy route');},
      review:async()=>{throw new Error('Unexpected legacy route');},
    },
  });
  return singleton;
}

export async function getRestrictedAttemptStatus(recordId: string, verifiedOwnerId: string) {
  if(!getRestrictedWriteHandlers()||!statusPool)return 'not-found' as const;
  return inspectWriteAttempt(statusPool,recordId,verifiedOwnerId);
}
