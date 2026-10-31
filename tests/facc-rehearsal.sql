-- Run only against an isolated restored database after the FACC migration.
-- All synthetic rows and changes are rolled back.
BEGIN;
DO $test$
DECLARE
  probe uuid := gen_random_uuid();
  customer uuid := gen_random_uuid();
  run_one uuid;
  run_two uuid;
  before_circuit integer;
  after_circuit integer;
BEGIN
  IF has_table_privilege('authenticated','public.facc_ai_configs','SELECT')
     OR has_function_privilege('authenticated','public.facc_apply_ai_config(uuid,bigint,jsonb,text)','EXECUTE')
     OR has_function_privilege('authenticated','public.facc_allow_model_attempt(text,text)','EXECUTE')
     OR has_table_privilege('authenticated','public.user_roles','UPDATE') THEN
    RAISE EXCEPTION 'Authenticated grants expose admin state';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users u JOIN public.user_roles r ON r.user_id=u.id
    WHERE lower(u.email)='carbonface99@gmail.com' AND r.role='admin') THEN
    RAISE EXCEPTION 'Existing production admin identity is missing';
  END IF;
  SELECT count(*) INTO before_circuit FROM public.facc_ai_circuits;
  INSERT INTO public.facc_ai_requests(id,purpose,input_type,requested_count,status)
    VALUES(probe,'health_probe','probe',1,'started');
  PERFORM public.facc_record_ai_attempt(probe,1::smallint,'gemini','gemini-2.5-flash',null,
    'transient_overload',100,503::smallint,null,null,null,false);
  SELECT count(*) INTO after_circuit FROM public.facc_ai_circuits;
  IF before_circuit<>after_circuit THEN RAISE EXCEPTION 'Probe changed customer circuit'; END IF;
  INSERT INTO public.facc_ai_requests(id,purpose,input_type,requested_count,status)
    VALUES(customer,'customer','text',1,'started');
  PERFORM public.facc_record_ai_attempt(customer,1::smallint,'gemini','gemini-2.5-flash',null,
    'transient_overload',100,503::smallint,null,null,null,false);
  IF NOT EXISTS(SELECT 1 FROM public.facc_ai_circuits WHERE provider='gemini'
    AND model_id='gemini-2.5-flash' AND failure_streak=1) THEN
    RAISE EXCEPTION 'Customer failure did not update circuit';
  END IF;
  PERFORM public.facc_record_ai_attempt(customer,1::smallint,'gemini','gemini-2.5-flash',null,
    'transient_overload',100,503::smallint,null,null,null,false);
  IF (SELECT failure_streak FROM public.facc_ai_circuits WHERE provider='gemini'
    AND model_id='gemini-2.5-flash')<>1 THEN RAISE EXCEPTION 'Duplicate attempt changed circuit'; END IF;
  UPDATE public.facc_ai_circuits SET open_until=now()-interval '1 second',recovery_lease_until=null
    WHERE provider='gemini' AND model_id='gemini-2.5-flash';
  IF NOT public.facc_allow_model_attempt('gemini','gemini-2.5-flash')
     OR public.facc_allow_model_attempt('gemini','gemini-2.5-flash') THEN
    RAISE EXCEPTION 'Recovery probe lease is not exclusive';
  END IF;
  PERFORM public.facc_record_ai_attempt(customer,2::smallint,'gemini','gemini-2.5-flash',null,
    'success',100,200::smallint,null,null,null,false);
  IF NOT public.facc_allow_model_attempt('gemini','gemini-2.5-flash') THEN
    RAISE EXCEPTION 'Successful customer probe did not reopen model';
  END IF;
  run_one:=public.facc_begin_monitor_run();
  run_two:=public.facc_begin_monitor_run();
  IF run_one IS NULL OR run_two IS NOT NULL THEN RAISE EXCEPTION 'Monitor lease not exclusive'; END IF;
  PERFORM public.facc_finish_monitor_run(run_one,2,0);
  IF (SELECT status FROM public.facc_monitor_runs WHERE id=run_one)<>'success' THEN
    RAISE EXCEPTION 'Monitor finish failed';
  END IF;
  IF public.facc_begin_monitor_run() IS NULL THEN RAISE EXCEPTION 'Monitor did not recover'; END IF;
END $test$;
ROLLBACK;
