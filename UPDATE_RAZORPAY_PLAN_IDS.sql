-- Update subscription_plans table with actual Razorpay Plan IDs
-- Based on the plans created in Razorpay dashboard

-- First, let's see current plans
SELECT name, price_monthly, price_inr FROM public.subscription_plans;

-- Add razorpay_plan_id_inr column if it doesn't exist
ALTER TABLE public.subscription_plans 
ADD COLUMN IF NOT EXISTS razorpay_plan_id_inr TEXT;

-- Update with actual Razorpay Plan IDs from your dashboard
-- You need to replace these with the actual Plan IDs from your Razorpay dashboard

-- For Pro Plan (₹199) - Using actual Plan ID from your Razorpay dashboard
UPDATE public.subscription_plans
SET razorpay_plan_id_inr = 'plan_REN5cBATpXrR7S'  -- Actual Pro Plan ID from your dashboard
WHERE name = 'Pro';

-- For Business Plan (₹999) - Using actual Plan ID from your Razorpay dashboard
UPDATE public.subscription_plans
SET razorpay_plan_id_inr = 'plan_RENZeCMJQuFc8n'  -- Actual Business Plan ID from your dashboard
WHERE name = 'Business';

-- Add razorpay_subscription_id column to user_subscriptions if it doesn't exist
ALTER TABLE public.user_subscriptions
ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_razorpay_subscription_id
ON public.user_subscriptions(razorpay_subscription_id);

-- Verify the updates
SELECT name, price_monthly, price_inr, razorpay_plan_id_inr
FROM public.subscription_plans
WHERE name IN ('Pro', 'Business');
