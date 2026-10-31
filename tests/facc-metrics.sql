-- Synthetic-only metric fixtures on an isolated restored database. No rows persist.
BEGIN;
DO $test$
DECLARE
  live_user uuid:=gen_random_uuid();
  sandbox_user uuid:=gen_random_uuid();
  request_id uuid:=gen_random_uuid();
  manual_id uuid:=gen_random_uuid();
  probe_id uuid:=gen_random_uuid();
  generation_id uuid:=gen_random_uuid();
  result jsonb;
BEGIN
  INSERT INTO auth.users(id) VALUES(live_user),(sandbox_user);
  INSERT INTO public.profiles(id,created_at) VALUES(live_user,'2098-12-31 23:59:59+00'),
    (sandbox_user,'2099-01-01 00:00:00+00') ON CONFLICT(id) DO UPDATE SET created_at=excluded.created_at;
  INSERT INTO public.faqify_sandbox_cohort(user_id,enabled) VALUES(sandbox_user,true);
  INSERT INTO public.paddle_payments(transaction_id,user_id,environment,customer_id,tier,kind,amount,currency,paid_at,period_end)
  VALUES ('txn_facc_synthetic_usd',live_user,'live','ctm_facc_synthetic','Pro','credit_pack',900,'USD','2099-01-01 00:00:00+00','2100-01-01 00:00:00+00'),
    ('txn_facc_synthetic_eur',live_user,'live','ctm_facc_synthetic','Pro','credit_pack',800,'EUR','2099-12-31 23:59:59+00','2100-01-01 00:00:00+00'),
    ('txn_facc_synthetic_sandbox',sandbox_user,'sandbox','ctm_facc_sandbox','Business','credit_pack',2900,'USD','2099-06-01 00:00:00+00','2100-01-01 00:00:00+00');
  INSERT INTO public.faq_credit_adjustments(adjustment_id,transaction_id,user_id,action,status,resolution,occurred_at)
    VALUES('adj_facc_synthetic','txn_facc_synthetic_usd',live_user,'refund','completed','review','2099-06-02 00:00:00+00');
  INSERT INTO public.facc_ai_requests(id,user_id,purpose,input_type,requested_count,returned_count,status,started_at,finished_at)
  VALUES(request_id,live_user,'customer','text',2,2,'success','2099-06-01 00:00:00+00','2099-06-01 00:00:01+00'),
    (manual_id,live_user,'manual_test','text',2,2,'success','2099-06-01 00:00:00+00','2099-06-01 00:00:01+00'),
    (probe_id,null,'health_probe','probe',1,0,'failed','2099-06-01 00:00:00+00','2099-06-01 00:00:01+00');
  INSERT INTO public.facc_ai_attempts(request_id,attempt_seq,provider,model_id,category,latency_ms,fallback)
    VALUES(request_id,1,'gemini','gemini-2.5-flash','success',100,false);
  INSERT INTO public.faq_generation_requests(id,user_id,requested_count,faqs,status,created_at)
    VALUES(generation_id,live_user,2,'[{"question":"Q1","answer":"A1"},{"question":"Q2","answer":"A2"}]'::jsonb,
      'completed','2099-06-01 00:00:00+00');
  INSERT INTO public.faq_credit_ledger(user_id,bucket,entry_type,delta,idempotency_key,generation_id,created_at)
    VALUES(live_user,'paid','usage',-2,'facc-metric-synthetic',generation_id,'2099-06-01 00:00:01+00');
  result:=public.facc_admin_summary('2099-01-01 00:00:00+00','2100-01-01 00:00:00+00',false,false,false);
  IF (result->>'completed_purchases')::integer<>2 OR (result->>'paying_customers')::integer<>1
    OR (result->>'repeat_purchasers')::integer<>1 OR (result->>'ai_requests')::integer<>1
    OR (result->>'adjustment_reviews')::integer<>1
    OR (result->>'generated_pairs')::integer<>2 OR (result->>'saved_pairs')::integer<>2
    OR (result->>'estimated_ai_cost_usd') IS NOT NULL THEN
    RAISE EXCEPTION 'Default live metrics are incorrect'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(result->'payment_totals'))<>2 THEN
    RAISE EXCEPTION 'Currencies were collapsed'; END IF;
  result:=public.facc_admin_summary('2099-01-01 00:00:00+00','2100-01-01 00:00:00+00',true,false,true);
  IF (result->>'completed_purchases')::integer<>3 OR (result->>'ai_requests')::integer<>3 THEN
    RAISE EXCEPTION 'Sandbox or test opt-in is incorrect'; END IF;
  result:=public.facc_admin_summary('2099-01-01 00:00:00+00','2099-12-31 23:59:59+00',false,false,false);
  IF (result->>'completed_purchases')::integer<>1 THEN
    RAISE EXCEPTION 'UTC end boundary is not exclusive'; END IF;
END $test$;
ROLLBACK;
