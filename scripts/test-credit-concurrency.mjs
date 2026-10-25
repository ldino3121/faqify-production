// Explicit isolated-restore test. Never accepts remote database credentials.
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const container=process.env.FAQIFY_LOCAL_RESTORE_CONTAINER;
const output=process.env.FAQIFY_LOCAL_TEST_OUTPUT;
if (!/^faqify-credit-current-[a-z0-9-]+$/.test(container??'') || !output?.startsWith('/Users/carbonface/Backups/faqify/')) {
  throw new Error('Provide the explicit isolated credit restore and protected output folder.');
}
mkdirSync(output,{recursive:true,mode:0o700});
const info=JSON.parse(spawnSync('docker',['inspect',container],{encoding:'utf8'}).stdout)[0];
assert.equal(info.State.Running,true);
assert.equal(info.HostConfig.NetworkMode,'none');
assert.equal(Object.keys(info.HostConfig.PortBindings??{}).length,0);
const uid=randomUUID(),freeUid=randomUUID(),ticketIds=[];
const ident=()=>randomUUID().replaceAll('-','').slice(0,26);
const txnA=`txn_${ident()}`,txnB=`txn_${ident()}`;
const eventA=`evt_${ident()}`,eventB=`evt_${ident()}`,customer=`ctm_${ident()}`;
const quote=value=>`'${value.replaceAll("'","''")}'`;
let logIndex=0;
function run(sql,label) {
  return new Promise((done,reject)=>{
    const p=spawn('docker',['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1',
      '-h','/var/run/postgresql','-U','supabase_admin','-d','faqify_restore']);
    const stdout=[],stderr=[];
    p.stdout.on('data',chunk=>stdout.push(chunk));p.stderr.on('data',chunk=>stderr.push(chunk));
    p.on('error',reject);
    p.on('close',code=>{
      const result={code,stdout:Buffer.concat(stdout).toString(),stderr:Buffer.concat(stderr).toString()};
      writeFileSync(resolve(output,`${++logIndex}-${label}.stderr.log`),result.stderr,{mode:0o600});
      done(result);
    });
    p.stdin.end(`SET statement_timeout='20s'; SET lock_timeout='10s'; ${sql}`);
  });
}
async function ok(sql,label){const r=await run(sql,label);assert.equal(r.code,0,`${label} failed; inspect protected log`);return r.stdout.trim();}
const service=sql=>`BEGIN;SET LOCAL ROLE service_role;
  SELECT set_config('request.jwt.claim.role','service_role',true);
  SET LOCAL request.headers='{"x-faqify-client":"2"}';${sql};COMMIT;`;
const asUser=(user,sql)=>`BEGIN;SET LOCAL ROLE authenticated;
  SELECT set_config('request.jwt.claim.role','authenticated',true);
  SELECT set_config('request.jwt.claim.sub',${quote(user)},true);
  SET LOCAL request.headers='{"x-faqify-client":"2"}';${sql};COMMIT;`;
const payment=(event,transaction,price)=>service(`SELECT public.apply_paddle_credit_event(${quote(event)},now(),'sandbox',
  jsonb_build_object('operation','payment','transaction_id',${quote(transaction)},'customer_id',${quote(customer)},
    'price_id',${quote(price)},'currency','USD','user_id',${quote(uid)},
    'checkout_id',(SELECT id::text FROM public.paddle_checkouts WHERE transaction_id=${quote(transaction)})))`);
