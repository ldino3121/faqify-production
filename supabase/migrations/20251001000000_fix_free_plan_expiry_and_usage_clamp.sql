-- Fix P0: Free plan must never expire + clamp over-limit FAQ usage
-- Source of truth for limits: src/config/plans.ts (Free 5 / Pro 100 / Business 500)
--
-- Root causes fixed here:
--  1) Legacy Free limit was 10; the canonical pricing migration lowered the Free
--     limit to 5 but never clamped existing usage, so dashboards rendered e.g.
--     "10/5" with a negative "remaining" counter (e.g. ldino3121@gmail.com).
--  2) handle_new_user() gave Free users a plan_expires_at of NOW() + 1 month, so
--     Free accounts showed "EXPIRED" and were blocked from generating FAQs after
--     ~30 days. Free is a permanent tier and must never expire.
--  3) The legacy column default for faq_usage_limit was 10 (contradicts canonical 5).
--  4) The denormalized text column plan_tier could drift from the enum plan_id.
--
-- Safe to re-run (idempotent).

BEGIN;

-- 1) Clamp any usage that exceeds the current plan limit.
UPDATE public.user_subscriptions
SET faq_usage_current = faq_usage_limit,
    updated_at = NOW()
WHERE faq_usage_current > faq_usage_limit;

-- 2) Free plan never expires -> normalize legacy short/expired expiry to a far-future sentinel.
UPDATE public.user_subscriptions
SET plan_expires_at = TIMESTAMPTZ '2099-12-31 23:59:59+00',
    updated_at = NOW()
WHERE COALESCE(NULLIF(plan_tier, ''), plan_id::text) = 'Free'
  AND (plan_expires_at IS NULL OR plan_expires_at < TIMESTAMPTZ '2099-12-31 23:59:59+00');

-- 3) Keep the denormalized text column plan_tier in sync with the enum plan_id.
UPDATE public.user_subscriptions
SET plan_tier = plan_id::text
WHERE plan_tier IS DISTINCT FROM plan_id::text;

-- 4) Signup trigger: Free plan never expires + derives its limit from the plans table.
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
    user_id, plan_id, plan_tier, status, plan_activated_at, plan_expires_at, faq_usage_current, faq_usage_limit, auto_renewal
  )
  SELECT
    NEW.id,
    'Free',
    'Free',
    'active',
    NOW(),
    TIMESTAMPTZ '2099-12-31 23:59:59+00',  -- Free never expires
    0,
    COALESCE((SELECT sp.faq_limit FROM public.subscription_plans sp WHERE sp.name = 'Free' LIMIT 1), 5),
    FALSE
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5) Remove the stale legacy default (10) that contradicts the canonical Free limit.
ALTER TABLE public.user_subscriptions ALTER COLUMN faq_usage_limit SET DEFAULT 5;

COMMIT;