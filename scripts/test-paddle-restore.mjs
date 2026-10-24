// Explicit local-only acceptance runner. Does not restore data or apply migrations.
// Logs can contain database error context and must stay outside the repository.
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, chmodSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const container = process.env.FAQIFY_LOCAL_RESTORE_CONTAINER;
const output = process.env.FAQIFY_LOCAL_TEST_OUTPUT;
if (!/^faqify-migration-rehearsal-[a-z0-9-]+$/.test(container ?? '') || !output || !isAbsolute(output)) {
  throw new Error('Set an explicit faqify-migration-rehearsal-* container and an absolute FAQIFY_LOCAL_TEST_OUTPUT folder outside Git.');
}
const repo = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
mkdirSync(output, { recursive: true, mode: 0o700 });
const destination = realpathSync(output);
const pathFromRepo = relative(repo, destination);
if (!pathFromRepo || (!pathFromRepo.startsWith('..' + '/') && !isAbsolute(pathFromRepo))) {
  throw new Error('Private database test logs must be outside the repository.');
}
chmodSync(destination, 0o700);
const inspected = spawnSync('docker', ['inspect', container], { encoding: 'utf8' });
if (inspected.status !== 0) throw new Error('Cannot inspect the explicit local container.');
const [target] = JSON.parse(inspected.stdout);
if (!target.State.Running || target.HostConfig.NetworkMode !== 'none' || Object.keys(target.HostConfig.PortBindings ?? {}).length) {
  throw new Error('Target must be running with network=none and no published ports.');
}
const sql = readFileSync(new URL('../supabase/tests/paddle_restore_acceptance.sql', import.meta.url));
const run = spawnSync('docker', ['exec', '-i', container, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1',
  '-h', '/var/run/postgresql', '-U', 'supabase_admin', '-d', 'faqify_restore'], { input: sql, maxBuffer: 16 * 1024 * 1024 });
