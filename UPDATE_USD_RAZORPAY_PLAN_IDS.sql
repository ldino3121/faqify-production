-- =====================================================
-- UPDATE DATABASE WITH USD RAZORPAY PLAN IDS ($9 / $29)
-- Run this in the Supabase SQL Editor for your project
-- =====================================================

-- 1. Inspect current subscription_plans
SELECT name, price_monthly, price_inr
FROM public.subscription_plans
ORDER BY name;

-- 2. Add razorpay_plan_id_usd column if it doesn't exist
ALTER TABLE public.subscription_plans
ADD COLUMN IF NOT EXISTS razorpay_plan_id_usd TEXT;

-- 3. Store USD Razorpay Plan IDs for Pro and Business
--    Replace these with the exact IDs from your Razorpay dashboard if they differ

-- Pro Plan ($9/month) - USD Razorpay Plan ID
UPDATE public.subscription_plans
SET 
  razorpay_plan_id_usd = 'plan_Rk4UC2Kxsh78K9',  -- Pro $9 USD plan
  updated_at = NOW()
WHERE name = 'Pro';

-- Business Plan ($29/month) - USD Razorpay Plan ID
UPDATE public.subscription_plans
SET 
  razorpay_plan_id_usd = 'plan_Rk4Uu6Syvg6cZH',  -- Business $29 USD plan
  updated_at = NOW()
WHERE name = 'Business';

-- 4. Create index for faster lookups by USD plan id
CREATE INDEX IF NOT EXISTS idx_subscription_plans_razorpay_plan_id_usd
ON public.subscription_plans(razorpay_plan_id_usd);

-- 5. Verify the updates
SELECT 
  name AS plan_name,
  price_monthly AS usd_price_cents,
  price_inr AS legacy_inr_paise,
  razorpay_plan_id_usd AS usd_razorpay_plan_id
FROM public.subscription_plans
WHERE name IN ('Pro', 'Business')
ORDER BY plan_name;

-- =====================================================
-- USD RAZORPAY PLAN IDS CONFIGURED
-- This aligns with the edge function create-razorpay-subscription,
-- which now prefers subscription_plans.razorpay_plan_id_usd.
-- =====================================================

