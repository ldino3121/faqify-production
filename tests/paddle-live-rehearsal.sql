-- Execute only on an isolated restored database. This transaction always rolls back.
BEGIN;
SET LOCAL session_replication_role = replica;
DO $test$
DECLARE
  test_user uuid := 'efb63f4a-dacd-4d78-a519-4f4e742ebf04';
  initial_paid integer;
  initial_sandbox_grants integer;
  checkout jsonb;
  outcome text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.faqify_rollout_control WHERE mode='frozen')
    OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id=test_user)
    THEN RAISE EXCEPTION 'Isolated frozen restore with approved test account required'; END IF;
  IF (SELECT public_enabled FROM public.faqify_live_billing_control WHERE singleton)
    THEN RAISE EXCEPTION 'Live public gate must start disabled'; END IF;
  SELECT paid_available INTO initial_paid FROM public.faq_credit_wallets WHERE user_id=test_user;
  SELECT count(*) INTO initial_sandbox_grants FROM public.faq_credit_grants
    WHERE user_id=test_user AND environment='sandbox';
  IF initial_paid IS NULL THEN RAISE EXCEPTION 'Test wallet missing'; END IF;
  INSERT INTO public.faqify_live_billing_cohort(user_id) VALUES(test_user);
  checkout:=public.begin_paddle_credit_checkout(test_user,'Pro','live');
  UPDATE public.paddle_checkouts SET transaction_id='txn_aaaaaaaaaaaaaaaaaaaaaaaaaa'
    WHERE id=(checkout->>'id')::uuid;
  outcome:=public.apply_paddle_credit_event('evt_aaaaaaaaaaaaaaaaaaaaaaaaaa',now(),'live',
    jsonb_build_object('operation','payment','transaction_id','txn_aaaaaaaaaaaaaaaaaaaaaaaaaa',
      'subscription_id',null,'customer_id','ctm_aaaaaaaaaaaaaaaaaaaaaaaaaa',
      'checkout_id',checkout->>'id','user_id',test_user::text,
      'price_id','pri_01m6p0421ctnjm6htam5zm8cn0','currency','USD'));
  IF outcome<>'credit_granted' THEN RAISE EXCEPTION 'Pro grant failed'; END IF;
  outcome:=public.apply_paddle_credit_event('evt_aaaaaaaaaaaaaaaaaaaaaaaaaa',now(),'live',
    jsonb_build_object('operation','payment','transaction_id','txn_aaaaaaaaaaaaaaaaaaaaaaaaaa'));
  IF outcome<>'duplicate_event' THEN RAISE EXCEPTION 'Retry duplicated grant'; END IF;
  checkout:=public.begin_paddle_credit_checkout(test_user,'Business','live');
  UPDATE public.paddle_checkouts SET transaction_id='txn_bbbbbbbbbbbbbbbbbbbbbbbbbb'
    WHERE id=(checkout->>'id')::uuid;
  outcome:=public.apply_paddle_credit_event('evt_bbbbbbbbbbbbbbbbbbbbbbbbbb',now(),'live',
    jsonb_build_object('operation','payment','transaction_id','txn_bbbbbbbbbbbbbbbbbbbbbbbbbb',
      'subscription_id',null,'customer_id','ctm_aaaaaaaaaaaaaaaaaaaaaaaaaa',
      'checkout_id',checkout->>'id','user_id',test_user::text,
      'price_id','pri_01m6p042sd1hk4wre39q7cnr23','currency','USD'));
  IF outcome<>'credit_granted' THEN RAISE EXCEPTION 'Business grant failed'; END IF;
  IF (SELECT paid_available FROM public.faq_credit_wallets WHERE user_id=test_user)<>initial_paid+600
    THEN RAISE EXCEPTION 'Purchases did not accumulate'; END IF;
  IF (SELECT count(*) FROM public.faq_credit_grants WHERE user_id=test_user AND environment='live')<>2
    THEN RAISE EXCEPTION 'Live grants missing or duplicated'; END IF;
  IF (SELECT count(*) FROM public.faq_credit_grants WHERE user_id=test_user AND environment='sandbox')<>initial_sandbox_grants
    THEN RAISE EXCEPTION 'Sandbox grant history changed'; END IF;
END $test$;
ROLLBACK;