let failed;
try {
  await ok(`SET ROLE postgres;SELECT public.faqify_set_rollout('open',2);
    INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
      (${quote(uid)},${quote(uid+'@example.invalid')},'{}'),
      (${quote(freeUid)},${quote(freeUid+'@example.invalid')},'{}');
    INSERT INTO public.faqify_sandbox_cohort(user_id) VALUES(${quote(uid)}),(${quote(freeUid)});
    INSERT INTO public.paddle_checkouts(user_id,environment,tier,kind,price_id,transaction_id,closed)
      VALUES(${quote(uid)},'sandbox','Pro','credit_pack','pri_01m5s0d08dqp588cxhgq2vszzf',${quote(txnA)},true),
            (${quote(uid)},'sandbox','Business','credit_pack','pri_01m5s0d1mqfwn77efkypa94ay4',${quote(txnB)},false);`, 'fixtures');
  const purchases=await Promise.all([
    run(payment(eventA,txnA,'pri_01m5s0d08dqp588cxhgq2vszzf'),'purchase-pro'),
    run(payment(eventB,txnB,'pri_01m5s0d1mqfwn77efkypa94ay4'),'purchase-business')]);
  assert.ok(purchases.every(r=>r.code===0 && r.stdout.includes('credit_granted')),'Concurrent purchases must both grant');
  assert.equal(await ok(`SELECT paid_available FROM public.faq_credit_wallets WHERE user_id=${quote(uid)}`,'purchase-balance'),'600');
  const reservations=await Promise.all([
    run(service(`SELECT public.begin_faq_generation(${quote(freeUid)},4,NULL,'First synthetic source')`),'reserve-a'),
    run(service(`SELECT public.begin_faq_generation(${quote(freeUid)},4,NULL,'Second synthetic source')`),'reserve-b')]);
  assert.equal(reservations.filter(r=>r.code===0).length,1,'Concurrent reservations cannot overspend five free credits');
  ticketIds.push(reservations.find(r=>r.code===0).stdout.trim().split('\n').at(-1));
  await ok(`SET ROLE postgres; UPDATE public.faq_generation_requests SET status='completed',
      faqs='[{"question":"Question one?","answer":"Answer one."},{"question":"Question two?","answer":"Answer two."},{"question":"Question three?","answer":"Answer three."},{"question":"Question four?","answer":"Answer four."}]'
      WHERE id=${quote(ticketIds[0])};`,'complete-ticket');
  const save=asUser(freeUid,`SELECT public.save_generated_faqs(${quote(ticketIds[0])},'Concurrent credit save',NULL)`);
  const saves=await Promise.all([run(save,'save-a'),run(save,'save-b')]);
  assert.ok(saves.every(r=>r.code===0),'Both identical save requests must succeed');
  const saved=saves.map(r=>JSON.parse(r.stdout.trim().split('\n').at(-1)));
  assert.equal(saved[0].collection_id,saved[1].collection_id);
  assert.equal(saved.filter(r=>r.already_saved===true).length,1);
  const state=JSON.parse(await ok(`SELECT json_build_object('free',w.free_available,'reserved',w.reserved,
    'usage_entries',(SELECT count(*) FROM public.faq_credit_ledger WHERE user_id=${quote(freeUid)} AND entry_type='usage'),
    'saved_pairs',(SELECT count(*) FROM public.faqs f JOIN public.faq_collections c ON c.id=f.collection_id WHERE c.user_id=${quote(freeUid)}))
    FROM public.faq_credit_wallets w WHERE w.user_id=${quote(freeUid)}`,'save-balance'));
  assert.deepEqual(state,{free:1,reserved:0,usage_entries:1,saved_pairs:4});
  console.log('Credit concurrency: PASS; same-account purchases accumulate, reservations cap spend, save replay charges once.');
} catch(error){failed=error;console.error('Credit concurrency: FAIL; protected logs retained.');}
finally {
  try {await ok(`SET ROLE postgres;DELETE FROM public.paddle_events WHERE event_id IN (${quote(eventA)},${quote(eventB)});
    DELETE FROM auth.users WHERE id IN (${quote(uid)},${quote(freeUid)});
    SELECT public.faqify_set_rollout('drain',2);SELECT public.faqify_set_rollout('frozen',2);`,'cleanup');}
  catch(error){failed??=error;console.error('Local fixture cleanup requires review; no production state was touched.');}
}
if(failed)process.exitCode=1;
