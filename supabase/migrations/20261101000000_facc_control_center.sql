-- FACC is a forward-only addition. Existing billing, FAQ and credit tables are untouched.
BEGIN;

DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    RAISE EXCEPTION 'FACC requires pg_cron in the target database before migration';
  END IF;
END $$;

-- The existing SELECT-only RLS policy prevented self-promotion, but old table
-- grants still advertised DML to authenticated clients. Remove that ambiguity.
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.user_roles FROM PUBLIC,anon,authenticated;

CREATE TABLE public.facc_model_catalog (
  provider text NOT NULL CHECK (provider IN ('gemini','deepseek')),
  model_id text NOT NULL,
  input_usd_per_million numeric(10,4),
  output_usd_per_million numeric(10,4),
  price_note text NOT NULL,
  price_source text NOT NULL,
  price_checked_at date NOT NULL,
  max_input_chars integer NOT NULL CHECK (max_input_chars BETWEEN 1000 AND 20000),
  max_output_tokens integer NOT NULL CHECK (max_output_tokens BETWEEN 512 AND 8192),
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (provider,model_id)
);
INSERT INTO public.facc_model_catalog(provider,model_id,input_usd_per_million,output_usd_per_million,price_note,price_source,price_checked_at,max_input_chars,max_output_tokens,capabilities) VALUES
('gemini','gemini-2.5-flash',0.30,2.50,'Standard paid text; actual tier may differ','https://ai.google.dev/gemini-api/docs/pricing','2026-10-31',10000,4096,'{"json":true,"text":true}'::jsonb),
('gemini','gemini-2.5-flash-lite',0.10,0.40,'Standard paid text; actual tier may differ','https://ai.google.dev/gemini-api/docs/pricing','2026-10-31',10000,4096,'{"json":true,"text":true}'::jsonb),
('deepseek','deepseek-flash',0.30,1.20,'Peak cache-miss estimate; off-peak/cached usage may cost less','https://api-docs.deepseek.com/quick_start/pricing/','2026-10-31',10000,4096,'{"json":true,"text":true}'::jsonb);

CREATE TABLE public.facc_ai_configs (
  version bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  layers jsonb NOT NULL CHECK (jsonb_typeof(layers)='array' AND jsonb_array_length(layers)=3),
  actor_id uuid REFERENCES auth.users(id),
  action text NOT NULL CHECK (action IN ('initial','apply','restore')),
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.facc_ai_configs(layers,action) VALUES
('[{"provider":"gemini","model_id":"gemini-2.5-flash","enabled":true},{"provider":"gemini","model_id":"gemini-2.5-flash-lite","enabled":true},{"provider":"deepseek","model_id":"deepseek-flash","enabled":false}]'::jsonb,'initial');

CREATE TABLE public.facc_ai_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  provider text NOT NULL,
  model_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('real','simulated','availability','chain')),
  successful boolean,
  requested_count integer NOT NULL CHECK (requested_count BETWEEN 1 AND 3),
  returned_count integer,
  latency_ms integer,
  error_category text,
  input_tokens integer,
  output_tokens integer,
  adapter_revision text,
  prompt_revision text,
  tested_layers jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (provider,model_id) REFERENCES public.facc_model_catalog(provider,model_id)
);
CREATE INDEX facc_ai_tests_actor_time ON public.facc_ai_tests(actor_id,created_at DESC);

CREATE TABLE public.facc_ai_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL CHECK (action IN ('apply','restore')),
  old_version bigint NOT NULL,
  new_version bigint NOT NULL,
  old_layers jsonb NOT NULL,
  new_layers jsonb NOT NULL,
  test_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX facc_ai_audit_time ON public.facc_ai_audit(created_at DESC,id DESC);

