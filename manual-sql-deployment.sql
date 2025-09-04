-- =====================================================
-- 🔧 Manual SQL Deployment for FAQ Creator
-- =====================================================
-- 
-- Copy and paste this into Supabase SQL Editor:
-- https://supabase.com/dashboard/project/dlzshcshqjdghmtzlbma/sql
--
-- =====================================================

-- Function 1: Increment FAQ usage by count
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
  
  -- Check if subscription exists
  IF current_usage IS NULL THEN
    RETURN FALSE;
  END IF;
  
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
    faq_usage_limit
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

-- Grant permissions for authenticated users
GRANT EXECUTE ON FUNCTION public.increment_faq_usage_by_count(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_generate_faqs(UUID, INTEGER) TO authenticated;

-- Add helpful comments
COMMENT ON FUNCTION public.increment_faq_usage_by_count(UUID, INTEGER) IS 'Increment user FAQ usage by specified count';
COMMENT ON FUNCTION public.can_generate_faqs(UUID, INTEGER) IS 'Check if user can generate specified number of FAQs';

-- =====================================================
-- 🎉 Deployment Complete!
-- =====================================================
-- 
-- After running this SQL, the FAQ Creator should work!
-- Test it by refreshing the debug tool and clicking
-- "Test Database Functions" again.
-- =====================================================
