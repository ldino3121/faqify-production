-- PREPARATION ONLY: install on the original schema BEFORE wrapping deployed functions.
-- Run as postgres, never from a browser. No application rows are changed.
BEGIN;
CREATE TABLE IF NOT EXISTS public.faqify_rollout_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  mode text NOT NULL DEFAULT 'open' CHECK(mode IN ('open','drain','frozen')),
  minimum_client_revision integer NOT NULL DEFAULT 0 CHECK(minimum_client_revision >= 0)
);
INSERT INTO public.faqify_rollout_control(singleton) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.faqify_rollout_leases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.faqify_rollout_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faqify_rollout_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.faqify_rollout_control,public.faqify_rollout_leases FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.faqify_rollout_status() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT jsonb_build_object('mode',mode,'minimum_client_revision',minimum_client_revision)
  FROM public.faqify_rollout_control WHERE singleton;
$$;
REVOKE ALL ON FUNCTION public.faqify_rollout_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.faqify_rollout_status() TO anon,authenticated,service_role;

-- Operator-only transition. Shared transaction locks protect entire writes/admissions.
-- Leases deliberately NEVER expire automatically: a crashed worker needs reconciliation.
CREATE OR REPLACE FUNCTION public.faqify_set_rollout(p_mode text,p_minimum_client_revision integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Rollout transitions require READ COMMITTED';
  END IF;
  PERFORM pg_advisory_xact_lock(1262899537,1);
  IF p_mode='frozen' AND EXISTS(SELECT 1 FROM public.faqify_rollout_leases) THEN
    RAISE EXCEPTION 'Drain incomplete: active function leases remain';
  END IF;
  IF p_mode='frozen' AND (SELECT mode FROM public.faqify_rollout_control WHERE singleton)='open' THEN
    RAISE EXCEPTION 'Enter drain before frozen';
  END IF;
  UPDATE public.faqify_rollout_control SET mode=p_mode,minimum_client_revision=p_minimum_client_revision WHERE singleton;
END $$;
REVOKE ALL ON FUNCTION public.faqify_set_rollout(text,integer) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.faqify_enter_operation(p_function text,p_revision integer,p_client boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c public.faqify_rollout_control; result uuid;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(1262899537,1);
  SELECT * INTO STRICT c FROM public.faqify_rollout_control WHERE singleton FOR SHARE;
  IF c.mode <> 'open' THEN
    RAISE SQLSTATE 'PT503' USING MESSAGE='Maintenance: keep this tab open and export unsaved FAQs. Retry later.';
  END IF;
  IF p_client AND (p_revision IS NULL OR p_revision<c.minimum_client_revision) THEN
    RAISE SQLSTATE 'PT426' USING MESSAGE='Refresh required: export unsaved FAQs before reloading.';
  END IF;
  INSERT INTO public.faqify_rollout_leases(function_name) VALUES(p_function) RETURNING id INTO result;
  RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.faqify_leave_operation(p_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  DELETE FROM public.faqify_rollout_leases WHERE id=p_id;
$$;
REVOKE ALL ON FUNCTION public.faqify_enter_operation(text,integer,boolean),public.faqify_leave_operation(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.faqify_enter_operation(text,integer,boolean),public.faqify_leave_operation(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.faqify_guard_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c public.faqify_rollout_control; revision text;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(1262899537,1);
  SELECT * INTO STRICT c FROM public.faqify_rollout_control WHERE singleton FOR SHARE;
  IF c.mode='frozen' THEN
    RAISE SQLSTATE 'PT503' USING MESSAGE='Maintenance: keep this tab open and export unsaved FAQs. Retry later.';
  END IF;
  IF coalesce(auth.role(),'') IN ('anon','authenticated') AND c.minimum_client_revision>0 THEN
    revision := coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-faqify-client','');
    IF revision !~ '^[0-9]{1,8}$' THEN revision := '0'; END IF;
    IF revision::integer<c.minimum_client_revision THEN
      RAISE SQLSTATE 'PT426' USING MESSAGE='Refresh required: export unsaved FAQs before reloading.';
    END IF;
  END IF;
  RETURN NULL; -- statement trigger, not a row filter
END $$;
REVOKE ALL ON FUNCTION public.faqify_guard_write() FROM PUBLIC,anon,authenticated,service_role;

-- Re-run after adding tables. Skip extension-owned tables and the control plane.
CREATE OR REPLACE FUNCTION public.faqify_install_write_guards() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.oid,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')
      AND c.relname NOT IN ('faqify_rollout_control','faqify_rollout_leases','faqify_sandbox_cohort')
      AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS faqify_rollout_write_guard ON public.%I',t.relname);
    EXECUTE format('CREATE TRIGGER faqify_rollout_write_guard BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.faqify_guard_write()',t.relname);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.faqify_install_write_guards() FROM PUBLIC,anon,authenticated,service_role;
SELECT public.faqify_install_write_guards();
COMMIT;