for (const stream of ['stdout', 'stderr']) {
  const path = resolve(destination, `acceptance.${stream}.log`);
  writeFileSync(path, run[stream] ?? '', { mode: 0o600 });
  chmodSync(path, 0o600);
}
const passed = (run.stderr?.toString() ?? '').split('\n').filter(line => /^NOTICE:  PASS [a-zA-Z0-9 ,/-]+$/.test(line));
console.log(`Local SQL acceptance: ${run.status === 0 ? 'PASS' : 'FAIL'}; ${passed.length} groups completed.`);
if (run.status !== 0) console.error(`Private error context retained in ${destination}; never upload raw logs.`);
process.exitCode = run.status === 0 ? 0 : 1;
if (run.status === 0) {
  // Separate connections exercise the row locks that an in-memory single-session
  // suite cannot. Only freshly generated synthetic account IDs are committed;
  // finally removes those accounts and their dependent rows from this local DB.
  const users = Array.from({ length: 3 }, randomUUID);
  const tickets = Array.from({ length: 3 }, randomUUID);
  const token = randomUUID();
  const literal = value => `'${value.replaceAll("'", "''")}'`;
  const psql = (statement, label) => new Promise((resolveRun, reject) => {
    const child = spawn('docker', ['exec', '-i', container, 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
      '-h', '/var/run/postgresql', '-U', 'supabase_admin', '-d', 'faqify_restore']);
    const streams = { stdout: [], stderr: [] };
    for (const stream of ['stdout', 'stderr']) child[stream].on('data', chunk => streams[stream].push(chunk));
    child.on('error', reject);
    child.on('close', code => {
      const result = { code };
      for (const stream of ['stdout', 'stderr']) {
        result[stream] = Buffer.concat(streams[stream]).toString();
        writeFileSync(resolve(destination, `concurrency-${label}.${stream}.log`), result[stream], { mode: 0o600 });
      }
      resolveRun(result);
    });
    child.stdin.end(`SET statement_timeout='15s'; SET lock_timeout='5s';\n${statement}`);
  });
  const checked = async (sql, label) => {
    const result = await psql(sql, label);
    assert.equal(result.code, 0, `Local concurrency step ${label} failed; inspect private logs.`);
    return result.stdout.trim().split('\n').filter(Boolean);
  };
  const pair = async (sqlA, sqlB, label) => Promise.all([psql(sqlA, `${label}-a`), psql(sqlB, `${label}-b`)]);
  const asUser = (uid, sql) => `BEGIN; SET LOCAL ROLE authenticated;
    DO $$ BEGIN PERFORM set_config('request.jwt.claim.sub',${literal(uid)},true);
      PERFORM set_config('request.jwt.claim.role','authenticated',true);
      PERFORM set_config('request.headers','{"x-faqify-client":"1"}',true); END $$;
    ${sql}; SELECT pg_sleep(0.1); COMMIT;`;
  const asService = sql => `BEGIN; SET LOCAL ROLE service_role;
    DO $$ BEGIN PERFORM set_config('request.jwt.claim.role','service_role',true); END $$;
    ${sql}; SELECT pg_sleep(0.1); COMMIT;`;
  let failure;
  try {
    await checked(`BEGIN;
      INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES ${users.map(id => `(${literal(id)},${literal(id+'@example.invalid')},'{}')`).join(',')};
      INSERT INTO public.faqify_sandbox_cohort(user_id) VALUES ${users.map(id => `(${literal(id)})`).join(',')};
      UPDATE public.user_subscriptions SET plan_tier='Pro',plan_id='Pro',faq_usage_current=0,faq_usage_limit=5,
        plan_expires_at=now()+interval '1 month' WHERE user_id IN (${users.map(literal).join(',')});
      INSERT INTO public.faq_generation_requests(id,user_id,requested_count,faqs,status) VALUES
        ${tickets.map((id, i) => `(${literal(id)},${literal(users[i === 0 ? 0 : 1])},3,
          '[{"question":"One?","answer":"One."},{"question":"Two?","answer":"Two."},{"question":"Three?","answer":"Three."}]','completed')`).join(',')}; COMMIT;`, 'fixtures');
    const save = id => `SELECT public.save_generated_faqs(${literal(id)},'Concurrent synthetic FAQ')`;
    const same = await pair(asUser(users[0], save(tickets[0])), asUser(users[0], save(tickets[0])), 'same-ticket');
    assert.ok(same.every(r => r.code === 0), 'Concurrent save replay must succeed twice.');
    assert.equal(JSON.parse(same[0].stdout.trim()).collection_id, JSON.parse(same[1].stdout.trim()).collection_id);
    const distinct = await pair(asUser(users[1], save(tickets[1])), asUser(users[1], save(tickets[2])), 'quota-race');
    assert.equal(distinct.filter(r => r.code === 0).length, 1, 'Only one competing save fits the quota.');
    assert.ok(distinct.some(r => r.code !== 0 && r.stderr.includes('FAQ quota exceeded')));
    const state = JSON.parse((await checked(`SELECT json_build_object('usage_ok',bool_and(faq_usage_current=3),
      'collections',(SELECT count(*) FROM public.faq_collections WHERE user_id IN (${users.slice(0,2).map(literal).join(',')})))
      FROM public.user_subscriptions WHERE user_id IN (${users.slice(0,2).map(literal).join(',')});`, 'save-verify'))[0]);
    assert.equal(state.usage_ok, true); assert.equal(state.collections, 2);
    const checkout = asService(`SELECT public.begin_paddle_checkout(${literal(users[2])},'Pro','recurring','fixture-price','sandbox')`);
    const intents = await pair(checkout, checkout, 'checkout-race');
    assert.ok(intents.every(r => r.code === 0));
    const [first, second] = intents.map(r => JSON.parse(r.stdout.trim()));
    assert.equal(first.id, second.id); assert.notEqual(first.is_new, second.is_new);
    const txn = `fixture-${token}`;
    await checked(`UPDATE public.paddle_checkouts SET transaction_id=${literal(txn)} WHERE id=${literal(first.id)};`, 'bind');
    const payload = `jsonb_build_object('operation','payment','transaction_id',${literal(txn)},'subscription_id',${literal('sub-'+token)},
      'customer_id',${literal('ctm-'+token)},'price_id','fixture-price','tier','Pro','kind','recurring','amount','900','currency','USD',
      'period_end',now()+interval '1 month')`;
    const payment = event => asService(`SELECT public.apply_paddle_event(${literal(event)},now(),'sandbox',${payload})`);
    const events = await pair(payment(token), payment(token), 'event-race');
    assert.ok(events.every(r => r.code === 0));
    assert.deepEqual(events.map(r => r.stdout.trim()).sort(), ['duplicate','payment_applied']);
    await checked(`UPDATE public.user_subscriptions SET faq_usage_current=7 WHERE user_id=${literal(users[2])};`, 'consume');
    const payments = await pair(payment(token+'-a'), payment(token+'-b'), 'payment-race');
    assert.ok(payments.every(r => r.code === 0 && r.stdout.trim()==='payment_already_applied'));
    const entitlement = JSON.parse((await checked(`SELECT json_build_object('usage',faq_usage_current,
      'payments',(SELECT count(*) FROM public.paddle_payments WHERE user_id=${literal(users[2])}),
      'checkouts',(SELECT count(*) FROM public.paddle_checkouts WHERE user_id=${literal(users[2])}))
      FROM public.user_subscriptions WHERE user_id=${literal(users[2])};`, 'payment-verify'))[0]);
    assert.deepEqual(entitlement, { usage: 7, payments: 1, checkouts: 1 });
    console.log('Local concurrency acceptance: PASS; save replay, competing quota, checkout, event and transaction races.');
  } catch (error) {
    failure = error;
  } finally {
    try {
      await checked(`BEGIN; DELETE FROM public.paddle_events WHERE event_id IN (${[token, token+'-a', token+'-b'].map(literal).join(',')});
        DELETE FROM auth.users WHERE id IN (${users.map(literal).join(',')}); COMMIT;`, 'cleanup');
    } catch (error) { failure ??= error; }
  }
  if (failure) {
    console.error('Local concurrency acceptance: FAIL. Inspect protected concurrency logs; no database error context is printed.');
    process.exitCode = 1;
  }
}
