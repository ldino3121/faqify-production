-- Permanent DB fixes for FAQ saving, expiry, and RLS
-- Safe to re-run (IF NOT EXISTS guards, CREATE OR REPLACE)

BEGIN;

-- 1) Align schema with frontend
ALTER TABLE public.faq_collections
  ADD COLUMN IF NOT EXISTS source_content TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'published' CHECK (status IN ('draft','published','archived'));

ALTER TABLE public.faqs
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT TRUE;

-- 2) Ensure RLS policies allow expected operations
ALTER TABLE public.faq_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;

-- Replace permissive/ambiguous policies with explicit ones
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='faq_collections' AND policyname='Users can manage own FAQ collections'
  ) THEN
    EXECUTE 'DROP POLICY "Users can manage own FAQ collections" ON public.faq_collections';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='faqs' AND policyname='Users can manage FAQs in own collections'
  ) THEN
    EXECUTE 'DROP POLICY "Users can manage FAQs in own collections" ON public.faqs';
  END IF;
END $$;

-- faq_collections explicit policies
CREATE POLICY IF NOT EXISTS faq_collections_select_own ON public.faq_collections
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS faq_collections_insert_own ON public.faq_collections
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS faq_collections_update_own ON public.faq_collections
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS faq_collections_delete_own ON public.faq_collections
  FOR DELETE USING (auth.uid() = user_id);

-- faqs explicit policies
CREATE POLICY IF NOT EXISTS faqs_select_own ON public.faqs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.faq_collections c
      WHERE c.id = faqs.collection_id AND c.user_id = auth.uid()
    )
  );
CREATE POLICY IF NOT EXISTS faqs_insert_own ON public.faqs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.faq_collections c
      WHERE c.id = faqs.collection_id AND c.user_id = auth.uid()
    )
  );
CREATE POLICY IF NOT EXISTS faqs_update_own ON public.faqs
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.faq_collections c
      WHERE c.id = faqs.collection_id AND c.user_id = auth.uid()
    )
  );
CREATE POLICY IF NOT EXISTS faqs_delete_own ON public.faqs
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.faq_collections c
      WHERE c.id = faqs.collection_id AND c.user_id = auth.uid()
    )
  );

-- 3) Signup trigger assigns Free plan with expiry and correct quota
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_subscriptions (
    user_id, plan_id, status, plan_activated_at, plan_expires_at, faq_usage_current, faq_usage_limit, auto_renewal
  )
  SELECT
    NEW.id,
    'Free',
    'active',
    NOW(),
    NOW() + INTERVAL '1 month',
    0,
    COALESCE((SELECT sp.faq_limit FROM public.subscription_plans sp WHERE sp.name='Free' LIMIT 1), 10),
    FALSE
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4) Backfill missing expiry dates (activation + 1 month)
UPDATE public.user_subscriptions us
SET plan_expires_at = COALESCE(us.plan_activated_at, us.created_at, NOW()) + INTERVAL '1 month'
WHERE us.plan_expires_at IS NULL;

-- 5) Core RPCs used by frontend
-- increment usage
CREATE OR REPLACE FUNCTION public.increment_faq_usage_by_count(user_uuid UUID, faq_count INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  current_usage INTEGER;
  usage_limit INTEGER;
BEGIN
  SELECT faq_usage_current, faq_usage_limit
  INTO current_usage, usage_limit
  FROM public.user_subscriptions
  WHERE user_id = user_uuid;

  IF current_usage IS NULL THEN
    RETURN FALSE;
  END IF;
  IF current_usage + faq_count > usage_limit THEN
    RETURN FALSE;
  END IF;

  UPDATE public.user_subscriptions
  SET faq_usage_current = faq_usage_current + faq_count,
      updated_at = NOW()
  WHERE user_id = user_uuid;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- eligibility check (expiry + quota)
CREATE OR REPLACE FUNCTION public.can_generate_faqs(user_uuid UUID, faq_count INTEGER DEFAULT 1)
RETURNS JSONB AS $$
DECLARE
  sub RECORD;
  now_ts TIMESTAMPTZ := NOW();
  remaining INTEGER;
BEGIN
  SELECT plan_id AS plan_tier, status, plan_expires_at, faq_usage_current, faq_usage_limit
  INTO sub
  FROM public.user_subscriptions
  WHERE user_id = user_uuid;

  IF sub IS NULL THEN
    RETURN jsonb_build_object('can_generate', false, 'reason', 'No subscription');
  END IF;

  IF sub.plan_tier <> 'Free' AND sub.plan_expires_at IS NOT NULL AND now_ts >= sub.plan_expires_at THEN
    RETURN jsonb_build_object('can_generate', false, 'reason', 'Expired', 'is_expired', true);
  END IF;

  remaining := GREATEST(0, sub.faq_usage_limit - sub.faq_usage_current);
  IF faq_count > remaining THEN
    RETURN jsonb_build_object('can_generate', false, 'reason', 'Limit exceeded', 'remaining_faqs', remaining,
                              'current_usage', sub.faq_usage_current, 'usage_limit', sub.faq_usage_limit);
  END IF;

  RETURN jsonb_build_object(
    'can_generate', true,
    'reason', 'OK',
    'current_usage', sub.faq_usage_current,
    'usage_limit', sub.faq_usage_limit,
    'remaining_faqs', remaining,
    'plan_tier', sub.plan_tier,
    'plan_expires_at', sub.plan_expires_at,
    'is_within_period', true,
    'is_expired', false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
