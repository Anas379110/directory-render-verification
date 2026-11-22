/** Non-public, opt-in startup check. READ ONLY transactions, no application writes. */
import pg from 'pg';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRestrictedWriterConfig, restrictedPoolOptions } from '../lib/db/restricted-connection.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const relations=['public.businesses','public.reviews','directory_internal.write_events','public.moderation_log','auth.users'];
const permissions=`SELECT n.nspname||'.'||c.relname AS relation,has_table_privilege(current_user,c.oid,'SELECT') AS sel,has_table_privilege(current_user,c.oid,'INSERT') AS ins,has_table_privilege(current_user,c.oid,'UPDATE') AS upd,has_table_privilege(current_user,c.oid,'DELETE') AS del,has_table_privilege(current_user,c.oid,'TRUNCATE') AS trunc,has_table_privilege(current_user,c.oid,'TRIGGER') AS trig,has_table_privilege(current_user,c.oid,'REFERENCES') AS refs,row_security_active(c.oid) AS rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname||'.'||c.relname=ANY($1::text[])`;
const cleanState=`SELECT current_user,session_user,current_setting('request.jwt.claim.sub',true) AS sub,current_setting('request.jwt.claim.role',true) AS claim_role,current_setting('request.jwt.claims',true) AS claims`;
export class RestrictedDbReadinessError extends Error {
  constructor(stage,code) {
    super('Restricted DB readiness failed');this.name='RestrictedDbReadinessError';this.stage=stage;
    this.code=typeof code==='string'&&/^[A-Z0-9_]{3,40}$/.test(code)?code:null;
  }
}

/** expectedRuntimeRole is injectable only for disposable local fixtures, never read from env/CLI. */
export async function runRestrictedDbReadiness({env=process.env,Pool=pg.Pool,expectedRuntimeRole='directory_app_runtime'}={}) {
  const flag=env.DIRECTORY_DB_STARTUP_CHECK;
  if(flag===undefined||flag===''||flag==='false')return {ok:true,skipped:true};
  let stage='configuration',pool,client,began=false,failure,poolFaulted=false;
  try {
    assert.equal(flag,'true');
    assert.equal(env.DIRECTORY_VERIFICATION_MODE,'true');
    const actor=env.DIRECTORY_VERIFICATION_WRITER_ID?.trim();assert.ok(actor&&uuid.test(actor));
    const config=readRestrictedWriterConfig(env);assert.equal(config.mode,'restricted');
    pool=new Pool({...restrictedPoolOptions(config),max:1});
    pool.on('error',()=>{poolFaulted=true;});stage='connection';client=await pool.connect();
    assert.equal(client.connection?.stream?.encrypted,true);assert.equal(client.connection?.stream?.authorized,true);
    const clean=async()=>{
      const r=(await client.query(cleanState)).rows[0];
      assert.equal(r.current_user,expectedRuntimeRole);assert.equal(r.session_user,expectedRuntimeRole);
      for(const key of ['sub','claim_role','claims'])assert.ok(!r[key]);
    };
    stage='role-and-grant-check';await clean();
    const roleRows=(await client.query('SELECT rolname,rolcanlogin,rolinherit,rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=ANY($1::text[])',[[expectedRuntimeRole,'directory_app_writer']])).rows;
    assert.equal(roleRows.length,2);
    for(const role of roleRows){
      assert.equal(role.rolcanlogin,role.rolname===expectedRuntimeRole);
      for(const key of ['rolinherit','rolsuper','rolcreaterole','rolcreatedb','rolreplication','rolbypassrls'])assert.equal(role[key],false);
    }
    const memberships=(await client.query(`SELECT pg_get_userbyid(member) AS member,pg_get_userbyid(roleid) AS role,admin_option,to_jsonb(a)->'set_option' AS set_option FROM pg_auth_members a WHERE member=ANY(SELECT oid FROM pg_roles WHERE rolname=ANY($1::text[]))`,[[expectedRuntimeRole,'directory_app_writer']])).rows;
    assert.equal(memberships.length,1);assert.equal(memberships[0].member,expectedRuntimeRole);assert.equal(memberships[0].role,'directory_app_writer');assert.equal(memberships[0].admin_option,false);
    // PG14 local fixtures lack set_option; successful SET ROLE below is also required.
    assert.ok(memberships[0].set_option===null||memberships[0].set_option===true);
    const runtimePermissions=(await client.query(permissions,[relations])).rows;assert.equal(runtimePermissions.length,relations.length);
    for(const row of runtimePermissions)for(const key of ['sel','ins','upd','del','trunc','trig','refs'])assert.equal(row[key],false);
    for(const end of ['COMMIT','ROLLBACK']) {
      stage='read-only-transactions';await client.query('BEGIN READ ONLY');began=true;
      await client.query("SET LOCAL idle_in_transaction_session_timeout='10s'");await client.query("SET LOCAL lock_timeout='2s'");
      await client.query('SET LOCAL ROLE directory_app_writer');
      await client.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true)",[actor]);
      const identity=(await client.query("SELECT current_user,session_user,current_setting('transaction_read_only') AS read_only,current_setting('request.jwt.claim.sub',true) AS actor,current_setting('request.jwt.claim.role',true) AS claim_role")).rows[0];
      assert.equal(identity.current_user,'directory_app_writer');assert.equal(identity.session_user,expectedRuntimeRole);assert.equal(identity.read_only,'on');assert.equal(identity.actor,actor);assert.equal(identity.claim_role,'authenticated');
      const rows=(await client.query(permissions,[relations])).rows;assert.equal(rows.length,relations.length);
      for(const row of rows){
        const app=relations.slice(0,3).includes(row.relation);assert.equal(row.sel,app);assert.equal(row.ins,app);
        for(const key of ['upd','del','trunc','trig','refs'])assert.equal(row[key],false);
        if(app)assert.equal(row.rls,true);
      }
      await client.query('SELECT id FROM public.businesses LIMIT 0');await client.query('SELECT id FROM public.reviews LIMIT 0');await client.query('SELECT record_id FROM directory_internal.write_events LIMIT 0');
      await client.query(end);began=false;await clean();
    }
    client.release();client=undefined;stage='reuse';client=await pool.connect();await clean();assert.equal(poolFaulted,false);
  } catch(error) { failure=new RestrictedDbReadinessError(stage,error?.code); }
  finally {
    if(client){
      if(began)try{await client.query('ROLLBACK');}catch{failure??=new RestrictedDbReadinessError('cleanup',null);}
      client.release(failure?new Error('Readiness connection discarded'):undefined);
    }
    if(pool)try{await pool.end();}catch{failure??=new RestrictedDbReadinessError('cleanup',null);}
  }
  if(failure)throw failure;
  return {ok:true,skipped:false,tlsAuthorized:true,limitedRoleChecked:true,readOnlyTransactions:2,claimsCleared:true,poolClosed:true};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {console.log(JSON.stringify(await runRestrictedDbReadiness()));}
  catch(error){console.error(JSON.stringify({ok:false,stage:error.stage??'unknown',code:error.code??null}));process.exitCode=1;}
}
