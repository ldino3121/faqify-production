-- Three active layers need three fresh real tests and an exact-chain test.
-- Keep the per-hour limit and permit one retry within the rolling day.
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
       AND created_at>now()-interval '24 hours')>=6)
    THEN RAISE EXCEPTION 'Admin model-test budget reached; retry later'; END IF;
  INSERT INTO public.facc_ai_tests(actor_id,provider,model_id,kind,requested_count)
  VALUES(p_actor,p_provider,p_model,p_kind,2) RETURNING id INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.facc_begin_ai_test(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.facc_begin_ai_test(uuid,text,text,text) TO service_role;
