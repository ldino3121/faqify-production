// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const db = new PGlite();
const uid = '10000000-0000-0000-0000-000000000001';
const other = '10000000-0000-0000-0000-000000000002';
const plan = 'pri_' + 'a'.repeat(26);
let seq = 0;
const event = async (payload: object, at = new Date().toISOString(), id = `event-${++seq}`) =>
  db.query<{ result: string }>('select public.apply_paddle_event($1,$2,$3,$4) as result', [id, at, 'sandbox', JSON.stringify(payload)]);
const row = async () => (await db.query<any>('select * from public.user_subscriptions where user_id=$1', [uid])).rows[0];
const gate = async (count = 3) => (await db.query<any>('select public.can_generate_faqs($1,$2) as result', [uid, count])).rows[0].result;
const faqs = Array.from({ length: 3 }, (_, i) => ({ question: `Question ${i}?`, answer: `Answer ${i}.` }));
beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
    CREATE TYPE public.plan_tier AS ENUM ('Free','Pro','Business');
    CREATE TABLE profiles(id uuid PRIMARY KEY);
    CREATE TABLE user_subscriptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid UNIQUE REFERENCES profiles(id),
      plan_tier text DEFAULT 'Free', status text DEFAULT 'active', faq_usage_current integer DEFAULT 0, faq_usage_limit integer DEFAULT 5,
      plan_activated_at timestamptz DEFAULT now(),plan_expires_at timestamptz DEFAULT '2099-12-31',
      last_reset_date timestamptz DEFAULT now(), created_at timestamptz DEFAULT now(),updated_at timestamptz,
      razorpay_subscription_id text,auto_renewal boolean DEFAULT false,payment_gateway text,subscription_source text,
      payment_type text,billing_cycle text,next_billing_date timestamptz,cancelled_at timestamptz,cancellation_reason text,plan_changed_at timestamptz,
      CONSTRAINT user_subscriptions_status_check CHECK(status IN ('active','inactive','cancelled','expired')));
    CREATE TABLE payment_transactions(id uuid PRIMARY KEY,user_id uuid);
    CREATE TABLE faq_collections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES profiles(id),title text,source_url text,source_content text,status text);
    CREATE TABLE faqs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),collection_id uuid REFERENCES faq_collections(id),question text NOT NULL,answer text NOT NULL,order_index integer,is_published boolean);
    CREATE TABLE usage_analytics(id uuid DEFAULT gen_random_uuid(),user_id uuid,action_type text NOT NULL,action text,metadata jsonb);
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
    CREATE FUNCTION public.reset_monthly_usage() RETURNS integer LANGUAGE sql AS $$SELECT 0$$;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated,service_role;
    ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
    CREATE POLICY legacy_permissive ON user_subscriptions FOR ALL USING(true);
  `);
  await db.exec(readFileSync('supabase/rollout/maintenance.sql','utf8'));
  await db.exec("select faqify_set_rollout('drain',0); select faqify_set_rollout('frozen',0);");
  await db.exec(readFileSync('supabase/migrations/20261022000000_paddle_and_atomic_faq_saves.sql','utf8'));
  await db.exec("select faqify_set_rollout('open',0)");
  await db.query('insert into auth.users(id) values($1),($2)',[uid,other]);
  await db.query('insert into faqify_sandbox_cohort(user_id) values($1),($2)',[uid,other]);
  await db.query('insert into profiles(id) values($1),($2)',[uid,other]);
  await db.query('insert into user_subscriptions(user_id) values($1),($2)',[uid,other]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[uid]);
}, 60000);
afterAll(() => db.close());

describe('atomic FAQ saves and account permissions', () => {
  it('commits content and quota once, and replays the same save safely', async () => {
    const g=(await db.query<any>("insert into faq_generation_requests(user_id,requested_count,faqs,status) values($1,3,$2,'completed') returning id",[uid,JSON.stringify(faqs)])).rows[0].id;
    const first=(await db.query<any>('select save_generated_faqs($1,$2) as result',[g,'Test FAQs'])).rows[0].result;
    const second=(await db.query<any>('select save_generated_faqs($1,$2) as result',[g,'Test FAQs'])).rows[0].result;
    expect(first.collection_id).toBe(second.collection_id);expect(second.already_saved).toBe(true);
    expect((await row()).faq_usage_current).toBe(3);
    expect((await db.query<any>('select count(*)::int as n from faqs')).rows[0].n).toBe(3);
    expect((await db.query("select action_type,action from usage_analytics")).rows).toEqual([{action_type:'collection_saved',action:'collection_saved'}]);
  });
  it('refuses a second Free collection before another AI request', async () => {
    expect((await gate()).can_generate).toBe(false);
    await db.exec('delete from faqs; delete from faq_collections;');
  });
  it('rolls back the whole save when quota is exhausted', async () => {
    const g=(await db.query<any>("insert into faq_generation_requests(user_id,requested_count,faqs,status) values($1,3,$2,'completed') returning id",[uid,JSON.stringify(faqs)])).rows[0].id;
    await expect(db.query('select save_generated_faqs($1,$2)',[g,'Too many FAQs'])).rejects.toThrow('quota');
    expect((await db.query<any>('select count(*)::int as n from faq_collections')).rows[0].n).toBe(0);
  });
  it('refuses another user generation ticket and another account quota lookup', async () => {
    const g=(await db.query<any>("insert into faq_generation_requests(user_id,requested_count,faqs,status) values($1,3,$2,'completed') returning id",[other,JSON.stringify(faqs)])).rows[0].id;
    await expect(db.query('select save_generated_faqs($1,$2)',[g,'Another account'])).rejects.toThrow('not found');
    await expect(db.query('select can_generate_faqs($1,3)',[other])).rejects.toThrow('Unauthorized');
  });
  it('denies client entitlement writes and replaces the broad legacy SELECT policy', async () => {
    await db.exec('set role authenticated');
    await expect(db.exec("update user_subscriptions set plan_tier='Business'" )).rejects.toThrow('permission denied');
    await expect(db.exec('truncate user_subscriptions')).rejects.toThrow('permission denied');
    const rows=await db.query('select * from user_subscriptions');expect(rows.rows).toHaveLength(1);
    await expect(db.exec("select begin_paddle_checkout(null,'Pro','recurring','x','sandbox')")).rejects.toThrow('permission denied');
    await db.exec('reset role');
  });
  it('rolls back content, quota, analytics and ticket status on a required FAQ insert failure', async () => {
    const g=(await db.query<{id: string}>("insert into faq_generation_requests(user_id,requested_count,faqs,status) values($1,1,$2,'completed') returning id",[other,JSON.stringify([{question:'Incomplete FAQ'}])])).rows[0].id;
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);
    await expect(db.query('select save_generated_faqs($1,$2)',[g,'Invalid FAQ'])).rejects.toThrow('null value');
    expect((await db.query<{n: number}>('select count(*)::int n from faq_collections where user_id=$1',[other])).rows[0].n).toBe(0);
    expect((await db.query<{faq_usage_current: number}>('select faq_usage_current from user_subscriptions where user_id=$1',[other])).rows[0].faq_usage_current).toBe(0);
    expect((await db.query<{status: string}>('select status from faq_generation_requests where id=$1',[g])).rows[0].status).toBe('completed');
    await db.query('delete from faq_generation_requests where id=$1',[g]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
  });
  it('rejects duplicate account owners without forcing nullable legacy owners to change', async () => {
    await expect(db.query('insert into user_subscriptions(user_id) values($1)',[uid])).rejects.toThrow('unique');
    await db.exec('insert into user_subscriptions(user_id) values(null)');
    await db.exec('set role authenticated');
    expect((await db.query('select id from user_subscriptions')).rows).toHaveLength(1);
    await expect(db.query('select can_generate_faqs(null,1)')).rejects.toThrow('Unauthorized');
    await db.exec('reset role');
    await db.exec('delete from user_subscriptions where user_id is null');
  });
});

describe('Paddle entitlement lifecycle',()=>{
  let intent: string;
  let payment: Record<string, any>;
  const paidAt='2026-10-22T10:00:00Z';
  it('deduplicates checkout creation under the account lock',async()=>{
    const begin=()=>db.query<any>("select begin_paddle_checkout($1,'Pro','recurring',$2,'sandbox') as result",[uid,plan]);
    const a=(await begin()).rows[0].result;const b=(await begin()).rows[0].result;
    expect(a.is_new).toBe(true);expect(b.is_new).toBe(false);expect(a.id).toBe(b.id);intent=a.id;
    await db.query("update paddle_checkouts set transaction_id=$1,expires_at=now()-interval '1 hour' where id=$2",['txn-first',intent]);
    // An old browser can still pay a draft transaction: time alone must not release the intent.
    expect((await begin()).rows[0].result.id).toBe(intent);
  });
  it('binds a completed payment to the server-created intent and grants quota',async()=>{
    payment={operation:'payment',transaction_id:'txn-first',subscription_id:'sub-first',customer_id:'ctm-first',price_id:plan,tier:'Pro',kind:'recurring',amount:'900',currency:'USD',period_end:'2099-11-22T10:00:00Z',period_start:paidAt};
    await event(payment,paidAt,'first-payment');
    const s=await row();expect(s.plan_tier).toBe('Pro');expect(s.plan_id).toBe('Pro');expect(s.faq_usage_current).toBe(0);expect(s.paddle_subscription_id).toBe('sub-first');
  });
  it('does not reset consumed quota on duplicate events or duplicate payments',async()=>{
    await db.query('update user_subscriptions set faq_usage_current=7 where user_id=$1',[uid]);
    await event(payment,paidAt,'first-payment');await event(payment,paidAt);
    expect((await row()).faq_usage_current).toBe(7);
  });
  it('records renewals once and ignores older deliveries for access',async()=>{
    await event({...payment,transaction_id:'txn-renew',period_end:'2099-12-22T10:00:00Z'},'2026-11-22T10:00:00Z');
    expect((await row()).faq_usage_current).toBe(0);
    await db.query('update user_subscriptions set faq_usage_current=9 where user_id=$1',[uid]);
    await event({...payment,transaction_id:'txn-delayed'},'2026-10-23T10:00:00Z');
    expect((await row()).faq_usage_current).toBe(9);expect((await row()).paddle_last_transaction_id).toBe('txn-renew');
  });
  it('keeps paid access when renewal cancellation is only scheduled',async()=>{
    await event({operation:'subscription',subscription_id:'sub-first',customer_id:'ctm-first',status:'active',scheduled_action:'cancel'},'2026-11-23T10:00:00Z');
    const s=await row();expect(s.auto_renewal).toBe(false);expect(s.status).toBe('active');expect((await gate()).can_generate).toBe(true);
  });
  it('does not reset recurring usage through the monthly cron',async()=>{
    await db.query("update user_subscriptions set last_reset_date=now()-interval '2 months' where user_id=$1",[uid]);
    await db.exec('select reset_monthly_usage()');expect((await row()).faq_usage_current).toBe(9);
  });
  it('blocks overlapping paid subscriptions',async()=>{
    await expect(db.query("select begin_paddle_checkout($1,'Business','recurring',$2,'sandbox')",[uid,plan])).rejects.toThrow('existing recurring');
  });
  it('ignores stale subscription events and stops access on effective cancellation',async()=>{
    await event({operation:'subscription',subscription_id:'sub-first',customer_id:'ctm-first',status:'canceled'},'2026-11-24T10:00:00Z');
    await event({operation:'subscription',subscription_id:'sub-first',customer_id:'ctm-first',status:'active'},'2026-11-22T10:00:00Z');
    expect((await row()).status).toBe('cancelled');
    // Test gate against an actually elapsed expiration, independent of host date.
    await db.query("update user_subscriptions set plan_expires_at=now()-interval '1 day' where user_id=$1",[uid]);
    expect((await gate()).can_generate).toBe(false);
  });
  it('acknowledges partial refunds without revoking access and revokes the current full refund',async()=>{
    await event({operation:'adjustment',transaction_id:'txn-renew',action:'refund',adjustment_status:'approved',adjustment_type:'partial'});
    expect((await row()).status).toBe('cancelled');
    await event({operation:'adjustment',transaction_id:'txn-renew',action:'refund',adjustment_status:'approved',adjustment_type:'full'});
    expect((await row()).status).toBe('refunded');expect((await gate()).can_generate).toBe(false);
  });
  it('rolls back failed webhook processing so delivery can be retried',async()=>{
    await expect(event({...payment,transaction_id:'unknown',subscription_id:'unknown'},undefined,'retry-event')).rejects.toThrow('Unbound');
    expect((await db.query("select * from paddle_events where event_id='retry-event'")).rows).toHaveLength(0);
  });
});

describe('one-time access and superseded subscription events',()=>{
  it('allows a fresh one-time period after the old recurring entitlement has ended',async()=>{
    const result=await db.query<any>("select begin_paddle_checkout($1,'Business','one_time',$2,'sandbox') as result",[uid,plan]);
    const id=result.rows[0].result.id;
    await db.query("update paddle_checkouts set transaction_id='txn-one-time' where id=$1",[id]);
    await event({operation:'payment',transaction_id:'txn-one-time',subscription_id:null,customer_id:'ctm-first',price_id:plan,tier:'Business',kind:'one_time',amount:'2900',currency:'USD',period_end:'2099-12-22T10:00:00Z',period_start:'2026-12-22T10:00:00Z'},'2026-12-22T10:00:00Z');
    const s=await row();expect(s.plan_tier).toBe('Business');expect(s.faq_usage_current).toBe(0);expect(s.faq_usage_limit).toBe(500);expect(s.auto_renewal).toBe(false);expect(s.paddle_subscription_id).toBeNull();
  });
  it('acknowledges a late cancellation of the old subscription without touching replacement access',async()=>{
    const result=await event({operation:'subscription',subscription_id:'sub-first',customer_id:'ctm-first',status:'canceled'},'2026-12-23T10:00:00Z');
    expect(result.rows[0].result).toBe('superseded_subscription_event');expect((await row()).status).toBe('active');expect((await row()).plan_tier).toBe('Business');
  });
  it('never refills one-time Paddle quota through calendar resets',async()=>{
    await db.query("update user_subscriptions set faq_usage_current=500,last_reset_date=now()-interval '2 months' where user_id=$1",[uid]);
    await db.exec('select reset_monthly_usage()');
    expect((await gate(1)).can_generate).toBe(false);
    expect((await row()).faq_usage_current).toBe(500);
  });
  it('uses the canonical plan_id when a legacy plan_tier is null',async()=>{
    await db.query("update user_subscriptions set plan_tier=null,plan_id='Business',faq_usage_current=0,plan_expires_at=now()-interval '1 day' where user_id=$1",[uid]);
    expect((await gate(1)).can_generate).toBe(false);
  });
});

describe('generation cost admission',()=>{
  it('enforces the hourly attempt cap under the account lock and accepts one remaining credit',async()=>{
    await db.exec("select set_config('request.jwt.claim.role','service_role',false)");
    for(let i=0;i<19;i++) await db.query('select begin_faq_generation($1,1,null,null)',[other]);
    // The earlier ownership test inserted one ticket for this account: 20 total.
    await expect(db.query('select begin_faq_generation($1,1,null,null)',[other])).rejects.toThrow('rate limit');
  });
});

describe('maintenance with the revised billing schema', () => {
  it('rejects old direct inserts at the revoked grant and other old writes at the revision guard',async()=>{
    await db.exec("select faqify_set_rollout('open',1); select set_config('request.jwt.claim.role','authenticated',false); select set_config('request.headers','{}',false); set role authenticated");
    try {
      await expect(db.exec("insert into faq_collections(title) values('stale')")).rejects.toThrow('permission denied');
      await expect(db.exec('update faqs set answer=answer')).rejects.toThrow('Refresh required');
      await db.exec(`SELECT set_config('request.headers','{"x-faqify-client":"1"}',false); UPDATE faqs SET answer=answer;`);
    } finally { await db.exec("reset role; select faqify_set_rollout('open',0)"); }
  });

  it('freezes new ledgers without acknowledging an event and allows a later idempotent retry', async () => {
    const id='maintenance-retry-event';
    const payload={operation:'adjustment',transaction_id:'txn-first',action:'refund',adjustment_status:'pending',adjustment_type:'full'};
    await db.exec("select faqify_set_rollout('drain',0); select faqify_set_rollout('frozen',0)");
    try {
      await expect(event(payload,new Date().toISOString(),id)).rejects.toThrow('Maintenance');
      expect((await db.query('select event_id from paddle_events where event_id=$1',[id])).rows).toHaveLength(0);
      expect((await db.query('select count(*) from faqs')).rows).toHaveLength(1);
    } finally { await db.exec("select faqify_set_rollout('open',0)"); }
    await event(payload,new Date().toISOString(),id);
    await event(payload,new Date().toISOString(),id);
    expect((await db.query('select event_id from paddle_events where event_id=$1',[id])).rows).toHaveLength(1);
  });
});

describe('sandbox cohort boundary on the shared database', () => {
  it('fails closed for nonmembers and live while leaving ordinary FAQ access independent', async () => {
    await db.exec('RESET ROLE');
    await db.query('update faqify_sandbox_cohort set enabled=false where user_id=$1',[other]);
    await expect(db.query("select begin_paddle_checkout($1,'Pro','one_time','fixture','sandbox')",[other])).rejects.toThrow('approved test accounts');
    await expect(db.query("select faqify_require_sandbox_member($1,'live')",[uid])).rejects.toThrow('sandbox');
    await expect(db.query("select faqify_require_sandbox_member(null,'sandbox')")).rejects.toThrow('approved test accounts');
    await db.query('update faqify_sandbox_cohort set enabled=true where user_id=$1',[other]);
  });
  it('clients and runtime service role cannot enroll accounts or read the cohort', async () => {
    for (const role of ['anon','authenticated','service_role']) {
      await db.exec(`set role ${role}`);
      await expect(db.query('select * from faqify_sandbox_cohort')).rejects.toThrow('permission denied');
      await expect(db.query('insert into faqify_sandbox_cohort(user_id) values($1)',[other])).rejects.toThrow('permission denied');
      await db.exec('reset role');
    }
  });
  it('rolls back event/payment ledgers when a bound nonmember payment arrives', async () => {
    await db.query('update faqify_sandbox_cohort set enabled=false where user_id=$1',[other]);
    await db.query("insert into paddle_checkouts(user_id,environment,tier,kind,price_id,transaction_id) values($1,'sandbox','Pro','one_time','cohort-price','cohort-transaction')",[other]);
    await expect(event({operation:'payment',transaction_id:'cohort-transaction',price_id:'cohort-price',tier:'Pro',kind:'one_time'},undefined,'cohort-rejected-event')).rejects.toThrow('approved test accounts');
    expect((await db.query("select event_id from paddle_events where event_id='cohort-rejected-event'")).rows).toHaveLength(0);
    expect((await db.query("select transaction_id from paddle_payments where transaction_id='cohort-transaction'")).rows).toHaveLength(0);
    await db.query('update faqify_sandbox_cohort set enabled=true where user_id=$1',[other]);
  });
});
