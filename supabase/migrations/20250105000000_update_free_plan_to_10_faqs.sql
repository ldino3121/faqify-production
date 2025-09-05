-- Update Free plan limit from 5 to 10 FAQs
-- This updates the database to match the new pricing structure

-- 1. Update subscription_plans table to set Free plan limit to 10
UPDATE public.subscription_plans 
SET faq_limit = 10,
    features = '["Website URL analysis", "Text content analysis", "Document upload (PDF, DOCX)", "AI-powered FAQ generation", "Embed widget", "WordPress integration", "Analytics dashboard", "Export functionality", "Email support"]',
    updated_at = NOW()
WHERE name = 'Free';

-- 2. Update all existing Free plan users to have correct limit
UPDATE public.user_subscriptions 
SET faq_usage_limit = 10,
    updated_at = NOW()
WHERE plan_tier = 'Free';

-- 3. Update the pricing migration hook to expect 10 FAQs for Free plan
-- This ensures the migration system recognizes the correct structure

-- 4. Verify the changes
SELECT 
    'subscription_plans' as table_name,
    name as plan_name,
    faq_limit,
    features
FROM public.subscription_plans
WHERE name IN ('Free', 'Pro', 'Business')
ORDER BY faq_limit;

-- 5. Check user subscriptions
SELECT 
    plan_tier,
    COUNT(*) as user_count,
    faq_usage_limit,
    AVG(faq_usage_current) as avg_usage
FROM public.user_subscriptions
GROUP BY plan_tier, faq_usage_limit
ORDER BY faq_usage_limit;
