-- Forward-only transition. Apply while faqify_rollout_control is frozen at revision 1;
-- install compatible functions/front-end and advance to revision 2 before reopening.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.faqify_rollout_control WHERE mode='frozen') THEN
    RAISE EXCEPTION 'Freeze FAQify before installing credit accounting';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261022000000') THEN
    RAISE EXCEPTION 'The original Paddle migration must already be recorded';
  END IF;
END $$;

-- These are new catalog identities. The old monthly and 30-day prices stay
-- mapped only by the legacy webhook path.
CREATE TABLE public.faq_credit_prices (
  price_id text PRIMARY KEY, environment text NOT NULL CHECK(environment='sandbox'),
  pack text NOT NULL UNIQUE CHECK(pack IN ('Pro','Business')),
  credits integer NOT NULL CHECK(credits IN (100,500)),
  amount_cents integer NOT NULL CHECK(amount_cents IN (900,2900)),
  currency text NOT NULL DEFAULT 'USD' CHECK(currency='USD'),
  CHECK ((pack='Pro' AND credits=100 AND amount_cents=900) OR
         (pack='Business' AND credits=500 AND amount_cents=2900))
);
INSERT INTO public.faq_credit_prices(price_id,environment,pack,credits,amount_cents) VALUES
  ('pri_01m5s0d08dqp588cxhgq2vszzf','sandbox','Pro',100,900),
  ('pri_01m5s0d1mqfwn77efkypa94ay4','sandbox','Business',500,2900);