CREATE TABLE public.facc_ai_requests (
  id uuid PRIMARY KEY,
  generation_id uuid UNIQUE REFERENCES public.faq_generation_requests(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  purpose text NOT NULL CHECK (purpose IN ('customer','manual_test','health_probe')),
  input_type text NOT NULL CHECK (input_type IN ('url','text','file','probe')),
  config_version bigint REFERENCES public.facc_ai_configs(version),
  requested_count integer NOT NULL,
  returned_count integer,
  status text NOT NULL CHECK (status IN ('started','success','failed')),
  error_category text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX facc_ai_requests_time ON public.facc_ai_requests(started_at DESC);
CREATE INDEX facc_ai_requests_user_time ON public.facc_ai_requests(user_id,started_at DESC);

CREATE TABLE public.facc_ai_attempts (
  request_id uuid NOT NULL REFERENCES public.facc_ai_requests(id) ON DELETE CASCADE,
  attempt_seq smallint NOT NULL CHECK (attempt_seq BETWEEN 1 AND 12),
  provider text NOT NULL,
  model_id text NOT NULL,
  returned_model text,
  category text NOT NULL,
  latency_ms integer NOT NULL CHECK (latency_ms>=0),
  http_status smallint,
  input_tokens integer,
  output_tokens integer,
  estimated_cost_usd numeric(12,8),
  fallback boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id,attempt_seq)
);
CREATE INDEX facc_ai_attempts_time ON public.facc_ai_attempts(created_at DESC);
CREATE INDEX facc_ai_attempts_model_time ON public.facc_ai_attempts(provider,model_id,created_at DESC);

CREATE TABLE public.facc_ai_circuits (
  provider text NOT NULL,
  model_id text NOT NULL,
  failure_streak smallint NOT NULL DEFAULT 0,
  open_until timestamptz,
  recovery_lease_until timestamptz,
  last_check_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_category text,
  PRIMARY KEY(provider,model_id),
  FOREIGN KEY(provider,model_id) REFERENCES public.facc_model_catalog(provider,model_id)
);

CREATE TABLE public.facc_monitor_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz NOT NULL DEFAULT now()+interval '3 minutes',
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','failed')),
  checked integer NOT NULL DEFAULT 0,
  failures integer NOT NULL DEFAULT 0
);
CREATE INDEX facc_monitor_runs_started ON public.facc_monitor_runs(started_at DESC);

-- Every FACC table is private even when an admin calls PostgREST directly.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['facc_model_catalog','facc_ai_configs','facc_ai_tests','facc_ai_audit','facc_ai_requests','facc_ai_attempts','facc_ai_circuits','facc_monitor_runs'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  END LOOP;
END $$;
GRANT USAGE,SELECT ON SEQUENCE public.facc_ai_configs_version_seq,public.facc_ai_audit_id_seq TO service_role;

CREATE FUNCTION public.facc_begin_monitor_run() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('facc_monitor',117));
  IF EXISTS(SELECT 1 FROM public.facc_monitor_runs WHERE status='running' AND lease_until>now())
     OR (SELECT count(*) FROM public.facc_monitor_runs WHERE started_at>now()-interval '24 hours')>=2
    THEN RETURN NULL; END IF;
  INSERT INTO public.facc_monitor_runs DEFAULT VALUES RETURNING id INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.facc_begin_monitor_run() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.facc_begin_monitor_run() TO service_role;

