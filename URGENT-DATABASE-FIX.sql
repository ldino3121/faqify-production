-- URGENT: Fix Database for Subscription Model
-- Run these commands in Supabase SQL Editor RIGHT NOW

-- 1. Add the missing column
ALTER TABLE public.subscription_plans
ADD COLUMN IF NOT EXISTS razorpay_plan_id_inr TEXT;

-- 2. Update Pro Plan with your actual Plan ID
UPDATE public.subscription_plans 
SET razorpay_plan_id_inr = 'plan_REN5cBATpXrR7S'
WHERE name = 'Pro';

-- 3. Update Business Plan with your actual Plan ID
UPDATE public.subscription_plans 
SET razorpay_plan_id_inr = 'plan_RENZeCMJQuFc8n'
WHERE name = 'Business';

-- 4. Add subscription tracking column
ALTER TABLE public.user_subscriptions
ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT;

-- 5. VERIFY IT WORKED
SELECT 
  name, 
  price_monthly, 
  razorpay_plan_id_inr,
  CASE 
    WHEN razorpay_plan_id_inr IS NOT NULL THEN '✅ READY'
    ELSE '❌ MISSING'
  END as status
FROM public.subscription_plans
WHERE name IN ('Free', 'Pro', 'Business')
ORDER BY name;

-- Expected output:
-- Business | 2900 | plan_RENZeCMJQuFc8n | ✅ READY
-- Free     | 0    | NULL                | ❌ MISSING (this is OK)
-- Pro      | 900  | plan_REN5cBATpXrR7S | ✅ READY
