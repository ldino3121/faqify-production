-- =====================================================
-- 🗄️ Complete Database Schema with Real-Time Sync
-- =====================================================
-- 
-- This script creates all necessary tables with proper relationships
-- and sets up real-time synchronization for seamless functionality
--
-- =====================================================

-- Phase 1: Core Tables with Enhanced Schema
-- =====================================================

-- 1.1: Enhanced user_subscriptions table with all required columns
ALTER TABLE public.user_subscriptions 
ADD COLUMN IF NOT EXISTS plan_activated_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 month'),
ADD COLUMN IF NOT EXISTS last_reset_date DATE DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS previous_plan_tier plan_tier DEFAULT 'Free',
ADD COLUMN IF NOT EXISTS plan_changed_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS auto_renewal BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS cancellation_date TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS grace_period_end TIMESTAMPTZ NULL;

-- 1.2: Create subscription_history table for audit trail
CREATE TABLE IF NOT EXISTS public.subscription_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  from_plan_tier plan_tier NOT NULL,
  to_plan_tier plan_tier NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('upgrade', 'downgrade', 'renewal', 'cancellation', 'expiration')),
  change_reason TEXT,
  effective_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  previous_expiration TIMESTAMPTZ,
  new_expiration TIMESTAMPTZ,
  usage_at_change INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- 1.3: Create subscription_usage_logs table for detailed tracking
CREATE TABLE IF NOT EXISTS public.subscription_usage_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.user_subscriptions(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('faq_generated', 'usage_reset', 'plan_changed', 'limit_exceeded')),
  faq_count INTEGER DEFAULT 0,
  usage_before INTEGER DEFAULT 0,
  usage_after INTEGER DEFAULT 0,
  limit_at_time INTEGER DEFAULT 0,
  plan_tier_at_time plan_tier NOT NULL,
  collection_id UUID REFERENCES public.faq_collections(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- 1.4: Create subscription_notifications table for user alerts
CREATE TABLE IF NOT EXISTS public.subscription_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('usage_warning', 'expiration_warning', 'plan_expired', 'plan_upgraded', 'usage_reset')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  is_dismissed BOOLEAN DEFAULT FALSE,
  action_url TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ
);

-- 1.5: Create subscription_metrics table for analytics
CREATE TABLE IF NOT EXISTS public.subscription_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  plan_tier plan_tier NOT NULL,
  total_users INTEGER DEFAULT 0,
  active_users INTEGER DEFAULT 0,
  new_signups INTEGER DEFAULT 0,
  upgrades INTEGER DEFAULT 0,
  downgrades INTEGER DEFAULT 0,
  cancellations INTEGER DEFAULT 0,
  expirations INTEGER DEFAULT 0,
  total_faqs_generated INTEGER DEFAULT 0,
  avg_usage_per_user DECIMAL(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(date, plan_tier)
);

-- Phase 2: Indexes for Performance and Real-Time Queries
-- =====================================================

-- 2.1: Core subscription indexes
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON public.user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_plan_expires_at ON public.user_subscriptions(plan_expires_at);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_plan_activated_at ON public.user_subscriptions(plan_activated_at);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status_tier ON public.user_subscriptions(status, plan_tier);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_last_reset ON public.user_subscriptions(last_reset_date);

