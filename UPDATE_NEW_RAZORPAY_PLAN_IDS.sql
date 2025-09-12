-- =====================================================
-- UPDATE DATABASE WITH NEW RAZORPAY PLAN IDS (₹750/₹2500)
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Add razorpay_plan_id_inr column if it doesn't exist
ALTER TABLE public.subscription_plans
ADD COLUMN IF NOT EXISTS razorpay_plan_id_inr TEXT;

-- 2. Add razorpay_subscription_id column to user_subscriptions if it doesn't exist
ALTER TABLE public.user_subscriptions
ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT;

-- 3. Update Pro Plan with NEW ₹750 Razorpay Plan ID
UPDATE public.subscription_plans 
SET 
  razorpay_plan_id_inr = 'plan_RGcv1a3WtevwV8',  -- NEW Pro Plan ID for ₹750
  price_inr = 75000,  -- ₹750 in paise
  price_monthly = 750,  -- Update frontend pricing to ₹750
  updated_at = NOW()
WHERE name = 'Pro';

-- 4. Update Business Plan with NEW ₹2500 Razorpay Plan ID
UPDATE public.subscription_plans 
SET 
  razorpay_plan_id_inr = 'plan_RGcucvclIXXAgp',  -- NEW Business Plan ID for ₹2500
  price_inr = 250000,  -- ₹2500 in paise
  price_monthly = 2500,  -- Update frontend pricing to ₹2500
  updated_at = NOW()
WHERE name = 'Business';

-- 5. Update Free Plan to 10 FAQs
UPDATE public.subscription_plans 
SET 
  faq_limit = 10,  -- 10 FAQs per month
  price_monthly = 0,  -- Free
  price_inr = 0,  -- Free
  updated_at = NOW()
WHERE name = 'Free';

-- 6. Update existing Free plan users to have 10 FAQ limit
UPDATE public.user_subscriptions 
SET 
  faq_usage_limit = 10,
  updated_at = NOW()
WHERE plan_tier = 'Free';

-- 7. Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_subscription_plans_razorpay_plan_id_inr
ON public.subscription_plans(razorpay_plan_id_inr);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_razorpay_subscription_id
ON public.user_subscriptions(razorpay_subscription_id);

-- 8. Verify the updates
SELECT 
  name as plan_name,
  price_monthly as frontend_price,
  price_inr as razorpay_price_paise,
  (price_inr / 100.0) as razorpay_price_rupees,
  faq_limit,
  razorpay_plan_id_inr as razorpay_plan_id,
  CASE 
    WHEN razorpay_plan_id_inr IS NOT NULL THEN '✅ Configured'
    ELSE '❌ Missing'
  END as status,
  updated_at
FROM public.subscription_plans
WHERE name IN ('Free', 'Pro', 'Business')
ORDER BY 
  CASE name 
    WHEN 'Free' THEN 1 
    WHEN 'Pro' THEN 2 
    WHEN 'Business' THEN 3 
  END;

-- 9. Show pricing summary
SELECT 
  '🎯 NEW PRICING STRUCTURE' as info,
  'Free Plan' as plan,
  '₹0' as price,
  '10 FAQs/month' as limit,
  'N/A' as plan_id
UNION ALL
SELECT 
  '🎯 NEW PRICING STRUCTURE' as info,
  'Pro Plan' as plan,
  '₹750/month' as price,
  '100 FAQs/month' as limit,
  'plan_RGcv1a3WtevwV8' as plan_id
UNION ALL
SELECT 
  '🎯 NEW PRICING STRUCTURE' as info,
  'Business Plan' as plan,
  '₹2500/month' as price,
  '500 FAQs/month' as limit,
  'plan_RGcucvclIXXAgp' as plan_id;

-- 10. Show user subscription summary
SELECT 
  plan_tier,
  status,
  COUNT(*) as user_count,
  AVG(faq_usage_current) as avg_usage,
  AVG(faq_usage_limit) as avg_limit
FROM public.user_subscriptions
GROUP BY plan_tier, status
ORDER BY plan_tier;

-- =====================================================
-- RAZORPAY PLAN IDS UPDATED!
-- 
-- NEW Plan IDs:
-- - Pro Plan (₹750): plan_RGcv1a3WtevwV8
-- - Business Plan (₹2500): plan_RGcucvclIXXAgp
-- 
-- NEW Subscription IDs (for reference):
-- - Pro Subscription: sub_RGdn4VBWnRvtBE
-- - Business Subscription: sub_RGdnjqwdDzAYYX
-- =====================================================
