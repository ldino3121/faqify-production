-- Fix Free plan limit from 10 to 5 FAQs
-- This corrects the database to match the intended pricing structure

-- 1. Update subscription_plans table to correct Free plan limit
UPDATE public.subscription_plans 
SET faq_limit = 5 
WHERE name = 'Free';

-- 2. Update all existing Free plan users to have correct limit
UPDATE public.user_subscriptions 
SET faq_usage_limit = 5,
    updated_at = NOW()
WHERE plan_tier = 'Free';

-- 3. For users who have exceeded the new limit, reset their usage to the limit
UPDATE public.user_subscriptions 
SET faq_usage_current = 5,
    updated_at = NOW()
WHERE plan_tier = 'Free' 
AND faq_usage_current > 5;
