-- Live Paddle credit packs. Preserve sandbox events, grants, and historical subscriptions.
-- Apply only during a verified frozen rollout, with the compatible functions staged.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.faqify_rollout_control WHERE mode='frozen') THEN
    RAISE EXCEPTION 'Freeze FAQify before enabling live credit pack schema';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261104010000') THEN
    RAISE EXCEPTION 'PR15 migration history is required';
  END IF;
END $$;

ALTER TABLE public.faq_credit_prices DROP CONSTRAINT faq_credit_prices_environment_check;
ALTER TABLE public.faq_credit_prices ADD CONSTRAINT faq_credit_prices_environment_check
  CHECK(environment IN ('sandbox','live'));
ALTER TABLE public.faq_credit_prices DROP CONSTRAINT faq_credit_prices_pack_key;
ALTER TABLE public.faq_credit_prices ADD CONSTRAINT faq_credit_prices_environment_pack_key UNIQUE(environment,pack);
-- This operator-owned catalog seed runs while normal application writes remain frozen.
ALTER TABLE public.faq_credit_prices DISABLE TRIGGER faqify_rollout_write_guard;
INSERT INTO public.faq_credit_prices(price_id,environment,pack,credits,amount_cents) VALUES
  ('pri_01m6p0421ctnjm6htam5zm8cn0','live','Pro',100,900),
  ('pri_01m6p042sd1hk4wre39q7cnr23','live','Business',500,2900);
ALTER TABLE public.faq_credit_prices ENABLE TRIGGER faqify_rollout_write_guard;

ALTER TABLE public.faq_credit_grants DROP CONSTRAINT faq_credit_grants_environment_check;
ALTER TABLE public.faq_credit_grants ADD CONSTRAINT faq_credit_grants_environment_check
  CHECK(environment IN ('sandbox','live'));
ALTER TABLE public.faq_credit_grants DROP CONSTRAINT faq_credit_grants_transaction_id_key;
ALTER TABLE public.faq_credit_grants ADD CONSTRAINT faq_credit_grants_environment_transaction_key
  UNIQUE(environment,transaction_id);
ALTER TABLE public.paddle_events DROP CONSTRAINT paddle_events_pkey;
ALTER TABLE public.paddle_events ADD CONSTRAINT paddle_events_pkey PRIMARY KEY(environment,event_id);
ALTER TABLE public.faq_credit_adjustments ADD COLUMN environment text NOT NULL DEFAULT 'sandbox'
  CHECK(environment IN ('sandbox','live'));
ALTER TABLE public.faq_credit_adjustments DROP CONSTRAINT faq_credit_adjustments_pkey;
ALTER TABLE public.faq_credit_adjustments ADD CONSTRAINT faq_credit_adjustments_pkey
  PRIMARY KEY(environment,adjustment_id);

CREATE TABLE public.faqify_live_billing_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  public_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.faqify_live_billing_control(singleton,public_enabled) VALUES(true,false);
CREATE TABLE public.faqify_live_billing_cohort (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.faqify_live_billing_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faqify_live_billing_cohort ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.faqify_live_billing_control,public.faqify_live_billing_cohort
  FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.faqify_live_billing_control,public.faqify_live_billing_cohort TO service_role;

CREATE FUNCTION public.faqify_require_billing_member(p_user uuid,p_environment text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF p_user IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user) THEN
    RAISE EXCEPTION 'Billing account unavailable';
  END IF;
  IF p_environment='sandbox' THEN
    PERFORM public.faqify_require_sandbox_member(p_user,p_environment);
  ELSIF p_environment='live' THEN
    IF NOT EXISTS(SELECT 1 FROM public.faqify_live_billing_control WHERE singleton AND public_enabled)
      AND NOT EXISTS(SELECT 1 FROM public.faqify_live_billing_cohort WHERE user_id=p_user AND enabled)
    THEN RAISE EXCEPTION 'Live checkout is temporarily limited to approved launch accounts'; END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported billing environment';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.faqify_require_billing_member(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.faqify_require_billing_member(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.begin_paddle_credit_checkout(p_user uuid,p_pack text,p_environment text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w public.faq_credit_wallets%ROWTYPE; c public.paddle_checkouts%ROWTYPE; price text;
BEGIN
  PERFORM public.faqify_require_billing_member(p_user,p_environment);
  SELECT price_id INTO price FROM public.faq_credit_prices WHERE pack=p_pack AND environment=p_environment;
  IF price IS NULL THEN RAISE EXCEPTION 'Unknown credit pack'; END IF;
  SELECT * INTO w FROM public.faq_credit_wallets WHERE user_id=p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Credit account unavailable'; END IF;
  IF w.hold_reason IS NOT NULL THEN RAISE EXCEPTION 'Credit account requires billing review'; END IF;
  UPDATE public.paddle_checkouts SET closed=true
    WHERE user_id=p_user AND environment=p_environment AND transaction_id IS NULL AND expires_at<=now();
  SELECT * INTO c FROM public.paddle_checkouts
    WHERE user_id=p_user AND environment=p_environment AND NOT closed
    ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    IF c.kind<>'credit_pack' OR c.price_id<>price THEN
      RAISE EXCEPTION 'An existing checkout is still open. Complete it or close it before choosing another pack.';
    END IF;
    RETURN jsonb_build_object('id',c.id,'price_id',c.price_id,'transaction_id',c.transaction_id,'is_new',false);
  END IF;
  IF (SELECT count(*) FROM public.paddle_checkouts WHERE user_id=p_user AND created_at>now()-interval '1 hour')>=5
    THEN RAISE EXCEPTION 'Too many checkout attempts. Please retry later.'; END IF;
  INSERT INTO public.paddle_checkouts(user_id,environment,tier,kind,price_id)
    VALUES(p_user,p_environment,p_pack,'credit_pack',price) RETURNING * INTO c;
  RETURN jsonb_build_object('id',c.id,'price_id',price,'is_new',true);
END $$;

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
      customer_id,credits,remaining,amount_cents,currency,granted_at)
      VALUES(uid,txn,c.id,p_environment,price.price_id,customer,price.credits,price.credits,
        price.amount_cents,'USD',p_occurred_at) RETURNING * INTO g;
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

REVOKE ALL ON FUNCTION public.begin_paddle_credit_checkout(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_paddle_credit_checkout(uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.apply_paddle_credit_event(text,timestamptz,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_paddle_credit_event(text,timestamptz,text,jsonb) TO service_role;
COMMIT;
