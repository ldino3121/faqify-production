-- Synthetic fixtures only. Run through scripts/test-paddle-restore.mjs against
-- an isolated, network-disabled restore AFTER the pending migration. No history
-- migrations, external services, existing account mutations, or persistent tests.
BEGIN;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';
SET LOCAL request.headers='{"x-faqify-client":"1"}';
CREATE FUNCTION pg_temp.assert_ok(ok boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label; END IF;
END $$;
CREATE FUNCTION pg_temp.assert_error(statement text, expected_state text, label text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE=expected_state THEN RETURN; END IF;
    RAISE EXCEPTION 'Unexpected error class for %: %',label,SQLSTATE;
  END;
  RAISE EXCEPTION 'Expected error for %',label;
END $$;
DO $$ BEGIN
  PERFORM pg_temp.assert_ok(current_database()='faqify_restore','local database name');
  PERFORM pg_temp.assert_ok(current_setting('listen_addresses')='','no TCP listeners');
  PERFORM pg_temp.assert_ok(current_setting('cron.launch_active_jobs')='off','cron disabled');
  PERFORM pg_temp.assert_ok(NOT EXISTS(SELECT 1 FROM auth.users WHERE id IN
    ('f0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000002','f0000000-0000-0000-0000-000000000003')),'fixture IDs unused');
END $$;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('f0000000-0000-0000-0000-000000000001','paddle-restore-free@example.invalid','{}'),
 ('f0000000-0000-0000-0000-000000000002','paddle-restore-paid@example.invalid','{}'),
 ('f0000000-0000-0000-0000-000000000003','paddle-restore-no-profile@example.invalid','{}');
DO $$ BEGIN
  PERFORM pg_temp.assert_ok((SELECT count(*)=3 FROM public.user_subscriptions WHERE user_id IN
    ('f0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000002','f0000000-0000-0000-0000-000000000003')),'actual signup trigger creates subscriptions');
  PERFORM pg_temp.assert_error($q$INSERT INTO public.user_subscriptions(user_id) VALUES('f0000000-0000-0000-0000-000000000001')$q$,'23505','unique non-null subscription owner');
  RAISE NOTICE 'PASS signup and subscription uniqueness';
END $$;
INSERT INTO public.faqify_sandbox_cohort(user_id) VALUES
 ('f0000000-0000-0000-0000-000000000001'),
 ('f0000000-0000-0000-0000-000000000002'),
 ('f0000000-0000-0000-0000-000000000003');
-- A missing optional profile must not prevent an existing auth account from
-- generating or purchasing. Never backfill profiles from billing information.
DELETE FROM public.profiles WHERE id='f0000000-0000-0000-0000-000000000003';
SET LOCAL ROLE service_role;
DO $$ BEGIN
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM public.begin_faq_generation('f0000000-0000-0000-0000-000000000003',1,NULL,NULL);
  PERFORM public.begin_paddle_checkout('f0000000-0000-0000-0000-000000000003','Business','one_time','fixture-business','sandbox');
  RAISE NOTICE 'PASS existing accounts without profiles';
END $$;
RESET ROLE;
INSERT INTO public.user_subscriptions(user_id) VALUES(NULL);
INSERT INTO public.faq_generation_requests(id,user_id,requested_count,faqs,status) VALUES
 ('f1000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001',3,
  '[{"question":"One?","answer":"One."},{"question":"Two?","answer":"Two."},{"question":"Three?","answer":"Three."}]','completed');
SET LOCAL ROLE authenticated;
DO $$ DECLARE a jsonb; b jsonb; BEGIN
  PERFORM set_config('request.jwt.claim.sub','f0000000-0000-0000-0000-000000000001',true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM pg_temp.assert_ok((SELECT count(*)=1 FROM public.user_subscriptions),'RLS excludes other/null owners');
  PERFORM pg_temp.assert_error($q$UPDATE public.user_subscriptions SET faq_usage_current=0$q$,'42501','no client entitlement writes');
  PERFORM pg_temp.assert_error('TRUNCATE public.user_subscriptions','42501','no TRUNCATE bypass');
  PERFORM pg_temp.assert_error($q$SELECT public.can_generate_faqs('f0000000-0000-0000-0000-000000000002',1)$q$,'P0001','cross-account quota');
  PERFORM pg_temp.assert_error('SELECT public.can_generate_faqs(NULL,1)','P0001','non-null RPC ownership');
  PERFORM pg_temp.assert_error($q$SELECT public.begin_paddle_checkout('f0000000-0000-0000-0000-000000000001','Pro','recurring','fixture-pro','sandbox')$q$,'42501','no direct client checkout RPC');
  a:=public.save_generated_faqs('f1000000-0000-0000-0000-000000000001','Restore test FAQs');
  b:=public.save_generated_faqs('f1000000-0000-0000-0000-000000000001','Restore test FAQs');
  PERFORM pg_temp.assert_ok(a->>'collection_id'=b->>'collection_id' AND (b->>'already_saved')::boolean,'idempotent save');
  PERFORM pg_temp.assert_ok(NOT (public.can_generate_faqs(auth.uid(),1)->>'can_generate')::boolean,'Free single collection');
  RAISE NOTICE 'PASS ownership, permissions, Free collection limit and save replay';
END $$;
RESET ROLE;
DO $$ BEGIN
  PERFORM pg_temp.assert_ok((SELECT faq_usage_current=3 FROM public.user_subscriptions WHERE user_id='f0000000-0000-0000-0000-000000000001'),'quota charged once');
  PERFORM pg_temp.assert_ok((SELECT count(*)=1 FROM public.usage_analytics WHERE user_id='f0000000-0000-0000-0000-000000000001' AND action_type='collection_saved' AND action='collection_saved'),'required analytics action_type');
  PERFORM pg_temp.assert_ok((SELECT count(*)=3 FROM public.faqs f JOIN public.faq_collections c ON c.id=f.collection_id WHERE c.user_id='f0000000-0000-0000-0000-000000000001'),'all FAQs saved');
END $$;
DELETE FROM public.faq_collections WHERE user_id='f0000000-0000-0000-0000-000000000001';
INSERT INTO public.faq_generation_requests(id,user_id,requested_count,faqs,status) VALUES
 ('f1000000-0000-0000-0000-000000000002','f0000000-0000-0000-0000-000000000001',3,
  '[{"question":"One?","answer":"One."},{"question":"Two?","answer":"Two."},{"question":"Three?","answer":"Three."}]','completed'),
 ('f1000000-0000-0000-0000-000000000003','f0000000-0000-0000-0000-000000000002',1,'[{"question":"Missing answer?"}]','completed');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  PERFORM pg_temp.assert_error($q$SELECT public.save_generated_faqs('f1000000-0000-0000-0000-000000000002','Over quota')$q$,'P0001','Free quota remains consumed after deletion');
  PERFORM pg_temp.assert_error($q$SELECT public.save_generated_faqs('f1000000-0000-0000-0000-000000000003','Other account')$q$,'P0001','ticket ownership');
  PERFORM set_config('request.jwt.claim.sub','f0000000-0000-0000-0000-000000000002',true);
  PERFORM pg_temp.assert_error($q$SELECT public.save_generated_faqs('f1000000-0000-0000-0000-000000000003','Invalid answer')$q$,'23502','real required FAQ column');
END $$;
RESET ROLE;
DO $$ BEGIN
  PERFORM pg_temp.assert_ok(NOT EXISTS(SELECT 1 FROM public.faq_collections WHERE user_id='f0000000-0000-0000-0000-000000000002'),'failed save leaves no collection');
  PERFORM pg_temp.assert_ok((SELECT faq_usage_current=0 FROM public.user_subscriptions WHERE user_id='f0000000-0000-0000-0000-000000000002'),'failed save leaves quota unchanged');
  PERFORM pg_temp.assert_ok((SELECT status='completed' FROM public.faq_generation_requests WHERE id='f1000000-0000-0000-0000-000000000003'),'failed save leaves ticket retryable');
  RAISE NOTICE 'PASS required inserts and atomic failure rollback';
END $$;
-- Server-created intent is the ownership source for the first payment.
SET LOCAL ROLE service_role;
DO $$ DECLARE a jsonb; b jsonb; BEGIN
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  a:=public.begin_paddle_checkout('f0000000-0000-0000-0000-000000000002','Pro','recurring','fixture-pro','sandbox');
  b:=public.begin_paddle_checkout('f0000000-0000-0000-0000-000000000002','Pro','recurring','fixture-pro','sandbox');
  PERFORM pg_temp.assert_ok(a->>'id'=b->>'id' AND NOT (b->>'is_new')::boolean,'checkout intent reused');
END $$;
UPDATE public.paddle_checkouts SET transaction_id='fixture-txn' WHERE user_id='f0000000-0000-0000-0000-000000000002';
DO $$ DECLARE payment jsonb; result text; BEGIN
  payment:=jsonb_build_object('operation','payment','transaction_id','fixture-txn','subscription_id','fixture-sub','customer_id','fixture-customer',
    'price_id','fixture-pro','tier','Pro','kind','recurring','amount','900','currency','USD','period_start',now(),'period_end',now()+interval '1 month');
  result:=public.apply_paddle_event('fixture-event',now(),'sandbox',payment);
  PERFORM pg_temp.assert_ok(result='payment_applied','first fulfillment');
  UPDATE public.user_subscriptions SET faq_usage_current=99 WHERE user_id='f0000000-0000-0000-0000-000000000002';
  PERFORM pg_temp.assert_ok(public.apply_paddle_event('fixture-event',now(),'sandbox',payment)='duplicate','event retry');
  PERFORM pg_temp.assert_ok(public.apply_paddle_event('fixture-event-retry',now(),'sandbox',payment)='payment_already_applied','same payment different event');
  PERFORM pg_temp.assert_ok((SELECT faq_usage_current=99 AND faq_usage_limit=100 AND current_period_end=plan_expires_at FROM public.user_subscriptions WHERE user_id='f0000000-0000-0000-0000-000000000002'),'paid period and replay preserve consumed quota');
  PERFORM pg_temp.assert_ok((public.can_generate_faqs('f0000000-0000-0000-0000-000000000002',1)->>'can_generate')::boolean,'last paid credit accepted');
  PERFORM pg_temp.assert_ok(NOT (public.can_generate_faqs('f0000000-0000-0000-0000-000000000002',2)->>'can_generate')::boolean,'paid quota exceeded');
  PERFORM pg_temp.assert_error($q$SELECT public.apply_paddle_event('fixture-failed-event',now(),'sandbox','{"operation":"payment","transaction_id":"fixture-unbound","subscription_id":"fixture-unbound"}')$q$,'P0001','unbound payment rejected');
  PERFORM pg_temp.assert_ok(NOT EXISTS(SELECT 1 FROM public.paddle_events WHERE event_id='fixture-failed-event'),'failed event not acknowledged');
  RAISE NOTICE 'PASS checkout ownership, recurring periods, paid quota and webhook retries';
END $$;
RESET ROLE;
INSERT INTO public.faq_generation_requests(id,user_id,requested_count,faqs,status) VALUES
 ('f1000000-0000-0000-0000-000000000004','f0000000-0000-0000-0000-000000000002',1,'[{"question":"Last credit?","answer":"Saved atomically."}]','completed');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub','f0000000-0000-0000-0000-000000000002',true);
  PERFORM public.save_generated_faqs('f1000000-0000-0000-0000-000000000004','Paid final credit');
  PERFORM pg_temp.assert_ok(NOT (public.can_generate_faqs(auth.uid(),1)->>'can_generate')::boolean,'paid save consumes final credit');
END $$;
RESET ROLE;
-- Preserve one credit for the lifecycle gate checks below.
UPDATE public.user_subscriptions SET faq_usage_current=99 WHERE user_id='f0000000-0000-0000-0000-000000000002';
SET LOCAL ROLE service_role;
DO $$ BEGIN PERFORM set_config('request.jwt.claim.role','service_role',true); END $$;
-- One subscription cannot be bound to two accounts. Both the attempted payment
-- and its event ledger roll back if the binding violates the unique index.
UPDATE public.paddle_checkouts SET transaction_id='fixture-collision',tier='Pro',kind='recurring',price_id='fixture-pro'
 WHERE user_id='f0000000-0000-0000-0000-000000000003';
DO $$ BEGIN
  PERFORM pg_temp.assert_error($q$SELECT public.apply_paddle_event('fixture-collision-event',now(),'sandbox',
    jsonb_build_object('operation','payment','transaction_id','fixture-collision','subscription_id','fixture-sub','customer_id','fixture-other-customer','price_id','fixture-pro','tier','Pro','kind','recurring','amount','900','currency','USD','period_end',now()+interval '1 month'))$q$,'23505','unique provider subscription ownership');
  PERFORM pg_temp.assert_ok(NOT EXISTS(SELECT 1 FROM public.paddle_payments WHERE transaction_id='fixture-collision'),'collision payment rolled back');
  PERFORM pg_temp.assert_ok(NOT EXISTS(SELECT 1 FROM public.paddle_events WHERE event_id='fixture-collision-event'),'collision event rolled back');
END $$;
-- An out-of-order lifecycle notification can retry once ownership is bound.
DO $$ BEGIN
  PERFORM pg_temp.assert_error($q$SELECT public.apply_paddle_event('fixture-lifecycle-retry',now(),'sandbox','{"operation":"subscription","subscription_id":"fixture-future-sub","customer_id":"fixture-other-customer","status":"active"}')$q$,'P0001','lifecycle before payment');
  PERFORM pg_temp.assert_ok(NOT EXISTS(SELECT 1 FROM public.paddle_events WHERE event_id='fixture-lifecycle-retry'),'early lifecycle remains retryable');
  PERFORM public.apply_paddle_event('fixture-pause',now()+interval '1 minute','sandbox','{"operation":"subscription","subscription_id":"fixture-sub","customer_id":"fixture-customer","status":"paused"}');
  PERFORM pg_temp.assert_ok(NOT (public.can_generate_faqs('f0000000-0000-0000-0000-000000000002',1)->>'can_generate')::boolean,'paused status and access blocked');
  PERFORM public.apply_paddle_event('fixture-resume',now()+interval '2 minutes','sandbox','{"operation":"subscription","subscription_id":"fixture-sub","customer_id":"fixture-customer","status":"active"}');
  PERFORM pg_temp.assert_ok((public.can_generate_faqs('f0000000-0000-0000-0000-000000000002',1)->>'can_generate')::boolean,'resume restores only paid period');
  PERFORM public.apply_paddle_event('fixture-refund',now()+interval '3 minutes','sandbox','{"operation":"adjustment","transaction_id":"fixture-txn","action":"refund","adjustment_status":"approved","adjustment_type":"full"}');
  PERFORM pg_temp.assert_ok((SELECT status='refunded' FROM public.user_subscriptions WHERE user_id='f0000000-0000-0000-0000-000000000002'),'refund allowed by widened status check');
  RAISE NOTICE 'PASS provider uniqueness, retry rollback, pause/resume and refund';
END $$;
RESET ROLE;
UPDATE public.paddle_checkouts SET kind='one_time',transaction_id='fixture-unbound'
 WHERE user_id='f0000000-0000-0000-0000-000000000003';
SET LOCAL ROLE service_role;
DO $$ BEGIN
  PERFORM pg_temp.assert_ok(public.apply_paddle_event('fixture-failed-event',now(),'sandbox',jsonb_build_object('operation','payment','transaction_id','fixture-unbound',
    'customer_id','fixture-other-customer','price_id','fixture-pro','tier','Pro','kind','one_time','amount','900','currency','USD','period_end',now()+interval '30 days'))='payment_applied','failed payment succeeds on same-event retry');
  UPDATE public.user_subscriptions SET faq_usage_current=100,last_reset_date=now()-interval '2 months'
   WHERE user_id='f0000000-0000-0000-0000-000000000003';
  PERFORM public.reset_monthly_usage();
  PERFORM pg_temp.assert_ok(NOT (public.can_generate_faqs('f0000000-0000-0000-0000-000000000003',1)->>'can_generate')::boolean,'one-time quota cannot reset early');
  PERFORM pg_temp.assert_ok((SELECT faq_usage_current=100 AND NOT auto_renewal AND paddle_subscription_id IS NULL FROM public.user_subscriptions WHERE user_id='f0000000-0000-0000-0000-000000000003'),'one-time entitlement properties');
  RAISE NOTICE 'PASS one-time fulfillment and no calendar quota refill';
END $$;
RESET ROLE;
ROLLBACK;
