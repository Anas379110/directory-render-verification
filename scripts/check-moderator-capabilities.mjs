/** READ ONLY capability check. Caller supplies a checked-out runtime connection,
 * inside a read-only transaction with SET LOCAL ROLE directory_app_moderator and
 * server-approved owner identity stamped. No state or policy changes.
 */
import assert from 'node:assert/strict';
export async function checkModeratorCapabilities(client, actor) {
  const identity=(await client.query("SELECT current_user,public.is_admin($1::uuid) AS admin,current_setting('transaction_read_only') AS read_only",[actor])).rows[0];
  assert.equal(identity.current_user,'directory_app_moderator'); assert.equal(identity.admin,true); assert.equal(identity.read_only,'on');
  const rows=(await client.query(`SELECT c.relname,has_table_privilege(current_user,c.oid,'SELECT') AS sel,
    has_table_privilege(current_user,c.oid,'INSERT') AS ins,has_table_privilege(current_user,c.oid,'UPDATE') AS upd,
    has_table_privilege(current_user,c.oid,'DELETE') AS del,has_table_privilege(current_user,c.oid,'TRIGGER') AS trig,
    has_table_privilege(current_user,c.oid,'TRUNCATE') AS trunc,row_security_active(c.oid) AS rls
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE (n.nspname,c.relname) IN (('public','businesses'),('public','reviews'),('public','moderation_log'),('auth','users'),('directory_internal','write_events'))`)).rows;
  assert.equal(rows.length,5);
  for(const row of rows){
    const app=['businesses','reviews'].includes(row.relname);
    assert.equal(row.sel,app);
    for(const key of ['ins','upd','del','trig','trunc'])assert.equal(row[key],false);
    if(app)assert.equal(row.rls,true);
  }
  const columns=(await client.query(`SELECT c.relname,a.attname,has_column_privilege(current_user,c.oid,a.attnum,'UPDATE') AS allowed
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
    WHERE n.nspname='public' AND c.relname IN ('businesses','reviews') AND a.attnum>0 AND NOT a.attisdropped`)).rows;
  for(const column of columns)assert.equal(column.allowed,column.relname==='businesses'?['status','rejection_reason','updated_at'].includes(column.attname):column.attname==='status');
  const schema=(await client.query("SELECT has_schema_privilege(current_user,'public','CREATE') AS pub,has_schema_privilege(current_user,'directory_internal','CREATE') AS internal")).rows[0];
  assert.equal(schema.pub,false);assert.equal(schema.internal,false);
  const functions=(await client.query(`SELECT p.proname,p.prosecdef,p.proconfig,
    has_function_privilege(current_user,p.oid,'EXECUTE') AS executable
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='directory_internal' AND p.proname IN ('moderate_business_limited','moderate_review_limited','audit_moderator_transition')`)).rows;
  assert.equal(functions.length,3);
  for(const fn of functions){assert.equal(fn.prosecdef,fn.proname==='audit_moderator_transition');assert.equal(fn.executable,fn.proname!=='audit_moderator_transition');assert.ok(fn.proconfig?.includes('search_path=""'));}
  await client.query("SELECT id FROM public.businesses WHERE status='pending' LIMIT 0");
  await client.query("SELECT id FROM public.reviews WHERE status='pending' LIMIT 0");
}
