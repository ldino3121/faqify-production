-- Forward-only FACC improvements. Customer billing, credits and content are untouched.
BEGIN;

ALTER TABLE public.facc_model_catalog
  ADD COLUMN approval_status text NOT NULL DEFAULT 'approved'
    CHECK (approval_status IN ('candidate','approved')),
  ADD COLUMN price_status text NOT NULL DEFAULT 'known'
    CHECK (price_status IN ('known','unknown')),
  ADD COLUMN provider_input_token_limit integer,
  ADD COLUMN provider_output_token_limit integer,
  ADD COLUMN registered_by uuid REFERENCES auth.users(id),
  ADD COLUMN registered_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE public.facc_model_registry_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL CHECK (action IN ('register','approve')),
  provider text NOT NULL,
  model_id text NOT NULL,
  price_status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX facc_model_registry_audit_time ON public.facc_model_registry_audit(created_at DESC,id DESC);
ALTER TABLE public.facc_model_registry_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.facc_model_registry_audit FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.facc_model_registry_audit TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.facc_model_registry_audit_id_seq TO service_role;

CREATE TABLE public.facc_monitor_schedule (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  expected_enabled boolean NOT NULL DEFAULT false,
  enabled_at timestamptz,
  cron_utc text NOT NULL DEFAULT '17 4 * * *'
);
INSERT INTO public.facc_monitor_schedule(singleton) VALUES(true);
ALTER TABLE public.facc_monitor_schedule ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.facc_monitor_schedule FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.facc_monitor_schedule TO service_role;
-- Only an operator with direct database privileges may update the expected
-- schedule gate after independently checking the GitHub Actions variable.

ALTER TABLE public.facc_monitor_runs ADD COLUMN invocation_source text NOT NULL DEFAULT 'unknown'
  CHECK (invocation_source IN ('unknown','manual','scheduled'));

CREATE FUNCTION public.facc_begin_monitor_run(p_source text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result uuid;
BEGIN
  IF p_source NOT IN ('manual','scheduled') THEN RAISE EXCEPTION 'Invalid monitor source'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('facc_monitor',117));
  IF EXISTS(SELECT 1 FROM public.facc_monitor_runs WHERE status='running' AND lease_until>now())
     OR (SELECT count(*) FROM public.facc_monitor_runs WHERE started_at>now()-interval '24 hours')>=2
    THEN RETURN NULL; END IF;
  INSERT INTO public.facc_monitor_runs(invocation_source) VALUES(p_source) RETURNING id INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.facc_begin_monitor_run(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.facc_begin_monitor_run(text) TO service_role;

CREATE FUNCTION public.facc_register_model_candidate(
  p_actor uuid,p_provider text,p_model text,p_input_price numeric,p_output_price numeric,
  p_price_status text,p_price_note text,p_price_source text,p_provider_input_limit integer,
  p_provider_output_limit integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_actor AND role='admin')
    THEN RAISE EXCEPTION 'Admin authorization required'; END IF;
  IF p_provider NOT IN ('gemini','deepseek') OR p_model !~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,99}$'
    OR p_price_status NOT IN ('known','unknown') OR length(p_price_note)>240 OR length(p_price_source)>240
    OR p_provider_input_limit<8192 OR p_provider_output_limit<4096
    OR (p_price_status='known' AND (p_input_price IS NULL OR p_output_price IS NULL OR p_input_price<0 OR p_output_price<0))
    OR (p_price_status='unknown' AND (p_input_price IS NOT NULL OR p_output_price IS NOT NULL))
    THEN RAISE EXCEPTION 'Invalid candidate metadata or pricing'; END IF;
  INSERT INTO public.facc_model_catalog(provider,model_id,input_usd_per_million,output_usd_per_million,
    price_note,price_source,price_checked_at,max_input_chars,max_output_tokens,capabilities,
    approval_status,price_status,provider_input_token_limit,provider_output_token_limit,registered_by)
  VALUES(p_provider,p_model,p_input_price,p_output_price,p_price_note,p_price_source,current_date,10000,4096,
    '{"text":true,"json":false}'::jsonb,'candidate',p_price_status,p_provider_input_limit,p_provider_output_limit,p_actor);
  INSERT INTO public.facc_model_registry_audit(actor_id,action,provider,model_id,price_status)
    VALUES(p_actor,'register',p_provider,p_model,p_price_status);
END $$;
REVOKE ALL ON FUNCTION public.facc_register_model_candidate(uuid,text,text,numeric,numeric,text,text,text,integer,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.facc_register_model_candidate(uuid,text,text,numeric,numeric,text,text,text,integer,integer)
  TO service_role;

CREATE FUNCTION public.facc_approve_model_candidate(p_actor uuid,p_provider text,p_model text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_actor AND role='admin')
    THEN RAISE EXCEPTION 'Admin authorization required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.facc_ai_tests t WHERE t.provider=p_provider AND t.model_id=p_model
    AND t.kind='real' AND t.successful AND t.returned_count=t.requested_count
    AND t.adapter_revision='facc-adapters-20261101-a' AND t.prompt_revision='faq-prompt-20261101-a'
    AND t.created_at>now()-interval '24 hours')
    THEN RAISE EXCEPTION 'A current exact-count generation test is required'; END IF;
  UPDATE public.facc_model_catalog SET approval_status='approved',
    capabilities=capabilities||'{"json":true}'::jsonb
    WHERE provider=p_provider AND model_id=p_model AND approval_status='candidate';
  IF NOT FOUND THEN RAISE EXCEPTION 'Candidate not found or already approved'; END IF;
  INSERT INTO public.facc_model_registry_audit(actor_id,action,provider,model_id,price_status)
    SELECT p_actor,'approve',provider,model_id,price_status FROM public.facc_model_catalog
    WHERE provider=p_provider AND model_id=p_model;
