-- Update pricing plans to match new structure
-- Free: 10 FAQs, Pro: 1000 FAQs, Business: 3000 FAQs

-- First, update existing subscription plans
UPDATE public.subscription_plans 
SET 
  price_monthly = 0,
  price_yearly = 0,
  faq_limit = 10,
  features = '["Website URL analysis", "Text content analysis", "Document upload (PDF, DOCX)", "AI-powered FAQ generation", "Embed widget", "WordPress integration", "Analytics dashboard", "Export functionality", "Email support"]'
WHERE name = 'Free';

UPDATE public.subscription_plans 
SET 
  price_monthly = 900, -- $9.00 in cents
  price_yearly = 10800, -- $108.00 in cents (10% discount)
  faq_limit = 1000,
  features = '["Website URL analysis", "Text content analysis", "Document upload (PDF, DOCX)", "AI-powered FAQ generation", "Embed widget", "WordPress integration", "Analytics dashboard", "Export functionality", "Priority email support"]'
WHERE name = 'Pro';

UPDATE public.subscription_plans 
SET 
  price_monthly = 2900, -- $29.00 in cents
  price_yearly = 34800, -- $348.00 in cents (10% discount)
  faq_limit = 3000,
  features = '["Website URL analysis", "Text content analysis", "Document upload (PDF, DOCX)", "AI-powered FAQ generation", "Embed widget", "WordPress integration", "Analytics dashboard", "Export functionality", "Priority support & phone support"]'
WHERE name = 'Business';

-- Update existing user subscriptions to match new limits
UPDATE public.user_subscriptions 
SET 
  faq_usage_limit = 10
WHERE plan_tier = 'Free';

UPDATE public.user_subscriptions 
SET 
  faq_usage_limit = 1000
WHERE plan_tier = 'Pro';

UPDATE public.user_subscriptions 
SET 
  faq_usage_limit = 3000
WHERE plan_tier = 'Business';

-- Add monthly usage reset tracking
ALTER TABLE public.user_subscriptions 
ADD COLUMN IF NOT EXISTS last_reset_date DATE DEFAULT CURRENT_DATE;

-- Create function to reset monthly usage for all users
CREATE OR REPLACE FUNCTION public.reset_monthly_usage()
RETURNS void AS $$
BEGIN
  UPDATE public.user_subscriptions 
  SET 
    faq_usage_current = 0,
    last_reset_date = CURRENT_DATE,
    updated_at = NOW()
  WHERE last_reset_date < CURRENT_DATE 
    OR last_reset_date IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to check and reset usage if needed for a specific user
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

-- Update the increment_faq_usage function to check monthly reset
CREATE OR REPLACE FUNCTION public.increment_faq_usage(user_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  current_usage INTEGER;
  usage_limit INTEGER;
  last_reset DATE;
BEGIN
  -- First check if we need to reset monthly usage
  PERFORM public.check_and_reset_user_usage(user_uuid);
  
  -- Get current usage and limit
  SELECT faq_usage_current, faq_usage_limit 
  INTO current_usage, usage_limit
  FROM public.user_subscriptions 
  WHERE user_id = user_uuid;
  
  -- Check if user has reached their limit
  IF current_usage >= usage_limit THEN
    RETURN FALSE;
  END IF;
  
  -- Increment usage
  UPDATE public.user_subscriptions 
  SET faq_usage_current = faq_usage_current + 1,
      updated_at = NOW()
  WHERE user_id = user_uuid;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to increment FAQ usage by count (for bulk FAQ generation)
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

-- Update the handle_new_user function to use new limits
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
  VALUES (NEW.id, 'Free', 10, CURRENT_DATE);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add index for better performance on monthly resets
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_last_reset ON public.user_subscriptions(last_reset_date);

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.reset_monthly_usage() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_reset_user_usage(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_faq_usage_by_count(UUID, INTEGER) TO authenticated;
