-- =====================================================
-- Add Missing Subscription Date Columns
-- =====================================================
-- This script adds the missing date columns to user_subscriptions table
-- and populates them with appropriate default values

-- Step 1: Add missing columns if they don't exist
ALTER TABLE public.user_subscriptions 
ADD COLUMN IF NOT EXISTS plan_activated_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 month'),
ADD COLUMN IF NOT EXISTS last_reset_date DATE DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS previous_plan_tier plan_tier DEFAULT 'Free',
ADD COLUMN IF NOT EXISTS plan_changed_at TIMESTAMPTZ DEFAULT NOW();

-- Step 2: Update existing records with NULL values
UPDATE public.user_subscriptions 
SET 
  plan_activated_at = COALESCE(plan_activated_at, created_at, NOW()),
  plan_expires_at = CASE 
    WHEN plan_tier = 'Free' THEN '2099-12-31'::TIMESTAMPTZ
    ELSE COALESCE(plan_expires_at, current_period_end, created_at + INTERVAL '1 month', NOW() + INTERVAL '1 month')
  END,
  last_reset_date = COALESCE(last_reset_date, CURRENT_DATE),
  previous_plan_tier = COALESCE(previous_plan_tier, 'Free'),
  plan_changed_at = COALESCE(plan_changed_at, created_at, NOW()),
  updated_at = NOW()
WHERE 
  plan_activated_at IS NULL 
  OR plan_expires_at IS NULL 
  OR last_reset_date IS NULL 
  OR previous_plan_tier IS NULL 
  OR plan_changed_at IS NULL;

-- Step 3: Set NOT NULL constraints after populating data
ALTER TABLE public.user_subscriptions 
ALTER COLUMN plan_activated_at SET NOT NULL,
ALTER COLUMN plan_expires_at SET NOT NULL,
ALTER COLUMN last_reset_date SET NOT NULL,
ALTER COLUMN previous_plan_tier SET NOT NULL,
ALTER COLUMN plan_changed_at SET NOT NULL;

-- Step 4: Add helpful comments
COMMENT ON COLUMN public.user_subscriptions.plan_activated_at IS 'When the current plan was activated';
COMMENT ON COLUMN public.user_subscriptions.plan_expires_at IS 'When the current plan expires (2099-12-31 for Free plans)';
COMMENT ON COLUMN public.user_subscriptions.last_reset_date IS 'Last date when monthly usage was reset';
COMMENT ON COLUMN public.user_subscriptions.previous_plan_tier IS 'Previous plan tier before last change';
COMMENT ON COLUMN public.user_subscriptions.plan_changed_at IS 'When the plan was last changed';

-- Verification query
SELECT 
  user_id,
  plan_tier,
  plan_activated_at,
  plan_expires_at,
  last_reset_date,
  previous_plan_tier,
  plan_changed_at,
  created_at,
  updated_at
FROM public.user_subscriptions
ORDER BY created_at DESC
LIMIT 5;
