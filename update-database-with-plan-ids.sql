-- Update Database with Actual Razorpay Plan IDs
-- Run this in Supabase SQL Editor

-- 1. Add razorpay_plan_id_inr column if it doesn't exist
ALTER TABLE public.subscription_plans
ADD COLUMN IF NOT EXISTS razorpay_plan_id_inr TEXT;

-- 2. Update Pro Plan with actual Razorpay Plan ID
UPDATE public.subscription_plans 
SET razorpay_plan_id_inr = 'plan_REN5cBATpXrR7S'
WHERE name = 'Pro';

-- 3. Update Business Plan with actual Razorpay Plan ID
UPDATE public.subscription_plans 
SET razorpay_plan_id_inr = 'plan_RENZeCMJQuFc8n'
WHERE name = 'Business';

-- 4. Add razorpay_subscription_id column to user_subscriptions if not exists
ALTER TABLE public.user_subscriptions
ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT;

-- 5. Add razorpay_customer_id column if not exists
ALTER TABLE public.user_subscriptions
ADD COLUMN IF NOT EXISTS razorpay_customer_id TEXT;

-- 6. Add payment_type column if not exists
ALTER TABLE public.user_subscriptions
ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'one_time' CHECK (payment_type IN ('one_time', 'recurring'));

-- 7. Add billing_cycle column if not exists
ALTER TABLE public.user_subscriptions
ADD COLUMN IF NOT EXISTS billing_cycle TEXT DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly'));

-- 8. Add subscription_source column if not exists
ALTER TABLE public.user_subscriptions
ADD COLUMN IF NOT EXISTS subscription_source TEXT DEFAULT 'manual' CHECK (subscription_source IN ('manual', 'stripe', 'razorpay'));

-- 9. Add next_billing_date column if not exists
ALTER TABLE public.user_subscriptions
ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMPTZ;

-- 10. Add auto_renewal column if not exists
ALTER TABLE public.user_subscriptions
ADD COLUMN IF NOT EXISTS auto_renewal BOOLEAN DEFAULT TRUE;

-- 11. Add plan_activated_at column if not exists
ALTER TABLE public.user_subscriptions
ADD COLUMN IF NOT EXISTS plan_activated_at TIMESTAMPTZ DEFAULT NOW();

-- 12. Add plan_expires_at column if not exists
ALTER TABLE public.user_subscriptions
ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 month');

-- 13. Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_razorpay_subscription_id
ON public.user_subscriptions(razorpay_subscription_id);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_razorpay_customer_id
ON public.user_subscriptions(razorpay_customer_id);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_razorpay_plan_id
ON public.subscription_plans(razorpay_plan_id_inr);

-- 14. Update existing Free plan users with proper expiry dates
UPDATE public.user_subscriptions 
SET 
  plan_activated_at = COALESCE(plan_activated_at, created_at),
  plan_expires_at = CASE 
    WHEN plan_tier = 'Free' THEN NULL  -- Free plans don't expire
    ELSE COALESCE(plan_expires_at, created_at + INTERVAL '1 month')
  END,
  payment_type = CASE 
    WHEN plan_tier = 'Free' THEN 'one_time'
    ELSE COALESCE(payment_type, 'recurring')
  END,
  subscription_source = COALESCE(subscription_source, 'manual')
WHERE plan_activated_at IS NULL OR plan_expires_at IS NULL;

-- 15. Verify the updates
SELECT 
  name, 
  price_monthly, 
  price_inr, 
  razorpay_plan_id_inr,
  CASE 
    WHEN razorpay_plan_id_inr IS NOT NULL THEN '✅ Configured'
    ELSE '❌ Missing'
  END as status
FROM public.subscription_plans
WHERE name IN ('Free', 'Pro', 'Business')
ORDER BY 
  CASE name 
    WHEN 'Free' THEN 1 
    WHEN 'Pro' THEN 2 
    WHEN 'Business' THEN 3 
  END;

-- 16. Show sample user subscriptions
SELECT 
  us.plan_tier,
  us.status,
  us.faq_usage_current,
  us.faq_usage_limit,
  us.payment_type,
  us.subscription_source,
  us.razorpay_subscription_id,
  COUNT(*) as user_count
FROM public.user_subscriptions us
GROUP BY 
  us.plan_tier, 
  us.status, 
  us.faq_usage_current, 
  us.faq_usage_limit, 
  us.payment_type, 
  us.subscription_source, 
  us.razorpay_subscription_id
ORDER BY us.plan_tier;
