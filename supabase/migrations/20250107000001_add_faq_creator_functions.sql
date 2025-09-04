-- =====================================================
-- Add FAQ Creator Database Functions
-- Migration: 20250107000001_add_faq_creator_functions.sql
-- =====================================================
-- 
-- This migration adds the essential database functions
-- needed for the FAQ Creator component to work properly
--
-- =====================================================

-- Function 1: Increment FAQ usage by count
CREATE OR REPLACE FUNCTION public.increment_faq_usage_by_count(user_uuid UUID, faq_count INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  current_usage INTEGER;
  usage_limit INTEGER;
  subscription_status TEXT;
BEGIN
  -- Get current usage, limit, and status
  SELECT faq_usage_current, faq_usage_limit, status
  INTO current_usage, usage_limit, subscription_status
  FROM public.user_subscriptions 
  WHERE user_id = user_uuid;
  
  -- Check if subscription exists
  IF current_usage IS NULL THEN
    RAISE EXCEPTION 'No subscription found for user %', user_uuid;
  END IF;
  
  -- Check if subscription is active
  IF subscription_status != 'active' THEN
    RAISE EXCEPTION 'Subscription is not active for user %', user_uuid;
  END IF;
  
  -- Check if user has enough remaining quota
  IF current_usage + faq_count > usage_limit THEN
    RAISE EXCEPTION 'FAQ limit exceeded. Current: %, Limit: %, Requested: %', 
      current_usage, usage_limit, faq_count;
  END IF;
  
  -- Increment usage by the FAQ count
  UPDATE public.user_subscriptions 
  SET 
    faq_usage_current = faq_usage_current + faq_count,
    updated_at = NOW()
  WHERE user_id = user_uuid;
  
  -- Log the usage increment
  INSERT INTO public.usage_analytics (user_id, action, metadata)
  VALUES (
    user_uuid, 
    'faq_usage_incremented', 
    jsonb_build_object(
      'faq_count', faq_count,
      'new_usage', current_usage + faq_count,
      'usage_limit', usage_limit
    )
  );
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function 2: Check if user can generate FAQs
CREATE OR REPLACE FUNCTION public.can_generate_faqs(user_uuid UUID, faq_count INTEGER DEFAULT 1)
RETURNS JSONB AS $$
DECLARE
  subscription_record RECORD;
  result JSONB;
BEGIN
  -- Get subscription details
  SELECT 
    plan_tier,
    status,
    faq_usage_current,
    faq_usage_limit,
    last_reset_date,
    created_at
  INTO subscription_record
  FROM public.user_subscriptions 
  WHERE user_id = user_uuid;
  
  -- Default result for no subscription
  result := jsonb_build_object(
    'can_generate', false,
    'reason', 'No subscription found',
    'current_usage', 0,
    'usage_limit', 0,
    'remaining_faqs', 0,
    'plan_tier', 'Unknown',
    'status', 'unknown'
  );
  
  -- Check if subscription exists
  IF subscription_record IS NULL THEN
    RETURN result;
  END IF;
  
  -- Build detailed result
  result := jsonb_build_object(
    'can_generate', false,
    'reason', 'Unknown error',
    'current_usage', subscription_record.faq_usage_current,
    'usage_limit', subscription_record.faq_usage_limit,
    'remaining_faqs', GREATEST(0, subscription_record.faq_usage_limit - subscription_record.faq_usage_current),
    'plan_tier', subscription_record.plan_tier,
    'status', subscription_record.status,
    'last_reset_date', subscription_record.last_reset_date
  );
  
  -- Check subscription status
  IF subscription_record.status != 'active' THEN
    result := jsonb_set(result, '{reason}', '"Subscription is not active"');
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

-- Function 3: Single FAQ increment function (for backward compatibility)
CREATE OR REPLACE FUNCTION public.increment_faq_usage(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN public.increment_faq_usage_by_count(user_uuid, 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function 4: Check and reset user usage (monthly reset)
CREATE OR REPLACE FUNCTION public.check_and_reset_user_usage(user_uuid UUID)
RETURNS JSONB AS $$
DECLARE
  last_reset DATE;
  current_date DATE := CURRENT_DATE;
  reset_performed BOOLEAN := FALSE;
BEGIN
  SELECT last_reset_date INTO last_reset
  FROM public.user_subscriptions 
  WHERE user_id = user_uuid;
  
  -- Reset if it's a new month or never reset
  IF last_reset IS NULL OR last_reset < DATE_TRUNC('month', current_date) THEN
    UPDATE public.user_subscriptions 
    SET 
      faq_usage_current = 0,
      last_reset_date = current_date,
      updated_at = NOW()
    WHERE user_id = user_uuid;
    
    reset_performed := TRUE;
    
    -- Log the reset
    INSERT INTO public.usage_analytics (user_id, action, metadata)
    VALUES (
      user_uuid, 
      'monthly_usage_reset', 
      jsonb_build_object(
        'reset_date', current_date,
        'previous_reset_date', last_reset
      )
    );
  END IF;
  
  RETURN jsonb_build_object(
    'reset_performed', reset_performed,
    'current_date', current_date,
    'last_reset_date', last_reset
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function 5: Get user subscription status with detailed info
CREATE OR REPLACE FUNCTION public.get_user_subscription_status(user_uuid UUID)
RETURNS JSONB AS $$
DECLARE
  subscription_record RECORD;
  result JSONB;
BEGIN
  -- Get subscription details
  SELECT 
    plan_tier,
    status,
    faq_usage_current,
    faq_usage_limit,
    last_reset_date,
    created_at,
    updated_at
  INTO subscription_record
  FROM public.user_subscriptions 
  WHERE user_id = user_uuid;
  
  -- Check if subscription exists
  IF subscription_record IS NULL THEN
    RETURN jsonb_build_object(
      'exists', false,
      'reason', 'No subscription found'
    );
  END IF;
  
  -- Build comprehensive status
  result := jsonb_build_object(
    'exists', true,
    'plan_tier', subscription_record.plan_tier,
    'status', subscription_record.status,
    'current_usage', subscription_record.faq_usage_current,
    'usage_limit', subscription_record.faq_usage_limit,
    'remaining_faqs', GREATEST(0, subscription_record.faq_usage_limit - subscription_record.faq_usage_current),
    'usage_percentage', ROUND((subscription_record.faq_usage_current::DECIMAL / subscription_record.faq_usage_limit::DECIMAL) * 100, 2),
    'last_reset_date', subscription_record.last_reset_date,
    'created_at', subscription_record.created_at,
    'updated_at', subscription_record.updated_at,
    'can_generate_faq', subscription_record.status = 'active' AND subscription_record.faq_usage_current < subscription_record.faq_usage_limit
  );
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add missing columns if they don't exist
ALTER TABLE public.user_subscriptions 
ADD COLUMN IF NOT EXISTS last_reset_date DATE DEFAULT CURRENT_DATE;

-- Update existing records to have proper reset dates
UPDATE public.user_subscriptions 
SET last_reset_date = CURRENT_DATE 
WHERE last_reset_date IS NULL;

-- Grant permissions for authenticated users
GRANT EXECUTE ON FUNCTION public.increment_faq_usage_by_count(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_generate_faqs(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_faq_usage(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_reset_user_usage(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_subscription_status(UUID) TO authenticated;

-- Add helpful comments
COMMENT ON FUNCTION public.increment_faq_usage_by_count(UUID, INTEGER) IS 'Increment user FAQ usage by specified count with validation';
COMMENT ON FUNCTION public.can_generate_faqs(UUID, INTEGER) IS 'Check if user can generate specified number of FAQs with detailed response';
COMMENT ON FUNCTION public.increment_faq_usage(UUID) IS 'Increment user FAQ usage by 1 (convenience function)';
COMMENT ON FUNCTION public.check_and_reset_user_usage(UUID) IS 'Reset user usage if new month with logging';
COMMENT ON FUNCTION public.get_user_subscription_status(UUID) IS 'Get comprehensive user subscription status information';

-- =====================================================
-- Migration Complete!
-- =====================================================
-- 
-- The following functions are now available:
-- ✅ increment_faq_usage_by_count(user_uuid, faq_count)
-- ✅ can_generate_faqs(user_uuid, faq_count)  
-- ✅ increment_faq_usage(user_uuid)
-- ✅ check_and_reset_user_usage(user_uuid)
-- ✅ get_user_subscription_status(user_uuid)
--
-- All functions include proper error handling, logging,
-- and validation for production use.
-- =====================================================
