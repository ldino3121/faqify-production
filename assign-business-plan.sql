-- =====================================================
-- Assign Business Plan to faqify18@gmail.com
-- =====================================================
-- This script upgrades the user to Business plan with 500 FAQ limit

-- Step 1: Find the user ID for faqify18@gmail.com
-- (Run this first to get the user_id)
SELECT id, email, full_name, created_at 
FROM public.profiles 
WHERE email = 'faqify18@gmail.com';

-- Step 2: Check current subscription status
-- (Replace USER_ID_HERE with the actual ID from Step 1)
SELECT 
    us.*,
    p.email,
    p.full_name
FROM public.user_subscriptions us
JOIN public.profiles p ON us.user_id = p.id
WHERE p.email = 'faqify18@gmail.com';

-- Step 3: Update to Business plan
-- (Replace USER_ID_HERE with the actual ID from Step 1)
UPDATE public.user_subscriptions 
SET 
    plan_tier = 'Business',
    faq_usage_limit = 500,
    faq_usage_current = 0,
    status = 'active',
    plan_activated_at = NOW(),
    plan_expires_at = NOW() + INTERVAL '30 days',
    plan_changed_at = NOW(),
    last_reset_date = CURRENT_DATE,
    updated_at = NOW()
WHERE user_id = (
    SELECT id FROM public.profiles WHERE email = 'faqify18@gmail.com'
);

-- Step 4: Log the change in subscription history
INSERT INTO public.subscription_history (
    user_id,
    from_plan_tier,
    to_plan_tier,
    change_type,
    change_reason,
    effective_date,
    new_expiration,
    usage_at_change,
    metadata
)
SELECT 
    p.id,
    'Free',
    'Business',
    'upgrade',
    'Manual assignment for testing',
    NOW(),
    NOW() + INTERVAL '30 days',
    0,
    jsonb_build_object(
        'assigned_by', 'admin_script',
        'purpose', 'testing',
        'timestamp', NOW()
    )
FROM public.profiles p
WHERE p.email = 'faqify18@gmail.com';

-- Step 5: Verify the update
SELECT 
    p.email,
    p.full_name,
    us.plan_tier,
    us.faq_usage_current,
    us.faq_usage_limit,
    us.status,
    us.plan_activated_at,
    us.plan_expires_at,
    us.last_reset_date
FROM public.user_subscriptions us
JOIN public.profiles p ON us.user_id = p.id
WHERE p.email = 'faqify18@gmail.com';

-- Step 6: Check subscription history
SELECT 
    sh.*,
    p.email
FROM public.subscription_history sh
JOIN public.profiles p ON sh.user_id = p.id
WHERE p.email = 'faqify18@gmail.com'
ORDER BY sh.created_at DESC
LIMIT 5;
