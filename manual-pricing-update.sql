-- Manual Pricing Update Script
-- Run this in Supabase SQL Editor if automatic migration doesn't work

-- Update subscription plans with new pricing structure
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

-- Update existing user subscriptions to match new limits
UPDATE public.user_subscriptions 
SET faq_usage_limit = 5
WHERE plan_tier = 'Free';

UPDATE public.user_subscriptions 
SET faq_usage_limit = 100
WHERE plan_tier = 'Pro';

UPDATE public.user_subscriptions 
SET faq_usage_limit = 500
WHERE plan_tier = 'Business';

-- Update the handle_new_user function for new signups
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

-- Verify the changes
SELECT name, faq_limit FROM public.subscription_plans ORDER BY faq_limit;
SELECT plan_tier, COUNT(*) as user_count, faq_usage_limit FROM public.user_subscriptions GROUP BY plan_tier, faq_usage_limit;
