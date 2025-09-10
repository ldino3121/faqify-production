-- COMPLETE DATABASE FIX FOR SUBSCRIPTION MODEL
-- Run this in Supabase SQL Editor

-- 1. Add missing columns to subscription_plans
ALTER TABLE public.subscription_plans
ADD COLUMN IF NOT EXISTS razorpay_plan_id_inr TEXT,
ADD COLUMN IF NOT EXISTS price_inr INTEGER DEFAULT 0;

-- 2. Update Pro Plan with your actual Razorpay Plan ID and INR price
UPDATE public.subscription_plans 
SET 
  razorpay_plan_id_inr = 'plan_REN5cBATpXrR7S',
  price_inr = 19900  -- ₹199 in paise
WHERE name = 'Pro';

-- 3. Update Business Plan with your actual Razorpay Plan ID and INR price
UPDATE public.subscription_plans 
SET 
  razorpay_plan_id_inr = 'plan_RENZeCMJQuFc8n',
  price_inr = 99900  -- ₹999 in paise
WHERE name = 'Business';

-- 4. Add missing columns to user_subscriptions
ALTER TABLE public.user_subscriptions
ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT,
ADD COLUMN IF NOT EXISTS razorpay_customer_id TEXT,
ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'one_time' CHECK (payment_type IN ('one_time', 'recurring')),
ADD COLUMN IF NOT EXISTS billing_cycle TEXT DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
ADD COLUMN IF NOT EXISTS subscription_source TEXT DEFAULT 'manual' CHECK (subscription_source IN ('manual', 'stripe', 'razorpay')),
ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS auto_renewal BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS plan_activated_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 month');

-- 5. Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_razorpay_subscription_id
ON public.user_subscriptions(razorpay_subscription_id);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_razorpay_customer_id
ON public.user_subscriptions(razorpay_customer_id);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_razorpay_plan_id_inr
ON public.subscription_plans(razorpay_plan_id_inr);

-- 6. Update existing Free plan users with proper settings
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

-- 7. VERIFY THE SETUP - This should show your plan IDs
SELECT 
  name, 
  price_monthly, 
  price_inr, 
  razorpay_plan_id_inr,
  CASE 
    WHEN razorpay_plan_id_inr IS NOT NULL THEN '✅ CONFIGURED'
    ELSE '❌ MISSING'
  END as status
FROM public.subscription_plans
WHERE name IN ('Free', 'Pro', 'Business')
ORDER BY 
  CASE name 
    WHEN 'Free' THEN 1 
    WHEN 'Pro' THEN 2 
    WHEN 'Business' THEN 3 
  END;

-- Expected output:
-- Free     | 0    | 0     | NULL                    | ❌ MISSING (this is OK)
-- Pro      | 900  | 19900 | plan_REN5cBATpXrR7S     | ✅ CONFIGURED
-- Business | 2900 | 99900 | plan_RENZeCMJQuFc8n     | ✅ CONFIGURED

-- 8. Check user_subscriptions table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'user_subscriptions' 
  AND table_schema = 'public'
  AND column_name IN ('razorpay_subscription_id', 'payment_type', 'subscription_source')
ORDER BY column_name;
