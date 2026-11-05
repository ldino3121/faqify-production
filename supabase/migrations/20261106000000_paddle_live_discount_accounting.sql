-- Preserve catalog price and separately record Paddle's verified total due after discounts.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.faqify_rollout_control WHERE mode='frozen') THEN
    RAISE EXCEPTION 'Freeze FAQify before zero-total billing update';
  END IF;
END $$;
ALTER TABLE public.faq_credit_grants ADD COLUMN collected_amount_cents integer CHECK (collected_amount_cents >= 0);
ALTER TABLE public.faq_credit_grants ADD COLUMN paddle_discount_id text CHECK (paddle_discount_id ~ '^dsc_[a-z0-9]{26}$');
CREATE OR REPLACE FUNCTION public.apply_paddle_credit_event(p_event_id text,p_occurred_at timestamptz,p_environment text,p_payload jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE op text:=p_payload->>'operation'; txn text:=p_payload->>'transaction_id';
  c public.paddle_checkouts%ROWTYPE; w public.faq_credit_wallets%ROWTYPE;
  g public.faq_credit_grants%ROWTYPE; price public.faq_credit_prices%ROWTYPE;
  prior public.faq_credit_adjustments%ROWTYPE; uid uuid;
  customer text:=p_payload->>'customer_id'; adj text:=p_payload->>'adjustment_id';
  act text:=p_payload->>'action'; adj_type text:=p_payload->>'adjustment_type'; adj_status text:=p_payload->>'adjustment_status';
BEGIN
  IF p_environment NOT IN ('sandbox','live') OR p_event_id !~ '^evt_[a-z0-9]{26}$'
    OR txn !~ '^txn_[a-z0-9]{26}$' OR p_occurred_at IS NULL
    THEN RAISE EXCEPTION 'Invalid credit event'; END IF;
  INSERT INTO public.paddle_events(event_id,environment,occurred_at)
    VALUES(p_event_id,p_environment,p_occurred_at) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN 'duplicate_event'; END IF;
  IF op='payment' THEN
    IF p_payload->>'subscription_id' IS NOT NULL THEN RAISE EXCEPTION 'Credit pack cannot create a subscription'; END IF;
    SELECT * INTO c FROM public.paddle_checkouts WHERE transaction_id=txn AND environment=p_environment;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unbound credit payment; retry after checkout binding'; END IF;
    IF c.kind<>'credit_pack' OR c.price_id IS DISTINCT FROM p_payload->>'price_id'
      OR c.id::text IS DISTINCT FROM p_payload->>'checkout_id'
      OR c.user_id::text IS DISTINCT FROM p_payload->>'user_id'
      THEN RAISE EXCEPTION 'Credit checkout price mismatch'; END IF;
    SELECT * INTO price FROM public.faq_credit_prices WHERE price_id=c.price_id AND environment=p_environment;
    IF NOT FOUND OR price.pack<>c.tier THEN RAISE EXCEPTION 'Unknown credit price'; END IF;
    IF p_payload->>'currency' IS DISTINCT FROM 'USD' OR customer !~ '^ctm_[a-z0-9]{26}$'
      THEN RAISE EXCEPTION 'Invalid credit transaction currency or customer'; END IF;
    IF p_environment='live' AND coalesce(p_payload->>'amount','') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Missing live Paddle grand total';
    END IF;
    IF p_payload->>'discount_id' IS NOT NULL
      AND p_payload->>'discount_id' !~ '^dsc_[a-z0-9]{26}$' THEN
      RAISE EXCEPTION 'Invalid Paddle discount identity';
    END IF;
    uid:=c.user_id;
    IF p_environment='sandbox' THEN PERFORM public.faqify_require_sandbox_member(uid,p_environment); END IF;
    SELECT * INTO w FROM public.faq_credit_wallets WHERE user_id=uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Credit account unavailable'; END IF;
    SELECT * INTO c FROM public.paddle_checkouts WHERE transaction_id=txn AND environment=p_environment FOR UPDATE;
    IF NOT FOUND OR c.user_id<>uid THEN RAISE EXCEPTION 'Checkout ownership changed'; END IF;
    IF EXISTS(SELECT 1 FROM public.paddle_customers WHERE user_id=uid AND environment=p_environment AND customer_id<>customer)
      OR EXISTS(SELECT 1 FROM public.user_subscriptions WHERE user_id=uid AND paddle_environment=p_environment
        AND paddle_customer_id IS NOT NULL AND paddle_customer_id<>customer)
      THEN RAISE EXCEPTION 'Customer mismatch'; END IF;
    IF EXISTS(SELECT 1 FROM public.faq_credit_grants WHERE transaction_id=txn AND environment=p_environment) THEN RETURN 'duplicate_transaction'; END IF;
    INSERT INTO public.faq_credit_grants(user_id,transaction_id,checkout_id,environment,price_id,
      customer_id,credits,remaining,amount_cents,currency,granted_at,collected_amount_cents,paddle_discount_id)
      VALUES(uid,txn,c.id,p_environment,price.price_id,customer,price.credits,price.credits,
        price.amount_cents,'USD',p_occurred_at,
        CASE WHEN p_environment='live' THEN (p_payload->>'amount')::integer ELSE NULL END,
        p_payload->>'discount_id') RETURNING * INTO g;
    INSERT INTO public.faq_credit_ledger(user_id,bucket,entry_type,delta,idempotency_key,
      source_transaction_id,source_event_id,grant_id)
      VALUES(uid,'paid','purchase_grant',price.credits,'pack:'||p_environment||':'||txn,txn,p_event_id,g.id);
    UPDATE public.faq_credit_wallets SET paid_available=paid_available+price.credits,
      ever_purchased=true,updated_at=now() WHERE user_id=uid;
    INSERT INTO public.paddle_customers(user_id,environment,customer_id) VALUES(uid,p_environment,customer)
      ON CONFLICT(user_id,environment) DO UPDATE SET customer_id=excluded.customer_id;
    UPDATE public.paddle_checkouts SET closed=true,expires_at=now() WHERE id=c.id;
    RETURN 'credit_granted';
  ELSIF op='adjustment' THEN
    IF adj !~ '^adj_[a-z0-9]{26}$' THEN RAISE EXCEPTION 'Invalid adjustment identity'; END IF;
    SELECT * INTO g FROM public.faq_credit_grants WHERE transaction_id=txn AND environment=p_environment;
    IF NOT FOUND THEN RAISE EXCEPTION 'Credit purchase not recorded yet'; END IF;
    IF customer IS DISTINCT FROM g.customer_id THEN RAISE EXCEPTION 'Customer mismatch'; END IF;
    uid:=g.user_id;
    IF p_environment='sandbox' THEN PERFORM public.faqify_require_sandbox_member(uid,p_environment); END IF;
    SELECT * INTO w FROM public.faq_credit_wallets WHERE user_id=uid FOR UPDATE;
    SELECT * INTO g FROM public.faq_credit_grants WHERE transaction_id=txn AND environment=p_environment FOR UPDATE;
    SELECT * INTO prior FROM public.faq_credit_adjustments WHERE adjustment_id=adj AND environment=p_environment FOR UPDATE;
    IF FOUND AND prior.occurred_at>=p_occurred_at THEN RETURN 'stale_adjustment'; END IF;
    INSERT INTO public.faq_credit_adjustments(adjustment_id,environment,transaction_id,user_id,action,adjustment_type,
      status,resolution,occurred_at)
      VALUES(adj,p_environment,txn,uid,act,adj_type,adj_status,'none',p_occurred_at)
      ON CONFLICT(environment,adjustment_id) DO UPDATE SET action=excluded.action,adjustment_type=excluded.adjustment_type,
        status=excluded.status,occurred_at=excluded.occurred_at;
    IF act NOT IN ('refund','chargeback','chargeback_reverse') THEN RETURN 'adjustment_recorded'; END IF;
    IF adj_status='rejected' THEN RETURN 'adjustment_rejected'; END IF;
    IF g.reversed_at IS NOT NULL AND act IN ('refund','chargeback') THEN RETURN 'pack_already_reversed'; END IF;
    IF act IN ('refund','chargeback') AND adj_status='approved' AND adj_type='full'
      AND g.remaining=g.credits AND g.reversed_at IS NULL THEN
      UPDATE public.faq_credit_grants SET remaining=0,reversed_at=p_occurred_at WHERE id=g.id;
      UPDATE public.faq_credit_wallets SET paid_available=paid_available-g.credits,updated_at=now() WHERE user_id=uid;
      INSERT INTO public.faq_credit_ledger(user_id,bucket,entry_type,delta,idempotency_key,
        source_transaction_id,source_event_id,source_adjustment_id,grant_id)
        VALUES(uid,'paid','refund_reversal',-g.credits,'reversal:'||p_environment||':'||txn,txn,p_event_id,adj,g.id);
      UPDATE public.faq_credit_adjustments SET resolution='reversed' WHERE adjustment_id=adj AND environment=p_environment;
      RETURN 'unused_pack_reversed';
    END IF;
    IF adj_status IN ('pending_approval','approved','reversed') THEN
      UPDATE public.faq_credit_wallets SET hold_reason='Billing adjustment requires credit reconciliation',updated_at=now()
        WHERE user_id=uid;
      UPDATE public.faq_credit_adjustments SET resolution='review' WHERE adjustment_id=adj AND environment=p_environment;
      RETURN 'reconciliation_required';
    END IF;
    RETURN 'adjustment_recorded';
  END IF;
  RAISE EXCEPTION 'Unsupported credit event operation';
END $$;

CREATE OR REPLACE FUNCTION public.facc_admin_summary(p_start timestamptz,p_end timestamptz,
  p_include_sandbox boolean DEFAULT false,p_include_admin boolean DEFAULT false,p_include_tests boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
WITH accounts AS (
  SELECT p.id,p.created_at FROM public.profiles p
  WHERE (p_include_admin OR NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=p.id AND r.role='admin'))
    AND (p_include_sandbox OR NOT EXISTS(SELECT 1 FROM public.faqify_sandbox_cohort c WHERE c.user_id=p.id AND c.enabled))
), verified_payments AS (
  -- Legacy payments are recorded here; completed credit-pack purchases are
  -- recorded as immutable grants instead. Prefer a payment row if both exist.
  SELECT x.user_id,x.transaction_id,x.environment,x.tier,x.kind,x.amount,x.currency,x.paid_at,'paddle_total'::text AS amount_basis
  FROM public.paddle_payments x WHERE x.status='completed'
  UNION ALL
  SELECT g.user_id,g.transaction_id,g.environment,c.tier,'credit_pack'::text,
    coalesce(g.collected_amount_cents,g.amount_cents)::numeric,g.currency,g.granted_at,
    CASE WHEN g.collected_amount_cents IS NOT NULL THEN 'paddle_grand_total' ELSE 'catalog_price' END::text AS amount_basis
  FROM public.faq_credit_grants g
  JOIN public.paddle_checkouts c ON c.id=g.checkout_id AND c.user_id=g.user_id
    AND c.transaction_id=g.transaction_id AND c.price_id=g.price_id
  WHERE g.amount_cents IS NOT NULL AND g.currency IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM public.paddle_payments x WHERE x.transaction_id=g.transaction_id AND x.status='completed')
), pay AS (
  SELECT x.* FROM verified_payments x JOIN accounts a ON a.id=x.user_id
  WHERE x.paid_at>=p_start AND x.paid_at<p_end
    AND (p_include_sandbox OR x.environment='live')
), gen AS (
  SELECT g.* FROM public.faq_generation_requests g JOIN accounts a ON a.id=g.user_id
  WHERE g.created_at>=p_start AND g.created_at<p_end
), usage AS (
  SELECT l.* FROM public.faq_credit_ledger l JOIN accounts a ON a.id=l.user_id
  WHERE l.created_at>=p_start AND l.created_at<p_end AND l.entry_type='usage'
), ai AS (
  SELECT r.* FROM public.facc_ai_requests r
  WHERE r.started_at>=p_start AND r.started_at<p_end AND r.status<>'started'
    AND (p_include_tests OR r.purpose='customer')
    AND (r.user_id IS NULL OR EXISTS(SELECT 1 FROM accounts a WHERE a.id=r.user_id))
), attempts AS (
  SELECT t.* FROM public.facc_ai_attempts t JOIN ai ON ai.id=t.request_id
), currency_totals AS (
  SELECT currency,amount_basis,sum(amount) AS amount_minor,count(*) AS purchases FROM pay GROUP BY currency,amount_basis
), pack_totals AS (
  SELECT tier,count(*) AS purchases FROM pay WHERE kind='credit_pack' GROUP BY tier
), bucket_totals AS (
  SELECT bucket,sum(-delta) AS credits FROM usage GROUP BY bucket
), adjustment_totals AS (
  SELECT x.action,x.resolution,count(*) AS events FROM public.faq_credit_adjustments x
  JOIN accounts a ON a.id=x.user_id
  LEFT JOIN public.paddle_payments p ON p.transaction_id=x.transaction_id AND p.user_id=x.user_id
  LEFT JOIN public.faq_credit_grants g ON g.transaction_id=x.transaction_id AND g.user_id=x.user_id
  WHERE x.occurred_at>=p_start AND x.occurred_at<p_end
    AND (p_include_sandbox OR coalesce(p.environment,g.environment)='live')
  GROUP BY x.action,x.resolution
), model_stats AS (
  SELECT provider,model_id,count(*) AS attempts,count(*) FILTER(WHERE category='success') AS successes,
    count(*) FILTER(WHERE fallback) AS fallback_attempts,
    sum(input_tokens) AS input_tokens,sum(output_tokens) AS output_tokens,
    sum(estimated_cost_usd) AS estimated_cost_usd,
    percentile_cont(0.5) WITHIN GROUP(ORDER BY latency_ms) AS p50_ms,
    percentile_cont(0.95) WITHIN GROUP(ORDER BY latency_ms) AS p95_ms
  FROM attempts GROUP BY provider,model_id
), error_categories AS (
  SELECT error_category,count(*) AS failures FROM ai WHERE status='failed' GROUP BY error_category
)
SELECT jsonb_build_object(
  'timezone','UTC','start',p_start,'end_exclusive',p_end,
  'total_accounts',(SELECT count(*) FROM accounts WHERE created_at<p_end),
  'new_signups',(SELECT count(*) FROM accounts WHERE created_at>=p_start AND created_at<p_end),
  'active_users',(SELECT count(DISTINCT user_id) FROM (SELECT user_id FROM gen UNION ALL SELECT user_id FROM usage) active),
  'paying_customers',(SELECT count(DISTINCT user_id) FROM pay),
  'repeat_purchasers',(SELECT count(*) FROM (SELECT user_id FROM pay GROUP BY user_id HAVING count(*)>1) repeated),
  'completed_purchases',(SELECT count(*) FROM pay),
  'payment_totals',coalesce((SELECT jsonb_agg(jsonb_build_object('currency',currency,'basis',amount_basis,'amount_minor',amount_minor,'purchases',purchases) ORDER BY currency,amount_basis) FROM currency_totals),'[]'::jsonb),
  'pack_sales',coalesce((SELECT jsonb_agg(jsonb_build_object('pack',tier,'count',purchases) ORDER BY tier) FROM pack_totals),'[]'::jsonb),
  'adjustment_reviews',(SELECT coalesce(sum(events),0) FROM adjustment_totals WHERE resolution='review'),
  'adjustment_events',coalesce((SELECT jsonb_agg(jsonb_build_object('action',action,'resolution',resolution,'count',events)
    ORDER BY action,resolution) FROM adjustment_totals),'[]'::jsonb),
  'generations_succeeded',(SELECT count(*) FROM gen WHERE status IN ('completed','saved')),
  'generations_failed',(SELECT count(*) FROM gen WHERE status='failed'),
  'generated_pairs',(SELECT coalesce(sum(jsonb_array_length(faqs)),0) FROM gen WHERE status IN ('completed','saved') AND jsonb_typeof(faqs)='array'),
  'saved_pairs',(SELECT coalesce(sum(-delta),0) FROM usage),
  'consumption_by_bucket',coalesce((SELECT jsonb_agg(jsonb_build_object('bucket',bucket,'credits',credits) ORDER BY bucket) FROM bucket_totals),'[]'::jsonb),
  'collections_created',(SELECT count(*) FROM public.faq_collections c JOIN accounts a ON a.id=c.user_id WHERE c.created_at>=p_start AND c.created_at<p_end),
  'ai_requests',(SELECT count(*) FROM ai),
  'ai_successes',(SELECT count(*) FROM ai WHERE status='success'),
  'provider_attempt_failures',(SELECT count(*) FROM attempts WHERE category<>'success'),
  'fallback_requests',(SELECT count(DISTINCT request_id) FROM attempts WHERE fallback),
  'ai_p50_ms',(SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM finished_at-started_at)*1000) FROM ai WHERE finished_at IS NOT NULL),
  'ai_p95_ms',(SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM finished_at-started_at)*1000) FROM ai WHERE finished_at IS NOT NULL),
  'estimated_ai_cost_usd',(SELECT sum(estimated_cost_usd) FROM attempts),
  'model_stats',coalesce((SELECT jsonb_agg(to_jsonb(model_stats) ORDER BY provider,model_id) FROM model_stats),'[]'::jsonb),
  'recent_error_categories',coalesce((SELECT jsonb_agg(to_jsonb(error_categories) ORDER BY failures DESC,error_category) FROM error_categories),'[]'::jsonb),
  'open_checkouts',(SELECT count(*) FROM public.paddle_checkouts c JOIN accounts a ON a.id=c.user_id WHERE NOT c.closed AND (p_include_sandbox OR c.environment='live')),
  'completed_awaiting_grant',(SELECT count(*) FROM pay p WHERE p.kind='credit_pack' AND NOT EXISTS(SELECT 1 FROM public.faq_credit_grants g WHERE g.transaction_id=p.transaction_id AND g.user_id=p.user_id)),
  'old_reservations',(SELECT count(*) FROM public.faq_generation_requests g JOIN accounts a ON a.id=g.user_id WHERE g.status IN ('pending','completed') AND g.reserved_count>0 AND g.expires_at<now()),
  'tracked_since',(SELECT min(started_at) FROM public.facc_ai_requests)
);
$$;
COMMIT;
