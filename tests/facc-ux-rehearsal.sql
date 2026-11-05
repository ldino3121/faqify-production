-- Run against an isolated actual-schema restore after both FACC migrations.
-- Synthetic catalog/test rows are rolled back; no customer rows are selected.
BEGIN;
-- The protected dump was captured frozen. Open only this local transaction.
UPDATE public.faqify_rollout_control SET mode='open' WHERE singleton;
DO $test$
DECLARE
  admin_id uuid;
  candidate text := 'gemini-facc-synthetic-ux-test';
  run_id uuid;
  first_count bigint;
  expected jsonb;
BEGIN
  IF has_table_privilege('authenticated','public.facc_model_registry_audit','SELECT')
    OR has_table_privilege('authenticated','public.facc_monitor_schedule','SELECT')
    OR has_function_privilege('authenticated','public.facc_register_model_candidate(uuid,text,text,numeric,numeric,text,text,text,integer,integer)','EXECUTE')
    OR has_function_privilege('authenticated','public.facc_approve_model_candidate(uuid,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.facc_begin_monitor_run(text)','EXECUTE')
  THEN RAISE EXCEPTION 'Admin UX grants expose privileged operation'; END IF;

  SELECT user_id INTO admin_id FROM public.user_roles WHERE role='admin' ORDER BY user_id LIMIT 1;
  IF admin_id IS NULL THEN RAISE EXCEPTION 'Admin role missing in restore'; END IF;
  SELECT count(*) INTO first_count FROM public.facc_model_catalog;
  PERFORM public.facc_register_model_candidate(admin_id,'gemini',candidate,NULL,NULL,'unknown',
    'Unknown price; synthetic rehearsal','Synthetic local test',8192,4096);
  IF (SELECT count(*) FROM public.facc_model_catalog) <> first_count+1
    OR NOT EXISTS(SELECT 1 FROM public.facc_model_catalog WHERE model_id=candidate AND approval_status='candidate')
  THEN RAISE EXCEPTION 'Candidate registration failed'; END IF;

  BEGIN
    PERFORM public.facc_approve_model_candidate(admin_id,'gemini',candidate);
    RAISE EXCEPTION 'Untested candidate was approved';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='Untested candidate was approved' THEN RAISE; END IF;
  END;

  INSERT INTO public.facc_ai_tests(actor_id,provider,model_id,kind,requested_count,
    returned_count,successful,adapter_revision,prompt_revision)
  VALUES(admin_id,'gemini',candidate,'real',2,2,true,
    'facc-adapters-20261101-a','faq-prompt-20261101-a');
  PERFORM public.facc_approve_model_candidate(admin_id,'gemini',candidate);
  IF NOT EXISTS(SELECT 1 FROM public.facc_model_catalog WHERE model_id=candidate AND approval_status='approved')
    OR (SELECT count(*) FROM public.facc_model_registry_audit WHERE model_id=candidate)<>2
  THEN RAISE EXCEPTION 'Approval/audit failed'; END IF;

  expected:=public.facc_admin_health();
  IF expected->>'monitorScheduleEnabled'<>'false' OR expected->>'lastMonitorRun' IS NOT NULL
  THEN RAISE EXCEPTION 'Never-run monitor was reported as active'; END IF;
  run_id:=public.facc_begin_monitor_run('manual');
  IF run_id IS NULL OR (SELECT invocation_source FROM public.facc_monitor_runs WHERE id=run_id)<>'manual'
  THEN RAISE EXCEPTION 'Monitor invocation source was not recorded'; END IF;
  IF public.facc_begin_monitor_run('scheduled') IS NOT NULL
  THEN RAISE EXCEPTION 'Overlapping monitor run escaped shared lease'; END IF;
  expected:=public.facc_admin_summary('2026-10-24T00:00:00Z','2026-11-05T00:00:00Z',true,true,true);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(expected->'payment_totals') x
      WHERE x->>'basis'='catalog_price')
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(expected->'payment_totals') x
      WHERE x->>'basis'='paddle_total')
  THEN RAISE EXCEPTION 'Mixed payment amount sources were not separated'; END IF;
END $test$;
ROLLBACK;
