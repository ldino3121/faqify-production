-- Apply this additive migration to the existing, backed-up FAQify database.
-- Do not replay the older ad-hoc migrations over a production database.
BEGIN;
-- The exported production schema owns accounts through auth.users. user_id is
-- nullable (preserved for legacy rows), but every non-null owner must be unique.
-- Never deduplicate or silently choose one subscription during fulfillment.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_attribute a
      ON a.attrelid=i.indrelid AND a.attname='user_id'
    WHERE i.indrelid='public.user_subscriptions'::regclass
      AND i.indisunique AND i.indisvalid AND i.indimmediate AND i.indpred IS NULL
      AND i.indexprs IS NULL AND i.indnkeyatts=1 AND i.indkey[0]=a.attnum
  ) THEN RAISE EXCEPTION 'A unique subscription owner key is required; review existing data without merging records'; END IF;
  IF (SELECT atttypid FROM pg_attribute WHERE attrelid='public.user_subscriptions'::regclass AND attname='status') <> 'text'::regtype
  THEN RAISE EXCEPTION 'Unexpected subscription status type; inspect schema before migrating'; END IF;
END $$;
ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS plan_id public.plan_tier DEFAULT 'Free',
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS paddle_subscription_id text,
  ADD COLUMN IF NOT EXISTS paddle_customer_id text,
  ADD COLUMN IF NOT EXISTS paddle_environment text,
  ADD COLUMN IF NOT EXISTS paddle_state_at timestamptz,
  ADD COLUMN IF NOT EXISTS paddle_last_payment_at timestamptz,
  ADD COLUMN IF NOT EXISTS paddle_last_transaction_id text;
-- Exported production has no subscription_source/payment_type checks. Preserve
-- other constraints instead of removing checks by a substring match.
-- Production status is text with this CHECK, not an enum. Retain all legacy
-- states and widen only the known constraint; do not drop unrelated checks.
ALTER TABLE public.user_subscriptions DROP CONSTRAINT IF EXISTS user_subscriptions_status_check;
ALTER TABLE public.user_subscriptions ADD CONSTRAINT user_subscriptions_status_check
  CHECK (status IN ('active','inactive','cancelled','expired','canceled','paused','past_due','pending','refunded'));
CREATE UNIQUE INDEX paddle_subscription_owner
  ON public.user_subscriptions(paddle_environment,paddle_subscription_id)
  WHERE paddle_subscription_id IS NOT NULL;

CREATE TABLE public.paddle_checkouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  environment text NOT NULL CHECK(environment IN ('sandbox','live')),
  tier text NOT NULL CHECK(tier IN ('Pro','Business')),
  kind text NOT NULL CHECK(kind IN ('recurring','one_time')),
  price_id text NOT NULL,
  transaction_id text UNIQUE,
  closed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '30 minutes'
);
CREATE INDEX paddle_checkout_user ON public.paddle_checkouts(user_id,created_at DESC);
CREATE TABLE public.paddle_customers (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  environment text NOT NULL,
  customer_id text NOT NULL,
  PRIMARY KEY(user_id,environment), UNIQUE(customer_id,environment)
);
CREATE TABLE public.paddle_events (
  event_id text PRIMARY KEY, environment text NOT NULL, occurred_at timestamptz NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.paddle_payments (
  transaction_id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  environment text NOT NULL,
  subscription_id text,
  customer_id text NOT NULL,
  tier text NOT NULL, kind text NOT NULL, amount numeric NOT NULL, currency text NOT NULL,
  paid_at timestamptz NOT NULL, period_end timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'completed'
);
CREATE TABLE public.faq_generation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_count integer NOT NULL CHECK(requested_count BETWEEN 1 AND 10),
  faqs jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','saved')),
  collection_id uuid REFERENCES public.faq_collections(id) ON DELETE SET NULL,
  source_url text, source_content text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '1 hour'
);
CREATE INDEX faq_requests_rate ON public.faq_generation_requests(user_id,created_at DESC);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['paddle_checkouts','paddle_customers','paddle_events','paddle_payments','faq_generation_requests'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  END LOOP;
END $$;

-- Money, entitlements, and usage are backend-owned. RLS cannot protect columns
-- if a broad "service" policy accidentally applies to authenticated callers.
-- Legacy ALL grants include TRUNCATE, which bypasses RLS. Regrant only the
-- intended operations, including no inherited PUBLIC table write privileges.
REVOKE ALL ON public.user_subscriptions, public.payment_transactions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.faq_collections, public.faqs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.faq_collections, public.faqs TO anon;
GRANT SELECT ON public.user_subscriptions, public.payment_transactions TO authenticated;
DO $$ DECLARE t text; p record; BEGIN
  FOREACH t IN ARRAY ARRAY['user_subscriptions','payment_transactions'] LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,t);
    END LOOP;
    EXECUTE format('CREATE POLICY account_read ON public.%I FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.is_admin())',t);
  END LOOP;
