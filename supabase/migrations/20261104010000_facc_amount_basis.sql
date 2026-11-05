-- Preserve amount source: pack grants record catalog price; legacy payment rows record the Paddle transaction total.
BEGIN;
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
    g.amount_cents::numeric,g.currency,g.granted_at,'catalog_price'::text AS amount_basis
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
REVOKE ALL ON FUNCTION public.facc_admin_summary(timestamptz,timestamptz,boolean,boolean,boolean) FROM PUBLIC,anon,authenticated;
COMMIT;
