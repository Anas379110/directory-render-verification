import { UnknownCommitOutcomeError, type WriterPool, type WriterConnection } from './writer-transaction';

/** Caller must supply the ID returned by server-side getUser, never a request-body ID.
 * Caller must verify requireAdmin first; the database checks current admin metadata again.
 * Its distinct claim role leaves the old authenticated-owner status guard intact.
 * Every query uses ONE checked-out connection. Pool-level query() cannot substitute.
 */
export async function withModeratorIdentity<T>(
  pool: WriterPool,
  verifiedUserId: string,
  operation: (connection: WriterConnection) => Promise<T>,
): Promise<T> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(verifiedUserId)) {
    throw new Error('Invalid verified user identity');
  }
  const connection = await pool.connect();
  let discard: Error | undefined;
  let began = false;
  let committing = false;
  try {
    await connection.query('BEGIN');
    began = true;
    await connection.query("SET LOCAL idle_in_transaction_session_timeout='10s'");
    await connection.query("SET LOCAL lock_timeout='2s'");
    await connection.query('SET LOCAL ROLE directory_app_moderator');
    await connection.query(
      "SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'directory_app_moderator', true)",
      [verifiedUserId],
    );
    const result = await operation(connection);
    committing = true;
    await connection.query('COMMIT');
    committing = false;
    began = false;
    return result;
  } catch (error) {
    if (began) {
      try { await connection.query('ROLLBACK'); }
      catch (rollbackError) {
        discard = rollbackError instanceof Error ? rollbackError : new Error('Rollback failed');
      }
    } else {
      // A failed BEGIN may mean a broken connection. Do not reuse it.
      discard = error instanceof Error ? error : new Error('Transaction start failed');
    }
    if (committing) {
      // COMMIT can have reached the server even if its reply was lost. A later
      // ROLLBACK cannot prove otherwise. Destroy the lease and do not retry.
      discard = error instanceof Error ? error : new Error('Commit reply lost');
      throw new UnknownCommitOutcomeError(error);
    }
    throw error;
  } finally {
    connection.release(discard);
  }
}
