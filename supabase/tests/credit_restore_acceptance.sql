-- Run only against the network-isolated faqify_restore after both migrations.
-- Synthetic accounts and all their writes roll back at the end.
BEGIN;
SET LOCAL ROLE postgres;
SET LOCAL request.headers='{"x-faqify-client":"2"}';
SELECT public.faqify_set_rollout('open',2);
CREATE FUNCTION pg_temp.assert_ok(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label; END IF; END $$;
DO $$ BEGIN
  PERFORM pg_temp.assert_ok(current_database()='faqify_restore','isolated database');
  PERFORM pg_temp.assert_ok(current_setting('listen_addresses')='','no network listener');
  PERFORM pg_temp.assert_ok(current_setting('cron.launch_active_jobs')='off','cron disabled');
  PERFORM pg_temp.assert_ok((SELECT count(*)=8 FROM public.faq_credit_wallets),'existing users seeded for review');
  PERFORM pg_temp.assert_ok((SELECT count(*)=0 FROM public.faq_credit_ledger),'no invented existing intro grants');
END $$;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('c0000000-0000-0000-0000-000000000001','credit-a@example.invalid','{}'),
 ('c0000000-0000-0000-0000-000000000002','credit-b@example.invalid','{}'),
 ('c0000000-0000-0000-0000-000000000003','credit-nonmember@example.invalid','{}');
INSERT INTO public.faqify_sandbox_cohort(user_id) VALUES
 ('c0000000-0000-0000-0000-000000000001'),
 ('c0000000-0000-0000-0000-000000000002');
DO $$ BEGIN
  PERFORM pg_temp.assert_ok((SELECT count(*)=3 FROM public.faq_credit_wallets WHERE user_id::text LIKE 'c0000000-%' AND free_available=5 AND intro_state='granted'),'intro once');
  PERFORM pg_temp.assert_ok((SELECT count(*)=3 FROM public.faq_credit_ledger WHERE user_id::text LIKE 'c0000000-%' AND entry_type='intro_grant' AND delta=5),'auditable intro grants');
  PERFORM pg_temp.assert_ok((SELECT count(*)=3 FROM public.user_subscriptions WHERE user_id::text LIKE 'c0000000-%'),'actual signup subscriptions');
END $$;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
DO $$ DECLARE a jsonb; denied boolean:=false; BEGIN
  a:=public.begin_paddle_credit_checkout('c0000000-0000-0000-0000-000000000001','Pro','sandbox');
  PERFORM pg_temp.assert_ok(a->>'price_id'='pri_01m5s0d08dqp588cxhgq2vszzf','server-owned Pro price');
  PERFORM pg_temp.assert_ok((public.begin_paddle_credit_checkout('c0000000-0000-0000-0000-000000000001','Pro','sandbox')->>'id')=a->>'id','open intent dedupe');
  BEGIN
    PERFORM public.begin_paddle_credit_checkout('c0000000-0000-0000-0000-000000000003','Pro','sandbox');
  EXCEPTION WHEN raise_exception THEN denied:=true;
  END;
  PERFORM pg_temp.assert_ok(denied,'nonmember checkout rejected');
END $$;
RESET ROLE;
UPDATE public.paddle_checkouts SET transaction_id='txn_aaaaaaaaaaaaaaaaaaaaaaaaaa'
 WHERE user_id='c0000000-0000-0000-0000-000000000001' AND kind='credit_pack';
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
DO $$ DECLARE p jsonb; BEGIN
  p:=jsonb_build_object('operation','payment','transaction_id','txn_aaaaaaaaaaaaaaaaaaaaaaaaaa',
    'customer_id','ctm_aaaaaaaaaaaaaaaaaaaaaaaaaa','price_id','pri_01m5s0d08dqp588cxhgq2vszzf','currency','USD',
    'checkout_id',(SELECT id::text FROM public.paddle_checkouts WHERE transaction_id='txn_aaaaaaaaaaaaaaaaaaaaaaaaaa'),
    'user_id','c0000000-0000-0000-0000-000000000001');
  PERFORM pg_temp.assert_ok(public.apply_paddle_credit_event('evt_aaaaaaaaaaaaaaaaaaaaaaaaaa',now(),'sandbox',p)='credit_granted','Pro grant');
  PERFORM pg_temp.assert_ok(public.apply_paddle_credit_event('evt_aaaaaaaaaaaaaaaaaaaaaaaaaa',now(),'sandbox',p)='duplicate_event','event idempotency');
  PERFORM pg_temp.assert_ok(public.apply_paddle_credit_event('evt_bbbbbbbbbbbbbbbbbbbbbbbbbb',now(),'sandbox',p)='duplicate_transaction','transaction idempotency');
END $$;
RESET ROLE;
DO $$ BEGIN
  PERFORM pg_temp.assert_ok((SELECT paid_available=100 AND free_available=5 AND ever_purchased FROM public.faq_credit_wallets WHERE user_id='c0000000-0000-0000-0000-000000000001'),'Pro adds without consuming intro');
  PERFORM pg_temp.assert_ok((SELECT count(*)=1 FROM public.faq_credit_grants WHERE user_id='c0000000-0000-0000-0000-000000000001'),'one grant per transaction');
END $$;
-- Complete a second, different pack while credits remain.
UPDATE public.paddle_checkouts SET closed=true WHERE user_id='c0000000-0000-0000-0000-000000000001';
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT public.begin_paddle_credit_checkout('c0000000-0000-0000-0000-000000000001','Business','sandbox');
RESET ROLE;
UPDATE public.paddle_checkouts SET transaction_id='txn_bbbbbbbbbbbbbbbbbbbbbbbbbb'
 WHERE user_id='c0000000-0000-0000-0000-000000000001' AND kind='credit_pack' AND tier='Business';
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT public.apply_paddle_credit_event('evt_cccccccccccccccccccccccccc',now(),'sandbox',
  jsonb_build_object('operation','payment','transaction_id','txn_bbbbbbbbbbbbbbbbbbbbbbbbbb',
    'customer_id','ctm_aaaaaaaaaaaaaaaaaaaaaaaaaa','price_id','pri_01m5s0d1mqfwn77efkypa94ay4','currency','USD',
    'checkout_id',(SELECT id::text FROM public.paddle_checkouts WHERE transaction_id='txn_bbbbbbbbbbbbbbbbbbbbbbbbbb'),
    'user_id','c0000000-0000-0000-0000-000000000001'));
RESET ROLE;
DO $$ BEGIN
  PERFORM pg_temp.assert_ok((SELECT paid_available=600 FROM public.faq_credit_wallets WHERE user_id='c0000000-0000-0000-0000-000000000001'),'Pro then Business accumulation');
  PERFORM pg_temp.assert_ok((SELECT count(*)=2 FROM public.faq_credit_grants WHERE user_id='c0000000-0000-0000-0000-000000000001'),'both purchases retained');
END $$;
-- Reserve before generation; a failed generation releases without usage.
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT public.begin_faq_generation('c0000000-0000-0000-0000-000000000001',3,NULL,'Synthetic content');
DO $$ DECLARE ticket_id uuid; BEGIN
  SELECT r.id INTO ticket_id FROM public.faq_generation_requests r WHERE r.user_id='c0000000-0000-0000-0000-000000000001' ORDER BY r.created_at DESC LIMIT 1;
  PERFORM public.fail_faq_generation('c0000000-0000-0000-0000-000000000001',ticket_id);
END $$;
RESET ROLE;
DO $$ BEGIN
  PERFORM pg_temp.assert_ok((SELECT reserved=0 AND free_available=5 AND paid_available=600 FROM public.faq_credit_wallets WHERE user_id='c0000000-0000-0000-0000-000000000001'),'failed generation costs zero');
END $$;
-- The AI handler may return fewer valid pairs than requested; charge actual saved pairs.
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT public.begin_faq_generation('c0000000-0000-0000-0000-000000000001',4,NULL,'Synthetic content');
RESET ROLE;
UPDATE public.faq_generation_requests SET status='completed',
 faqs='[{"question":"First question?","answer":"First answer."},{"question":"Second question?","answer":"Second answer."}]'
 WHERE user_id='c0000000-0000-0000-0000-000000000001' AND status='pending';
SELECT set_config('test.credit_ticket',(SELECT id::text FROM public.faq_generation_requests
 WHERE user_id='c0000000-0000-0000-0000-000000000001' AND status='completed'),true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','c0000000-0000-0000-0000-000000000001',true);
DO $$ DECLARE ticket_id uuid; a jsonb; b jsonb; BEGIN
  ticket_id:=current_setting('test.credit_ticket')::uuid;
  a:=public.save_generated_faqs(ticket_id,'Synthetic credit collection',NULL);
  b:=public.save_generated_faqs(ticket_id,'Synthetic credit collection',NULL);
  PERFORM pg_temp.assert_ok(a->>'collection_id'=b->>'collection_id' AND (b->>'already_saved')::boolean,'save replay');
END $$;
RESET ROLE;
DO $$ BEGIN
  PERFORM pg_temp.assert_ok((SELECT free_available=3 AND paid_available=600 AND reserved=0 FROM public.faq_credit_wallets WHERE user_id='c0000000-0000-0000-0000-000000000001'),'actual pairs charged free first');
  PERFORM pg_temp.assert_ok((SELECT count(*)=2 FROM public.faqs f JOIN public.faq_collections c ON c.id=f.collection_id WHERE c.user_id='c0000000-0000-0000-0000-000000000001'),'saved rows exactly once');
END $$;
-- A fully unused pack can be reversed once; a consumed pack is held for review.
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT public.apply_paddle_credit_event('evt_dddddddddddddddddddddddddd',now(),'sandbox',
  '{"operation":"adjustment","transaction_id":"txn_bbbbbbbbbbbbbbbbbbbbbbbbbb","customer_id":"ctm_aaaaaaaaaaaaaaaaaaaaaaaaaa","adjustment_id":"adj_aaaaaaaaaaaaaaaaaaaaaaaaaa","action":"refund","adjustment_status":"approved","adjustment_type":"full"}');
RESET ROLE;
DO $$ BEGIN
  PERFORM pg_temp.assert_ok((SELECT paid_available=100 FROM public.faq_credit_wallets WHERE user_id='c0000000-0000-0000-0000-000000000001'),'unused pack reversal only');
  PERFORM pg_temp.assert_ok((SELECT count(*)=1 FROM public.faq_credit_ledger WHERE source_adjustment_id='adj_aaaaaaaaaaaaaaaaaaaaaaaaaa'),'single reversal entry');
END $$;
-- A failed save is transactional, deletion does not refund usage, and the old
-- monthly reset cannot alter either credit bucket.
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT public.begin_faq_generation('c0000000-0000-0000-0000-000000000002',2,NULL,'Invalid synthetic answer');
RESET ROLE;
UPDATE public.faq_generation_requests SET status='completed',faqs='[{"question":"Missing answer?"}]'
 WHERE user_id='c0000000-0000-0000-0000-000000000002' AND status='pending';
SELECT set_config('test.bad_ticket',(SELECT id::text FROM public.faq_generation_requests
 WHERE user_id='c0000000-0000-0000-0000-000000000002' AND status='completed'),true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','c0000000-0000-0000-0000-000000000002',true);
DO $$ DECLARE failed boolean:=false; BEGIN
  BEGIN PERFORM public.save_generated_faqs(current_setting('test.bad_ticket')::uuid,'Invalid synthetic save',NULL);
  EXCEPTION WHEN raise_exception THEN failed:=true; END;
  PERFORM pg_temp.assert_ok(failed,'invalid save rejected');
END $$;
RESET ROLE;
DO $$ BEGIN
  PERFORM pg_temp.assert_ok((SELECT free_available=5 AND paid_available=0 FROM public.faq_credit_wallets WHERE user_id='c0000000-0000-0000-0000-000000000002'),'failed save costs zero');
  PERFORM pg_temp.assert_ok((SELECT count(*)=0 FROM public.faq_collections WHERE user_id='c0000000-0000-0000-0000-000000000002'),'failed save creates no collection');
END $$;
DELETE FROM public.faq_collections WHERE user_id='c0000000-0000-0000-0000-000000000001';
DO $$ BEGIN
  PERFORM pg_temp.assert_ok((SELECT free_available=3 AND paid_available=100 FROM public.faq_credit_wallets WHERE user_id='c0000000-0000-0000-0000-000000000001'),'deletion does not restore credits');
  PERFORM public.reset_monthly_usage();
  PERFORM pg_temp.assert_ok((SELECT free_available=3 AND paid_available=100 FROM public.faq_credit_wallets WHERE user_id='c0000000-0000-0000-0000-000000000001'),'month reset leaves wallet unchanged');
END $$;
-- Consumed purchases are never silently clawed back from another pack.
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT public.begin_faq_generation('c0000000-0000-0000-0000-000000000001',5,NULL,'Paid synthetic source');
RESET ROLE;
UPDATE public.faq_generation_requests SET status='completed',faqs=
 '[{"question":"Question one?","answer":"Answer one."},{"question":"Question two?","answer":"Answer two."},{"question":"Question three?","answer":"Answer three."},{"question":"Question four?","answer":"Answer four."},{"question":"Question five?","answer":"Answer five."}]'
 WHERE user_id='c0000000-0000-0000-0000-000000000001' AND status='pending';
SELECT set_config('test.paid_ticket',(SELECT id::text FROM public.faq_generation_requests
 WHERE user_id='c0000000-0000-0000-0000-000000000001' AND status='completed'),true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','c0000000-0000-0000-0000-000000000001',true);
SELECT public.save_generated_faqs(current_setting('test.paid_ticket')::uuid,'Paid synthetic collection',NULL);
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT public.apply_paddle_credit_event('evt_eeeeeeeeeeeeeeeeeeeeeeeeee',now(),'sandbox',
  '{"operation":"adjustment","transaction_id":"txn_aaaaaaaaaaaaaaaaaaaaaaaaaa","customer_id":"ctm_aaaaaaaaaaaaaaaaaaaaaaaaaa","adjustment_id":"adj_bbbbbbbbbbbbbbbbbbbbbbbbbb","action":"chargeback","adjustment_status":"approved","adjustment_type":"full"}');
RESET ROLE;
DO $$ BEGIN
  PERFORM pg_temp.assert_ok((SELECT paid_available=98 AND free_available=0 AND hold_reason IS NOT NULL FROM public.faq_credit_wallets WHERE user_id='c0000000-0000-0000-0000-000000000001'),'consumed chargeback held for review without erasing unrelated balance');
  PERFORM pg_temp.assert_ok((SELECT count(*)=1 FROM public.faq_credit_usage_allocations WHERE generation_id=current_setting('test.paid_ticket')::uuid),'paid usage attributed to Pro');
  PERFORM pg_temp.assert_ok((SELECT count(*)=5 FROM public.faqs f JOIN public.faq_collections c ON c.id=f.collection_id WHERE c.user_id='c0000000-0000-0000-0000-000000000001'),'existing content preserved after chargeback');
END $$;
INSERT INTO public.faqify_sandbox_cohort(user_id) VALUES('c0000000-0000-0000-0000-000000000003');
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
DO $$ DECLARE idx integer; packs text[]:=ARRAY['Business','Pro','Pro'];
  txns text[]:=ARRAY['txn_cccccccccccccccccccccccccc','txn_dddddddddddddddddddddddddd','txn_eeeeeeeeeeeeeeeeeeeeeeeeee'];
  events text[]:=ARRAY['evt_ffffffffffffffffffffffffff','evt_gggggggggggggggggggggggggg','evt_hhhhhhhhhhhhhhhhhhhhhhhhhh'];
  intent jsonb; pack_price text; result text;
BEGIN
  FOR idx IN 1..3 LOOP
    intent:=public.begin_paddle_credit_checkout('c0000000-0000-0000-0000-000000000003',packs[idx],'sandbox');
    UPDATE public.paddle_checkouts SET transaction_id=txns[idx] WHERE id=(intent->>'id')::uuid;
    pack_price:=intent->>'price_id';
    result:=public.apply_paddle_credit_event(events[idx],now(),'sandbox',jsonb_build_object(
      'operation','payment','transaction_id',txns[idx],'customer_id','ctm_cccccccccccccccccccccccccc',
      'price_id',pack_price,'currency','USD','checkout_id',intent->>'id',
      'user_id','c0000000-0000-0000-0000-000000000003'));
    PERFORM pg_temp.assert_ok(result='credit_granted','Business to Pro and repeat Pro fulfillment');
  END LOOP;
  PERFORM pg_temp.assert_ok((SELECT paid_available=700 AND free_available=5 AND ever_purchased
    FROM public.faq_credit_wallets WHERE user_id='c0000000-0000-0000-0000-000000000003'),'Business then Pro then repeat Pro accumulates');
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','c0000000-0000-0000-0000-000000000001',true);
DO $$ DECLARE denied boolean:=false; BEGIN
  PERFORM pg_temp.assert_ok((SELECT count(*)=1 FROM public.faq_credit_wallets),'wallet RLS owner read');
  BEGIN UPDATE public.faq_credit_wallets SET paid_available=999999 WHERE user_id=auth.uid();
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  PERFORM pg_temp.assert_ok(denied,'client cannot mint credits');
  denied:=false;
  BEGIN PERFORM public.can_generate_faqs('c0000000-0000-0000-0000-000000000003',1);
  EXCEPTION WHEN raise_exception THEN denied:=true; END;
  PERFORM pg_temp.assert_ok(denied,'cross-account balance denied');
END $$;
RESET ROLE;
DO $$ BEGIN
  PERFORM pg_temp.assert_ok(NOT EXISTS(
    SELECT 1 FROM public.faq_credit_wallets w WHERE w.user_id::text LIKE 'c0000000-%'
      AND w.paid_available<>(SELECT coalesce(sum(g.remaining),0) FROM public.faq_credit_grants g WHERE g.user_id=w.user_id)
  ),'paid wallet equals remaining per-purchase grants');
END $$;
ROLLBACK;
