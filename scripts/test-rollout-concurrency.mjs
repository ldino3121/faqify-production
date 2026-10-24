// Synthetic tables only. No production connection, backup, credentials or published port.
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const name=`faqify-rollout-test-${randomUUID().slice(0,8)}`;
const sql=(query)=>new Promise((resolve,reject)=>{
  const child=spawn('docker',['exec','-i',name,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres']);
  let out='',err='';child.stdout.on('data',c=>out+=c);child.stderr.on('data',c=>err+=c);
  child.on('error',reject);child.on('close',code=>resolve({code,out,err}));
  child.stdin.end("SET statement_timeout='10s';\n"+query);
});
const ok=async(query)=>{const r=await sql(query);assert.equal(r.code,0,'Synthetic SQL failed (no private data involved)');return r.out.trim();};
const waitFor=async(query)=>{
  for(let i=0;i<100;i++) {if(await ok(query)==='t')return;await new Promise(r=>setTimeout(r,25));}
  throw new Error('Synthetic concurrency synchronization timed out');
};
let started=false;
try {
  const run=spawnSync('docker',['run','--rm','-d','--name',name,'--network','none','--tmpfs','/var/lib/postgresql/data:rw',
    '-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17'],{encoding:'utf8'});
  assert.equal(run.status,0,'Could not start isolated synthetic database');started=true;
  let ready=false;
  for(let i=0;i<100;i++) {
    const r=spawnSync('docker',['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres'],{stdio:'ignore'});
    if(r.status===0){ready=true;break;} await new Promise(r=>setTimeout(r,100));
  }
  assert.ok(ready,'Synthetic database did not start');
  await ok(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT NULL::text$$;
    CREATE TABLE faq_collections(id int PRIMARY KEY); CREATE TABLE faqs(id int PRIMARY KEY,collection_id int REFERENCES faq_collections);`);
  await ok(readFileSync(new URL('../supabase/rollout/maintenance.sql',import.meta.url),'utf8'));
  await ok("SELECT faqify_set_rollout('drain',0)");
  const save=sql("SET application_name='rollout-save'; BEGIN; INSERT INTO faq_collections VALUES(1); INSERT INTO faqs VALUES(1,1); SELECT pg_sleep(1.5); COMMIT");
  await waitFor("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='rollout-save' AND wait_event='PgSleep')");
  const freeze=sql("SET application_name='rollout-freeze'; SELECT faqify_set_rollout('frozen',0)");
  await waitFor("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='rollout-freeze' AND wait_event='advisory')");
  assert.equal((await save).code,0);assert.equal((await freeze).code,0);
  assert.equal(await ok('SELECT count(*) FROM faqs'), '1');
  assert.notEqual((await sql('INSERT INTO faq_collections VALUES(2)')).code,0);
  console.log('PASS freeze waits for an admitted atomic database transaction and preserves its rows');

  await ok("SELECT faqify_set_rollout('drain',0)");
  const oldSnapshot=sql("SET application_name='rollout-snapshot'; BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT mode FROM faqify_rollout_control; SELECT pg_sleep(1.5); INSERT INTO faq_collections VALUES(3); COMMIT");
  await waitFor("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='rollout-snapshot' AND wait_event='PgSleep')");
  await ok("SELECT faqify_set_rollout('frozen',0)");
  const stale=await oldSnapshot;assert.notEqual(stale.code,0);assert.match(stale.err,/serialize|Maintenance/);
  console.log('PASS a pre-freeze repeatable-read snapshot cannot write through the barrier');

  await ok("SELECT faqify_set_rollout('drain',0)");
  const transition=sql("SET application_name='rollout-transition'; BEGIN; SELECT faqify_set_rollout('frozen',0); SELECT pg_sleep(1.5); COMMIT");
  await waitFor("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='rollout-transition' AND wait_event='PgSleep')");
  const waiting=sql("SET application_name='rollout-waiting'; INSERT INTO faq_collections VALUES(4)");
  await waitFor("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='rollout-waiting' AND wait_event='advisory')");
  assert.equal((await transition).code,0);const blocked=await waiting;assert.notEqual(blocked.code,0);assert.match(blocked.err,/Maintenance/);
  assert.equal(await ok('SELECT count(*) FROM faq_collections'),'1');
  console.log('PASS a writer waiting behind freeze observes the new mode and is rejected');
} finally {
  if(started) {
    const stopped=spawnSync('docker',['stop',name],{stdio:'ignore'});
    if(stopped.status!==0) throw new Error(`Cleanup failed: stop isolated test container ${name}`);
  }
}
