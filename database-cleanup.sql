-- =====================================================
-- 🔧 FAQify Database Cleanup & Optimization Script
-- =====================================================
-- 
-- This script safely cleans up database inconsistencies
-- and optimizes the database structure for production use.
--
-- ⚠️  IMPORTANT: Run this in development first!
-- ⚠️  Backup your database before running!
--
-- =====================================================

-- Phase 1: Fix Critical Pricing Issues
-- =====================================================

-- 1.1: Update subscription plans to correct pricing structure
INSERT INTO public.subscription_plans (name, price_monthly, price_yearly, faq_limit, features)
VALUES
  ('Free', 0, 0, 5, '["Website URL analysis", "Text content analysis", "Document upload (PDF, DOCX)", "AI-powered FAQ generation", "Embed widget", "WordPress integration", "Analytics dashboard", "Export functionality", "Email support"]'),
  ('Pro', 900, 9700, 100, '["Website URL analysis", "Text content analysis", "Document upload (PDF, DOCX)", "AI-powered FAQ generation", "Embed widget", "WordPress integration", "Analytics dashboard", "Export functionality", "Priority email support"]'),
  ('Business', 2900, 31300, 500, '["Website URL analysis", "Text content analysis", "Document upload (PDF, DOCX)", "AI-powered FAQ generation", "Embed widget", "WordPress integration", "Analytics dashboard", "Export functionality", "Priority support & phone support"]')
ON CONFLICT (name) DO UPDATE SET
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  faq_limit = EXCLUDED.faq_limit,
  features = EXCLUDED.features;

-- 1.2: Fix existing user subscriptions to match correct limits
UPDATE public.user_subscriptions 
SET 
  faq_usage_limit = 5,
  updated_at = NOW()
WHERE plan_tier = 'Free';

UPDATE public.user_subscriptions 
SET 
  faq_usage_limit = 100,
  updated_at = NOW()
WHERE plan_tier = 'Pro';

UPDATE public.user_subscriptions 
SET 
  faq_usage_limit = 500,
  updated_at = NOW()
WHERE plan_tier = 'Business';

-- 1.3: Ensure all users have proper subscription records
INSERT INTO public.user_subscriptions (user_id, plan_tier, faq_usage_limit, faq_usage_current, status)
SELECT 
  p.id,
  'Free'::plan_tier,
  5,
  0,
  'active'::subscription_status
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_subscriptions us 
  WHERE us.user_id = p.id
);

-- 1.4: Add missing last_reset_date column if it doesn't exist
ALTER TABLE public.user_subscriptions 
ADD COLUMN IF NOT EXISTS last_reset_date DATE DEFAULT CURRENT_DATE;

-- Update last_reset_date for existing records
UPDATE public.user_subscriptions 
SET last_reset_date = CURRENT_DATE 
WHERE last_reset_date IS NULL;

-- Phase 2: Fix Database Functions
-- =====================================================

-- 2.1: Update handle_new_user function to use correct limits
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  
  INSERT INTO public.user_subscriptions (user_id, plan_tier, faq_usage_limit, last_reset_date)
  VALUES (NEW.id, 'Free', 5, CURRENT_DATE);
  
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

-- Phase 3: Analytics Cleanup (Simplified Approach)
-- =====================================================

-- 3.1: Keep only the simple usage_analytics table
-- Remove references to complex analytics tables that don't exist

-- 3.2: Drop orphaned analytics functions if they exist
DROP FUNCTION IF EXISTS public.increment_collection_views(UUID, DATE);
DROP FUNCTION IF EXISTS public.increment_faq_views(UUID, DATE);
DROP FUNCTION IF EXISTS public.increment_widget_loads(UUID, DATE);
DROP FUNCTION IF EXISTS public.increment_user_exports(UUID, DATE);
DROP FUNCTION IF EXISTS public.increment_user_embeds(UUID, DATE);

-- Phase 4: Data Integrity Checks
-- =====================================================

-- 4.1: Ensure all FAQ collections have valid user references
DELETE FROM public.faq_collections 
WHERE user_id NOT IN (SELECT id FROM public.profiles);

-- 4.2: Ensure all FAQs have valid collection references
DELETE FROM public.faqs 
WHERE collection_id NOT IN (SELECT id FROM public.faq_collections);

-- 4.3: Ensure all user_subscriptions have valid user references
DELETE FROM public.user_subscriptions 
WHERE user_id NOT IN (SELECT id FROM public.profiles);

-- 4.4: Reset any usage that exceeds new limits
UPDATE public.user_subscriptions 
SET faq_usage_current = LEAST(faq_usage_current, faq_usage_limit)
WHERE faq_usage_current > faq_usage_limit;

-- Phase 5: Optimization
-- =====================================================

-- 5.1: Update table statistics
ANALYZE public.profiles;
ANALYZE public.subscription_plans;
ANALYZE public.user_subscriptions;
ANALYZE public.faq_collections;
ANALYZE public.faqs;
ANALYZE public.usage_analytics;

-- 5.2: Add helpful comments
COMMENT ON TABLE public.subscription_plans IS 'Subscription plans: Free (5), Pro (100), Business (500) FAQs per month';
COMMENT ON TABLE public.user_subscriptions IS 'User subscription data with monthly FAQ usage tracking';
COMMENT ON COLUMN public.user_subscriptions.faq_usage_current IS 'Current month FAQ usage count';
COMMENT ON COLUMN public.user_subscriptions.faq_usage_limit IS 'Monthly FAQ generation limit';
COMMENT ON COLUMN public.user_subscriptions.last_reset_date IS 'Last monthly usage reset date';

-- Phase 6: Verification Queries
-- =====================================================

-- 6.1: Verify subscription plans
SELECT name, faq_limit, price_monthly FROM public.subscription_plans ORDER BY faq_limit;

-- 6.2: Verify user subscription distribution
SELECT 
  plan_tier, 
  COUNT(*) as user_count, 
  faq_usage_limit,
  AVG(faq_usage_current) as avg_usage
FROM public.user_subscriptions 
GROUP BY plan_tier, faq_usage_limit 
ORDER BY faq_usage_limit;

-- 6.3: Check for any orphaned records
SELECT 'Orphaned Collections' as issue, COUNT(*) as count
FROM public.faq_collections 
WHERE user_id NOT IN (SELECT id FROM public.profiles)
UNION ALL
SELECT 'Orphaned FAQs' as issue, COUNT(*) as count
FROM public.faqs 
WHERE collection_id NOT IN (SELECT id FROM public.faq_collections)
UNION ALL
SELECT 'Orphaned Subscriptions' as issue, COUNT(*) as count
FROM public.user_subscriptions 
WHERE user_id NOT IN (SELECT id FROM public.profiles);

-- 6.4: Check usage limits consistency
SELECT 
  'Users with usage > limit' as issue,
  COUNT(*) as count
FROM public.user_subscriptions 
WHERE faq_usage_current > faq_usage_limit;

-- =====================================================
-- 🎉 Cleanup Complete!
-- =====================================================
-- 
-- After running this script:
-- ✅ All users should have correct FAQ limits
-- ✅ Database functions should work properly  
-- ✅ No orphaned records should exist
-- ✅ Analytics system simplified and working
-- ✅ All data integrity issues resolved
--
-- Next steps:
-- 1. Test the application thoroughly
-- 2. Verify user limits display correctly
-- 3. Test FAQ generation and limits
-- 4. Monitor for any errors
--
-- =====================================================
