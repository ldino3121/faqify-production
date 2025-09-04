-- =====================================================
-- Fix Database Migration Conflicts - FAQify
-- =====================================================
-- This script resolves all conflicting migrations and ensures
-- consistent pricing structure across the entire database

-- Phase 1: Ensure Correct Pricing Structure
-- =====================================================

-- 1.1: Update subscription_plans to final pricing structure
INSERT INTO public.subscription_plans (name, price_monthly, price_yearly, faq_limit, features)
VALUES
  ('Free', 0, 0, 5, '["Website URL analysis", "Text content analysis", "Document upload (PDF, DOCX)", "AI-powered FAQ generation", "Embed widget", "WordPress integration", "Analytics dashboard", "Export functionality", "Email support"]'),
  ('Pro', 900, 9700, 100, '["Website URL analysis", "Text content analysis", "Document upload (PDF, DOCX)", "AI-powered FAQ generation", "Embed widget", "WordPress integration", "Analytics dashboard", "Export functionality", "Priority email support"]'),
  ('Business', 2900, 31300, 500, '["Website URL analysis", "Text content analysis", "Document upload (PDF, DOCX)", "AI-powered FAQ generation", "Embed widget", "WordPress integration", "Analytics dashboard", "Export functionality", "Priority support & phone support"]')
ON CONFLICT (name) DO UPDATE SET
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  faq_limit = EXCLUDED.faq_limit,
  features = EXCLUDED.features,
  updated_at = NOW();

-- 1.2: Add missing columns to user_subscriptions if they don't exist
ALTER TABLE public.user_subscriptions 
ADD COLUMN IF NOT EXISTS plan_activated_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 month'),
ADD COLUMN IF NOT EXISTS last_reset_date DATE DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS previous_plan_tier plan_tier DEFAULT 'Free',
ADD COLUMN IF NOT EXISTS plan_changed_at TIMESTAMPTZ DEFAULT NOW();

-- 1.3: Fix ALL existing user subscriptions to match correct limits
UPDATE public.user_subscriptions 
SET 
  faq_usage_limit = 5,
  plan_activated_at = COALESCE(plan_activated_at, created_at),
  plan_expires_at = COALESCE(plan_expires_at, created_at + INTERVAL '1 month'),
  last_reset_date = COALESCE(last_reset_date, CURRENT_DATE),
  updated_at = NOW()
WHERE plan_tier = 'Free';

UPDATE public.user_subscriptions 
SET 
  faq_usage_limit = 100,
  plan_activated_at = COALESCE(plan_activated_at, created_at),
  plan_expires_at = COALESCE(plan_expires_at, created_at + INTERVAL '1 month'),
  last_reset_date = COALESCE(last_reset_date, CURRENT_DATE),
  updated_at = NOW()
WHERE plan_tier = 'Pro';

UPDATE public.user_subscriptions 
SET 
  faq_usage_limit = 500,
  plan_activated_at = COALESCE(plan_activated_at, created_at),
  plan_expires_at = COALESCE(plan_expires_at, created_at + INTERVAL '1 month'),
  last_reset_date = COALESCE(last_reset_date, CURRENT_DATE),
  updated_at = NOW()
WHERE plan_tier = 'Business';

-- 1.4: Reset usage for users who exceed new limits
UPDATE public.user_subscriptions 
SET 
  faq_usage_current = LEAST(faq_usage_current, faq_usage_limit),
  updated_at = NOW()
WHERE faq_usage_current > faq_usage_limit;

-- Phase 2: Fix Database Functions
-- =====================================================

