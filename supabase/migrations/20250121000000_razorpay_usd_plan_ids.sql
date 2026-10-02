-- Add USD Razorpay plan IDs (P1-7)
-- create-razorpay-subscription/index.ts reads subscription_plans.razorpay_plan_id_usd,
-- which earlier migrations never created (they only added razorpay_plan_id / *_inr).
-- Safe to re-run.

BEGIN;

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS razorpay_plan_id_usd TEXT;

-- Seed with the current USD Razorpay Plan IDs (from the Razorpay dashboard).
-- Verify these match your live dashboard before deploying.
UPDATE public.subscription_plans SET razorpay_plan_id_usd = 'plan_Rk4UC2Kxsh78K9' WHERE name = 'Pro';
UPDATE public.subscription_plans SET razorpay_plan_id_usd = 'plan_Rk4Uu6Syvg6cZH' WHERE name = 'Business';

COMMENT ON COLUMN public.subscription_plans.razorpay_plan_id_usd IS 'Razorpay USD plan id used for auto-renewing subscriptions';

COMMIT;