END $$;
GRANT SELECT ON public.paddle_payments TO authenticated;
CREATE POLICY paddle_payments_read ON public.paddle_payments FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.is_admin());

GRANT SELECT,UPDATE,DELETE ON public.faq_collections, public.faqs TO authenticated;
GRANT ALL ON public.user_subscriptions,public.payment_transactions,public.faq_collections,public.faqs TO service_role;
DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN
      ('change_subscription_plan','cancel_subscription','reactivate_subscription','reset_monthly_usage',
       'check_and_reset_user_usage','check_and_handle_expired_subscriptions','increment_faq_usage','increment_faq_usage_by_count')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.can_generate_faqs(user_uuid uuid,faq_count integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.user_subscriptions%ROWTYPE; remaining integer;
BEGIN
  IF user_uuid IS NULL OR (auth.role() IS DISTINCT FROM 'service_role' AND auth.uid() IS DISTINCT FROM user_uuid) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF faq_count IS NULL OR faq_count<1 OR faq_count>10 THEN RETURN jsonb_build_object('can_generate',false,'reason','Invalid FAQ count'); END IF;
  SELECT * INTO s FROM public.user_subscriptions WHERE user_id=user_uuid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('can_generate',false,'reason','No subscription'); END IF;
  IF coalesce(s.plan_tier,s.plan_id::text)<>'Free' AND (s.plan_expires_at IS NULL OR s.plan_expires_at<=now() OR s.status NOT IN ('active','cancelled','canceled')) THEN
    RETURN jsonb_build_object('can_generate',false,'reason','Your paid plan is expired or inactive.','is_expired',true);
  END IF;
  -- Paddle recurring quotas reset only on payment; legacy/Free monthly windows reset when due.
  IF s.paddle_subscription_id IS NULL AND s.payment_gateway IS DISTINCT FROM 'paddle'
      AND coalesce(s.last_reset_date,s.plan_activated_at,s.created_at)<=now()-interval '1 month' THEN
    UPDATE public.user_subscriptions SET faq_usage_current=0,last_reset_date=now(),updated_at=now() WHERE id=s.id;
    s.faq_usage_current:=0;
  END IF;
  IF coalesce(s.plan_tier,s.plan_id::text)='Free' AND EXISTS(SELECT 1 FROM public.faq_collections WHERE user_id=user_uuid) THEN
    RETURN jsonb_build_object('can_generate',false,'reason','Free plan allows one collection. Delete it or upgrade to create another.');
  END IF;
  remaining:=greatest(0,s.faq_usage_limit-s.faq_usage_current);
  RETURN jsonb_build_object('can_generate',faq_count<=remaining,'reason',CASE WHEN faq_count<=remaining THEN 'OK' ELSE 'FAQ quota exceeded' END,
    'remaining_faqs',remaining,'current_usage',s.faq_usage_current,'usage_limit',s.faq_usage_limit,'plan_tier',coalesce(s.plan_tier,s.plan_id::text),'is_expired',false);
END $$;
REVOKE ALL ON FUNCTION public.can_generate_faqs(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_generate_faqs(uuid,integer) TO authenticated,service_role;

CREATE FUNCTION public.begin_faq_generation(p_user uuid,p_count integer,p_url text,p_content text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE eligibility jsonb; request_id uuid;
BEGIN
  -- Serialize attempt admission per account; simultaneous requests cannot exceed the rate cap.
  PERFORM 1 FROM public.user_subscriptions WHERE user_id=p_user FOR UPDATE;
  eligibility:=public.can_generate_faqs(p_user,p_count);
  IF NOT (eligibility->>'can_generate')::boolean THEN RAISE EXCEPTION '%',eligibility->>'reason'; END IF;
  IF (SELECT count(*) FROM public.faq_generation_requests WHERE user_id=p_user AND created_at>now()-interval '1 hour')>=20 THEN
    RAISE EXCEPTION 'Generation rate limit reached. Please retry later.';
  END IF;
  DELETE FROM public.faq_generation_requests WHERE user_id=p_user AND expires_at<now()-interval '7 days';
  INSERT INTO public.faq_generation_requests(user_id,requested_count,source_url,source_content)
    VALUES(p_user,p_count,left(p_url,2048),left(p_content,10000)) RETURNING id INTO request_id;
  RETURN request_id;
END $$;
REVOKE ALL ON FUNCTION public.begin_faq_generation(uuid,integer,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_faq_generation(uuid,integer,text,text) TO service_role;

CREATE FUNCTION public.save_generated_faqs(p_generation_id uuid,p_title text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE g public.faq_generation_requests%ROWTYPE; s public.user_subscriptions%ROWTYPE; c uuid; n integer; eligibility jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT * INTO g FROM public.faq_generation_requests WHERE id=p_generation_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Generation not found'; END IF;
  IF g.status='saved' AND g.collection_id IS NOT NULL THEN RETURN jsonb_build_object('collection_id',g.collection_id,'already_saved',true); END IF;
  IF g.status<>'completed' OR g.expires_at<now() THEN RAISE EXCEPTION 'Generation expired or incomplete; please generate again'; END IF;
  IF length(trim(p_title)) NOT BETWEEN 3 AND 100 THEN RAISE EXCEPTION 'Title must contain 3–100 characters'; END IF;
  n:=jsonb_array_length(g.faqs);
  IF n IS NULL OR n NOT BETWEEN 1 AND 10 OR n<>g.requested_count THEN RAISE EXCEPTION 'Invalid generated FAQ count'; END IF;
  eligibility:=public.can_generate_faqs(auth.uid(),n);
  IF NOT (eligibility->>'can_generate')::boolean THEN RAISE EXCEPTION '%',eligibility->>'reason'; END IF;
  SELECT * INTO s FROM public.user_subscriptions WHERE user_id=auth.uid() FOR UPDATE;
  IF coalesce(s.plan_tier,s.plan_id::text)='Free' AND EXISTS(SELECT 1 FROM public.faq_collections WHERE user_id=auth.uid()) THEN
    RAISE EXCEPTION 'Free plan allows one FAQ collection. Delete it or upgrade before creating another.';
  END IF;
  INSERT INTO public.faq_collections(user_id,title,source_url,source_content,status)
    VALUES(auth.uid(),trim(p_title),g.source_url,g.source_content,'published') RETURNING id INTO c;
  INSERT INTO public.faqs(collection_id,question,answer,order_index,is_published)
    SELECT c,item->>'question',item->>'answer',ordinality-1,true FROM jsonb_array_elements(g.faqs) WITH ORDINALITY AS f(item,ordinality);
  UPDATE public.user_subscriptions SET faq_usage_current=faq_usage_current+n,updated_at=now() WHERE id=s.id;
  UPDATE public.faq_generation_requests SET status='saved',collection_id=c WHERE id=g.id;
  -- action_type is required in production; action remains for legacy reports.
  -- collection_saved is the existing application analytics event, not a new type.
  INSERT INTO public.usage_analytics(user_id,action_type,action,metadata)
    VALUES(auth.uid(),'collection_saved','collection_saved',jsonb_build_object('faq_count',n,'collection_id',c));
  RETURN jsonb_build_object('collection_id',c);
END $$;
REVOKE ALL ON FUNCTION public.save_generated_faqs(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_generated_faqs(uuid,text) TO authenticated;

-- Operator-owned acceptance cohort. Empty by default; no production accounts
-- are enrolled by a migration. Kept outside the application write barrier so
-- postgres can review enrollment while frozen; neither clients nor service_role
-- can read or change membership directly.
CREATE TABLE public.faqify_sandbox_cohort (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true
);
ALTER TABLE public.faqify_sandbox_cohort ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.faqify_sandbox_cohort FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.faqify_require_sandbox_member(p_user uuid,p_environment text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF p_environment IS DISTINCT FROM 'sandbox' THEN RAISE EXCEPTION 'Only Paddle sandbox is enabled'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.faqify_sandbox_cohort WHERE user_id=p_user AND enabled)
  THEN RAISE EXCEPTION 'Sandbox billing is restricted to approved test accounts'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.faqify_require_sandbox_member(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.faqify_require_sandbox_member(uuid,text) TO service_role;

CREATE FUNCTION public.begin_paddle_checkout(p_user uuid,p_tier text,p_kind text,p_price text,p_environment text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.user_subscriptions%ROWTYPE; c public.paddle_checkouts%ROWTYPE;
BEGIN
  PERFORM public.faqify_require_sandbox_member(p_user,p_environment);
  SELECT * INTO s FROM public.user_subscriptions WHERE user_id=p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subscription record missing; contact support'; END IF;
  IF (s.razorpay_subscription_id IS NOT NULL OR s.paddle_subscription_id IS NOT NULL)
      AND (s.plan_expires_at>now() OR s.status IN ('active','past_due','paused','pending')) THEN
    RAISE EXCEPTION 'Manage your existing recurring subscription before purchasing another plan.';
  END IF;
  UPDATE public.paddle_checkouts SET closed=true WHERE user_id=p_user AND transaction_id IS NULL AND expires_at<=now();
  SELECT * INTO c FROM public.paddle_checkouts WHERE user_id=p_user AND environment=p_environment AND NOT closed
    ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    IF c.tier<>p_tier OR c.kind<>p_kind THEN RAISE EXCEPTION 'An existing checkout is still open. Complete it or close the pending checkout before changing plans.'; END IF;
    RETURN jsonb_build_object('id',c.id,'transaction_id',c.transaction_id,'is_new',false);
  END IF;
  IF (SELECT count(*) FROM public.paddle_checkouts WHERE user_id=p_user AND created_at>now()-interval '1 hour')>=5 THEN
    RAISE EXCEPTION 'Too many checkout attempts. Please retry later.';
  END IF;
  INSERT INTO public.paddle_checkouts(user_id,environment,tier,kind,price_id) VALUES(p_user,p_environment,p_tier,p_kind,p_price) RETURNING * INTO c;
  RETURN jsonb_build_object('id',c.id,'is_new',true);
END $$;
REVOKE ALL ON FUNCTION public.begin_paddle_checkout(uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_paddle_checkout(uuid,text,text,text,text) TO service_role;

CREATE FUNCTION public.apply_paddle_event(p_event_id text,p_occurred_at timestamptz,p_environment text,p_payload jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.user_subscriptions%ROWTYPE; c public.paddle_checkouts%ROWTYPE; pay public.paddle_payments%ROWTYPE;
  uid uuid; txn text:=p_payload->>'transaction_id'; subid text:=p_payload->>'subscription_id';
  customer text:=p_payload->>'customer_id'; op text:=p_payload->>'operation'; ends timestamptz; n integer;
BEGIN
  IF p_environment IS DISTINCT FROM 'sandbox' THEN RAISE EXCEPTION 'Only Paddle sandbox is enabled'; END IF;
  INSERT INTO public.paddle_events(event_id,environment,occurred_at) VALUES(p_event_id,p_environment,p_occurred_at) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN 'duplicate'; END IF;
  IF op='payment' THEN
    -- Match an API-created checkout, or a renewal of an already-bound subscription.
    SELECT * INTO c FROM public.paddle_checkouts WHERE transaction_id=txn AND environment=p_environment;
    IF FOUND THEN
      IF c.price_id<>p_payload->>'price_id' OR c.tier<>p_payload->>'tier' OR c.kind<>p_payload->>'kind' THEN RAISE EXCEPTION 'Checkout price mismatch'; END IF;
      uid:=c.user_id;
    ELSE
      SELECT user_id INTO uid FROM public.user_subscriptions WHERE paddle_subscription_id=subid AND paddle_environment=p_environment;
      IF uid IS NULL THEN RAISE EXCEPTION 'Unbound payment; awaiting checkout binding'; END IF;
    END IF;
    PERFORM public.faqify_require_sandbox_member(uid,p_environment);
    SELECT * INTO s FROM public.user_subscriptions WHERE user_id=uid FOR UPDATE;
    IF s.paddle_customer_id IS NOT NULL AND s.paddle_environment=p_environment AND s.paddle_customer_id<>customer THEN RAISE EXCEPTION 'Customer mismatch'; END IF;
    ends:=(p_payload->>'period_end')::timestamptz;
    INSERT INTO public.paddle_payments(transaction_id,user_id,environment,subscription_id,customer_id,tier,kind,amount,currency,paid_at,period_end)
      VALUES(txn,uid,p_environment,subid,customer,p_payload->>'tier',p_payload->>'kind',(p_payload->>'amount')::numeric,p_payload->>'currency',p_occurred_at,ends)
      ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN RETURN 'payment_already_applied'; END IF;
    INSERT INTO public.paddle_customers(user_id,environment,customer_id) VALUES(uid,p_environment,customer)
      ON CONFLICT(user_id,environment) DO UPDATE SET customer_id=excluded.customer_id;
    -- A delayed older payment is recorded but cannot overwrite newer access.
    IF s.paddle_last_payment_at IS NOT NULL AND p_occurred_at<s.paddle_last_payment_at THEN RETURN 'older_payment_recorded'; END IF;
    IF s.paddle_subscription_id IS NOT NULL AND subid IS DISTINCT FROM s.paddle_subscription_id AND c.id IS NULL THEN RETURN 'superseded_subscription'; END IF;
    n:=CASE p_payload->>'tier' WHEN 'Pro' THEN 100 WHEN 'Business' THEN 500 ELSE 0 END;
    IF n=0 THEN RAISE EXCEPTION 'Invalid tier'; END IF;
    UPDATE public.user_subscriptions SET
      plan_tier=p_payload->>'tier',plan_id=(p_payload->>'tier')::public.plan_tier,
      status=CASE WHEN paddle_state_at>p_occurred_at AND status IN ('cancelled','canceled','paused','past_due') THEN status ELSE 'active' END,
      faq_usage_limit=n,faq_usage_current=0,last_reset_date=now(),
      plan_activated_at=coalesce((p_payload->>'period_start')::timestamptz,p_occurred_at),
      plan_expires_at=CASE WHEN paddle_state_at>p_occurred_at AND status IN ('cancelled','canceled','paused') THEN least(plan_expires_at,ends) ELSE ends END,
      current_period_end=ends,plan_changed_at=now(),payment_gateway='paddle',subscription_source='paddle',
      payment_type=CASE WHEN subid IS NULL THEN 'one_time' ELSE 'recurring' END,
      billing_cycle='monthly',auto_renewal=subid IS NOT NULL AND NOT (coalesce(s.paddle_state_at>p_occurred_at,false) AND NOT s.auto_renewal),
      next_billing_date=CASE WHEN subid IS NOT NULL AND NOT (coalesce(s.paddle_state_at>p_occurred_at,false) AND NOT s.auto_renewal) THEN ends ELSE NULL END,
      razorpay_subscription_id=NULL,paddle_subscription_id=subid,paddle_customer_id=customer,paddle_environment=p_environment,
      paddle_last_payment_at=p_occurred_at,paddle_last_transaction_id=txn,
      cancelled_at=CASE WHEN paddle_state_at>p_occurred_at THEN cancelled_at ELSE NULL END,
      cancellation_reason=CASE WHEN paddle_state_at>p_occurred_at THEN cancellation_reason ELSE NULL END,
      updated_at=now() WHERE id=s.id;
    UPDATE public.paddle_checkouts SET closed=true,expires_at=now() WHERE id=c.id;
    RETURN 'payment_applied';
  ELSIF op='subscription' THEN
    SELECT * INTO s FROM public.user_subscriptions WHERE paddle_subscription_id=subid AND paddle_environment=p_environment FOR UPDATE;
    -- Out-of-order activation: retry until transaction.completed establishes ownership.
    IF NOT FOUND THEN
      IF EXISTS(SELECT 1 FROM public.paddle_payments WHERE subscription_id=subid AND environment=p_environment) THEN RETURN 'superseded_subscription_event'; END IF;
      RAISE EXCEPTION 'Subscription not bound yet';
    END IF;
    PERFORM public.faqify_require_sandbox_member(s.user_id,p_environment);
    IF customer IS DISTINCT FROM s.paddle_customer_id THEN RAISE EXCEPTION 'Customer mismatch'; END IF;
    IF s.paddle_state_at IS NOT NULL AND p_occurred_at<=s.paddle_state_at THEN RETURN 'stale_subscription_event'; END IF;
    UPDATE public.user_subscriptions SET
      status=CASE p_payload->>'status' WHEN 'canceled' THEN 'cancelled' WHEN 'paused' THEN 'paused' WHEN 'past_due' THEN 'past_due'
        WHEN 'active' THEN CASE WHEN s.status='refunded' THEN 'refunded' ELSE 'active' END ELSE status END,
      auto_renewal=(p_payload->>'status'='active' AND (p_payload->>'scheduled_action') IS DISTINCT FROM 'cancel'),
      cancelled_at=CASE WHEN p_payload->>'status'='canceled' OR p_payload->>'scheduled_action'='cancel' THEN p_occurred_at ELSE NULL END,
      cancellation_reason=CASE WHEN p_payload->>'status'='canceled' OR p_payload->>'scheduled_action'='cancel' THEN 'Managed through Paddle' ELSE NULL END,
      -- An effective cancellation/pause ends access; a scheduled cancellation keeps paid access.
      plan_expires_at=CASE WHEN p_payload->>'status' IN ('canceled','paused') THEN least(plan_expires_at,p_occurred_at)
        WHEN p_payload->>'status'='active' AND s.status='paused' THEN s.current_period_end ELSE plan_expires_at END,
      next_billing_date=CASE WHEN p_payload->>'status' IN ('canceled','paused') OR p_payload->>'scheduled_action'='cancel' THEN NULL ELSE next_billing_date END,
      paddle_state_at=p_occurred_at,updated_at=now() WHERE id=s.id;
    RETURN 'subscription_updated';
  ELSIF op='adjustment' THEN
    IF p_payload->>'adjustment_status'<>'approved' OR p_payload->>'action' NOT IN ('refund','chargeback') OR p_payload->>'adjustment_type'<>'full' THEN RETURN 'adjustment_no_access_change'; END IF;
    SELECT * INTO pay FROM public.paddle_payments WHERE transaction_id=txn AND environment=p_environment;
    IF NOT FOUND THEN RAISE EXCEPTION 'Adjustment payment not recorded yet'; END IF;
    PERFORM public.faqify_require_sandbox_member(pay.user_id,p_environment);
    SELECT * INTO s FROM public.user_subscriptions WHERE user_id=pay.user_id FOR UPDATE;
    UPDATE public.paddle_payments SET status=p_payload->>'action' WHERE transaction_id=txn;
    IF s.paddle_last_transaction_id=txn THEN
      UPDATE public.user_subscriptions SET status='refunded',plan_expires_at=least(plan_expires_at,now()),updated_at=now() WHERE id=s.id;
    END IF;
    RETURN 'adjustment_applied';
  END IF;
  RETURN 'ignored';
END $$;
REVOKE ALL ON FUNCTION public.apply_paddle_event(text,timestamptz,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_paddle_event(text,timestamptz,text,jsonb) TO service_role;

-- Daily legacy reset must not grant a new Paddle billing period before payment.
CREATE OR REPLACE FUNCTION public.reset_monthly_usage()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.user_subscriptions SET faq_usage_current=0,last_reset_date=now(),updated_at=now()
    WHERE paddle_subscription_id IS NULL AND payment_gateway IS DISTINCT FROM 'paddle'
      AND coalesce(last_reset_date,plan_activated_at,created_at)<=now()-interval '1 month';
  GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.reset_monthly_usage() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reset_monthly_usage() TO service_role;
-- The separately installed rollout control must be present before cutover.
-- Include all new ledgers/tickets in the same write barrier before committing DDL.
SELECT public.faqify_install_write_guards();
COMMIT;
