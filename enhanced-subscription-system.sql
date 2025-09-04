-- =====================================================
-- 🔄 Enhanced Subscription System with Period Management
-- =====================================================
-- 
-- This script adds comprehensive subscription period tracking
-- with both FAQ count limits AND date-based restrictions
--
-- =====================================================

-- Phase 1: Update Database Schema
-- =====================================================

-- 1.1: Add missing columns to user_subscriptions table
ALTER TABLE public.user_subscriptions 
ADD COLUMN IF NOT EXISTS plan_activated_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 month'),
ADD COLUMN IF NOT EXISTS last_reset_date DATE DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS previous_plan_tier plan_tier DEFAULT 'Free',
ADD COLUMN IF NOT EXISTS plan_changed_at TIMESTAMPTZ DEFAULT NOW();

-- 1.2: Update existing records to have proper dates
UPDATE public.user_subscriptions 
SET 
  plan_activated_at = COALESCE(plan_activated_at, created_at),
  plan_expires_at = COALESCE(plan_expires_at, created_at + INTERVAL '1 month'),
  last_reset_date = COALESCE(last_reset_date, CURRENT_DATE),
  plan_changed_at = COALESCE(plan_changed_at, created_at)
WHERE plan_activated_at IS NULL OR plan_expires_at IS NULL;

-- 1.3: Add helpful indexes for date queries
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_plan_expires_at ON public.user_subscriptions(plan_expires_at);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_plan_activated_at ON public.user_subscriptions(plan_activated_at);

-- Phase 2: Enhanced Database Functions
-- =====================================================