CREATE TABLE public.faq_credit_wallets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  free_available integer NOT NULL DEFAULT 0 CHECK(free_available BETWEEN 0 AND 5),
  paid_available integer NOT NULL DEFAULT 0 CHECK(paid_available>=0),
  reserved integer NOT NULL DEFAULT 0 CHECK(reserved>=0),
  intro_state text NOT NULL CHECK(intro_state IN ('granted','review','withheld')),
  ever_purchased boolean NOT NULL DEFAULT false,
  hold_reason text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.faq_credit_grants (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id text NOT NULL UNIQUE,
  checkout_id uuid UNIQUE REFERENCES public.paddle_checkouts(id),
  environment text NOT NULL CHECK(environment='sandbox'),
  price_id text REFERENCES public.faq_credit_prices(price_id),
  customer_id text,
  credits integer NOT NULL CHECK(credits>0),
  remaining integer NOT NULL CHECK(remaining>=0 AND remaining<=credits),
  amount_cents integer CHECK(amount_cents IN (900,2900)),
  currency text CHECK(currency='USD'),
  granted_at timestamptz NOT NULL,
  reversed_at timestamptz,
  CHECK ((checkout_id IS NOT NULL AND price_id IS NOT NULL AND customer_id IS NOT NULL
    AND amount_cents IS NOT NULL AND currency='USD') OR
    (checkout_id IS NULL AND price_id IS NULL AND customer_id IS NULL AND amount_cents IS NULL AND currency IS NULL))
);
CREATE INDEX faq_credit_grants_spend ON public.faq_credit_grants(user_id,granted_at,id) WHERE remaining>0;
CREATE TABLE public.faq_credit_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket text NOT NULL CHECK(bucket IN ('free','paid','legacy')),
  entry_type text NOT NULL CHECK(entry_type IN ('intro_grant','purchase_grant','usage','refund_reversal','correction')),
  delta integer NOT NULL CHECK(delta<>0 OR entry_type='correction'),
  idempotency_key text NOT NULL UNIQUE,
  source_transaction_id text, source_event_id text, source_adjustment_id text,
  generation_id uuid, grant_id bigint REFERENCES public.faq_credit_grants(id),
  note text, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((entry_type='usage' AND delta<0) OR (entry_type<>'usage'))
);
CREATE INDEX faq_credit_ledger_owner_time ON public.faq_credit_ledger(user_id,created_at DESC);
CREATE TABLE public.faq_credit_usage_allocations (
  generation_id uuid NOT NULL REFERENCES public.faq_generation_requests(id),
  grant_id bigint NOT NULL REFERENCES public.faq_credit_grants(id),
  credits integer NOT NULL CHECK(credits>0),
  PRIMARY KEY(generation_id,grant_id)
);
CREATE TABLE public.faq_credit_adjustments (
  adjustment_id text PRIMARY KEY, transaction_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL, adjustment_type text, status text NOT NULL,
  resolution text NOT NULL CHECK(resolution IN ('none','reversed','review')),
  occurred_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX faq_credit_adjustments_owner ON public.faq_credit_adjustments(user_id,created_at DESC);

ALTER TABLE public.paddle_checkouts DROP CONSTRAINT paddle_checkouts_kind_check;
ALTER TABLE public.paddle_checkouts ADD CONSTRAINT paddle_checkouts_kind_check
  CHECK(kind IN ('recurring','one_time','credit_pack'));
ALTER TABLE public.faq_generation_requests ADD COLUMN reserved_count integer NOT NULL DEFAULT 0 CHECK(reserved_count>=0);
ALTER TABLE public.faq_generation_requests DROP CONSTRAINT faq_generation_requests_status_check;
ALTER TABLE public.faq_generation_requests ADD CONSTRAINT faq_generation_requests_status_check
  CHECK(status IN ('pending','completed','saved','failed'));

-- Owner-approved transition policy: exactly the seven existing active Free
-- accounts receive five one-time credits. Historical monthly usage cannot
-- establish a lifetime remainder, so this explicit transition grant does not
-- infer or convert historical usage. Stop if the cohort has changed.
DO $$ DECLARE free_count integer; BEGIN
  SELECT count(*) INTO free_count FROM public.user_subscriptions
    WHERE user_id IS NOT NULL AND coalesce(plan_tier,plan_id::text)='Free' AND status='active';
  IF free_count<>7 THEN RAISE EXCEPTION 'Expected seven existing active Free accounts; found %',free_count; END IF;
END $$;
INSERT INTO public.faq_credit_wallets(user_id,free_available,intro_state)
  SELECT user_id,
    CASE WHEN coalesce(plan_tier,plan_id::text)='Free' AND status='active' THEN 5 ELSE 0 END,
    CASE WHEN coalesce(plan_tier,plan_id::text)='Free' AND status='active' THEN 'granted' ELSE 'review' END
  FROM public.user_subscriptions WHERE user_id IS NOT NULL;
INSERT INTO public.faq_credit_ledger(user_id,bucket,entry_type,delta,idempotency_key,note)
  SELECT user_id,'free','intro_grant',5,'intro:'||user_id,
    'Owner-approved one-time existing Free account transition grant'
  FROM public.faq_credit_wallets WHERE intro_state='granted';

CREATE FUNCTION public.faqify_grant_new_account_intro() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.faq_credit_wallets(user_id,free_available,intro_state)
    VALUES(NEW.user_id,5,'granted') ON CONFLICT DO NOTHING;
  IF FOUND THEN
    INSERT INTO public.faq_credit_ledger(user_id,bucket,entry_type,delta,idempotency_key,note)
      VALUES(NEW.user_id,'free','intro_grant',5,'intro:'||NEW.user_id,'New-account introductory allowance');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER faqify_credit_intro AFTER INSERT ON public.user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.faqify_grant_new_account_intro();

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['faq_credit_prices','faq_credit_wallets','faq_credit_grants','faq_credit_ledger',
    'faq_credit_usage_allocations','faq_credit_adjustments'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  END LOOP;
END $$;
GRANT SELECT ON public.faq_credit_wallets,public.faq_credit_grants,public.faq_credit_ledger,
  public.faq_credit_adjustments TO authenticated;
CREATE POLICY wallet_owner_read ON public.faq_credit_wallets FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.is_admin());
CREATE POLICY grants_owner_read ON public.faq_credit_grants FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.is_admin());
CREATE POLICY ledger_owner_read ON public.faq_credit_ledger FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.is_admin());
CREATE POLICY adjustments_owner_read ON public.faq_credit_adjustments FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.is_admin());
REVOKE ALL ON public.faq_credit_prices FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.faq_credit_prices TO service_role;
REVOKE ALL ON FUNCTION public.faqify_grant_new_account_intro() FROM PUBLIC,anon,authenticated,service_role;

