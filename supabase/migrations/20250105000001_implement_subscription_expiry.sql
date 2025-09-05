-- Implement comprehensive subscription expiry system
-- This ensures all subscriptions have proper expiry dates and status tracking

-- 1. Ensure all required columns exist
ALTER TABLE public.user_subscriptions 
ADD COLUMN IF NOT EXISTS plan_activated_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 month'),
ADD COLUMN IF NOT EXISTS last_reset_date DATE DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS previous_plan_tier plan_tier DEFAULT 'Free',
ADD COLUMN IF NOT EXISTS plan_changed_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Update existing records with proper expiry dates
UPDATE public.user_subscriptions 
SET 
  plan_activated_at = COALESCE(plan_activated_at, created_at, NOW()),
  plan_expires_at = CASE 
    WHEN plan_tier = 'Free' THEN (COALESCE(plan_activated_at, created_at, NOW()) + INTERVAL '1 month')
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

-- 3. Create function to check and update expired subscriptions
CREATE OR REPLACE FUNCTION public.check_and_handle_expired_subscriptions()
RETURNS void AS $$
DECLARE
  expired_subscription RECORD;
BEGIN
  -- Find and handle expired subscriptions
  FOR expired_subscription IN
    SELECT user_id, plan_tier, plan_expires_at, status
    FROM public.user_subscriptions
    WHERE plan_expires_at < NOW()
      AND status = 'active'
      AND plan_tier != 'Free'
  LOOP
    -- Update subscription to expired status and downgrade to Free
    UPDATE public.user_subscriptions 
    SET 
      previous_plan_tier = expired_subscription.plan_tier,
      plan_tier = 'Free',
      status = 'expired',
      faq_usage_limit = 10,
      faq_usage_current = 0,
      plan_activated_at = NOW(),
      plan_expires_at = NOW() + INTERVAL '1 month',
      plan_changed_at = NOW(),
      last_reset_date = CURRENT_DATE,
      updated_at = NOW()
    WHERE user_id = expired_subscription.user_id;
    
    -- Log the expiration
    INSERT INTO public.subscription_history (
      user_id, 
      from_plan_tier, 
      to_plan_tier, 
      change_type, 
      change_reason,
      effective_date,
      previous_expiration,
      new_expiration
    ) VALUES (
      expired_subscription.user_id,
      expired_subscription.plan_tier,
      'Free',
      'expiration',
      'Subscription expired automatically',
      NOW(),
      expired_subscription.plan_expires_at,
      NOW() + INTERVAL '1 month'
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create function to get subscription status with expiry info
CREATE OR REPLACE FUNCTION public.get_subscription_with_expiry(user_uuid UUID)
RETURNS JSONB AS $$
DECLARE
  subscription_record RECORD;
  days_remaining INTEGER;
  result JSONB;
BEGIN
  -- Get subscription data
  SELECT 
    s.*,
    p.name as plan_name,
    p.price_monthly,
    p.faq_limit as plan_faq_limit
  INTO subscription_record
  FROM public.user_subscriptions s
  LEFT JOIN public.subscription_plans p ON s.plan_tier = p.name
  WHERE s.user_id = user_uuid;
  
  IF subscription_record IS NULL THEN
    RETURN jsonb_build_object('error', 'Subscription not found');
  END IF;
  
  -- Calculate days remaining
  days_remaining := EXTRACT(DAY FROM (subscription_record.plan_expires_at - NOW()));
  
  -- Build result
  result := jsonb_build_object(
    'user_id', subscription_record.user_id,
    'plan_tier', subscription_record.plan_tier,
    'status', subscription_record.status,
    'faq_usage_current', subscription_record.faq_usage_current,
    'faq_usage_limit', subscription_record.faq_usage_limit,
    'plan_activated_at', subscription_record.plan_activated_at,
    'plan_expires_at', subscription_record.plan_expires_at,
    'days_remaining', GREATEST(0, days_remaining),
    'is_expired', subscription_record.plan_expires_at < NOW(),
    'expires_soon', days_remaining <= 7 AND days_remaining > 0,
    'last_reset_date', subscription_record.last_reset_date,
    'plan_changed_at', subscription_record.plan_changed_at
  );
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Update the handle_new_user function to set proper expiry
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  activation_date TIMESTAMPTZ := NOW();
  expiry_date TIMESTAMPTZ := NOW() + INTERVAL '1 month';
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'User'),
    activation_date,
    activation_date
  );
  
  -- Create subscription with proper expiry
  INSERT INTO public.user_subscriptions (
    user_id, 
    plan_tier, 
    status, 
    faq_usage_current, 
    faq_usage_limit,
    plan_activated_at,
    plan_expires_at,
    last_reset_date,
    previous_plan_tier,
    plan_changed_at,
    created_at, 
    updated_at
  ) VALUES (
    NEW.id,
    'Free',
    'active',
    0,
    10,
    activation_date,
    expiry_date,
    CURRENT_DATE,
    'Free',
    activation_date,
    activation_date,
    activation_date
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Create a scheduled job to check expired subscriptions (run daily)
-- This would typically be set up as a cron job or scheduled function
-- For now, we'll create the function that can be called manually or via cron

-- 7. Verify the setup
SELECT 
  'Current subscription status' as info,
  plan_tier,
  COUNT(*) as user_count,
  AVG(EXTRACT(DAY FROM (plan_expires_at - NOW()))) as avg_days_remaining
FROM public.user_subscriptions
GROUP BY plan_tier
ORDER BY plan_tier;
