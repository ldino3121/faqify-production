-- =====================================================
-- Add Profile Date Columns to user_subscriptions
-- =====================================================
-- This adds the missing columns needed for the profile section

-- Add the missing profile date columns
ALTER TABLE public.user_subscriptions 
ADD COLUMN IF NOT EXISTS plan_activated_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 month');

-- Update existing records with proper values
UPDATE public.user_subscriptions 
SET 
  plan_activated_at = COALESCE(plan_activated_at, created_at, NOW()),
  plan_expires_at = CASE 
    WHEN plan_tier = 'Free' THEN '2099-12-31T23:59:59.999Z'::TIMESTAMPTZ
    ELSE COALESCE(plan_expires_at, current_period_end, created_at + INTERVAL '1 month', NOW() + INTERVAL '1 month')
  END,
  updated_at = NOW()
WHERE 
  plan_activated_at IS NULL 
  OR plan_expires_at IS NULL;

-- Verify the changes
SELECT 
  user_id,
  plan_tier,
  plan_activated_at,
  plan_expires_at,
  created_at
FROM public.user_subscriptions
ORDER BY created_at DESC;