CREATE FUNCTION public.facc_finish_monitor_run(p_id uuid,p_checked integer,p_failures integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  UPDATE public.facc_monitor_runs SET finished_at=now(),
    status=CASE WHEN p_failures=0 THEN 'success' ELSE 'failed' END,
    checked=p_checked,failures=p_failures WHERE id=p_id AND status='running';
END $$;
REVOKE ALL ON FUNCTION public.facc_finish_monitor_run(uuid,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.facc_finish_monitor_run(uuid,integer,integer) TO service_role;

CREATE FUNCTION public.facc_allow_model_attempt(p_provider text,p_model text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE circuit public.facc_ai_circuits%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_provider||':'||p_model,119));
  SELECT * INTO circuit FROM public.facc_ai_circuits
    WHERE provider=p_provider AND model_id=p_model FOR UPDATE;
  IF NOT FOUND OR circuit.open_until IS NULL THEN RETURN true; END IF;
  IF circuit.open_until>now() OR circuit.recovery_lease_until>now() THEN RETURN false; END IF;
  UPDATE public.facc_ai_circuits SET recovery_lease_until=now()+interval '130 seconds'
    WHERE provider=p_provider AND model_id=p_model;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.facc_allow_model_attempt(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.facc_allow_model_attempt(text,text) TO service_role;

CREATE FUNCTION public.facc_record_ai_attempt(
  p_request uuid,p_seq smallint,p_provider text,p_model text,p_returned_model text,
  p_category text,p_latency integer,p_status smallint,p_input_tokens integer,
  p_output_tokens integer,p_cost numeric,p_fallback boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE inserted integer; request_purpose text;
BEGIN
  SELECT purpose INTO request_purpose FROM public.facc_ai_requests WHERE id=p_request;
  IF request_purpose IS NULL THEN RAISE EXCEPTION 'Unknown AI request'; END IF;
  INSERT INTO public.facc_ai_attempts(request_id,attempt_seq,provider,model_id,returned_model,category,latency_ms,http_status,input_tokens,output_tokens,estimated_cost_usd,fallback)
  VALUES(p_request,p_seq,p_provider,p_model,left(p_returned_model,120),p_category,p_latency,p_status,p_input_tokens,p_output_tokens,p_cost,p_fallback)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted=ROW_COUNT;
  IF inserted=0 THEN RETURN; END IF;
  -- Provider probes and admin tests are evidence, never customer circuit input.
  IF request_purpose <> 'customer' THEN RETURN; END IF;
  INSERT INTO public.facc_ai_circuits(provider,model_id,failure_streak,last_check_at,last_success_at,last_failure_at,last_category,open_until)
  VALUES(p_provider,p_model,CASE WHEN p_category IN ('rate_limited','transient_overload','timeout','network') THEN 1 ELSE 0 END,
    now(),CASE WHEN p_category='success' THEN now() END,CASE WHEN p_category<>'success' THEN now() END,p_category,
    CASE WHEN p_category IN ('authentication','model_unavailable') THEN now()+interval '10 minutes' END)
  ON CONFLICT(provider,model_id) DO UPDATE SET
    failure_streak=CASE WHEN p_category IN ('rate_limited','transient_overload','timeout','network') THEN least(10,public.facc_ai_circuits.failure_streak+1) ELSE 0 END,
    last_check_at=now(),last_success_at=CASE WHEN p_category='success' THEN now() ELSE public.facc_ai_circuits.last_success_at END,
    last_failure_at=CASE WHEN p_category<>'success' THEN now() ELSE public.facc_ai_circuits.last_failure_at END,
    last_category=p_category,
    recovery_lease_until=CASE WHEN p_category='success' THEN NULL ELSE public.facc_ai_circuits.recovery_lease_until END,
    open_until=CASE
      WHEN p_category IN ('authentication','model_unavailable') THEN now()+interval '10 minutes'
      WHEN p_category IN ('rate_limited','transient_overload','timeout','network') AND public.facc_ai_circuits.failure_streak>=2 THEN now()+interval '2 minutes'
      WHEN p_category='success' THEN NULL ELSE public.facc_ai_circuits.open_until END;
END $$;
REVOKE ALL ON FUNCTION public.facc_record_ai_attempt(uuid,smallint,text,text,text,text,integer,smallint,integer,integer,numeric,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.facc_record_ai_attempt(uuid,smallint,text,text,text,text,integer,smallint,integer,integer,numeric,boolean) TO service_role;

CREATE FUNCTION public.facc_begin_ai_test(p_actor uuid,p_provider text,p_model text,p_kind text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_actor AND role='admin')
    THEN RAISE EXCEPTION 'Admin authorization required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text,117));
  IF (SELECT count(*) FROM public.facc_ai_tests WHERE actor_id=p_actor AND created_at>now()-interval '1 hour')>=10
    THEN RAISE EXCEPTION 'Admin model-test limit reached; retry later'; END IF;
  INSERT INTO public.facc_ai_tests(actor_id,provider,model_id,kind,requested_count)
  VALUES(p_actor,p_provider,p_model,p_kind,2) RETURNING id INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.facc_begin_ai_test(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.facc_begin_ai_test(uuid,text,text,text) TO service_role;

CREATE FUNCTION public.facc_apply_ai_config(p_actor uuid,p_expected_version bigint,p_layers jsonb,p_action text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE current_config public.facc_ai_configs%ROWTYPE; layer jsonb; n integer:=0; enabled_count integer:=0;
  gemini_count integer:=0; pair text; seen text[]:=ARRAY[]::text[]; next_version bigint; evidence jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_actor AND role='admin')
    THEN RAISE EXCEPTION 'Admin authorization required'; END IF;
  IF p_action NOT IN ('apply','restore') OR jsonb_typeof(p_layers)<>'array' OR jsonb_array_length(p_layers)<>3
    THEN RAISE EXCEPTION 'Invalid routing configuration'; END IF;
  IF p_action='restore' AND NOT EXISTS(SELECT 1 FROM public.facc_ai_configs WHERE layers=p_layers)
    THEN RAISE EXCEPTION 'Restore requires a previously active configuration'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('facc_ai_config',117));
  SELECT * INTO current_config FROM public.facc_ai_configs ORDER BY version DESC LIMIT 1 FOR UPDATE;
  IF current_config.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'Routing configuration changed; reload before applying'; END IF;
  FOR layer IN SELECT value FROM jsonb_array_elements(p_layers) LOOP
    n:=n+1;
    IF jsonb_typeof(layer)<>'object' OR jsonb_typeof(layer->'enabled')<>'boolean' OR
       layer->>'provider' NOT IN ('gemini','deepseek') OR
       NOT EXISTS(SELECT 1 FROM public.facc_model_catalog c WHERE c.provider=layer->>'provider' AND c.model_id=layer->>'model_id')
      THEN RAISE EXCEPTION 'Unapproved model configuration'; END IF;
    pair:=(layer->>'provider')||':'||(layer->>'model_id');
    IF pair=ANY(seen) THEN RAISE EXCEPTION 'Duplicate model assignment'; END IF;
    seen:=array_append(seen,pair);
    IF (layer->>'enabled')::boolean THEN
      enabled_count:=enabled_count+1;
      IF layer->>'provider'='gemini' THEN gemini_count:=gemini_count+1; END IF;
      IF p_action='apply' AND NOT EXISTS(SELECT 1 FROM public.facc_ai_tests t WHERE t.provider=layer->>'provider' AND t.model_id=layer->>'model_id'
        AND t.kind='real' AND t.successful AND t.returned_count=t.requested_count
        AND t.adapter_revision='facc-adapters-20261101-a' AND t.prompt_revision='faq-prompt-20261101-a'
        AND t.created_at>now()-interval '24 hours')
        THEN RAISE EXCEPTION 'Every enabled model needs a recent successful real test'; END IF;
    END IF;
  END LOOP;
  IF enabled_count<2 OR gemini_count<1 THEN RAISE EXCEPTION 'Keep at least two usable layers including Gemini'; END IF;
  IF p_action='apply' AND NOT EXISTS(
    SELECT 1 FROM public.facc_ai_tests t WHERE t.actor_id=p_actor AND t.kind='chain'
      AND t.successful AND t.returned_count=t.requested_count
      AND t.tested_layers=p_layers
      AND t.adapter_revision='facc-adapters-20261101-a'
      AND t.prompt_revision='faq-prompt-20261101-a'
      AND t.created_at>now()-interval '24 hours')
    THEN RAISE EXCEPTION 'Exact routing configuration requires a recent successful real chain test'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('provider',layer.value->>'provider','model_id',layer.value->>'model_id',
    'test_id',t.id,'tested_at',t.created_at,'successful',t.successful) ORDER BY layer.ordinality),'[]'::jsonb)
  INTO evidence
  FROM jsonb_array_elements(p_layers) WITH ORDINALITY layer(value,ordinality)
  LEFT JOIN LATERAL (
    SELECT id,created_at,successful FROM public.facc_ai_tests t
    WHERE t.provider=layer.value->>'provider' AND t.model_id=layer.value->>'model_id' AND t.kind='real'
      AND t.successful AND t.returned_count=t.requested_count
      AND t.adapter_revision='facc-adapters-20261101-a' AND t.prompt_revision='faq-prompt-20261101-a'
    ORDER BY t.created_at DESC LIMIT 1
  ) t ON true
  WHERE (layer.value->>'enabled')::boolean;
  IF p_action='apply' THEN
    evidence:=evidence||jsonb_build_array((SELECT jsonb_build_object(
      'kind','chain','test_id',t.id,'tested_at',t.created_at,
      'adapter_revision',t.adapter_revision,'prompt_revision',t.prompt_revision)
      FROM public.facc_ai_tests t WHERE t.actor_id=p_actor AND t.kind='chain'
        AND t.successful AND t.tested_layers=p_layers
        AND t.adapter_revision='facc-adapters-20261101-a'
        AND t.prompt_revision='faq-prompt-20261101-a'
      ORDER BY t.created_at DESC LIMIT 1));
  END IF;
  INSERT INTO public.facc_ai_configs(layers,actor_id,action) VALUES(p_layers,p_actor,p_action) RETURNING version INTO next_version;
  INSERT INTO public.facc_ai_audit(actor_id,action,old_version,new_version,old_layers,new_layers,test_evidence)
    VALUES(p_actor,p_action,current_config.version,next_version,current_config.layers,p_layers,evidence);
  RETURN next_version;
END $$;
REVOKE ALL ON FUNCTION public.facc_apply_ai_config(uuid,bigint,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.facc_apply_ai_config(uuid,bigint,jsonb,text) TO service_role;

-- Attempts are retained for 90 days; immutable configuration/audit history remains.
CREATE FUNCTION public.facc_prune_telemetry() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  DELETE FROM public.facc_ai_requests WHERE started_at<now()-interval '90 days';
  DELETE FROM public.facc_ai_tests WHERE created_at<now()-interval '90 days';
  DELETE FROM public.facc_monitor_runs WHERE started_at<now()-interval '90 days';
END $$;
REVOKE ALL ON FUNCTION public.facc_prune_telemetry() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.facc_prune_telemetry() TO service_role;
SELECT cron.schedule('faqify-facc-prune-telemetry','14 3 * * *','SELECT public.facc_prune_telemetry()');

CREATE FUNCTION public.facc_admin_summary(p_start timestamptz,p_end timestamptz,
  p_include_sandbox boolean DEFAULT false,p_include_admin boolean DEFAULT false,p_include_tests boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
WITH accounts AS (
  SELECT p.id,p.created_at FROM public.profiles p
  WHERE (p_include_admin OR NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=p.id AND r.role='admin'))
    AND (p_include_sandbox OR NOT EXISTS(SELECT 1 FROM public.faqify_sandbox_cohort c WHERE c.user_id=p.id AND c.enabled))
), verified_payments AS (
  -- Legacy payments are recorded here; completed credit-pack purchases are
  -- recorded as immutable grants instead. Prefer a payment row if both exist.
  SELECT x.user_id,x.transaction_id,x.environment,x.tier,x.kind,x.amount,x.currency,x.paid_at
  FROM public.paddle_payments x WHERE x.status='completed'
  UNION ALL
  SELECT g.user_id,g.transaction_id,g.environment,c.tier,'credit_pack'::text,
    g.amount_cents::numeric,g.currency,g.granted_at
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
  SELECT currency,sum(amount) AS amount_minor,count(*) AS purchases FROM pay GROUP BY currency
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
  'payment_totals',coalesce((SELECT jsonb_agg(jsonb_build_object('currency',currency,'amount_minor',amount_minor,'purchases',purchases) ORDER BY currency) FROM currency_totals),'[]'::jsonb),
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
GRANT EXECUTE ON FUNCTION public.facc_admin_summary(timestamptz,timestamptz,boolean,boolean,boolean) TO service_role;

CREATE FUNCTION public.facc_admin_health() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
SELECT jsonb_build_object(
  'openCheckouts',(SELECT count(*) FROM public.paddle_checkouts WHERE NOT closed),
  'completedAwaitingGrant',(SELECT count(*) FROM public.paddle_payments p WHERE p.kind='credit_pack' AND p.status='completed'
    AND NOT EXISTS(SELECT 1 FROM public.faq_credit_grants g WHERE g.transaction_id=p.transaction_id AND g.user_id=p.user_id)),
  'adjustmentReviews',(SELECT count(*) FROM public.faq_credit_adjustments WHERE resolution='review'),
  'oldReservations',(SELECT count(*) FROM public.faq_generation_requests WHERE status IN ('pending','completed')
    AND reserved_count>0 AND expires_at<now()),
  'staleAIRequests',(SELECT count(*) FROM public.facc_ai_requests WHERE status='started'
    AND started_at<now()-interval '10 minutes'),
  'delayedProcessedWebhooks',(SELECT count(*) FROM public.paddle_events WHERE processed_at>occurred_at+interval '15 minutes'),
  'lastProcessedWebhook',(SELECT max(processed_at) FROM public.paddle_events),
  'lastMonitorRun',(SELECT max(started_at) FROM public.facc_monitor_runs),
  'lastSuccessfulMonitor',(SELECT max(finished_at) FROM public.facc_monitor_runs WHERE status='success'),
  'monitorFailures24h',(SELECT count(*) FROM public.facc_monitor_runs WHERE started_at>now()-interval '24 hours'
    AND (status='failed' OR (status='running' AND lease_until<now()))),
  'checkedAt',now()
);
$$;
REVOKE ALL ON FUNCTION public.facc_admin_health() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.facc_admin_health() TO service_role;

COMMIT;
