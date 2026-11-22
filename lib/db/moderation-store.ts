import { withModeratorIdentity } from './moderator-transaction';
import type { WriterConnection, WriterPool } from './writer-transaction';

type Row = Record<string, unknown>;
type Result<T> = { rows: T[] };
export interface ModerationDecision { decision: 'approved' | 'rejected'; rejectionReason?: string }
export class ModerationForbiddenError extends Error {
  readonly code = 'PT403';
  constructor() { super('Moderation forbidden'); }
}
async function assertDatabaseAdmin(connection: WriterConnection, actor: string) {
  const result = await connection.query('SELECT public.is_admin($1::uuid) AS allowed', [actor]) as Result<{ allowed: boolean }>;
  if (result.rows[0]?.allowed !== true) throw new ModerationForbiddenError();
}
/** Internal server store. Actor must come from requireAdmin, never request JSON.
 * SQL inputs remain parameters; table/function names are fixed literals.
 * No retry or service-role fallback, including uncertain COMMIT outcomes.
 */
export function createRestrictedModerationStore(pool: WriterPool) {
  async function list(actor: string, kind: 'business' | 'review') {
    return withModeratorIdentity(pool, actor, async connection => {
      await assertDatabaseAdmin(connection, actor);
      const sql = kind === 'business'
        ? "SELECT pg_catalog.to_jsonb(b) AS row FROM public.businesses b WHERE b.status='pending' ORDER BY b.created_at ASC, b.id ASC"
        : "SELECT pg_catalog.jsonb_build_object('id',r.id,'rating',r.rating,'comment',r.comment,'created_at',r.created_at,'businesses',pg_catalog.jsonb_build_object('name',b.name)) AS row FROM public.reviews r LEFT JOIN public.businesses b ON b.id=r.business_id WHERE r.status='pending' ORDER BY r.created_at ASC, r.id ASC";
      const result = await connection.query(sql) as Result<{ row: Row }>;
      return result.rows.map(value => value.row);
    });
  }
  async function moderate(actor: string, id: string, value: ModerationDecision, kind: 'business' | 'review') {
    return withModeratorIdentity(pool, actor, async connection => {
      const sql = kind === 'business'
        ? 'SELECT directory_internal.moderate_business_limited($1::uuid,$2::uuid,$3::text,$4::text) AS row'
        : 'SELECT directory_internal.moderate_review_limited($1::uuid,$2::uuid,$3::text,$4::text) AS row';
      const result = await connection.query(sql, [id, actor, value.decision, value.rejectionReason ?? null]) as Result<{ row: Row }>;
      if (!result.rows[0]?.row) throw new Error('Missing moderation result');
      return result.rows[0].row;
    });
  }
  return {
    listBusinesses: (actor: string) => list(actor, 'business'),
    listReviews: (actor: string) => list(actor, 'review'),
    moderateBusiness: (actor: string, id: string, value: ModerationDecision) => moderate(actor, id, value, 'business'),
    moderateReview: (actor: string, id: string, value: ModerationDecision) => moderate(actor, id, value, 'review'),
  };
}