END $$;
REVOKE ALL ON FUNCTION public.facc_approve_model_candidate(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.facc_approve_model_candidate(uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.facc_begin_ai_test(p_actor uuid,p_provider text,p_model text,p_kind text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_actor AND role='admin')
    THEN RAISE EXCEPTION 'Admin authorization required'; END IF;
  IF p_kind NOT IN ('real','chain','availability','simulated') OR
     NOT EXISTS(SELECT 1 FROM public.facc_model_catalog WHERE provider=p_provider AND model_id=p_model)
    THEN RAISE EXCEPTION 'Registered model required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text,117));
  IF (SELECT count(*) FROM public.facc_ai_tests WHERE actor_id=p_actor AND created_at>now()-interval '1 hour')>=10
    OR (p_kind IN ('real','chain') AND
      (SELECT count(*) FROM public.facc_ai_tests WHERE actor_id=p_actor AND kind IN ('real','chain')
       AND created_at>now()-interval '24 hours')>=4)
    THEN RAISE EXCEPTION 'Admin model-test budget reached; retry later'; END IF;
  INSERT INTO public.facc_ai_tests(actor_id,provider,model_id,kind,requested_count)
  VALUES(p_actor,p_provider,p_model,p_kind,2) RETURNING id INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.facc_begin_ai_test(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.facc_begin_ai_test(uuid,text,text,text) TO service_role;

CREATE FUNCTION public.facc_require_approved_config() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE layer jsonb;
BEGIN
  FOR layer IN SELECT value FROM jsonb_array_elements(NEW.layers) LOOP
    IF NOT EXISTS(SELECT 1 FROM public.facc_model_catalog WHERE provider=layer->>'provider'
      AND model_id=layer->>'model_id' AND approval_status='approved')
      THEN RAISE EXCEPTION 'Routing requires an approved model'; END IF;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.facc_require_approved_config() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER facc_approved_config BEFORE INSERT ON public.facc_ai_configs
  FOR EACH ROW EXECUTE FUNCTION public.facc_require_approved_config();

CREATE OR REPLACE FUNCTION public.facc_admin_health() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
SELECT jsonb_build_object(
  'openCheckouts',(SELECT count(*) FROM public.paddle_checkouts WHERE NOT closed),
  'completedAwaitingGrant',(SELECT count(*) FROM public.paddle_payments p WHERE p.kind='credit_pack' AND p.status='completed'
    AND NOT EXISTS(SELECT 1 FROM public.faq_credit_grants g WHERE g.transaction_id=p.transaction_id AND g.user_id=p.user_id)),
  'adjustmentReviews',(SELECT count(*) FROM public.faq_credit_adjustments WHERE resolution='review'),
  'oldReservations',(SELECT count(*) FROM public.faq_generation_requests WHERE status IN ('pending','completed')
    AND reserved_count>0 AND expires_at<now()),
  'staleAIRequests',(SELECT count(*) FROM public.facc_ai_requests WHERE status='started'
    AND started_at<now()-interval '10 minutes'),
  'processedLate24h',(SELECT count(*) FROM public.paddle_events WHERE processed_at>occurred_at+interval '15 minutes'
    AND processed_at>=now()-interval '24 hours'),
  'lastProcessedWebhook',(SELECT max(processed_at) FROM public.paddle_events),
  'lastMonitorRun',(SELECT max(started_at) FROM public.facc_monitor_runs),
  'lastMonitorStatus',(SELECT CASE WHEN status='running' AND lease_until<now() THEN 'failed' ELSE status END
    FROM public.facc_monitor_runs ORDER BY started_at DESC LIMIT 1),
  'lastMonitorSource',(SELECT invocation_source FROM public.facc_monitor_runs ORDER BY started_at DESC LIMIT 1),
  'lastScheduledMonitor',(SELECT max(started_at) FROM public.facc_monitor_runs WHERE invocation_source='scheduled'),
  'lastSuccessfulMonitor',(SELECT max(finished_at) FROM public.facc_monitor_runs WHERE status='success'),
  'monitorFailures24h',(SELECT count(*) FROM public.facc_monitor_runs WHERE started_at>now()-interval '24 hours'
    AND (status='failed' OR (status='running' AND lease_until<now()))),
  'monitorScheduleEnabled',(SELECT expected_enabled FROM public.facc_monitor_schedule WHERE singleton),
  'monitorEnabledAt',(SELECT enabled_at FROM public.facc_monitor_schedule WHERE singleton),
  'checkedAt',now()
);
$$;
REVOKE ALL ON FUNCTION public.facc_admin_health() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.facc_admin_health() TO service_role;

SELECT public.faqify_install_write_guards();
COMMIT;
