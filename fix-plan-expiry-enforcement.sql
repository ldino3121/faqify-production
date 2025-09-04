-- 🔒 PLAN EXPIRY ENFORCEMENT FIX
-- This SQL script fixes the plan expiry enforcement issue
-- Ensures users cannot generate FAQs after their plan expires

-- 1. Enhanced function to check subscription status with strict expiry enforcement
CREATE OR REPLACE FUNCTION public.is_subscription_active_strict(user_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  subscription_record RECORD;
BEGIN
  SELECT 
    plan_tier,
    status,
    plan_expires_at
  INTO subscription_record
  FROM public.user_subscriptions 
  WHERE user_id = user_uuid;
  
  -- Check if subscription exists and is active
  IF subscription_record IS NULL OR subscription_record.status != 'active' THEN
    RETURN FALSE;
  END IF;
  
  -- For Free plan, always active (no expiration)
  IF subscription_record.plan_tier = 'Free' THEN
    RETURN TRUE;
  END IF;
  
  -- For paid plans, STRICTLY check if within subscription period
  -- Use CURRENT_TIMESTAMP for precise comparison
  IF subscription_record.plan_expires_at IS NULL THEN
    RETURN FALSE; -- Paid plans must have expiry date
  END IF;
  
  RETURN subscription_record.plan_expires_at > CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Enhanced function to check FAQ generation eligibility with strict expiry
CREATE OR REPLACE FUNCTION public.can_generate_faqs_strict(user_uuid UUID, faq_count INTEGER DEFAULT 1)
RETURNS JSONB AS $$
DECLARE
  subscription_record RECORD;
  is_active BOOLEAN;
  days_remaining INTEGER;
  hours_remaining INTEGER;
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
  
  -- Default result for no subscription
  result := jsonb_build_object(
    'can_generate', false,
    'reason', 'No subscription found',
    'current_usage', 0,
    'usage_limit', 0,
    'remaining_faqs', 0,
    'plan_tier', 'Unknown',
    'plan_expires_at', null,
    'days_remaining', 0,
    'hours_remaining', 0,
    'is_within_period', false,
    'is_expired', false,
    'expiry_date_formatted', null
  );
  
  -- Check if subscription exists
  IF subscription_record IS NULL THEN
    RETURN result;
  END IF;
  
  -- Check if subscription is active with strict expiry enforcement
  is_active := public.is_subscription_active_strict(user_uuid);
  
  -- Calculate time remaining
  IF subscription_record.plan_tier = 'Free' THEN
    days_remaining := 999; -- Free plan never expires
    hours_remaining := 999;
  ELSE
    IF subscription_record.plan_expires_at IS NOT NULL THEN
      days_remaining := GREATEST(0, EXTRACT(DAY FROM (subscription_record.plan_expires_at - CURRENT_TIMESTAMP)));
      hours_remaining := GREATEST(0, EXTRACT(EPOCH FROM (subscription_record.plan_expires_at - CURRENT_TIMESTAMP)) / 3600);
    ELSE
      days_remaining := 0;
      hours_remaining := 0;
    END IF;
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
    'hours_remaining', hours_remaining,
    'is_within_period', is_active,
    'is_expired', NOT is_active AND subscription_record.plan_tier != 'Free',
    'expiry_date_formatted', 
      CASE 
        WHEN subscription_record.plan_tier = 'Free' THEN 'Never expires'
        WHEN subscription_record.plan_expires_at IS NOT NULL THEN 
          TO_CHAR(subscription_record.plan_expires_at, 'Day, Month DD, YYYY')
        ELSE 'No expiry date set'
      END
  );
  
  -- Check subscription status
  IF subscription_record.status != 'active' THEN
    result := jsonb_set(result, '{reason}', '"Subscription is not active"');
    RETURN result;
  END IF;
  
  -- STRICT EXPIRY CHECK - This is the key fix
  IF NOT is_active THEN
    IF subscription_record.plan_tier != 'Free' THEN
      result := jsonb_set(result, '{reason}', 
        CASE 
          WHEN subscription_record.plan_expires_at IS NOT NULL THEN
            '"Your ' || subscription_record.plan_tier || ' plan expired on ' || 
            TO_CHAR(subscription_record.plan_expires_at, 'Day, Month DD, YYYY') || 
            '. Please upgrade to continue generating FAQs."'
          ELSE
            '"Your ' || subscription_record.plan_tier || ' plan has expired. Please upgrade to continue."'
        END
      );
      result := jsonb_set(result, '{is_expired}', 'true');
      RETURN result;
    END IF;
  END IF;
  
  -- Check FAQ usage limits
  IF subscription_record.faq_usage_current + faq_count > subscription_record.faq_usage_limit THEN
    result := jsonb_set(result, '{reason}', '"Monthly FAQ limit exceeded. You have used ' || 
      subscription_record.faq_usage_current || ' out of ' || subscription_record.faq_usage_limit || 
      ' FAQs this month."');
    RETURN result;
  END IF;
  
  -- All checks passed
  result := jsonb_set(result, '{can_generate}', 'true');
  result := jsonb_set(result, '{reason}', '"OK"');
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update the existing can_generate_faqs function to use strict checking
CREATE OR REPLACE FUNCTION public.can_generate_faqs(user_uuid UUID, faq_count INTEGER DEFAULT 1)
RETURNS JSONB AS $$
BEGIN
  -- Use the strict version for all FAQ generation checks
  RETURN public.can_generate_faqs_strict(user_uuid, faq_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Function to check and update expired subscriptions
CREATE OR REPLACE FUNCTION public.update_expired_subscriptions()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER := 0;
BEGIN
  -- Update expired paid plans to inactive status
  UPDATE public.user_subscriptions 
  SET 
    status = 'expired',
    updated_at = CURRENT_TIMESTAMP
  WHERE 
    plan_tier != 'Free' 
    AND status = 'active'
    AND plan_expires_at IS NOT NULL 
    AND plan_expires_at <= CURRENT_TIMESTAMP;
    
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Create a trigger to automatically update expired subscriptions
CREATE OR REPLACE FUNCTION public.check_subscription_expiry_trigger()
RETURNS TRIGGER AS $$
BEGIN
  -- When checking subscription, also update any expired ones
  PERFORM public.update_expired_subscriptions();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (only if it doesn't exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'subscription_expiry_check_trigger'
  ) THEN
    CREATE TRIGGER subscription_expiry_check_trigger
      BEFORE SELECT ON public.user_subscriptions
      FOR EACH STATEMENT
      EXECUTE FUNCTION public.check_subscription_expiry_trigger();
  END IF;
END $$;

-- 6. Immediately update any currently expired subscriptions
SELECT public.update_expired_subscriptions() as expired_subscriptions_updated;

-- 7. Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.is_subscription_active_strict(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_generate_faqs_strict(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_generate_faqs(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_expired_subscriptions() TO authenticated;

-- Success message
SELECT 'Plan expiry enforcement has been successfully implemented!' as status;