-- 2.1: Update handle_new_user function to use correct Free plan limit
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  
  INSERT INTO public.user_subscriptions (
    user_id, 
    plan_tier, 
    faq_usage_limit, 
    plan_activated_at,
    plan_expires_at,
    last_reset_date
  )
  VALUES (
    NEW.id, 
    'Free', 
    5, 
    NOW(),
    NOW() + INTERVAL '1 month',
    CURRENT_DATE
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2.2: Update monthly usage reset function
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

-- 2.3: Update FAQ usage increment function
CREATE OR REPLACE FUNCTION public.increment_faq_usage_by_count(user_uuid UUID, faq_count INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  current_usage INTEGER;
  usage_limit INTEGER;
BEGIN
  -- First check if we need to reset monthly usage
  PERFORM public.check_and_reset_user_usage(user_uuid);
  
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

-- 2.4: Single FAQ increment function (for backward compatibility)
CREATE OR REPLACE FUNCTION public.increment_faq_usage(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN public.increment_faq_usage_by_count(user_uuid, 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2.5: Enhanced can_generate_faqs function
CREATE OR REPLACE FUNCTION public.can_generate_faqs(user_uuid UUID, faq_count INTEGER DEFAULT 1)
RETURNS JSONB AS $$
DECLARE
  subscription_record RECORD;
  result JSONB;
BEGIN
  -- First check if we need to reset monthly usage
  PERFORM public.check_and_reset_user_usage(user_uuid);
  
  -- Get subscription details
  SELECT 
    plan_tier,
    status,
    faq_usage_current,
    faq_usage_limit,
    last_reset_date,
    plan_activated_at,
    plan_expires_at
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
  
  -- Check if subscription is active
  IF subscription_record.status != 'active' THEN
    result := jsonb_build_object(
      'can_generate', false,
      'reason', 'Subscription is not active',
      'current_usage', subscription_record.faq_usage_current,
      'usage_limit', subscription_record.faq_usage_limit,
      'remaining_faqs', 0,
      'plan_tier', subscription_record.plan_tier,
      'status', subscription_record.status
    );
    RETURN result;
  END IF;
  
  -- Check if user has enough remaining quota
  IF subscription_record.faq_usage_current + faq_count > subscription_record.faq_usage_limit THEN
    result := jsonb_build_object(
      'can_generate', false,
      'reason', 'FAQ limit exceeded',
      'current_usage', subscription_record.faq_usage_current,
      'usage_limit', subscription_record.faq_usage_limit,
      'remaining_faqs', subscription_record.faq_usage_limit - subscription_record.faq_usage_current,
      'plan_tier', subscription_record.plan_tier,
      'status', subscription_record.status
    );
    RETURN result;
  END IF;
  
  -- User can generate FAQs
  result := jsonb_build_object(
    'can_generate', true,
    'reason', 'Sufficient quota available',
    'current_usage', subscription_record.faq_usage_current,
    'usage_limit', subscription_record.faq_usage_limit,
    'remaining_faqs', subscription_record.faq_usage_limit - subscription_record.faq_usage_current,
    'plan_tier', subscription_record.plan_tier,
    'status', subscription_record.status
  );
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Phase 3: Data Integrity Checks
-- =====================================================

-- 3.1: Ensure all FAQ collections have valid user references
DELETE FROM public.faq_collections 
WHERE user_id NOT IN (SELECT id FROM public.profiles);

-- 3.2: Ensure all FAQs have valid collection references
DELETE FROM public.faqs 
WHERE collection_id NOT IN (SELECT id FROM public.faq_collections);

-- 3.3: Ensure all users have subscription records
INSERT INTO public.user_subscriptions (user_id, plan_tier, faq_usage_limit, plan_activated_at, plan_expires_at, last_reset_date)
SELECT 
  p.id, 
  'Free', 
  5, 
  NOW(),
  NOW() + INTERVAL '1 month',
  CURRENT_DATE
FROM public.profiles p
WHERE p.id NOT IN (SELECT user_id FROM public.user_subscriptions);

-- Phase 4: Add Comments and Verification
-- =====================================================

-- Add comments to track this migration
COMMENT ON TABLE public.subscription_plans IS 'Updated to final pricing structure: Free (5), Pro (100), Business (500) FAQs per month - Migration completed';
COMMENT ON TABLE public.user_subscriptions IS 'All user limits updated to match final pricing structure - Migration completed';

-- Add helpful comments to functions
COMMENT ON FUNCTION public.can_generate_faqs(UUID, INTEGER) IS 'Check if user can generate specified number of FAQs with detailed response - Updated for final pricing';
COMMENT ON FUNCTION public.increment_faq_usage_by_count(UUID, INTEGER) IS 'Increment user FAQ usage by specified count with validation - Updated for final pricing';
COMMENT ON FUNCTION public.increment_faq_usage(UUID) IS 'Increment user FAQ usage by 1 (convenience function) - Updated for final pricing';
COMMENT ON FUNCTION public.check_and_reset_user_usage(UUID) IS 'Reset user usage if new month with logging - Updated for final pricing';

-- Final verification query (for manual checking)
-- SELECT 
--   'subscription_plans' as table_name,
--   name,
--   faq_limit,
--   price_monthly,
--   price_yearly
-- FROM public.subscription_plans
-- UNION ALL
-- SELECT 
--   'user_counts' as table_name,
--   plan_tier::text as name,
--   COUNT(*)::integer as faq_limit,
--   AVG(faq_usage_current)::integer as price_monthly,
--   AVG(faq_usage_limit)::integer as price_yearly
-- FROM public.user_subscriptions
-- GROUP BY plan_tier
-- ORDER BY table_name, name;

-- Migration completed successfully
SELECT 'Database migration conflicts resolved successfully!' as status;
