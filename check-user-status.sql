-- Check user status for darkyellow548@gmail.com
SELECT 
    p.id as user_id,
    p.email,
    p.full_name,
    us.plan_tier,
    us.payment_gateway,
    us.faq_usage_current,
    us.faq_usage_limit,
    us.status,
    us.plan_activated_at,
    us.plan_expires_at,
    us.created_at,
    us.updated_at
FROM profiles p
LEFT JOIN user_subscriptions us ON p.id = us.user_id
WHERE p.email = 'darkyellow548@gmail.com';