-- A completed legacy period remains usable until its recorded end. Its
-- allowance stays in user_subscriptions and is never converted into a pack.
CREATE OR REPLACE FUNCTION public.can_generate_faqs(user_uuid uuid,faq_count integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w public.faq_credit_wallets%ROWTYPE; s public.user_subscriptions%ROWTYPE;
  legacy_remaining integer:=0; total integer; active_reserved integer; owns_collection boolean; eligible boolean;
BEGIN
  IF user_uuid IS NULL OR (auth.role() IS DISTINCT FROM 'service_role' AND auth.uid() IS DISTINCT FROM user_uuid)
    THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF faq_count IS NULL OR faq_count NOT BETWEEN 1 AND 10 THEN
    RETURN jsonb_build_object('can_generate',false,'reason','Choose 1–10 FAQ pairs.');
  END IF;
  SELECT * INTO w FROM public.faq_credit_wallets WHERE user_id=user_uuid;
  SELECT * INTO s FROM public.user_subscriptions WHERE user_id=user_uuid;
  IF NOT FOUND OR w.user_id IS NULL THEN
    RETURN jsonb_build_object('can_generate',false,'reason','Credit account unavailable; contact support.');
  END IF;
  IF coalesce(s.plan_tier,s.plan_id::text)<>'Free' AND s.status IN ('active','cancelled','canceled')
    AND s.plan_expires_at>now() THEN
    legacy_remaining:=greatest(0,coalesce(s.faq_usage_limit,0)-coalesce(s.faq_usage_current,0));
  END IF;
  -- An expired generation cannot hide credits until a future write cleans up
  -- the materialized reservation counter.
  SELECT coalesce(sum(reserved_count),0)::integer INTO active_reserved
    FROM public.faq_generation_requests
    WHERE user_id=user_uuid AND status IN ('pending','completed') AND expires_at>now();
  total:=greatest(0,w.free_available+w.paid_available+legacy_remaining-active_reserved);
  SELECT EXISTS(SELECT 1 FROM public.faq_collections WHERE user_id=user_uuid) INTO owns_collection;
  eligible:=w.hold_reason IS NULL AND total>=faq_count;
  RETURN jsonb_build_object('can_generate',eligible,
    'reason',CASE WHEN w.hold_reason IS NOT NULL THEN 'Credit account requires billing review. Contact support.'
      WHEN eligible THEN 'OK' WHEN w.intro_state='review' AND total=0 THEN 'Introductory credit review is pending. Contact support or buy credits.'
      ELSE 'Not enough FAQ credits. Buy 100 or 500 credits to continue.' END,
    'remaining_faqs',total,'free_credits',w.free_available,'paid_credits',w.paid_available,
    'legacy_credits',legacy_remaining,'reserved_credits',active_reserved,
    'intro_state',w.intro_state,'ever_purchased',w.ever_purchased,
    'can_add_collection',w.ever_purchased OR coalesce(s.plan_tier,s.plan_id::text)<>'Free' OR NOT owns_collection,
    'is_expired',false);
END $$;
REVOKE ALL ON FUNCTION public.can_generate_faqs(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_generate_faqs(uuid,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.begin_faq_generation(p_user uuid,p_count integer,p_url text,p_content text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w public.faq_credit_wallets%ROWTYPE; eligibility jsonb; request_id uuid;
  released integer:=0; in_flight integer; previews integer;
BEGIN
  IF p_user IS NULL THEN RAISE EXCEPTION 'User required'; END IF;
  SELECT * INTO w FROM public.faq_credit_wallets WHERE user_id=p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Credit account unavailable'; END IF;
  -- The wallet lock serializes reservations, charges and grants. A crashed AI
  -- request releases its hold after ticket expiry, without giving another grant.
  WITH expired AS (
    UPDATE public.faq_generation_requests SET status='failed',reserved_count=0
      WHERE user_id=p_user AND status IN ('pending','completed') AND expires_at<now()
      RETURNING reserved_count
  ) SELECT coalesce(sum(reserved_count),0)::integer INTO released FROM expired;
  IF released>0 THEN
    UPDATE public.faq_credit_wallets SET reserved=reserved-released,updated_at=now() WHERE user_id=p_user;
  END IF;
  eligibility:=public.can_generate_faqs(p_user,p_count);
  IF NOT (eligibility->>'can_generate')::boolean THEN RAISE EXCEPTION '%',eligibility->>'reason'; END IF;
  SELECT count(*) INTO in_flight FROM public.faq_generation_requests
    WHERE user_id=p_user AND status IN ('pending','completed') AND expires_at>now();
  IF in_flight>=2 THEN RAISE EXCEPTION 'Save or let an existing generation expire before starting another.'; END IF;
  SELECT count(*) INTO previews FROM public.faq_generation_requests
    WHERE user_id=p_user AND status='completed' AND created_at>now()-interval '24 hours';
  IF previews>=3 THEN RAISE EXCEPTION 'Save an existing generation before requesting more previews.'; END IF;
  IF (SELECT count(*) FROM public.faq_generation_requests WHERE user_id=p_user AND created_at>now()-interval '1 hour')>=20
    THEN RAISE EXCEPTION 'Generation rate limit reached. Please retry later.'; END IF;
  DELETE FROM public.faq_generation_requests WHERE user_id=p_user AND status='failed' AND expires_at<now()-interval '7 days';
  UPDATE public.faq_credit_wallets SET reserved=reserved+p_count,updated_at=now() WHERE user_id=p_user;
  INSERT INTO public.faq_generation_requests(user_id,requested_count,source_url,source_content,reserved_count)
    VALUES(p_user,p_count,left(p_url,2048),left(p_content,10000),p_count) RETURNING id INTO request_id;
  RETURN request_id;
END $$;
REVOKE ALL ON FUNCTION public.begin_faq_generation(uuid,integer,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_faq_generation(uuid,integer,text,text) TO service_role;

CREATE FUNCTION public.fail_faq_generation(p_user uuid,p_generation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE held integer;
BEGIN
  PERFORM 1 FROM public.faq_credit_wallets WHERE user_id=p_user FOR UPDATE;
  SELECT reserved_count INTO held FROM public.faq_generation_requests
    WHERE id=p_generation_id AND user_id=p_user AND status='pending' FOR UPDATE;
  IF FOUND THEN
    UPDATE public.faq_generation_requests SET status='failed',reserved_count=0 WHERE id=p_generation_id;
    UPDATE public.faq_credit_wallets SET reserved=reserved-held,updated_at=now() WHERE user_id=p_user;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.fail_faq_generation(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fail_faq_generation(uuid,uuid) TO service_role;

CREATE FUNCTION public.save_generated_faqs(p_generation_id uuid,p_title text,p_collection_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); w public.faq_credit_wallets%ROWTYPE;
  g public.faq_generation_requests%ROWTYPE; s public.user_subscriptions%ROWTYPE;
  c uuid; n integer; left_to_charge integer; free_used integer; legacy_used integer;
  paid_used integer:=0; take integer; legacy_remaining integer:=0; grant_row public.faq_credit_grants%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT * INTO w FROM public.faq_credit_wallets WHERE user_id=uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Credit account unavailable'; END IF;
  SELECT * INTO g FROM public.faq_generation_requests WHERE id=p_generation_id AND user_id=uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Generation not found'; END IF;
  IF g.status='saved' AND g.collection_id IS NOT NULL THEN
    RETURN jsonb_build_object('collection_id',g.collection_id,'collection_title',
      (SELECT title FROM public.faq_collections WHERE id=g.collection_id),'already_saved',true);
  END IF;
  IF w.hold_reason IS NOT NULL THEN RAISE EXCEPTION 'Credit account requires billing review; contact support'; END IF;
  IF g.status<>'completed' OR g.expires_at<now() OR g.reserved_count<1 OR w.reserved<g.reserved_count
    THEN RAISE EXCEPTION 'Generation expired or incomplete; download the draft and contact support'; END IF;
  IF p_collection_id IS NULL AND length(trim(p_title)) NOT BETWEEN 3 AND 100
    THEN RAISE EXCEPTION 'Title must contain 3–100 characters'; END IF;
  IF jsonb_typeof(g.faqs) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid generated FAQs'; END IF;
  n:=jsonb_array_length(g.faqs);
  IF n NOT BETWEEN 1 AND g.requested_count OR n>10 THEN RAISE EXCEPTION 'Invalid generated FAQ count'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(g.faqs) AS f(item)
      WHERE jsonb_typeof(item)<>'object'
        OR coalesce(length(trim(item->>'question')),0) NOT BETWEEN 3 AND 500
        OR coalesce(length(trim(item->>'answer')),0) NOT BETWEEN 3 AND 4000)
    THEN RAISE EXCEPTION 'Generated FAQs contain an invalid question or answer'; END IF;
  SELECT * INTO s FROM public.user_subscriptions WHERE user_id=uid FOR UPDATE;
  IF coalesce(s.plan_tier,s.plan_id::text)<>'Free' AND s.status IN ('active','cancelled','canceled')
     AND s.plan_expires_at>now() THEN
    legacy_remaining:=greatest(0,coalesce(s.faq_usage_limit,0)-coalesce(s.faq_usage_current,0));
  END IF;
  IF w.free_available+w.paid_available+legacy_remaining-(w.reserved-g.reserved_count)<n
    THEN RAISE EXCEPTION 'Not enough FAQ credits to save this generation. Buy credits or contact support.'; END IF;
  IF (SELECT count(*) FROM public.faqs f JOIN public.faq_collections x ON x.id=f.collection_id WHERE x.user_id=uid)+n>10000
    THEN RAISE EXCEPTION 'Account FAQ storage limit reached (10,000 pairs); contact support'; END IF;
  IF p_collection_id IS NOT NULL THEN
    SELECT id INTO c FROM public.faq_collections WHERE id=p_collection_id AND user_id=uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Collection not found'; END IF;
  ELSIF NOT w.ever_purchased AND coalesce(s.plan_tier,s.plan_id::text)='Free' THEN
    SELECT id INTO c FROM public.faq_collections WHERE user_id=uid ORDER BY created_at,id LIMIT 1 FOR UPDATE;
  END IF;
  IF c IS NULL THEN
    IF (SELECT count(*) FROM public.faq_collections WHERE user_id=uid)>=100
      THEN RAISE EXCEPTION 'Account collection limit reached (100); contact support'; END IF;
    INSERT INTO public.faq_collections(user_id,title,source_url,source_content,status)
      VALUES(uid,trim(p_title),g.source_url,g.source_content,'published') RETURNING id INTO c;
  END IF;
  INSERT INTO public.faqs(collection_id,question,answer,order_index,is_published)
    SELECT c,item->>'question',item->>'answer',
      (SELECT coalesce(max(order_index),-1)+1 FROM public.faqs WHERE collection_id=c)+ordinality-1,true
    FROM jsonb_array_elements(g.faqs) WITH ORDINALITY AS f(item,ordinality);
  left_to_charge:=n;
  free_used:=least(left_to_charge,w.free_available);
  IF free_used>0 THEN
    UPDATE public.faq_credit_wallets SET free_available=free_available-free_used WHERE user_id=uid;
    INSERT INTO public.faq_credit_ledger(user_id,bucket,entry_type,delta,idempotency_key,generation_id)
      VALUES(uid,'free','usage',-free_used,'usage:'||g.id||':free',g.id);
    left_to_charge:=left_to_charge-free_used;
  END IF;
  legacy_used:=least(left_to_charge,legacy_remaining);
  IF legacy_used>0 THEN
    UPDATE public.user_subscriptions SET faq_usage_current=faq_usage_current+legacy_used,updated_at=now() WHERE id=s.id;
    INSERT INTO public.faq_credit_ledger(user_id,bucket,entry_type,delta,idempotency_key,generation_id)
      VALUES(uid,'legacy','usage',-legacy_used,'usage:'||g.id||':legacy',g.id);
    left_to_charge:=left_to_charge-legacy_used;
  END IF;
  FOR grant_row IN SELECT * FROM public.faq_credit_grants
      WHERE user_id=uid AND remaining>0 AND reversed_at IS NULL ORDER BY granted_at,id FOR UPDATE
  LOOP
    EXIT WHEN left_to_charge=0;
    take:=least(left_to_charge,grant_row.remaining);
    UPDATE public.faq_credit_grants SET remaining=remaining-take WHERE id=grant_row.id;
    INSERT INTO public.faq_credit_usage_allocations(generation_id,grant_id,credits) VALUES(g.id,grant_row.id,take);
    INSERT INTO public.faq_credit_ledger(user_id,bucket,entry_type,delta,idempotency_key,
      source_transaction_id,generation_id,grant_id)
      VALUES(uid,'paid','usage',-take,'usage:'||g.id||':paid:'||grant_row.id,
        grant_row.transaction_id,g.id,grant_row.id);
    left_to_charge:=left_to_charge-take; paid_used:=paid_used+take;
  END LOOP;
  IF left_to_charge<>0 THEN RAISE EXCEPTION 'Credit ledger mismatch; contact support'; END IF;
  UPDATE public.faq_credit_wallets SET paid_available=paid_available-paid_used,
    reserved=reserved-g.reserved_count,updated_at=now() WHERE user_id=uid;
  UPDATE public.faq_generation_requests SET status='saved',collection_id=c,reserved_count=0 WHERE id=g.id;
  INSERT INTO public.usage_analytics(user_id,action_type,action,metadata)
    VALUES(uid,'collection_saved','collection_saved',jsonb_build_object('faq_count',n,'collection_id',c));
  RETURN jsonb_build_object('collection_id',c,'collection_title',
    (SELECT title FROM public.faq_collections WHERE id=c),'charged_credits',n,'free_charged',free_used,
    'legacy_charged',legacy_used,'paid_charged',paid_used);
END $$;
REVOKE ALL ON FUNCTION public.save_generated_faqs(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_generated_faqs(uuid,text,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.save_generated_faqs(p_generation_id uuid,p_title text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT public.save_generated_faqs(p_generation_id,p_title,NULL::uuid)
$$;
REVOKE ALL ON FUNCTION public.save_generated_faqs(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_generated_faqs(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_free_collection_limit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE paid_before boolean; existing integer;
BEGIN
  SELECT ever_purchased INTO paid_before FROM public.faq_credit_wallets WHERE user_id=NEW.user_id;
  IF NOT coalesce(paid_before,false) AND NOT EXISTS(
    SELECT 1 FROM public.user_subscriptions WHERE user_id=NEW.user_id
      AND coalesce(plan_tier,plan_id::text)<>'Free' AND plan_expires_at>now()
  ) THEN
    SELECT count(*) INTO existing FROM public.faq_collections WHERE user_id=NEW.user_id;
    IF existing>=1 THEN RAISE EXCEPTION 'One collection before the first paid purchase; add FAQs to your existing collection or buy credits'; END IF;
  END IF;
  RETURN NEW;
END $$;

-- This scheduled routine remains for outstanding legacy periods only. Neither
-- wallet balances nor Free introductory credits can be refreshed by a clock.
CREATE OR REPLACE FUNCTION public.reset_monthly_usage()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.user_subscriptions SET faq_usage_current=0,last_reset_date=now(),updated_at=now()
    WHERE coalesce(plan_tier,plan_id::text)<>'Free'
      AND paddle_subscription_id IS NULL AND payment_gateway IS DISTINCT FROM 'paddle'
      AND coalesce(last_reset_date,plan_activated_at,created_at)<=now()-interval '1 month';
  GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.reset_monthly_usage() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reset_monthly_usage() TO service_role;

CREATE FUNCTION public.begin_paddle_credit_checkout(p_user uuid,p_pack text,p_environment text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w public.faq_credit_wallets%ROWTYPE; c public.paddle_checkouts%ROWTYPE; price text;
BEGIN
  PERFORM public.faqify_require_sandbox_member(p_user,p_environment);
  SELECT price_id INTO price FROM public.faq_credit_prices WHERE pack=p_pack AND environment=p_environment;
  IF price IS NULL THEN RAISE EXCEPTION 'Unknown credit pack'; END IF;
  SELECT * INTO w FROM public.faq_credit_wallets WHERE user_id=p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Credit account unavailable'; END IF;
  IF w.hold_reason IS NOT NULL THEN RAISE EXCEPTION 'Credit account requires billing review'; END IF;
  UPDATE public.paddle_checkouts SET closed=true
    WHERE user_id=p_user AND transaction_id IS NULL AND expires_at<=now();
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
REVOKE ALL ON FUNCTION public.begin_paddle_credit_checkout(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_paddle_credit_checkout(uuid,text,text) TO service_role;

CREATE FUNCTION public.apply_paddle_credit_event(p_event_id text,p_occurred_at timestamptz,p_environment text,p_payload jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE op text:=p_payload->>'operation'; txn text:=p_payload->>'transaction_id';
  c public.paddle_checkouts%ROWTYPE; w public.faq_credit_wallets%ROWTYPE;
  g public.faq_credit_grants%ROWTYPE; price public.faq_credit_prices%ROWTYPE;
  prior public.faq_credit_adjustments%ROWTYPE; uid uuid;
  customer text:=p_payload->>'customer_id'; adj text:=p_payload->>'adjustment_id';
  act text:=p_payload->>'action'; adj_type text:=p_payload->>'adjustment_type'; adj_status text:=p_payload->>'adjustment_status';
BEGIN
  IF p_environment IS DISTINCT FROM 'sandbox' OR p_event_id !~ '^evt_[a-z0-9]{26}$'
    OR txn !~ '^txn_[a-z0-9]{26}$' OR p_occurred_at IS NULL
    THEN RAISE EXCEPTION 'Invalid sandbox credit event'; END IF;
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
    PERFORM public.faqify_require_sandbox_member(uid,p_environment);
    SELECT * INTO w FROM public.faq_credit_wallets WHERE user_id=uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Credit account unavailable'; END IF;
    SELECT * INTO c FROM public.paddle_checkouts WHERE transaction_id=txn AND environment=p_environment FOR UPDATE;
    IF NOT FOUND OR c.user_id<>uid THEN RAISE EXCEPTION 'Checkout ownership changed'; END IF;
    IF EXISTS(SELECT 1 FROM public.paddle_customers WHERE user_id=uid AND environment=p_environment AND customer_id<>customer)
      OR EXISTS(SELECT 1 FROM public.user_subscriptions WHERE user_id=uid AND paddle_environment=p_environment
        AND paddle_customer_id IS NOT NULL AND paddle_customer_id<>customer)
      THEN RAISE EXCEPTION 'Customer mismatch'; END IF;
    IF EXISTS(SELECT 1 FROM public.faq_credit_grants WHERE transaction_id=txn) THEN RETURN 'duplicate_transaction'; END IF;
    INSERT INTO public.faq_credit_grants(user_id,transaction_id,checkout_id,environment,price_id,
      customer_id,credits,remaining,amount_cents,currency,granted_at)
      VALUES(uid,txn,c.id,p_environment,price.price_id,customer,price.credits,price.credits,
        price.amount_cents,'USD',p_occurred_at) RETURNING * INTO g;
    INSERT INTO public.faq_credit_ledger(user_id,bucket,entry_type,delta,idempotency_key,
      source_transaction_id,source_event_id,grant_id)
      VALUES(uid,'paid','purchase_grant',price.credits,'pack:'||txn,txn,p_event_id,g.id);
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
    PERFORM public.faqify_require_sandbox_member(uid,p_environment);
    SELECT * INTO w FROM public.faq_credit_wallets WHERE user_id=uid FOR UPDATE;
    SELECT * INTO g FROM public.faq_credit_grants WHERE transaction_id=txn AND environment=p_environment FOR UPDATE;
    SELECT * INTO prior FROM public.faq_credit_adjustments WHERE adjustment_id=adj FOR UPDATE;
    IF FOUND AND prior.occurred_at>=p_occurred_at THEN RETURN 'stale_adjustment'; END IF;
    INSERT INTO public.faq_credit_adjustments(adjustment_id,transaction_id,user_id,action,adjustment_type,
      status,resolution,occurred_at)
      VALUES(adj,txn,uid,act,adj_type,adj_status,'none',p_occurred_at)
      ON CONFLICT(adjustment_id) DO UPDATE SET action=excluded.action,adjustment_type=excluded.adjustment_type,
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
        VALUES(uid,'paid','refund_reversal',-g.credits,'reversal:'||txn,txn,p_event_id,adj,g.id);
      UPDATE public.faq_credit_adjustments SET resolution='reversed' WHERE adjustment_id=adj;
      RETURN 'unused_pack_reversed';
    END IF;
    IF adj_status IN ('pending_approval','approved','reversed') THEN
      UPDATE public.faq_credit_wallets SET hold_reason='Billing adjustment requires credit reconciliation',updated_at=now()
        WHERE user_id=uid;
      UPDATE public.faq_credit_adjustments SET resolution='review' WHERE adjustment_id=adj;
      RETURN 'reconciliation_required';
    END IF;
    RETURN 'adjustment_recorded';
  END IF;
  RAISE EXCEPTION 'Unsupported credit event operation';
END $$;
REVOKE ALL ON FUNCTION public.apply_paddle_credit_event(text,timestamptz,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_paddle_credit_event(text,timestamptz,text,jsonb) TO service_role;

-- Only an explicit operator correction can clear a reconciliation hold. It
-- records a reason and unique correction ID, never rewrites old ledger rows.
CREATE FUNCTION public.faqify_correct_credits(p_user uuid,p_bucket text,p_delta integer,
  p_reference text,p_reason text,p_clear_hold boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
DECLARE w public.faq_credit_wallets%ROWTYPE; g public.faq_credit_grants%ROWTYPE;
  left_to_remove integer; take integer;
BEGIN
  IF current_user<>'postgres' THEN RAISE EXCEPTION 'Operator only'; END IF;
  IF p_bucket NOT IN ('free','paid') OR p_delta IS NULL OR p_reference IS NULL OR length(trim(p_reference))<4 OR length(trim(p_reason))<10
    OR (p_delta=0 AND NOT p_clear_hold)
    THEN RAISE EXCEPTION 'A reviewed correction reference and reason are required'; END IF;
  SELECT * INTO w FROM public.faq_credit_wallets WHERE user_id=p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  IF p_bucket='free' AND w.free_available+p_delta NOT BETWEEN 0 AND 5
    OR p_bucket='paid' AND w.paid_available+p_delta<0 THEN RAISE EXCEPTION 'Correction exceeds available balance'; END IF;
  IF p_bucket='paid' AND p_delta>0 THEN
    INSERT INTO public.faq_credit_grants(user_id,transaction_id,environment,credits,remaining,granted_at)
      VALUES(p_user,'correction:'||p_reference,'sandbox',p_delta,p_delta,now()) RETURNING * INTO g;
  ELSIF p_bucket='paid' AND p_delta<0 THEN
    left_to_remove:=-p_delta;
    FOR g IN SELECT * FROM public.faq_credit_grants WHERE user_id=p_user AND remaining>0
        AND reversed_at IS NULL ORDER BY granted_at DESC,id DESC FOR UPDATE
    LOOP
      EXIT WHEN left_to_remove=0;
      take:=least(left_to_remove,g.remaining);
      UPDATE public.faq_credit_grants SET remaining=remaining-take WHERE id=g.id;
      left_to_remove:=left_to_remove-take;
    END LOOP;
    IF left_to_remove<>0 THEN RAISE EXCEPTION 'Grant allocation mismatch'; END IF;
  END IF;
  INSERT INTO public.faq_credit_ledger(user_id,bucket,entry_type,delta,idempotency_key,note,grant_id)
    VALUES(p_user,p_bucket,'correction',p_delta,'correction:'||p_reference,p_reason,
      CASE WHEN p_bucket='paid' AND p_delta>0 THEN g.id ELSE NULL END);
  UPDATE public.faq_credit_wallets SET free_available=free_available+CASE WHEN p_bucket='free' THEN p_delta ELSE 0 END,
    paid_available=paid_available+CASE WHEN p_bucket='paid' THEN p_delta ELSE 0 END,
    hold_reason=CASE WHEN p_clear_hold THEN NULL ELSE hold_reason END,updated_at=now() WHERE user_id=p_user;
END $$;
REVOKE ALL ON FUNCTION public.faqify_correct_credits(uuid,text,integer,text,text,boolean)
  FROM PUBLIC,anon,authenticated,service_role;

-- Every new financial table must receive the existing statement-level freeze
-- and stale-client barrier before this transaction commits.
SELECT public.faqify_install_write_guards();
COMMIT;
