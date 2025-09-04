-- =====================================================
-- 🚀 Complete Real-Time Subscription System Deployment
-- =====================================================
-- 
-- This script deploys the complete subscription system with:
-- ✅ Enhanced database schema with proper relationships
-- ✅ Real-time triggers and notifications
-- ✅ Comprehensive logging and audit trails
-- ✅ Automatic expiration handling
-- ✅ Frontend synchronization setup
--
-- =====================================================

-- Phase 1: Deploy Complete Database Schema
-- =====================================================

-- Run the complete database schema
\i complete-database-schema.sql

-- Phase 2: Additional Real-Time Functions
-- =====================================================

-- 2.1: Enhanced FAQ usage increment with comprehensive logging
CREATE OR REPLACE FUNCTION public.increment_faq_usage_with_logging(
  user_uuid UUID, 
  faq_count INTEGER,
  collection_uuid UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  eligibility_check JSONB;
  can_generate BOOLEAN;
  usage_before INTEGER;
  usage_after INTEGER;
  subscription_record RECORD;
  result JSONB;
BEGIN
  -- Get current usage
  SELECT faq_usage_current, faq_usage_limit, plan_tier 
  INTO subscription_record
  FROM public.user_subscriptions 
  WHERE user_id = user_uuid;
  
  usage_before := COALESCE(subscription_record.faq_usage_current, 0);
  
  -- First check and reset usage if needed
  PERFORM public.check_and_reset_user_usage(user_uuid);
  
  -- Check if user can generate FAQs
  eligibility_check := public.can_generate_faqs(user_uuid, faq_count);
  can_generate := (eligibility_check->>'can_generate')::BOOLEAN;
  
  IF NOT can_generate THEN
    -- Log the failed attempt
    PERFORM public.log_usage_action(
      user_uuid, 
      'limit_exceeded', 
      faq_count, 
      usage_before, 
      usage_before,
      collection_uuid
    );
    
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
  
  -- Get updated usage
  SELECT faq_usage_current INTO usage_after
  FROM public.user_subscriptions 
  WHERE user_id = user_uuid;
  
  -- Log the successful generation
  PERFORM public.log_usage_action(
    user_uuid, 
    'faq_generated', 
    faq_count, 
    usage_before, 
    usage_after,
    collection_uuid
  );
  
  -- Check if user is approaching limit and create notification
  IF usage_after >= (subscription_record.faq_usage_limit * 0.8) AND usage_before < (subscription_record.faq_usage_limit * 0.8) THEN
    PERFORM public.create_notification(
      user_uuid,
      'usage_warning',
      'Approaching FAQ Limit',
      'You have used ' || usage_after || ' of ' || subscription_record.faq_usage_limit || ' FAQs this month.',
      '/dashboard/billing'
    );
  END IF;
  
  -- Get final subscription status
  result := public.get_subscription_status(user_uuid);
  result := jsonb_set(result, '{success}', 'true');
  result := jsonb_set(result, '{faqs_generated}', faq_count::text::jsonb);
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2.2: Enhanced plan change function with comprehensive tracking
CREATE OR REPLACE FUNCTION public.change_subscription_plan_with_tracking(
  user_uuid UUID, 
  new_plan_tier plan_tier,
  is_upgrade BOOLEAN DEFAULT TRUE,
  change_reason TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  current_subscription RECORD;
  new_activation_date TIMESTAMPTZ;
  new_expiration_date TIMESTAMPTZ;
  new_faq_limit INTEGER;
  history_id UUID;
  result JSONB;
BEGIN
  -- Get current subscription
  SELECT * INTO current_subscription
  FROM public.user_subscriptions 
  WHERE user_id = user_uuid;
  
  IF current_subscription IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Subscription not found');
  END IF;
  
  -- Calculate new dates
  new_activation_date := NOW();
  
  -- Set expiration based on plan type
  IF new_plan_tier = 'Free' THEN
    new_expiration_date := NOW() + INTERVAL '100 years'; -- Effectively never expires
  ELSE
    new_expiration_date := NOW() + INTERVAL '1 month';
  END IF;
  
  -- Get new plan limits
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
  
  -- Log the change
  history_id := public.log_subscription_change(
    user_uuid,
    current_subscription.plan_tier,
    new_plan_tier,
    CASE WHEN is_upgrade THEN 'upgrade' ELSE 'downgrade' END,
    change_reason,
    current_subscription.plan_expires_at,
    new_expiration_date,
    current_subscription.faq_usage_current
  );
  
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
  
  -- Log the usage reset
  PERFORM public.log_usage_action(
    user_uuid, 
    'plan_changed', 
    0, 
    current_subscription.faq_usage_current, 
    CASE WHEN is_upgrade THEN 0 ELSE LEAST(current_subscription.faq_usage_current, new_faq_limit) END
  );
  
  -- Create notification
  PERFORM public.create_notification(
    user_uuid,
    'plan_upgraded',
    'Plan Changed Successfully',
    'Your plan has been changed from ' || current_subscription.plan_tier || ' to ' || new_plan_tier || '.',
    '/dashboard'
  );
  
  -- Return comprehensive result
  result := jsonb_build_object(
    'success', true,
    'message', 'Subscription plan changed successfully',
    'history_id', history_id,
    'previous_plan', current_subscription.plan_tier,
    'new_plan', new_plan_tier,
    'activated_at', new_activation_date,
    'expires_at', new_expiration_date,
    'new_faq_limit', new_faq_limit,
    'usage_reset', is_upgrade
  );
  
  -- Add current status
  result := result || public.get_subscription_status(user_uuid);
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Phase 3: Set Up Automated Tasks
-- =====================================================

-- 3.1: Create function to run daily maintenance
CREATE OR REPLACE FUNCTION public.daily_subscription_maintenance()
RETURNS JSONB AS $$
DECLARE
  expired_result JSONB;
  notification_result JSONB;
  metrics_result JSONB;
  total_result JSONB;
BEGIN
  -- Process expired subscriptions
  expired_result := public.process_expired_subscriptions();
  
  -- Send expiration warnings
  PERFORM public.check_expiring_subscriptions();
  
  -- Update daily metrics
  INSERT INTO public.subscription_metrics (date, plan_tier, total_users, active_users, total_faqs_generated)
  SELECT 
    CURRENT_DATE,
    s.plan_tier,
    COUNT(*) as total_users,
    COUNT(*) FILTER (WHERE s.status = 'active') as active_users,
    COALESCE(SUM(l.faq_count) FILTER (WHERE l.created_at >= CURRENT_DATE), 0) as total_faqs_generated
  FROM public.user_subscriptions s
  LEFT JOIN public.subscription_usage_logs l ON s.user_id = l.user_id 
    AND l.action_type = 'faq_generated'
    AND l.created_at >= CURRENT_DATE
  GROUP BY s.plan_tier
  ON CONFLICT (date, plan_tier) DO UPDATE SET
    total_users = EXCLUDED.total_users,
    active_users = EXCLUDED.active_users,
    total_faqs_generated = EXCLUDED.total_faqs_generated,
    updated_at = NOW();
  
  -- Clean up old notifications (older than 30 days)
  DELETE FROM public.subscription_notifications
  WHERE created_at < NOW() - INTERVAL '30 days'
    AND is_dismissed = true;
  
  -- Clean up old usage logs (older than 90 days)
  DELETE FROM public.subscription_usage_logs
  WHERE created_at < NOW() - INTERVAL '90 days';
  
  total_result := jsonb_build_object(
    'date', CURRENT_DATE,
    'expired_subscriptions', expired_result,
    'maintenance_completed', true
  );
  
  RETURN total_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Phase 4: Enable Row Level Security (RLS)
-- =====================================================

-- 4.1: Enable RLS on all subscription tables
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_metrics ENABLE ROW LEVEL SECURITY;

-- 4.2: Create RLS policies for user_subscriptions
CREATE POLICY "Users can view own subscription" ON public.user_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own subscription" ON public.user_subscriptions
  FOR UPDATE USING (auth.uid() = user_id);

-- 4.3: Create RLS policies for subscription_history
CREATE POLICY "Users can view own subscription history" ON public.subscription_history
  FOR SELECT USING (auth.uid() = user_id);

-- 4.4: Create RLS policies for subscription_usage_logs
CREATE POLICY "Users can view own usage logs" ON public.subscription_usage_logs
  FOR SELECT USING (auth.uid() = user_id);

-- 4.5: Create RLS policies for subscription_notifications
CREATE POLICY "Users can view own notifications" ON public.subscription_notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON public.subscription_notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- 4.6: Create RLS policies for subscription_metrics (read-only for authenticated users)
CREATE POLICY "Authenticated users can view metrics" ON public.subscription_metrics
  FOR SELECT USING (auth.role() = 'authenticated');

-- Phase 5: Create Indexes for Real-Time Performance
-- =====================================================

-- Additional indexes for real-time queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.subscription_notifications(user_id, is_read, created_at) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_recent ON public.subscription_usage_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_history_user_recent ON public.subscription_history(user_id, effective_date DESC);

-- Phase 6: Grant Necessary Permissions
-- =====================================================

-- Grant permissions for authenticated users
GRANT SELECT ON public.subscription_plans TO authenticated;
GRANT SELECT, UPDATE ON public.user_subscriptions TO authenticated;
GRANT SELECT ON public.subscription_history TO authenticated;
GRANT SELECT ON public.subscription_usage_logs TO authenticated;
GRANT SELECT, UPDATE ON public.subscription_notifications TO authenticated;
GRANT SELECT ON public.subscription_metrics TO authenticated;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION public.get_subscription_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_generate_faqs(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_faq_usage_with_logging(UUID, INTEGER, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_subscription_plan_with_tracking(UUID, plan_tier, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_reset_user_usage(UUID) TO authenticated;

-- =====================================================
-- 🎉 Complete Real-Time Subscription System Deployed!
-- =====================================================
