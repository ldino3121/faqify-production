-- Quick Migration for Subscription Management + Fix Free Plan Limit
-- Run this in your Supabase SQL Editor

-- 1. Fix Free Plan FAQ Limit to 10 (correct value)
UPDATE public.subscription_plans
SET faq_limit = 10,
    updated_at = NOW()
WHERE name = 'Free';

-- 2. Update all existing Free plan users to have correct limit (10 FAQs)
UPDATE public.user_subscriptions
SET faq_usage_limit = 10,
    updated_at = NOW()
WHERE plan_tier = 'Free';

-- 3. Add new columns to user_subscriptions table for subscription management
ALTER TABLE public.user_subscriptions
ADD COLUMN IF NOT EXISTS auto_renewal BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'one_time' CHECK (payment_type IN ('one_time', 'recurring', 'subscription')),
ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS billing_cycle TEXT DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
ADD COLUMN IF NOT EXISTS subscription_source TEXT DEFAULT 'manual' CHECK (subscription_source IN ('manual', 'stripe', 'razorpay')),
ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT,
ADD COLUMN IF NOT EXISTS razorpay_plan_id TEXT;

-- 4. Add payment_type column to payment_transactions if not exists
ALTER TABLE public.payment_transactions
ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'one_time' CHECK (payment_type IN ('one_time', 'recurring', 'subscription'));

-- 5. Update existing subscriptions to have proper defaults
UPDATE public.user_subscriptions
SET
  auto_renewal = CASE
    WHEN plan_tier = 'Free' THEN false
    ELSE true
  END,
  payment_type = CASE
    WHEN plan_tier = 'Free' THEN 'one_time'
    ELSE 'recurring'
  END,
  billing_cycle = 'monthly',
  subscription_source = 'manual',
  next_billing_date = CASE
    WHEN plan_tier != 'Free' AND plan_expires_at IS NOT NULL
    THEN plan_expires_at
    ELSE NULL
  END
WHERE auto_renewal IS NULL;

-- 6. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_auto_renewal ON public.user_subscriptions(auto_renewal);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_cancelled_at ON public.user_subscriptions(cancelled_at);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_next_billing ON public.user_subscriptions(next_billing_date);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_razorpay_sub ON public.user_subscriptions(razorpay_subscription_id);

-- 7. Verify Free plan is correctly set to 10 FAQs
SELECT
    'subscription_plans' as table_name,
    name as plan_name,
    faq_limit
FROM public.subscription_plans
WHERE name = 'Free'

UNION ALL

SELECT
    'user_subscriptions' as table_name,
    plan_tier as plan_name,
    faq_usage_limit::text as faq_limit
FROM public.user_subscriptions
WHERE plan_tier = 'Free'
LIMIT 5;

-- Migration complete!
-- Free plan is now correctly set to 10 FAQs
-- Subscription management fields are ready
