-- =====================================================
-- 🔧 Fix FAQ Creator - Add Missing Database Functions
-- =====================================================
-- 
-- This script adds the essential database functions needed
-- for the FAQ Creator component to work properly
--
-- =====================================================

-- Function 1: Check if user can generate FAQs (basic version)
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
    faq_usage_limit
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
    'plan_tier', 'Unknown'
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
    'status', subscription_record.status
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

-- Function 2: Increment FAQ usage by count
CREATE OR REPLACE FUNCTION public.increment_faq_usage_by_count(user_uuid UUID, faq_count INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  current_usage INTEGER;
  usage_limit INTEGER;
BEGIN
  -- Get current usage and limit
  SELECT faq_usage_current, faq_usage_limit 
  INTO current_usage, usage_limit
  FROM public.user_subscriptions 
  WHERE user_id = user_uuid;
  
  -- Check if user has enough remaining quota
  IF current_usage + faq_count > usage_limit THEN
    RETURN FALSE;
  END IF;
  
  -- Increment usage by the FAQ count
  UPDATE public.user_subscriptions 
  SET faq_usage_current = faq_usage_current + faq_count,
      updated_at = NOW()
  WHERE user_id = user_uuid;
  
  RETURN TRUE;
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
RETURNS void AS $$
DECLARE
  last_reset DATE;
BEGIN
  SELECT last_reset_date INTO last_reset
  FROM public.user_subscriptions 
  WHERE user_id = user_uuid;
  
  -- Reset if it's a new month or never reset
  IF last_reset IS NULL OR last_reset < DATE_TRUNC('month', CURRENT_DATE) THEN
    UPDATE public.user_subscriptions 
    SET 
      faq_usage_current = 0,
      last_reset_date = CURRENT_DATE,
      updated_at = NOW()
    WHERE user_id = user_uuid;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function 5: Enhanced new user signup function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  
  -- Create subscription
  INSERT INTO public.user_subscriptions (
    user_id, 
    plan_tier, 
    faq_usage_limit,
    faq_usage_current,
    last_reset_date,
    status
  )
  VALUES (
    NEW.id, 
    'Free', 
    5,
    0,
    CURRENT_DATE,
    'active'
  );
  
  RETURN NEW;
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
GRANT EXECUTE ON FUNCTION public.can_generate_faqs(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_faq_usage_by_count(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_faq_usage(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_reset_user_usage(UUID) TO authenticated;

-- Add helpful comments
COMMENT ON FUNCTION public.can_generate_faqs(UUID, INTEGER) IS 'Check if user can generate specified number of FAQs';
COMMENT ON FUNCTION public.increment_faq_usage_by_count(UUID, INTEGER) IS 'Increment user FAQ usage by specified count';
COMMENT ON FUNCTION public.increment_faq_usage(UUID) IS 'Increment user FAQ usage by 1';
COMMENT ON FUNCTION public.check_and_reset_user_usage(UUID) IS 'Reset user usage if new month';

-- =====================================================
-- 🎉 FAQ Creator Functions Deployed!
-- =====================================================
-- 
-- The following functions are now available:
-- ✅ can_generate_faqs(user_uuid, faq_count)
-- ✅ increment_faq_usage_by_count(user_uuid, faq_count)  
-- ✅ increment_faq_usage(user_uuid)
-- ✅ check_and_reset_user_usage(user_uuid)
-- ✅ handle_new_user() (enhanced)
--
-- The FAQ Creator component should now work properly!
-- =====================================================