-- 2.1: Function to check if subscription is active and within period
CREATE OR REPLACE FUNCTION public.is_subscription_active(user_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  subscription_record RECORD;
  is_active BOOLEAN := FALSE;
BEGIN
  SELECT 
    plan_tier,
    status,
    plan_activated_at,
    plan_expires_at,
    faq_usage_current,
    faq_usage_limit
  INTO subscription_record
  FROM public.user_subscriptions 
  WHERE user_id = user_uuid;
  
  -- Check if subscription exists and is active
  IF subscription_record IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Check subscription status
  IF subscription_record.status != 'active' THEN
    RETURN FALSE;
  END IF;
  
  -- For Free plan, always active (no expiration)
  IF subscription_record.plan_tier = 'Free' THEN
    RETURN TRUE;
  END IF;
  
  -- For paid plans, check if within subscription period
  IF subscription_record.plan_expires_at > NOW() THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2.2: Enhanced function to check FAQ generation eligibility
CREATE OR REPLACE FUNCTION public.can_generate_faqs(user_uuid UUID, faq_count INTEGER DEFAULT 1)
RETURNS JSONB AS $$
DECLARE
  subscription_record RECORD;
  is_active BOOLEAN;
  days_remaining INTEGER;
  result JSONB;
BEGIN
  -- Get subscription details
  SELECT 
    plan_tier,
    status,
    plan_activated_at,
    plan_expires_at,
    faq_usage_current,
    faq_usage_limit,
    last_reset_date
  INTO subscription_record
  FROM public.user_subscriptions 
  WHERE user_id = user_uuid;
  
  -- Default result
  result := jsonb_build_object(
    'can_generate', false,
    'reason', 'No subscription found',
    'current_usage', 0,
    'usage_limit', 0,
    'remaining_faqs', 0,
    'plan_tier', 'Unknown',
    'plan_expires_at', null,
    'days_remaining', 0,
    'is_within_period', false
  );
  
  -- Check if subscription exists
  IF subscription_record IS NULL THEN
    RETURN result;
  END IF;
  
  -- Check if subscription is active
  is_active := public.is_subscription_active(user_uuid);
  
  -- Calculate days remaining
  IF subscription_record.plan_tier = 'Free' THEN
    days_remaining := 999; -- Free plan never expires
  ELSE
    days_remaining := GREATEST(0, EXTRACT(DAY FROM (subscription_record.plan_expires_at - NOW())));
  END IF;
  
  -- Build detailed result
  result := jsonb_build_object(
    'can_generate', false,
    'reason', 'Unknown error',
    'current_usage', subscription_record.faq_usage_current,
    'usage_limit', subscription_record.faq_usage_limit,
    'remaining_faqs', GREATEST(0, subscription_record.faq_usage_limit - subscription_record.faq_usage_current),
    'plan_tier', subscription_record.plan_tier,
    'plan_expires_at', subscription_record.plan_expires_at,
    'days_remaining', days_remaining,
    'is_within_period', is_active,
    'status', subscription_record.status
  );
  
  -- Check subscription status
  IF subscription_record.status != 'active' THEN
    result := jsonb_set(result, '{reason}', '"Subscription is not active"');
    RETURN result;
  END IF;
  
  -- Check if within subscription period
  IF NOT is_active THEN
    result := jsonb_set(result, '{reason}', '"Subscription period has expired"');
    RETURN result;
  END IF;
  
  -- Check FAQ usage limits
  IF subscription_record.faq_usage_current + faq_count > subscription_record.faq_usage_limit THEN
    result := jsonb_set(result, '{reason}', '"Monthly FAQ limit exceeded"');
    RETURN result;
  END IF;
  
  -- All checks passed
  result := jsonb_set(result, '{can_generate}', 'true');
  result := jsonb_set(result, '{reason}', '"OK"');
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2.3: Function to upgrade/change subscription plan
CREATE OR REPLACE FUNCTION public.change_subscription_plan(
  user_uuid UUID, 
  new_plan_tier plan_tier,
  is_upgrade BOOLEAN DEFAULT TRUE
)
RETURNS JSONB AS $$
DECLARE
  current_subscription RECORD;
  new_activation_date TIMESTAMPTZ;
  new_expiration_date TIMESTAMPTZ;
  result JSONB;
BEGIN
  -- Get current subscription
  SELECT * INTO current_subscription
  FROM public.user_subscriptions 
  WHERE user_id = user_uuid;
  
  -- Calculate new dates
  new_activation_date := NOW();
  
  -- Set expiration based on plan type
  IF new_plan_tier = 'Free' THEN
    new_expiration_date := NOW() + INTERVAL '100 years'; -- Effectively never expires
  ELSE
    new_expiration_date := NOW() + INTERVAL '1 month';
  END IF;
  
  -- Get new plan limits
  DECLARE
    new_faq_limit INTEGER;
  BEGIN
    SELECT faq_limit INTO new_faq_limit
    FROM public.subscription_plans
    WHERE name = new_plan_tier;
    
    IF new_faq_limit IS NULL THEN
      -- Default limits if plan not found
      CASE new_plan_tier
        WHEN 'Free' THEN new_faq_limit := 5;
        WHEN 'Pro' THEN new_faq_limit := 100;
        WHEN 'Business' THEN new_faq_limit := 500;
        ELSE new_faq_limit := 5;
      END CASE;
    END IF;
  END;
  
  -- Update subscription
  UPDATE public.user_subscriptions 
  SET 
    previous_plan_tier = current_subscription.plan_tier,
    plan_tier = new_plan_tier,
    plan_activated_at = new_activation_date,
    plan_expires_at = new_expiration_date,
    plan_changed_at = new_activation_date,
    faq_usage_limit = new_faq_limit,
    faq_usage_current = CASE 
      WHEN is_upgrade THEN 0  -- Reset usage on upgrade
      ELSE LEAST(current_subscription.faq_usage_current, new_faq_limit) -- Keep usage but cap at new limit
    END,
    last_reset_date = CURRENT_DATE,
    status = 'active',
    updated_at = NOW()
  WHERE user_id = user_uuid;
  
  -- Return result
  result := jsonb_build_object(
    'success', true,
    'message', 'Subscription plan changed successfully',
    'previous_plan', current_subscription.plan_tier,
    'new_plan', new_plan_tier,
    'activated_at', new_activation_date,
    'expires_at', new_expiration_date,
    'new_faq_limit', new_faq_limit
  );
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2.4: Enhanced monthly usage reset function
CREATE OR REPLACE FUNCTION public.check_and_reset_user_usage(user_uuid UUID)
RETURNS JSONB AS $$
DECLARE
  subscription_record RECORD;
  should_reset BOOLEAN := FALSE;
  reset_reason TEXT := '';
  result JSONB;
BEGIN
  SELECT * INTO subscription_record
  FROM public.user_subscriptions 
  WHERE user_id = user_uuid;
  
  IF subscription_record IS NULL THEN
    RETURN jsonb_build_object('error', 'Subscription not found');
  END IF;
  
  -- Check if subscription has expired and should be downgraded
  IF subscription_record.plan_tier != 'Free' AND subscription_record.plan_expires_at < NOW() THEN
    -- Downgrade to Free plan
    PERFORM public.change_subscription_plan(user_uuid, 'Free'::plan_tier, FALSE);
    reset_reason := 'Subscription expired, downgraded to Free plan';
    should_reset := TRUE;
  
  -- Check if it's a new month and needs monthly reset
  ELSIF subscription_record.last_reset_date < DATE_TRUNC('month', CURRENT_DATE) THEN
    should_reset := TRUE;
    reset_reason := 'Monthly usage reset';
  END IF;
  
  -- Perform reset if needed
  IF should_reset THEN
    UPDATE public.user_subscriptions 
    SET 
      faq_usage_current = 0,
      last_reset_date = CURRENT_DATE,
      updated_at = NOW()
    WHERE user_id = user_uuid;
    
    result := jsonb_build_object(
      'reset_performed', true,
      'reason', reset_reason,
      'reset_date', CURRENT_DATE
    );
  ELSE
    result := jsonb_build_object(
      'reset_performed', false,
      'reason', 'No reset needed'
    );
  END IF;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2.5: Enhanced FAQ usage increment function
CREATE OR REPLACE FUNCTION public.increment_faq_usage_by_count(user_uuid UUID, faq_count INTEGER)
RETURNS JSONB AS $$
DECLARE
  eligibility_check JSONB;
  can_generate BOOLEAN;
  result JSONB;
BEGIN
  -- First check and reset usage if needed
  PERFORM public.check_and_reset_user_usage(user_uuid);
  
  -- Check if user can generate FAQs
  eligibility_check := public.can_generate_faqs(user_uuid, faq_count);
  can_generate := (eligibility_check->>'can_generate')::BOOLEAN;
  
  IF NOT can_generate THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', eligibility_check->>'reason',
      'eligibility_details', eligibility_check
    );
  END IF;
  
  -- Increment usage
  UPDATE public.user_subscriptions 
  SET 
    faq_usage_current = faq_usage_current + faq_count,
    updated_at = NOW()
  WHERE user_id = user_uuid;
  
  -- Get updated subscription info
  DECLARE
    updated_subscription RECORD;
  BEGIN
    SELECT 
      faq_usage_current,
      faq_usage_limit,
      plan_tier,
      plan_expires_at
    INTO updated_subscription
    FROM public.user_subscriptions 
    WHERE user_id = user_uuid;
    
    result := jsonb_build_object(
      'success', true,
      'faqs_generated', faq_count,
      'current_usage', updated_subscription.faq_usage_current,
      'usage_limit', updated_subscription.faq_usage_limit,
      'remaining_faqs', updated_subscription.faq_usage_limit - updated_subscription.faq_usage_current,
      'plan_tier', updated_subscription.plan_tier,
      'plan_expires_at', updated_subscription.plan_expires_at
    );
  END;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Phase 3: Update Handle New User Function
