-- ========================================
-- SIMPLE SQL COMMANDS TO UPDATE PLAN IDS
-- Copy and paste these one by one in Supabase SQL Editor
-- ========================================

-- 1. Add the razorpay_plan_id_inr column if it doesn't exist
ALTER TABLE public.subscription_plans
ADD COLUMN IF NOT EXISTS razorpay_plan_id_inr TEXT;

-- 2. Update Pro Plan with your actual Razorpay Plan ID
UPDATE public.subscription_plans 
SET razorpay_plan_id_inr = 'plan_REN5cBATpXrR7S'
WHERE name = 'Pro';

-- 3. Update Business Plan with your actual Razorpay Plan ID
UPDATE public.subscription_plans 
SET razorpay_plan_id_inr = 'plan_RENZeCMJQuFc8n'
WHERE name = 'Business';

-- 4. Add razorpay_subscription_id column to user_subscriptions
ALTER TABLE public.user_subscriptions
ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT;

-- 5. Verify the updates worked
SELECT 
  name, 
  price_monthly, 
  razorpay_plan_id_inr,
  CASE 
    WHEN razorpay_plan_id_inr IS NOT NULL THEN 'Configured ✅'
    ELSE 'Missing ❌'
  END as status
FROM public.subscription_plans
WHERE name IN ('Free', 'Pro', 'Business')
ORDER BY name;