-- 2.2: History and logging indexes
CREATE INDEX IF NOT EXISTS idx_subscription_history_user_id ON public.subscription_history(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_history_effective_date ON public.subscription_history(effective_date);
CREATE INDEX IF NOT EXISTS idx_subscription_history_change_type ON public.subscription_history(change_type);

CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON public.subscription_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_subscription_id ON public.subscription_usage_logs(subscription_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON public.subscription_usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_logs_action_type ON public.subscription_usage_logs(action_type);

-- 2.3: Notifications indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.subscription_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.subscription_notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.subscription_notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.subscription_notifications(created_at);

-- 2.4: Metrics indexes
CREATE INDEX IF NOT EXISTS idx_metrics_date ON public.subscription_metrics(date);
CREATE INDEX IF NOT EXISTS idx_metrics_plan_tier ON public.subscription_metrics(plan_tier);

-- Phase 3: Enhanced Functions with Logging and Notifications
-- =====================================================

-- 3.1: Function to log subscription changes
CREATE OR REPLACE FUNCTION public.log_subscription_change(
  user_uuid UUID,
  from_plan plan_tier,
  to_plan plan_tier,
  change_type TEXT,
  change_reason TEXT DEFAULT NULL,
  previous_exp TIMESTAMPTZ DEFAULT NULL,
  new_exp TIMESTAMPTZ DEFAULT NULL,
  usage_count INTEGER DEFAULT 0
)
RETURNS UUID AS $$
DECLARE
  history_id UUID;
BEGIN
  INSERT INTO public.subscription_history (
    user_id,
    from_plan_tier,
    to_plan_tier,
    change_type,
    change_reason,
    effective_date,
    previous_expiration,
    new_expiration,
    usage_at_change
  )
  VALUES (
    user_uuid,
    from_plan,
    to_plan,
    change_type,
    change_reason,
    NOW(),
    previous_exp,
    new_exp,
    usage_count
  )
  RETURNING id INTO history_id;
  
  RETURN history_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3.2: Function to log usage actions
CREATE OR REPLACE FUNCTION public.log_usage_action(
  user_uuid UUID,
  action_type TEXT,
  faq_count INTEGER DEFAULT 0,
  usage_before INTEGER DEFAULT 0,
  usage_after INTEGER DEFAULT 0,
  collection_uuid UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  log_id UUID;
  subscription_record RECORD;
BEGIN
  -- Get current subscription info
  SELECT id, faq_usage_limit, plan_tier 
  INTO subscription_record
  FROM public.user_subscriptions 
  WHERE user_id = user_uuid;
  
  INSERT INTO public.subscription_usage_logs (
    user_id,
    subscription_id,
    action_type,
    faq_count,
    usage_before,
    usage_after,
    limit_at_time,
    plan_tier_at_time,
    collection_id
  )
  VALUES (
    user_uuid,
    subscription_record.id,
    action_type,
    faq_count,
    usage_before,
    usage_after,
    subscription_record.faq_usage_limit,
    subscription_record.plan_tier,
    collection_uuid
  )
  RETURNING id INTO log_id;
  
  RETURN log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3.3: Function to create notifications
CREATE OR REPLACE FUNCTION public.create_notification(
  user_uuid UUID,
  notification_type TEXT,
  title TEXT,
  message TEXT,
  action_url TEXT DEFAULT NULL,
  expires_hours INTEGER DEFAULT 168 -- 7 days default
)
RETURNS UUID AS $$
DECLARE
  notification_id UUID;
BEGIN
  INSERT INTO public.subscription_notifications (
    user_id,
    notification_type,
    title,
    message,
    action_url,
    expires_at
  )
  VALUES (
    user_uuid,
    notification_type,
    title,
    message,
    action_url,
    NOW() + (expires_hours || ' hours')::INTERVAL
  )
  RETURNING id INTO notification_id;
  
  RETURN notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3.4: Enhanced subscription status function with real-time data
CREATE OR REPLACE FUNCTION public.get_subscription_status(user_uuid UUID)
RETURNS JSONB AS $$
DECLARE
  subscription_record RECORD;
  recent_activity RECORD;
  notifications_count INTEGER;
  days_remaining INTEGER;
  usage_percentage DECIMAL(5,2);
  result JSONB;
BEGIN
  -- Get comprehensive subscription data
  SELECT 
    s.*,
    p.name as plan_name,
    p.price_monthly,
    p.price_yearly,
    p.features
  INTO subscription_record
  FROM public.user_subscriptions s
  LEFT JOIN public.subscription_plans p ON s.plan_tier = p.name
  WHERE s.user_id = user_uuid;
  
  IF subscription_record IS NULL THEN
    RETURN jsonb_build_object('error', 'Subscription not found');
  END IF;
  
  -- Get recent activity
  SELECT 
    COUNT(*) as total_actions,
    MAX(created_at) as last_activity
  INTO recent_activity
  FROM public.subscription_usage_logs
  WHERE user_id = user_uuid 
    AND created_at > NOW() - INTERVAL '30 days';
  
  -- Get unread notifications count
  SELECT COUNT(*) INTO notifications_count
  FROM public.subscription_notifications
  WHERE user_id = user_uuid 
    AND is_read = FALSE 
    AND (expires_at IS NULL OR expires_at > NOW());
  
  -- Calculate metrics
  IF subscription_record.plan_tier = 'Free' THEN
    days_remaining := 999999; -- Never expires
  ELSE
    days_remaining := GREATEST(0, EXTRACT(DAY FROM (subscription_record.plan_expires_at - NOW())));
  END IF;
  
  usage_percentage := CASE 
    WHEN subscription_record.faq_usage_limit > 0 THEN 
      (subscription_record.faq_usage_current::DECIMAL / subscription_record.faq_usage_limit::DECIMAL) * 100
    ELSE 0
  END;
  
  -- Build comprehensive result
  result := jsonb_build_object(
    'subscription_id', subscription_record.id,
    'user_id', subscription_record.user_id,
    'plan_tier', subscription_record.plan_tier,
    'plan_name', subscription_record.plan_name,
    'status', subscription_record.status,
    'is_active', (subscription_record.status = 'active' AND 
                  (subscription_record.plan_tier = 'Free' OR subscription_record.plan_expires_at > NOW())),
    'usage', jsonb_build_object(
      'current', subscription_record.faq_usage_current,
      'limit', subscription_record.faq_usage_limit,
      'remaining', subscription_record.faq_usage_limit - subscription_record.faq_usage_current,
      'percentage', usage_percentage
    ),
    'dates', jsonb_build_object(
      'activated_at', subscription_record.plan_activated_at,
      'expires_at', subscription_record.plan_expires_at,
      'last_reset', subscription_record.last_reset_date,
      'changed_at', subscription_record.plan_changed_at,
      'days_remaining', days_remaining
    ),
    'plan_details', jsonb_build_object(
      'price_monthly', subscription_record.price_monthly,
      'price_yearly', subscription_record.price_yearly,
      'features', subscription_record.features,
      'is_annual', subscription_record.is_annual
    ),
    'activity', jsonb_build_object(
      'recent_actions', COALESCE(recent_activity.total_actions, 0),
      'last_activity', recent_activity.last_activity
    ),
    'notifications', jsonb_build_object(
      'unread_count', notifications_count
    ),
    'previous_plan', subscription_record.previous_plan_tier,
    'auto_renewal', subscription_record.auto_renewal,
    'cancellation_date', subscription_record.cancellation_date,
    'grace_period_end', subscription_record.grace_period_end
  );
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Phase 4: Real-Time Triggers and Notifications
-- =====================================================

-- 4.1: Trigger to automatically update metrics when subscriptions change
CREATE OR REPLACE FUNCTION public.update_subscription_metrics()
RETURNS TRIGGER AS $$
BEGIN
  -- Update daily metrics for the affected plan tiers
  INSERT INTO public.subscription_metrics (date, plan_tier, total_users, active_users)
  SELECT
    CURRENT_DATE,
    plan_tier,
    COUNT(*) as total_users,
    COUNT(*) FILTER (WHERE status = 'active') as active_users
  FROM public.user_subscriptions
  WHERE plan_tier IN (COALESCE(OLD.plan_tier, NEW.plan_tier), NEW.plan_tier)
  GROUP BY plan_tier
  ON CONFLICT (date, plan_tier) DO UPDATE SET
    total_users = EXCLUDED.total_users,
    active_users = EXCLUDED.active_users,
    updated_at = NOW();

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 4.2: Create trigger for subscription changes
DROP TRIGGER IF EXISTS trigger_update_subscription_metrics ON public.user_subscriptions;
CREATE TRIGGER trigger_update_subscription_metrics
  AFTER INSERT OR UPDATE OR DELETE ON public.user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_subscription_metrics();

-- 4.3: Trigger to send notifications for expiring subscriptions
CREATE OR REPLACE FUNCTION public.check_expiring_subscriptions()
RETURNS void AS $$
DECLARE
  expiring_subscription RECORD;
BEGIN
  -- Find subscriptions expiring in 3 days
  FOR expiring_subscription IN
    SELECT user_id, plan_tier, plan_expires_at
    FROM public.user_subscriptions
    WHERE plan_tier != 'Free'
      AND status = 'active'
      AND plan_expires_at BETWEEN NOW() AND NOW() + INTERVAL '3 days'
      AND NOT EXISTS (
        SELECT 1 FROM public.subscription_notifications
        WHERE user_id = user_subscriptions.user_id
          AND notification_type = 'expiration_warning'
          AND created_at > NOW() - INTERVAL '7 days'
      )
  LOOP
    PERFORM public.create_notification(
      expiring_subscription.user_id,
      'expiration_warning',
      'Subscription Expiring Soon',
      'Your ' || expiring_subscription.plan_tier || ' plan expires on ' ||
      expiring_subscription.plan_expires_at::date || '. Renew now to continue using premium features.',
      '/dashboard/billing',
      72 -- 3 days
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4.4: Function to handle expired subscriptions (run daily)
CREATE OR REPLACE FUNCTION public.process_expired_subscriptions()
RETURNS JSONB AS $$
DECLARE
  expired_subscription RECORD;
  processed_count INTEGER := 0;
  results JSONB := '[]'::jsonb;
BEGIN
  -- Find and process expired subscriptions
  FOR expired_subscription IN
    SELECT user_id, plan_tier, plan_expires_at, faq_usage_current
    FROM public.user_subscriptions
    WHERE plan_tier != 'Free'
      AND status = 'active'
      AND plan_expires_at < NOW()
  LOOP
    -- Downgrade to Free plan
    PERFORM public.change_subscription_plan_with_tracking(
      expired_subscription.user_id,
      'Free'::plan_tier,
      FALSE,
      'Automatic expiration'
    );

    -- Create expiration notification
    PERFORM public.create_notification(
      expired_subscription.user_id,
      'plan_expired',
      'Subscription Expired',
      'Your ' || expired_subscription.plan_tier || ' plan has expired and you have been moved to the Free plan.',
      '/dashboard/billing'
    );

    processed_count := processed_count + 1;
    results := results || jsonb_build_object(
      'user_id', expired_subscription.user_id,
      'expired_plan', expired_subscription.plan_tier,
      'expired_at', expired_subscription.plan_expires_at
    );
  END LOOP;

  RETURN jsonb_build_object(
    'processed_count', processed_count,
    'expired_subscriptions', results
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