-- =====================================================

-- 3.1: Enhanced new user signup function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  activation_date TIMESTAMPTZ := NOW();
  expiration_date TIMESTAMPTZ := NOW() + INTERVAL '1 month'; -- Free plan gets 1 month initially
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  
  -- Create subscription with proper dates
  INSERT INTO public.user_subscriptions (
    user_id, 
    plan_tier, 
    faq_usage_limit,
    faq_usage_current,
    plan_activated_at,
    plan_expires_at,
    last_reset_date,
    status
  )
  VALUES (
    NEW.id, 
    'Free', 
    5,
    0,
    activation_date,
    expiration_date,
    CURRENT_DATE,
    'active'
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Phase 4: Add Comments and Documentation
-- =====================================================

COMMENT ON COLUMN public.user_subscriptions.plan_activated_at IS 'Date when current plan was activated';
COMMENT ON COLUMN public.user_subscriptions.plan_expires_at IS 'Date when current plan expires (Free plan never expires)';
COMMENT ON COLUMN public.user_subscriptions.last_reset_date IS 'Last date when monthly usage was reset';
COMMENT ON COLUMN public.user_subscriptions.previous_plan_tier IS 'Previous plan tier before last change';
COMMENT ON COLUMN public.user_subscriptions.plan_changed_at IS 'Date when plan was last changed';

COMMENT ON FUNCTION public.is_subscription_active(UUID) IS 'Check if user subscription is active and within valid period';
COMMENT ON FUNCTION public.can_generate_faqs(UUID, INTEGER) IS 'Comprehensive check for FAQ generation eligibility including count and date limits';
COMMENT ON FUNCTION public.change_subscription_plan(UUID, plan_tier, BOOLEAN) IS 'Change user subscription plan with proper date management';

-- =====================================================
-- 🎉 Enhanced Subscription System Complete!
-- =====================================================
