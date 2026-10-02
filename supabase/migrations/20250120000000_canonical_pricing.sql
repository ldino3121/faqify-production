-- Canonical pricing + FAQ limits (P0-2)
-- Source of truth: src/config/plans.ts
--   Free: 5 FAQs / $0 | Pro: 100 FAQs / $9 | Business: 500 FAQs / $29
-- Safe to re-run.

BEGIN;

-- 1) Canonical plan definitions
UPDATE public.subscription_plans SET faq_limit = 5,   price_monthly = 0,    price_yearly = 0     WHERE name = 'Free';
UPDATE public.subscription_plans SET faq_limit = 100, price_monthly = 900,  price_yearly = 9700  WHERE name = 'Pro';
UPDATE public.subscription_plans SET faq_limit = 500, price_monthly = 2900, price_yearly = 31300 WHERE name = 'Business';

-- 2) Align existing user quotas to their tier (tolerates legacy column naming:
--    historical migrations used both `plan_id` and `plan_tier`).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'user_subscriptions' AND column_name = 'plan_id') THEN
    EXECUTE $sql$
      UPDATE public.user_subscriptions us
      SET faq_usage_limit = sp.faq_limit, updated_at = NOW()
      FROM public.subscription_plans sp
      WHERE us.plan_id = sp.name
        AND us.faq_usage_limit IS DISTINCT FROM sp.faq_limit
    $sql$;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'user_subscriptions' AND column_name = 'plan_tier') THEN
    EXECUTE $sql$
      UPDATE public.user_subscriptions us
      SET faq_usage_limit = sp.faq_limit, updated_at = NOW()
      FROM public.subscription_plans sp
      WHERE us.plan_tier::text = sp.name
        AND us.faq_usage_limit IS DISTINCT FROM sp.faq_limit
    $sql$;
  END IF;
END $$;

-- 3) Signup trigger: derive the Free limit from subscription_plans (never a literal)
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
    COALESCE((SELECT sp.faq_limit FROM public.subscription_plans sp WHERE sp.name = 'Free' LIMIT 1), 5),
    FALSE
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE public.subscription_plans IS 'Canonical pricing: Free 5 / Pro 100 / Business 500 FAQs per month (see src/config/plans.ts)';

COMMIT;
