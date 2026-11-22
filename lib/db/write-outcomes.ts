import { withWriterIdentity, type WriterPool } from './writer-transaction';
import type { DurableOutcomeStore, DurableWriteIntent } from './write-config';

/** Persistent event candidate. The required table/grants exist only locally so far. */
export function postgresOutcomeStore(pool: WriterPool): DurableOutcomeStore {
  const append = async (event: DurableWriteIntent, phase: string) => {
    await withWriterIdentity(pool,event.ownerId,async connection => {
      await connection.query('SET LOCAL synchronous_commit=on');
      await connection.query(
        'INSERT INTO directory_internal.write_events(record_id,owner_id,kind,phase) VALUES ($1,$2,$3,$4) ON CONFLICT(record_id,phase) DO NOTHING',
        [event.recordId,event.ownerId,event.kind,phase],
      );
    });
  };
  return {
    intent: event => withWriterIdentity(pool,event.ownerId,async connection=>{
      await connection.query('SET LOCAL synchronous_commit=on');
      const hash=event.requestHash??'';
      const inserted=await connection.query("INSERT INTO directory_internal.write_events(record_id,owner_id,kind,phase,request_hash) VALUES ($1,$2,$3,'intent',$4) ON CONFLICT(record_id,phase) DO NOTHING RETURNING record_id",[event.recordId,event.ownerId,event.kind,hash]) as {rows:unknown[]};
      if(inserted.rows.length===1)return 'new' as const;
      const existing=await connection.query("SELECT kind,request_hash FROM directory_internal.write_events WHERE record_id=$1 AND owner_id=$2 AND phase='intent'",[event.recordId,event.ownerId]) as {rows:{kind:string;request_hash:string}[]};
      if(existing.rows.length!==1||existing.rows[0].kind!==event.kind||existing.rows[0].request_hash!==hash)throw Object.assign(new Error('Write attempt identity conflict'),{code:'WRITE_ATTEMPT_CONFLICT'});
      return 'existing' as const;
    }),
    settle: event => append(event,event.outcome),
  };
}

/** Read-only reconciliation. A missing row is NEVER proof that retry is safe.
 * No endpoint exposes this helper; caller must use the verified owner ID.
 */
export async function reconcileWrite(pool: WriterPool, event: DurableWriteIntent): Promise<'committed'|'unresolved'> {
  return withWriterIdentity(pool,event.ownerId,async connection => {
    await connection.query('SET TRANSACTION READ ONLY');
    const intent = await connection.query(
      "SELECT record_id FROM directory_internal.write_events WHERE record_id=$1 AND owner_id=$2 AND kind=$3 AND phase='intent'",
      [event.recordId,event.ownerId,event.kind],
    ) as {rows:unknown[]};
    if (intent.rows.length !== 1) return 'unresolved';
    // Identifiers are fixed literals, never input interpolation.
    const sql = event.kind==='business'
      ? 'SELECT id FROM public.businesses WHERE id=$1 AND owner_id=$2'
      : 'SELECT id FROM public.reviews WHERE id=$1 AND user_id=$2';
    const record = await connection.query(sql,[event.recordId,event.ownerId]) as {rows:unknown[]};
    return record.rows.length===1 ? 'committed' : 'unresolved';
  });
}

/** Owner-filtered status lookup for a known attempt ID. No metadata for another owner. */
export async function inspectWriteAttempt(pool: WriterPool, recordId: string, ownerId: string): Promise<'committed'|'unresolved'|'not-found'> {
  return withWriterIdentity(pool,ownerId,async connection=>{
    await connection.query('SET TRANSACTION READ ONLY');
    const intent=await connection.query("SELECT kind FROM directory_internal.write_events WHERE record_id=$1 AND owner_id=$2 AND phase='intent'",[recordId,ownerId]) as {rows:{kind:string}[]};
    if(intent.rows.length!==1)return 'not-found';
    const sql=intent.rows[0].kind==='business'
      ? 'SELECT id FROM public.businesses WHERE id=$1 AND owner_id=$2'
      : 'SELECT id FROM public.reviews WHERE id=$1 AND user_id=$2';
    const result=await connection.query(sql,[recordId,ownerId]) as {rows:unknown[]};
    return result.rows.length===1?'committed':'unresolved';
  });
}
