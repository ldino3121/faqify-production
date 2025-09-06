-- Quick Migration for Subscription Management
-- Run this in your Supabase SQL Editor

-- 1. Add new columns to user_subscriptions table
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

-- 2. Add payment_type column to payment_transactions if not exists
ALTER TABLE public.payment_transactions 
ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'one_time' CHECK (payment_type IN ('one_time', 'recurring', 'subscription'));

-- 3. Update existing subscriptions to have proper defaults
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

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_auto_renewal ON public.user_subscriptions(auto_renewal);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_cancelled_at ON public.user_subscriptions(cancelled_at);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_next_billing ON public.user_subscriptions(next_billing_date);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_razorpay_sub ON public.user_subscriptions(razorpay_subscription_id);

-- Migration complete!
-- You can now enable subscription management features.
